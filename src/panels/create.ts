/**
 * panels/create.ts — the Create panel: fill the form (or start from a
 * template, the active note, or a journey step), watch the live preview,
 * and seal the result into the vault.
 */
import { createKnobe, type CreateResult } from "../engine/knobe-core";
import {
  BEGIN_MARKER,
  applyTemplate,
  buildCreateArgs,
  emptyCreateState,
  localToday,
  slugify,
  type CreateFormState,
  type ExtraSource,
  type JourneyContext,
} from "../studio-core";
import {
  announce, button, checkField, copyToClipboard, debounce, errorBox, helpText, hideError,
  row2, sectionHeading, selectField, showError, textAreaField, textField,
} from "../ui";
import { REPORT_TEXT_LIMIT, shown } from "../display";
import { buildMarkdownToolbar } from "../md-toolbar";
import { renderJourneyMap } from "../journey-map-view";
import type { JourneyPrime, StudioContext } from "../panel-context";

const CONTENT_TYPES: Array<[string, string]> = [
  ["original", "original"], ["compression", "compression"], ["synthesis", "synthesis"],
  ["annotation", "annotation"], ["translation", "translation"], ["adaptation", "adaptation"],
  ["seed", "seed"],
];
const PRIVACY_LEVELS: Array<[string, string]> = [
  ["public", "public"], ["internal", "internal"], ["sensitive", "sensitive"], ["restricted", "restricted"],
];
const QUARANTINE: Array<[string, string]> = [
  ["quarantine", "quarantine (default: not yet reviewed)"], ["trusted", "trusted"],
];
const TEMPLATE_CHOICES: Array<[string, string]> = [
  ["blank", "Blank"], ["instructor", "Instructor reading"], ["student", "Student reflection"],
  ["researcher", "Research transcript"], ["enterprise", "Enterprise summary"],
];

export class CreatePanel {
  private ctx: StudioContext;
  private root: HTMLElement;
  private state: CreateFormState;
  private journeyCtx: JourneyContext | null = null;
  private onSealed: ((r: CreateResult) => void) | null = null;
  private result: CreateResult | null = null;
  private resultDest: { term?: string; course?: string } | null = null;

  private banner!: HTMLElement;
  private mapEl!: HTMLElement;
  private journeyMap: JourneyPrime["journeyMap"] | null = null;
  private aiWrap!: HTMLElement;
  private aiName!: HTMLInputElement;
  private aiWhat!: HTMLTextAreaElement;
  private aiPolicyNote!: HTMLElement;
  private form!: HTMLElement;
  private extraSourcesEl!: HTMLElement;
  private addSourceBtn!: HTMLButtonElement;
  private preview!: HTMLElement;
  private previewNote!: HTMLElement;
  private blockWarn!: HTMLElement;
  private err!: HTMLElement;
  private resBox!: HTMLElement;
  private resText!: HTMLElement;
  private resHash!: HTMLElement;
  private fileName!: HTMLInputElement;
  private previewToken = 0;

  constructor(ctx: StudioContext, root: HTMLElement) {
    this.ctx = ctx;
    this.root = root;
    this.state = this.freshState();
    this.build();
  }

  private freshState(): CreateFormState {
    const s = emptyCreateState();
    s.author = this.ctx.settings.defaultAuthor;
    s.license = this.ctx.settings.defaultLicense;
    return s;
  }

  private build(): void {
    const root = this.root;
    helpText(root, "Seal content into a .knobe.md knowledge object: the markdown body stays readable, and a sealed payload records attribution, fidelity limits, and use conditions with a SHA-256 integrity hash.");

    this.banner = root.createDiv({ cls: "ks-banner ks-hidden", attr: { role: "status" } });
    this.mapEl = root.createDiv({ cls: "ks-hidden" });

    const starters = root.createDiv({ cls: "ks-rowbtns" });
    button(starters, "Start from active note", async () => {
      try {
        const note = await this.ctx.activeNote();
        if (!note) {
          showError(this.err, "No active markdown note to start from.");
          return;
        }
        this.state.title = note.name.replace(/\.md$/i, "").replace(/\.knobe$/i, "");
        this.state.body = note.text;
        this.rebuildForm();
      } catch (e) {
        showError(this.err, e instanceof Error ? e.message : String(e));
      }
    });
    selectField(starters, "Template", TEMPLATE_CHOICES, "blank", (name) => {
      const author = this.state.author;
      this.state = applyTemplate(name, localToday());
      this.state.author = author || this.ctx.settings.defaultAuthor;
      if (!this.state.license) this.state.license = this.ctx.settings.defaultLicense;
      this.journeyCtx = null;
      this.banner.addClass("ks-hidden");
      this.setJourneyMap(null);
      this.aiWrap.addClass("ks-hidden");
      this.rebuildForm();
    });
    button(starters, "Reset", () => {
      this.state = this.freshState();
      this.journeyCtx = null;
      this.onSealed = null;
      this.banner.addClass("ks-hidden");
      this.setJourneyMap(null);
      this.aiWrap.addClass("ks-hidden");
      this.rebuildForm();
    });

    this.aiWrap = root.createDiv({ cls: "ks-aiwrap ks-hidden" });
    this.aiPolicyNote = this.aiWrap.createDiv({ cls: "ks-help" });
    const aiFields = this.aiWrap.createDiv();
    this.aiName = textField(aiFields, "AI tool used (leave blank if none)", "", {
      onInput: () => this.schedulePreview(),
    });
    this.aiWhat = textAreaField(aiFields, "What the AI did, and what you did yourself", "", {
      rows: 2, onInput: () => this.schedulePreview(),
    });

    this.form = root.createDiv();
    this.err = errorBox(root);

    this.resBox = root.createDiv({ cls: "ks-result ks-hidden", attr: { tabindex: "-1" } });
    this.resText = this.resBox.createDiv({ cls: "ks-restext" });
    this.resHash = this.resBox.createDiv({ cls: "ks-mono ks-reshash" });
    const nameRow = this.resBox.createDiv({ cls: "ks-rowbtns" });
    this.fileName = textField(nameRow, "File name", "untitled.knobe.md");
    button(nameRow, "Save to vault", async () => {
      if (!this.result) return;
      const file = await this.ctx.saveSealed(this.fileName.value.trim() || "untitled.knobe.md", this.result.text, this.resultDest ?? undefined);
      if (this.ctx.settings.openAfterSeal) this.ctx.openFile(file);
    }, { cta: true });
    button(nameRow, "Copy file text", async () => {
      if (this.result) await copyToClipboard(this.result.text);
    });

    sectionHeading(root, "Preview");
    this.previewNote = root.createDiv({
      cls: "ks-help",
      text: "Updates as you type. The preview is the exact file the Seal button produces, including its hash.",
      attr: { "aria-live": "polite" },
    });
    this.blockWarn = root.createDiv({
      cls: "ks-warnbox ks-hidden",
      text: "The body contains a KNOBE payload block. Sealing content that embeds another sealed object can confuse verifiers; consider linking by hash instead.",
      attr: { role: "status" },
    });
    this.preview = root.createEl("pre", { cls: "ks-preview" });

    this.rebuildForm();
  }

  private rebuildForm(): void {
    const f = this.form;
    f.empty();
    const s = this.state;
    const onEdit = (): void => this.schedulePreview();

    const r1 = row2(f);
    textField(r1, "Title", s.title, { onInput: (v) => { s.title = v; onEdit(); } });
    selectField(r1, "Content type", CONTENT_TYPES, s.contentType, (v) => { s.contentType = v; onEdit(); });
    const onBody = (v: string): void => {
      s.body = v;
      this.blockWarn.toggleClass("ks-hidden", !v.includes(BEGIN_MARKER));
      onEdit();
    };
    const bodyArea = textAreaField(f, "Content (markdown body)", s.body, { rows: 8, onInput: onBody });
    // Mount a formatting toolbar between the field's label and its textarea, so
    // users aren't expected to remember Markdown syntax.
    const bodyField = bodyArea.parentElement;
    if (bodyField) {
      const toolbarHost = bodyField.createDiv();
      bodyField.insertBefore(toolbarHost, bodyArea);
      buildMarkdownToolbar(toolbarHost, bodyArea, onBody);
    }
    textAreaField(f, "Summary", s.summary, { rows: 2, onInput: (v) => { s.summary = v; onEdit(); } });

    const r2 = row2(f);
    textField(r2, "Created date (YYYY-MM-DD)", s.createdDate, { onInput: (v) => { s.createdDate = v; onEdit(); } });
    textField(r2, "License", s.license, { placeholder: "CC BY 4.0", onInput: (v) => { s.license = v; onEdit(); } });
    const r3 = row2(f);
    selectField(r3, "Privacy level", PRIVACY_LEVELS, s.privacyLevel, (v) => { s.privacyLevel = v; onEdit(); });
    selectField(r3, "Quarantine status", QUARANTINE, s.quarantineStatus, (v) => { s.quarantineStatus = v; onEdit(); });

    sectionHeading(f, "Attribution");
    const r4 = row2(f);
    textField(r4, "Author", s.author, { onInput: (v) => { s.author = v; onEdit(); } });
    textField(r4, "Contribution", s.contribution1, { placeholder: "wrote all prose", onInput: (v) => { s.contribution1 = v; onEdit(); } });
    const r5 = row2(f);
    textField(r5, "Role", s.role1, { placeholder: "author", onInput: (v) => { s.role1 = v; onEdit(); } });
    checkField(r5, "rights_bearing: true", s.rights1, (v) => { s.rights1 = v; onEdit(); });
    checkField(f, "Good-faith declaration: the attribution above is honest and complete", s.goodFaith, (v) => { s.goodFaith = v; onEdit(); });

    this.extraSourcesEl = f.createDiv();
    this.renderExtraSources();
    this.addSourceBtn = button(f, "Add another source", () => {
      s.extraSources.push({ author: "", contribution: "", role: "", rights: false });
      this.renderExtraSources();
    }, { link: true });

    sectionHeading(f, "Fidelity limits");
    textField(f, "Represents", s.represents, { placeholder: "a first-draft course reflection", onInput: (v) => { s.represents = v; onEdit(); } });
    textField(f, "Trust as", s.trustAs, { onInput: (v) => { s.trustAs = v; onEdit(); } });
    textAreaField(f, "Do not infer (one per line)", s.doNotInfer, { rows: 3, onInput: (v) => { s.doNotInfer = v; onEdit(); } });

    sectionHeading(f, "Use conditions");
    textAreaField(f, "Permitted uses (one per line)", s.permitted, { rows: 2, onInput: (v) => { s.permitted = v; onEdit(); } });
    textAreaField(f, "Requested preservations (one per line)", s.preservations, { rows: 2, onInput: (v) => { s.preservations = v; onEdit(); } });
    textField(f, "Consent note", s.consentNote, { onInput: (v) => { s.consentNote = v; onEdit(); } });

    const r6 = row2(f);
    textField(r6, "Language (BCP 47, e.g. en)", s.language, { onInput: (v) => { s.language = v; onEdit(); } });
    textField(r6, "Tags (comma-separated)", s.tags, { onInput: (v) => { s.tags = v; onEdit(); } });

    const sealRow = f.createDiv({ cls: "ks-rowbtns ks-sealrow" });
    button(sealRow, "Seal", () => this.seal(), { cta: true });

    this.schedulePreview();
  }

  private renderExtraSources(): void {
    const box = this.extraSourcesEl;
    box.empty();
    this.state.extraSources.forEach((src: ExtraSource, i: number) => {
      const row = box.createDiv({ cls: "ks-srcrow" });
      row.createDiv({ cls: "ks-srclabel", text: "Source " + (i + 2) });
      const r1 = row2(row);
      textField(r1, "Author", src.author, { onInput: (v) => { src.author = v; this.schedulePreview(); } });
      textField(r1, "Contribution", src.contribution, { onInput: (v) => { src.contribution = v; this.schedulePreview(); } });
      const r2 = row2(row);
      textField(r2, "Role", src.role, { onInput: (v) => { src.role = v; this.schedulePreview(); } });
      checkField(r2, "rights_bearing: true", src.rights, (v) => { src.rights = v; this.schedulePreview(); });
      button(row, "Remove this source", () => {
        this.state.extraSources.splice(i, 1);
        this.renderExtraSources();
        this.schedulePreview();
        // The row (and the focused button) is gone; park focus nearby.
        this.addSourceBtn.focus();
        announce("Source " + (i + 2) + " removed.");
      }, { link: true });
    });
  }

  private currentJourneyCtx(): JourneyContext | null {
    if (!this.journeyCtx) return null;
    return { ...this.journeyCtx, aiName: this.aiName.value, aiWhat: this.aiWhat.value };
  }

  private schedulePreview = debounce(() => void this.buildPreview(), 350);

  private async buildPreview(): Promise<void> {
    const token = ++this.previewToken;
    try {
      const r = await createKnobe(buildCreateArgs(this.state, this.currentJourneyCtx()));
      if (token !== this.previewToken) return;
      this.preview.setText(r.text);
      this.previewNote.setText("Self-check: " + r.report.state + " · " + r.report.conformance + ". The preview is the exact file the Seal button produces.");
    } catch (e) {
      if (token !== this.previewToken) return;
      this.preview.setText("");
      this.previewNote.setText("The file cannot be assembled yet: " + (e instanceof Error ? e.message : String(e)));
    }
  }

  private async seal(): Promise<void> {
    hideError(this.err);
    try {
      const ctx = this.currentJourneyCtx();
      this.result = await createKnobe(buildCreateArgs(this.state, ctx));
      // Capture the save destination at seal time: journey work lands in the
      // Term > Course hierarchy even if the journey context is cleared later.
      this.resultDest = ctx && (ctx.term || ctx.course) ? { term: ctx.term, course: ctx.course } : null;
      this.resText.setText("Sealed. Self-check: " + this.result.report.state + " · " + this.result.report.conformance + ".");
      this.resHash.setText("payload_hash " + this.result.payloadHash);
      this.fileName.value = slugify(this.result.payload.title);
      this.resBox.removeClass("ks-hidden");
      this.resBox.focus();
      // An instructor sealing a step anchors it: badge it on this panel's
      // copy of the map now. The Journey panel records the hash in its own
      // canonical steps via onSealed; the two copies are independent by design.
      if (this.journeyMap && ctx && !ctx.forStudent) {
        const { steps, currentIdx } = this.journeyMap;
        const payloadHash = this.result.payloadHash;
        this.setJourneyMap({
          steps: steps.map((st, i) => (i === currentIdx ? { ...st, spec_hash: payloadHash } : st)),
          currentIdx,
        });
      }
      if (this.onSealed) {
        const cb = this.onSealed;
        this.onSealed = null;
        cb(this.result);
      }
    } catch (e) {
      showError(this.err, "Sealing did not complete: " + (e instanceof Error ? e.message : String(e)));
    }
  }

  private setJourneyMap(map: JourneyPrime["journeyMap"] | null): void {
    this.journeyMap = map ?? null;
    renderJourneyMap(this.mapEl, map ? map.steps : null, map ? map.currentIdx : null);
  }

  /** Journey flows (instructor step sealing, student submissions) land here. */
  primeWithJourney(args: JourneyPrime): void {
    if (this.onSealed) {
      announce("The previous journey step was replaced before it was sealed; its hash will not be recorded.");
    }
    this.state = this.freshState();
    if (args.prefill) Object.assign(this.state, args.prefill);
    this.journeyCtx = args.journeyCtx;
    this.onSealed = args.onSealed ?? null;
    this.banner.setText(args.banner);
    this.banner.removeClass("ks-hidden");
    this.setJourneyMap(args.journeyMap ?? null);
    this.aiName.value = "";
    this.aiWhat.value = "";
    const ui = args.journeyCtx.aiUI;
    this.aiWrap.toggleClass("ks-hidden", ui === "none");
    this.aiName.parentElement!.parentElement!.toggleClass("ks-hidden", ui !== "disclose");
    if (ui === "disclose") {
      const detail = args.journeyCtx.assignmentContext.ai_policy_detail;
      this.aiPolicyNote.setText(
        (typeof detail === "string" ? shown(detail, REPORT_TEXT_LIMIT) + " " : "") +
        "If you used AI, describe specifically what it did and what you did yourself. The disclosure is sealed into the file."
      );
    } else if (ui === "attest") {
      this.aiPolicyNote.setText("This step's AI policy: not allowed. Sealing carries your good-faith declaration that the work is yours alone.");
    }
    this.rebuildForm();
  }
}
