/**
 * panels/transform.ts — the Transform panel: load a verified original,
 * derive a new object that declares its parent by hash, and seal it.
 */
import { permits, read, transformKnobe, verify, type CreateResult, type VerifyReport } from "../engine/knobe-core";
import { REPORT_TEXT_LIMIT, shown, storedHashText } from "../display";
import { BEGIN_MARKER, localToday, singleLine, slugify } from "../studio-core";
import {
  button, conformanceTagCls, copyToClipboard, errorBox, helpText, hideError,
  row2, selectField, showError, stateTagCls, tagChip, textAreaField, textField,
} from "../ui";
import { buildIntake } from "../intake";
import type { StudioContext } from "../panel-context";

const T_TYPES: Array<[string, string]> = [
  ["compression", "compression (summary)"], ["synthesis", "synthesis"], ["annotation", "annotation"],
  ["translation", "translation"], ["adaptation", "adaptation"], ["original", "original (major rework)"],
];
const PRIVACY: Array<[string, string]> = [
  ["public", "public"], ["internal", "internal"], ["sensitive", "sensitive"], ["restricted", "restricted"],
];

export class TransformPanel {
  private ctx: StudioContext;
  private original: { text: string; report: VerifyReport } | null = null;
  private result: CreateResult | null = null;

  private work!: HTMLElement;
  private origTitle!: HTMLElement;
  private origHash!: HTMLElement;
  private origTags!: HTMLElement;
  private origPermits!: HTMLElement;
  private title!: HTMLInputElement;
  private summary!: HTMLTextAreaElement;
  private type!: HTMLSelectElement;
  private license!: HTMLInputElement;
  private privacy!: HTMLSelectElement;
  private author!: HTMLInputElement;
  private body!: HTMLTextAreaElement;
  private blockWarn!: HTMLElement;
  private sealErr!: HTMLElement;
  private resBox!: HTMLElement;
  private resText!: HTMLElement;
  private resHash!: HTMLElement;
  private resChain!: HTMLElement;
  private fileName!: HTMLInputElement;

  constructor(ctx: StudioContext, root: HTMLElement) {
    this.ctx = ctx;
    helpText(root, "Derive a new object from a verified original. The derivative records the original's payload hash as its parent, so the chain of custody stays checkable.");

    buildIntake(root, ctx, {
      label: "Load the original (it must verify first)",
      onText: (text, name) => this.loadOriginal(text, name),
    });

    this.work = root.createDiv({ cls: "ks-hidden" });
    const orig = this.work.createDiv({ cls: "ks-origcard" });
    this.origTitle = orig.createDiv({ cls: "ks-origtitle" });
    this.origHash = orig.createDiv({ cls: "ks-mono" });
    this.origTags = orig.createDiv({ cls: "ks-tagsrow" });
    this.origPermits = orig.createDiv({ cls: "ks-help" });

    const f = this.work.createDiv();
    const r1 = row2(f);
    this.title = textField(r1, "New title", "");
    this.type = selectField(r1, "Content type", T_TYPES, "compression");
    this.summary = textAreaField(f, "Summary of the derivative", "", { rows: 2 });
    this.body = textAreaField(f, "Derived content (markdown body)", "", { rows: 8 });
    this.body.addEventListener("input", () => {
      this.blockWarn.toggleClass("ks-hidden", !this.body.value.includes(BEGIN_MARKER));
    });
    this.blockWarn = f.createDiv({
      cls: "ks-warnbox ks-hidden",
      text: "The body contains a KNOBE payload block. Consider linking by hash instead of embedding a sealed object.",
      attr: { role: "status" },
    });
    const r2 = row2(f);
    this.license = textField(r2, "License", "");
    this.privacy = selectField(r2, "Privacy level", PRIVACY, "public");
    this.author = textField(f, "Your name (transformer)", this.ctx.settings.defaultAuthor);
    this.sealErr = errorBox(f);
    button(f.createDiv({ cls: "ks-rowbtns ks-sealrow" }), "Seal derivative", () => this.seal(), { cta: true });

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

  private async loadOriginal(text: string, _name: string): Promise<void> {
    const report = await verify(text);
    if (report.state !== "verified" && report.state !== "verified-body-modified") {
      this.work.addClass("ks-hidden");
      throw new Error("Cannot derive from this file (status: " + report.state + "). The original must verify first.");
    }
    const rd = await read(text);
    this.original = { text, report };
    this.origTitle.setText(typeof report.payload?.title === "string" ? shown(report.payload.title, 160) : "Untitled");
    this.origHash.setText("payload_hash " + (storedHashText(report.stored) ?? "(none)"));
    this.origTags.empty();
    tagChip(this.origTags, "integrity: " + report.state, stateTagCls(report.state));
    tagChip(this.origTags, "conformance: " + report.conformance, conformanceTagCls(report.conformance));
    const parentCount = Array.isArray(report.payload?.parents) ? report.payload.parents.length : 0;
    tagChip(this.origTags, "parents: " + parentCount, "neutral");

    const p = permits(report, "transform");
    const verdictWord = p.allowed === true ? "allowed" : p.allowed === "conditional" ? "conditional" : "not permitted";
    let permitsLine = 'The sealed terms evaluate "transform" as ' + verdictWord + ".";
    // Obligations quote the sealed license, privacy_level and extension keys.
    if (p.obligations.length) {
      permitsLine += " Obligations: " + p.obligations.map((o) => shown(o, REPORT_TEXT_LIMIT)).join("; ") + ".";
    }
    if (p.allowed === false) {
      permitsLine += " Studio will still seal a derivative; authorization is a matter of the sealed terms, not the tool.";
    }
    this.origPermits.setText(permitsLine);

    this.body.value = (rd.body ?? "").replace(/^\n+/, "");
    this.license.value = typeof report.payload?.license === "string" ? report.payload.license : "";
    const priv = report.payload?.privacy_level;
    if (typeof priv === "string" && ["public", "internal", "sensitive", "restricted"].includes(priv)) {
      this.privacy.value = priv;
    }
    this.title.value = "";
    this.summary.value = "";
    this.resBox.addClass("ks-hidden");
    hideError(this.sealErr);
    this.work.removeClass("ks-hidden");
    this.blockWarn.toggleClass("ks-hidden", !this.body.value.includes(BEGIN_MARKER));
    this.title.focus();
  }

  private async seal(): Promise<void> {
    if (!this.original) return;
    hideError(this.sealErr);
    try {
      const fields: Record<string, unknown> = {};
      const title = singleLine(this.title.value);
      if (title) fields.title = title;
      const summary = this.summary.value.trim();
      if (summary) fields.summary = summary;
      fields.content_type = this.type.value;
      fields.created_date = localToday();
      const lic = singleLine(this.license.value);
      if (lic) fields.license = lic;
      fields.privacy_level = this.privacy.value;
      const author = singleLine(this.author.value) || null;

      this.result = await transformKnobe(this.original.text, { fields, body: this.body.value, author });
      const parents = this.result.payload.parents ?? [];
      const last = parents[parents.length - 1] ?? {};
      const match = last.payload_hash === this.original.report.stored;
      this.resText.setText("Sealed. Self-check: " + this.result.report.state + " · " + this.result.report.conformance + ".");
      this.resHash.setText("payload_hash " + this.result.payloadHash);
      this.resChain.empty();
      this.resChain.createSpan({ text: "Declared parent: " });
      this.resChain.createEl("code", { text: String(last.payload_hash ?? "") });
      this.resChain.createSpan({
        cls: match ? "ks-cok" : "ks-cbad",
        text: match ? " matches the loaded original." : " does not match the loaded original.",
      });
      this.fileName.value = slugify(this.result.payload.title);
      this.resBox.removeClass("ks-hidden");
      this.resBox.focus();
    } catch (e) {
      showError(this.sealErr, "Sealing did not complete: " + (e instanceof Error ? e.message : String(e)));
    }
  }
}
