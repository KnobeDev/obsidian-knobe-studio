/**
 * panels/cohort.ts — the Cohort check panel: batch-verify a vault folder of
 * submissions, check chain links against an expectation (journey or spec)
 * file, view the lineage between submissions, export CSV, and seal a cohort
 * receipt attesting the verdicts.
 */
import { TFolder } from "obsidian";
import { createKnobe, verify, type CreateResult } from "../engine/knobe-core";
import {
  chainVerdict, cohortCsv, cohortRowFromReport, expectationFromReport,
  localToday, singleLine, slugify, sortCohortRows, unreadableCohortRow,
  type CohortExpectation, type CohortRow,
} from "../studio-core";
import { buildCohortReceipt } from "../cohort-receipt";
import {
  button, copyToClipboard, errorBox, helpText, hideError, sectionHeading, showError, textField,
} from "../ui";
import { buildIntake } from "../intake";
import { pickZipFile, skippedSummary } from "../zip-intake";
import { pickDirectory, pickTextFiles } from "../loose-intake";
import type { ZipReadResult } from "../zip";
import { filesUnderFolder, readVaultFile, saveTextFile } from "../vault";
import type { StudioContext } from "../panel-context";

export class CohortPanel {
  private ctx: StudioContext;
  private rows: CohortRow[] = [];
  private expectation: CohortExpectation | null = null;

  private expBanner!: HTMLElement;
  private err!: HTMLElement;
  private resultsBox!: HTMLElement;
  private summary!: HTMLElement;
  private tbody!: HTMLTableSectionElement;
  private chainBox!: HTMLElement;
  private receipt: CreateResult | null = null;
  private rcptName!: HTMLInputElement;
  private rcptErr!: HTMLElement;
  private rcptRes!: HTMLElement;
  private rcptText!: HTMLElement;
  private rcptHash!: HTMLElement;
  private rcptChain!: HTMLElement;
  private rcptFileName!: HTMLInputElement;

  constructor(ctx: StudioContext, root: HTMLElement) {
    this.ctx = ctx;
    helpText(root, "Batch-verify a folder of submissions. Rows sort anomalies first: broken seals and files with no chain link to the expected assignment rise to the top.");

    buildIntake(root, ctx, {
      label: "Optional: load the journey or assignment file submissions should chain to",
      onText: async (text) => {
        const report = await verify(text);
        if (report.state !== "verified" && report.state !== "verified-body-modified") {
          throw new Error("The expectation file does not verify (status: " + report.state + ").");
        }
        this.expectation = expectationFromReport(report);
        this.expBanner.setText(
          "Submissions will be checked against: " + this.expectation.title.slice(0, 110) +
          " (" + this.expectation.hashes.size + " accepted hash" + (this.expectation.hashes.size === 1 ? "" : "es") + ")."
        );
        this.expBanner.removeClass("ks-hidden");
        this.hideReceipt();
        if (this.rows.length) this.renderRows();
      },
    });
    this.expBanner = root.createDiv({ cls: "ks-banner ks-hidden", attr: { role: "status" } });

    helpText(root, "Add submissions from anywhere: a vault folder, a folder or files on disk (Notion / Overleaf / LMS exports), or a ZIP. Any text format is read directly — Markdown, LaTeX (.tex), HTML, plain text. Binary documents (.docx, .pdf) must be converted to Markdown/text first.");

    const btns = root.createDiv({ cls: "ks-rowbtns" });
    button(btns, "Check a vault folder…", () => {
      this.ctx.pickFolder((folder) => void this.processFolder(folder));
    }, { cta: true });
    button(btns, "Add files from disk…", () => {
      hideError(this.err);
      pickTextFiles((result) => this.addBatch(result, "the selected files"), (m) => showError(this.err, m));
    });
    button(btns, "Add a folder from disk…", () => {
      hideError(this.err);
      pickDirectory((result) => this.addBatch(result, "the selected folder"), (m) => showError(this.err, m));
    });
    button(btns, "Add a ZIP…", () => {
      // LMS bulk downloads arrive zipped; entries are read in memory only,
      // through the hardened parser (bomb caps, zip-slip-safe names).
      hideError(this.err);
      pickZipFile((result, zipName) => this.addBatch(result, zipName), (m) => showError(this.err, "Could not read the ZIP: " + m));
    });
    button(btns, "Add active note", async () => {
      try {
        const note = await this.ctx.activeNote();
        if (!note) {
          showError(this.err, "No active markdown note to add.");
          return;
        }
        await this.addFileText(note.name, note.text);
        this.renderRows();
      } catch (e) {
        showError(this.err, e instanceof Error ? e.message : String(e));
      }
    });
    button(btns, "Clear", () => {
      this.rows = [];
      this.hideReceipt();
      this.resultsBox.addClass("ks-hidden");
      this.chainBox.addClass("ks-hidden");
    }, { link: true });

    this.err = errorBox(root);

    this.resultsBox = root.createDiv({ cls: "ks-hidden" });
    this.summary = this.resultsBox.createDiv({ cls: "ks-cohort-summary", attr: { role: "status" } });
    const actions = this.resultsBox.createDiv({ cls: "ks-rowbtns" });
    button(actions, "Export CSV to vault", async () => {
      const csv = cohortCsv(sortCohortRows(this.rows, this.expectation), this.expectation);
      const file = await saveTextFile(this.ctx.app, this.ctx.saveFolder(), "cohort-check-" + localToday() + ".csv", csv, this.ctx.demoScope());
      this.ctx.openFile(file);
    });
    button(actions, "View chains between loaded files", () => this.toggleChains(), { link: true });

    // Focusable, labelled scroll region so keyboard users can reach
    // horizontally clipped columns at high zoom (SC 1.4.10).
    const tableWrap = this.resultsBox.createDiv({
      cls: "ks-tablewrap",
      attr: { tabindex: "0", role: "region", "aria-label": "Cohort verification results" },
    });
    const table = tableWrap.createEl("table", { cls: "ks-cohort-table" });
    table.createEl("caption", { text: "Cohort verification results", cls: "ks-sr-only" });
    const thead = table.createEl("thead");
    const hr = thead.createEl("tr");
    for (const h of ["file", "title", "author", "integrity", "conformance", "AI disclosure", "chain", "review"]) {
      hr.createEl("th", { text: h, attr: { scope: "col" } });
    }
    this.tbody = table.createEl("tbody");

    sectionHeading(this.resultsBox, "Chains");
    this.chainBox = this.resultsBox.createDiv({ cls: "ks-chainbox ks-hidden" });

    this.buildReceipt(this.resultsBox);
  }

  /** "Seal a cohort receipt": a sealed attestation of the table's verdicts. */
  private buildReceipt(parent: HTMLElement): void {
    const box = parent.createEl("details", { cls: "ks-receipt" });
    box.createEl("summary", { text: "Seal a cohort receipt" });
    helpText(box, "The receipt seals what this table shows: at seal time, these files existed with these payload hashes and produced these verdicts. Verdicts and hashes only; student-declared names are not sealed in. Anchored anywhere with an independent timestamp, its one hash timestamps every listed submission.");
    this.rcptName = textField(box, "Who is attesting", this.ctx.settings.defaultAuthor);
    // The attester's own name: identify the input purpose (SC 1.3.5).
    this.rcptName.setAttribute("autocomplete", "name");
    const hint = this.rcptName.parentElement!.createDiv({
      cls: "ks-help", text: "Recorded as the receipt's attribution, role cohort_verifier.", attr: { id: this.rcptName.id + "-hint" },
    });
    this.rcptName.setAttribute("aria-describedby", hint.id);
    button(box.createDiv({ cls: "ks-rowbtns" }), "Seal the receipt", () => this.sealReceipt(), { cta: true });
    this.rcptErr = errorBox(box);

    this.rcptRes = box.createDiv({ cls: "ks-result ks-hidden", attr: { tabindex: "-1" } });
    this.rcptText = this.rcptRes.createDiv({ cls: "ks-restext" });
    this.rcptHash = this.rcptRes.createDiv({ cls: "ks-mono ks-reshash" });
    this.rcptChain = this.rcptRes.createDiv({ cls: "ks-help" });
    const nameRow = this.rcptRes.createDiv({ cls: "ks-rowbtns" });
    this.rcptFileName = textField(nameRow, "File name", "cohort-receipt.knobe.md");
    button(nameRow, "Save to vault", async () => {
      if (!this.receipt) return;
      const file = await this.ctx.saveSealed(this.rcptFileName.value.trim() || "cohort-receipt.knobe.md", this.receipt.text);
      if (this.ctx.settings.openAfterSeal) this.ctx.openFile(file);
    }, { cta: true });
    button(nameRow, "Copy file text", async () => {
      if (this.receipt) await copyToClipboard(this.receipt.text);
    });
    helpText(this.rcptRes, "To anchor the date externally, put the payload_hash above somewhere you do not control the timestamp of: an email, a gradebook note, a post. One hash anchors every listed submission.");
  }

  private async sealReceipt(): Promise<void> {
    hideError(this.rcptErr);
    try {
      if (!this.rows.length) throw new Error("There is nothing to attest; run a check first.");
      const name = singleLine(this.rcptName.value);
      if (!name) throw new Error("Name who is attesting; the credit is part of the record.");
      this.receipt = await createKnobe(buildCohortReceipt(this.rows, this.expectation, name, localToday()));
      this.rcptText.setText("Sealed. Self-check: " + this.receipt.report.state + " · " + this.receipt.report.conformance + ".");
      this.rcptHash.setText("payload_hash " + this.receipt.payloadHash);
      this.rcptChain.setText(
        this.expectation && this.expectation.stored
          ? 'Anchored to "' + this.expectation.title.slice(0, 90) + '" as parents[0], payload_hash ' + this.expectation.stored + "."
          : "No expectation loaded; the receipt records verdicts without a chain target."
      );
      this.rcptFileName.value = slugify(this.receipt.payload.title);
      this.rcptRes.removeClass("ks-hidden");
      this.rcptRes.focus();
    } catch (e) {
      showError(this.rcptErr, "Sealing did not complete: " + (e instanceof Error ? e.message : String(e)));
    }
  }

  /** A sealed receipt describes one table; any change to the table retires it. */
  private hideReceipt(): void {
    this.receipt = null;
    this.rcptRes.addClass("ks-hidden");
    hideError(this.rcptErr);
  }

  /** Load a batch of text entries (from ZIP, disk files, or a disk folder). */
  private addBatch(result: ZipReadResult, sourceLabel: string): void {
    void (async () => {
      for (const entry of result.entries) await this.addFileText(entry.name, entry.text);
      this.renderRows();
      const note = skippedSummary(result);
      if (!result.entries.length) {
        showError(this.err, "No text submissions were found in " + sourceLabel + ". " + note);
      } else if (note) {
        showError(this.err, "Loaded " + result.entries.length + " from " + sourceLabel + ". " + note);
      }
    })();
  }

  private async addFileText(name: string, text: string): Promise<void> {
    try {
      const report = await verify(text);
      this.rows.push(cohortRowFromReport(name, report));
    } catch (e) {
      this.rows.push(unreadableCohortRow(name, e instanceof Error ? e.message : String(e)));
    }
  }

  private async processFolder(folder: TFolder): Promise<void> {
    hideError(this.err);
    const files = filesUnderFolder(folder);
    if (!files.length) {
      showError(this.err, "No .knobe.md, .md, or .txt files found under " + (folder.path === "/" ? "the vault root" : folder.path) + ".");
      return;
    }
    for (const f of files) {
      const text = await readVaultFile(this.ctx.app, f);
      await this.addFileText(f.name, text);
    }
    this.renderRows();
  }

  // Invariant: every change to this.rows or this.expectation must end in
  // renderRows() (or hideReceipt()), so a sealed receipt never outlives the
  // table it describes.
  private renderRows(): void {
    this.hideReceipt();
    this.rows = sortCohortRows(this.rows, this.expectation);
    this.tbody.empty();
    let okCount = 0, badCount = 0, aiCount = 0;
    for (const row of this.rows) {
      const tr = this.tbody.createEl("tr");
      const td = (text: string, cls?: string): void => {
        tr.createEl("td", { text, cls });
      };
      td(row.file, "ks-mono");
      td(row.title);
      td(row.author);
      td(row.state, row.state === "verified" ? "ks-cok" : row.state === "verified-body-modified" ? "ks-cwarn" : "ks-cbad");
      td(row.conformance, row.conformance === "valid" ? "ks-cok" : row.conformance === "warnings" ? "ks-cwarn" : "ks-cbad");
      td(row.ai, row.ai === "none declared" ? "ks-cneutral" : undefined);
      const cv = chainVerdict(row, this.expectation);
      td(cv.text, "ks-" + cv.cls.slice(1));
      td(row.review || "—", row.review ? undefined : "ks-cneutral");
      if (row.state === "verified" || row.state === "verified-body-modified") okCount += 1;
      else badCount += 1;
      if (row.ai && row.ai !== "none declared") aiCount += 1;
    }
    this.summary.setText(
      this.rows.length + " file" + (this.rows.length === 1 ? "" : "s") + " · " +
      okCount + " verified · " + badCount + " failed or unreadable · " + aiCount + " with an AI disclosure" +
      (this.expectation ? ' · chain checked against "' + this.expectation.title + '"' : " · no chain expectation loaded")
    );
    this.resultsBox.removeClass("ks-hidden");
    this.chainBox.addClass("ks-hidden");
  }

  private toggleChains(): void {
    if (!this.chainBox.hasClass("ks-hidden")) {
      this.chainBox.addClass("ks-hidden");
      return;
    }
    this.chainBox.empty();
    const byHash = new Map<string, CohortRow>();
    for (const r of this.rows) if (r.stored) byHash.set(r.stored, r);
    const inSetParents = (r: CohortRow) =>
      r.parents.filter((pa) => pa && typeof pa.payload_hash === "string" && byHash.has(pa.payload_hash));
    const roots = this.rows.filter((r) => !inSetParents(r).length);
    const rest = this.rows.filter((r) => inSetParents(r).length);
    const addItem = (r: CohortRow): void => {
      const div = this.chainBox.createDiv({ cls: "ks-chainitem" });
      div.createDiv({ text: (r.title || r.file) + (r.author ? " — " + r.author : "") + " · " + r.state });
      for (const pa of inSetParents(r)) {
        const target = byHash.get(pa.payload_hash!)!;
        div.createDiv({
          cls: "ks-chainlink",
          text: "↳ builds on " + (target.title || target.file) + " (" + (pa.relationship || "linked") + ", hash matches)",
        });
      }
      for (const pa of r.parents.filter((p) => p && typeof p.payload_hash === "string" && !byHash.has(p.payload_hash))) {
        div.createDiv({
          cls: "ks-chainlink",
          text: "↳ builds on " + String(typeof pa.title === "string" ? pa.title : "an object").slice(0, 60) + " (not among the loaded files)",
        });
      }
    };
    roots.forEach(addItem);
    rest.forEach(addItem);
    this.chainBox.removeClass("ks-hidden");
  }
}
