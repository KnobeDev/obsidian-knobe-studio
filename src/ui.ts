/**
 * ui.ts — shared DOM widgets for the Studio dashboard, built on Obsidian's
 * createEl helpers. All dynamic content is set via textContent (never
 * innerHTML) because every KNOBE field is untrusted input; payload-derived
 * text also goes through shown() (display.ts).
 */
import type { VerifyReport } from "./engine/knobe-core";
import { REPORT_TEXT_LIMIT, shown, storedHashText } from "./display";

export const STATE_META: Record<string, { cls: string; sym: string; label: string }> = {
  verified: { cls: "v-ok", sym: "✓", label: "Verified. The sealed record is intact." },
  "verified-body-modified": {
    cls: "v-warn", sym: "!",
    label: "Verified, body modified. The sealed payload is intact; the readable body changed.",
  },
  failed: { cls: "v-bad", sym: "✕", label: "Failed. The recomputed hash does not match the stored one." },
  unreadable: { cls: "v-neutral", sym: "?", label: "Unreadable. No valid payload could be parsed." },
};

export function tagChip(parent: HTMLElement, text: string, cls: string): void {
  parent.createSpan({ cls: "ks-tag ks-" + cls, text });
}

export function stateTagCls(state: string): string {
  return state === "verified" ? "ok" : state === "verified-body-modified" ? "warn" : state === "failed" ? "bad" : "neutral";
}

export function conformanceTagCls(conformance: string): string {
  return conformance === "valid" ? "ok" : conformance === "warnings" ? "warn" : "bad";
}

/** Full verification report block — port of the Studio's renderReport. */
export function renderReport(container: HTMLElement, report: VerifyReport, sourceName?: string): void {
  container.empty();
  const meta = STATE_META[report.state] ?? STATE_META.unreadable;

  const verdict = container.createDiv({ cls: "ks-verdict " + meta.cls });
  const sym = verdict.createDiv({ cls: "ks-vsym", text: meta.sym });
  sym.setAttribute("aria-hidden", "true");
  const vb = verdict.createDiv();
  vb.createDiv({ cls: "ks-vlabel", text: meta.label });
  if (sourceName) vb.createDiv({ cls: "ks-vfile", text: shown(sourceName) });

  const tags = container.createDiv({ cls: "ks-tagsrow" });
  tagChip(tags, "integrity: " + report.state, stateTagCls(report.state));
  tagChip(tags, "conformance: " + report.conformance, conformanceTagCls(report.conformance));
  if (report.body_verified) {
    const bvCls = report.body_verified === "yes" ? "ok" : report.body_verified === "modified" ? "warn" : "neutral";
    tagChip(tags, "body: " + report.body_verified, bvCls);
  }

  const dl = container.createEl("dl", { cls: "ks-rgrid" });
  const rrow = (label: string, value: string, mono?: boolean): void => {
    const div = dl.createDiv({ cls: "ks-rrow" });
    div.createEl("dt", { text: label });
    div.createEl("dd", { text: value, cls: mono ? "ks-mono" : undefined });
  };
  const title = report.payload && typeof report.payload.title === "string" ? shown(report.payload.title, 160) : null;
  if (title) rrow("title", title);
  const stored = storedHashText(report.stored);
  if (stored) rrow("stored hash", stored, true);
  if (report.state === "failed" && report.computed) rrow("computed hash", report.computed, true);
  if (report.multiple_blocks) {
    rrow("payload blocks", report.block_count + " found; block " + report.block_used + " evaluated");
  }
  if (report.reason) rrow("reason", shown(report.reason, REPORT_TEXT_LIMIT));
  if (!dl.childElementCount) dl.remove();

  if (report.conformance_issues && report.conformance_issues.length) {
    const ul = container.createEl("ul", { cls: "ks-issues" });
    for (const issue of report.conformance_issues) ul.createEl("li", { text: shown(issue, REPORT_TEXT_LIMIT) });
  }

  const notes = container.createDiv({ cls: "ks-notes" });
  notes.createEl("p", {
    text: "A verified result confirms integrity, not truth: the sealed record is unchanged, whether or not its contents are accurate.",
  });

  container.removeClass("ks-hidden");
  container.tabIndex = -1;
  container.focus();
}

// ---- form field builders ----------------------------------------------------

let fieldSeq = 0;
const nextId = (prefix: string): string => "ks-" + prefix + "-" + ++fieldSeq;

export interface FieldOpts {
  placeholder?: string;
  rows?: number;
  onInput?: (value: string) => void;
}

export function textField(parent: HTMLElement, label: string, value: string, opts: FieldOpts = {}): HTMLInputElement {
  const wrap = parent.createDiv({ cls: "ks-field" });
  const id = nextId("f");
  wrap.createEl("label", { text: label, attr: { for: id } });
  const input = wrap.createEl("input", { type: "text", attr: { id, autocomplete: "off" } });
  input.value = value;
  if (opts.placeholder) input.placeholder = opts.placeholder;
  if (opts.onInput) input.addEventListener("input", () => opts.onInput!(input.value));
  return input;
}

export function textAreaField(parent: HTMLElement, label: string, value: string, opts: FieldOpts = {}): HTMLTextAreaElement {
  const wrap = parent.createDiv({ cls: "ks-field" });
  const id = nextId("f");
  wrap.createEl("label", { text: label, attr: { for: id } });
  const ta = wrap.createEl("textarea", { attr: { id, rows: String(opts.rows ?? 3) } });
  ta.value = value;
  if (opts.placeholder) ta.placeholder = opts.placeholder;
  if (opts.onInput) ta.addEventListener("input", () => opts.onInput!(ta.value));
  return ta;
}

export function selectField(
  parent: HTMLElement,
  label: string,
  options: Array<[string, string]>,
  value: string,
  onChange?: (value: string) => void
): HTMLSelectElement {
  const wrap = parent.createDiv({ cls: "ks-field" });
  const id = nextId("f");
  wrap.createEl("label", { text: label, attr: { for: id } });
  const sel = wrap.createEl("select", { attr: { id }, cls: "dropdown" });
  for (const [val, text] of options) sel.createEl("option", { text, attr: { value: val } });
  sel.value = value;
  if (onChange) sel.addEventListener("change", () => onChange(sel.value));
  return sel;
}

export function checkField(parent: HTMLElement, label: string, checked: boolean, onChange?: (v: boolean) => void): HTMLInputElement {
  const wrap = parent.createEl("label", { cls: "ks-checkline" });
  const cb = wrap.createEl("input", { type: "checkbox" });
  cb.checked = checked;
  wrap.createSpan({ text: " " + label });
  if (onChange) cb.addEventListener("change", () => onChange(cb.checked));
  return cb;
}

export function row2(parent: HTMLElement): HTMLElement {
  return parent.createDiv({ cls: "ks-row2" });
}

export function button(
  parent: HTMLElement,
  label: string,
  onClick: () => void | Promise<void>,
  opts: { cta?: boolean; link?: boolean } = {}
): HTMLButtonElement {
  const cls = opts.link ? "ks-linkbtn" : opts.cta ? "mod-cta" : "";
  const b = parent.createEl("button", { text: label, cls, attr: { type: "button" } });
  // Pointer cancellation (WCAG 2.5.2): activation on click (up-event), never
  // pointerdown. The disabled latch stops a double-click from racing two
  // async seal/save handlers against each other.
  b.addEventListener("click", () => {
    if (b.disabled) return;
    b.disabled = true;
    void Promise.resolve()
      .then(onClick)
      .finally(() => { b.disabled = false; });
  });
  return b;
}

export function errorBox(parent: HTMLElement): HTMLElement {
  // aria-live + aria-atomic alongside role=alert so the later text mutation
  // is announced even though the node is created empty and hidden.
  const el = parent.createDiv({
    cls: "ks-error ks-hidden",
    attr: { role: "alert", "aria-live": "assertive", "aria-atomic": "true" },
  });
  return el;
}

export function showError(el: HTMLElement, message: string): void {
  el.setText(message);
  el.removeClass("ks-hidden");
}

export function hideError(el: HTMLElement): void {
  el.addClass("ks-hidden");
}

export function sectionHeading(parent: HTMLElement, text: string): void {
  parent.createEl("h3", { text, cls: "ks-subhead" });
}

export function helpText(parent: HTMLElement, text: string): void {
  parent.createEl("p", { cls: "ks-help", text });
}

let statusRegion: HTMLElement | null = null;

/**
 * Announce a status message through a shared visually-hidden polite live
 * region, leaving button labels stable (SC 2.5.3 Label in Name).
 */
export function announce(message: string): void {
  const region = prepareAnnouncer();
  region.setText("");
  window.setTimeout(() => region.setText(message), 30);
}

/** Create the live region ahead of the first message (call at plugin load):
 * screen readers can miss a region created at the moment its text is set.
 * Recreated when its window closed or focus moved to another window (a
 * popout), so a message is read where the user is. */
export function prepareAnnouncer(): HTMLElement {
  if (!statusRegion || !statusRegion.isConnected || statusRegion.ownerDocument !== activeDocument) {
    statusRegion?.remove();
    statusRegion = activeDocument.body.createDiv({
      cls: "ks-sr-only",
      attr: { role: "status", "aria-live": "polite", "aria-atomic": "true" },
    });
  }
  return statusRegion;
}

export async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    announce("Copied to clipboard.");
  } catch {
    announce("Copy failed.");
  }
}

export const debounce = <A extends unknown[]>(fn: (...a: A) => void, ms: number): ((...a: A) => void) => {
  let t: number | undefined;
  return (...a: A) => {
    window.clearTimeout(t);
    t = window.setTimeout(() => fn(...a), ms);
  };
};
