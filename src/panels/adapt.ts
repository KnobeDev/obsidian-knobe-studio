/**
 * panels/adapt.ts — the Adapt panel: create an accessibility adaptation
 * (plain language, translation, transcript, alt-text, multimodal) that is
 * sealed with lineage back to its source by payload hash.
 */
import { createKnobe, verify, type CreateResult, type VerifyReport } from "../engine/knobe-core";
import { ATYPES, BEGIN_MARKER, buildAdaptFields, cleanupAdaptText, localToday, slugify } from "../studio-core";
import {
  button, conformanceTagCls, copyToClipboard, errorBox, helpText, hideError,
  row2, selectField, showError, stateTagCls, tagChip, textAreaField, textField,
} from "../ui";
import { buildIntake } from "../intake";
import { read } from "../engine/knobe-core";
import type { StudioContext } from "../panel-context";

export class AdaptPanel {
  private ctx: StudioContext;
  private source: { text: string; report: VerifyReport; title: string; srcAuthor: string } | null = null;
  private result: CreateResult | null = null;
  private titleTouched = false;

  private work!: HTMLElement;
  private origTitle!: HTMLElement;
  private origHash!: HTMLElement;
  private origTags!: HTMLElement;
  private type!: HTMLSelectElement;
  private title!: HTMLInputElement;
  private adapter!: HTMLInputElement;
  private license!: HTMLInputElement;
  private body!: HTMLTextAreaElement;
  private cleanupNote!: HTMLElement;
  private blockWarn!: HTMLElement;
  private preserved!: HTMLTextAreaElement;
  private omitted!: HTMLTextAreaElement;
  private aiName!: HTMLInputElement;
  private aiWhat!: HTMLTextAreaElement;
  private reviewer!: HTMLInputElement;
  private sealErr!: HTMLElement;
  private resBox!: HTMLElement;
  private resText!: HTMLElement;
  private resHash!: HTMLElement;
  private resChain!: HTMLElement;
  private fileName!: HTMLInputElement;

  constructor(ctx: StudioContext, root: HTMLElement) {
    this.ctx = ctx;
    helpText(root, "Create an accessible version — plain language, translation, transcript, alt-text, or multimodal — sealed with lineage to its source. The adaptation declares what it preserves, what it omits, and who made it.");

    buildIntake(root, ctx, {
      label: "Load the source work (it must verify first)",
      onText: (text) => this.loadSource(text),
    });

    this.work = root.createDiv({ cls: "ks-hidden" });
    const orig = this.work.createDiv({ cls: "ks-origcard" });
    this.origTitle = orig.createDiv({ cls: "ks-origtitle" });
    this.origHash = orig.createDiv({ cls: "ks-mono" });
    this.origTags = orig.createDiv({ cls: "ks-tagsrow" });

    const f = this.work.createDiv();
    const r1 = row2(f);
    this.type = selectField(
      r1, "Adaptation type",
      Object.entries(ATYPES).map(([k, v]) => [k, v.label] as [string, string]),
      "simplification",
      () => this.suggestTitle()
    );
    this.title = textField(r1, "Title of the adaptation", "");
    this.title.addEventListener("input", () => { this.titleTouched = true; });

    this.body = textAreaField(f, "Adapted content (markdown body)", "", { rows: 8 });
    this.body.addEventListener("input", () => {
      this.blockWarn.toggleClass("ks-hidden", !this.body.value.includes(BEGIN_MARKER));
    });
    const cleanupRow = f.createDiv({ cls: "ks-rowbtns" });
    button(cleanupRow, "Clean up pasted text", () => {
      const before = this.body.value;
      const after = cleanupAdaptText(before);
      this.body.value = after;
      this.blockWarn.toggleClass("ks-hidden", !after.includes(BEGIN_MARKER));
      this.cleanupNote.setText(after === before ? "Nothing to clean." : "Cleaned: smart punctuation, stray HTML, and extra whitespace normalized.");
    }, { link: true });
    this.cleanupNote = cleanupRow.createSpan({ cls: "ks-help" });
    this.blockWarn = f.createDiv({
      cls: "ks-warnbox ks-hidden",
      text: "The body contains a KNOBE payload block. Consider linking by hash instead of embedding a sealed object.",
      attr: { role: "status" },
    });

    this.preserved = textAreaField(f, "What this adaptation preserves", "", {
      rows: 2, placeholder: "e.g. all definitions and the order of the argument",
    });
    this.omitted = textAreaField(f, "What it omits or changes", "", {
      rows: 2, placeholder: "e.g. the statistical appendix",
    });

    const r2 = row2(f);
    this.adapter = textField(r2, "Who made this adaptation", this.ctx.settings.defaultAuthor);
    this.reviewer = textField(r2, "Reviewer (optional)", "");
    const r3 = row2(f);
    this.aiName = textField(r3, "AI tool used (leave blank if none)", "");
    this.license = textField(r3, "License", "");
    this.aiWhat = textAreaField(f, "What the AI did, and what you did yourself", "", { rows: 2 });

    this.sealErr = errorBox(f);
    button(f.createDiv({ cls: "ks-rowbtns ks-sealrow" }), "Seal adaptation", () => this.seal(), { cta: true });

    this.resBox = this.work.createDiv({ cls: "ks-result ks-hidden", attr: { tabindex: "-1" } });
    this.resText = this.resBox.createDiv({ cls: "ks-restext" });
    this.resHash = this.resBox.createDiv({ cls: "ks-mono ks-reshash" });
    this.resChain = this.resBox.createDiv({ cls: "ks-chainline" });
    const nameRow = this.resBox.createDiv({ cls: "ks-rowbtns" });
    this.fileName = textField(nameRow, "File name", "untitled.knobe.md");
    button(nameRow, "Save to vault", async () => {
      if (!this.result) return;
      const file = await this.ctx.saveSealed(this.fileName.value.trim() || "untitled.knobe.md", this.result.text);
      if (this.ctx.settings.openAfterSeal) this.ctx.openFile(file);
    }, { cta: true });
    button(nameRow, "Copy file text", async () => {
      if (this.result) await copyToClipboard(this.result.text);
    });
  }

  private suggestTitle(): void {
    if (this.titleTouched || !this.source) return;
    const t = ATYPES[this.type.value];
    this.title.value = this.source.title + " (" + t.suffix + ")";
  }

  private async loadSource(text: string): Promise<void> {
    const report = await verify(text);
    if (report.state !== "verified" && report.state !== "verified-body-modified") {
      this.work.addClass("ks-hidden");
      throw new Error("Cannot adapt this file (status: " + report.state + "). The source must verify first.");
    }
    const rd = await read(text);
    const title = typeof report.payload?.title === "string" ? report.payload.title : "Untitled";
    const srcSources = report.payload?.attribution?.sources ?? [];
    const srcAuthor = srcSources[0] && typeof srcSources[0].author === "string" ? srcSources[0].author : "";
    this.source = { text, report, title, srcAuthor };
    this.origTitle.setText(title.slice(0, 160));
    this.origHash.setText("payload_hash " + report.stored);
    this.origTags.empty();
    tagChip(this.origTags, "integrity: " + report.state, stateTagCls(report.state));
    tagChip(this.origTags, "conformance: " + report.conformance, conformanceTagCls(report.conformance));
    this.body.value = (rd.body ?? "").replace(/^\n+/, "");
    this.license.value = typeof report.payload?.license === "string" ? report.payload.license : "";
    this.titleTouched = false;
    this.suggestTitle();
    this.preserved.value = "";
    this.omitted.value = "";
    this.aiName.value = "";
    this.aiWhat.value = "";
    this.reviewer.value = "";
    this.cleanupNote.setText("");
    this.resBox.addClass("ks-hidden");
    hideError(this.sealErr);
    this.work.removeClass("ks-hidden");
    this.blockWarn.toggleClass("ks-hidden", !this.body.value.includes(BEGIN_MARKER));
    this.type.focus();
  }

  private async seal(): Promise<void> {
    if (!this.source) return;
    hideError(this.sealErr);
    try {
      const stored = this.source.report.stored;
      const fields = buildAdaptFields({
        type: this.type.value,
        sourceTitle: this.source.title,
        sourceReport: this.source.report,
        sourceAuthor: this.source.srcAuthor,
        adapter: this.adapter.value,
        aiName: this.aiName.value,
        aiWhat: this.aiWhat.value,
        reviewer: this.reviewer.value,
        title: this.title.value,
        license: this.license.value,
        preserved: this.preserved.value,
        omitted: this.omitted.value,
        today: localToday(),
      });
      this.result = await createKnobe({ fields, body: this.body.value });
      const pa = (this.result.payload.parents ?? [])[0] ?? {};
      const acc = (this.result.payload.accessibility ?? [])[0] ?? {};
      const match = pa.payload_hash === stored && acc.adapted_from === stored;
      this.resText.setText("Sealed. Self-check: " + this.result.report.state + " · " + this.result.report.conformance + ".");
      this.resHash.setText("payload_hash " + this.result.payloadHash);
      this.resChain.empty();
      this.resChain.createSpan({ text: "Declared source (parents and accessibility record): " });
      this.resChain.createEl("code", { text: String(pa.payload_hash ?? "") });
      this.resChain.createSpan({
        cls: match ? "ks-cok" : "ks-cbad",
        text: match ? " both match the loaded source." : " does not match the loaded source.",
      });
      this.fileName.value = slugify(this.result.payload.title);
      this.resBox.removeClass("ks-hidden");
      this.resBox.focus();
    } catch (e) {
      showError(this.sealErr, "Sealing did not complete: " + (e instanceof Error ? e.message : String(e)));
    }
  }
}
