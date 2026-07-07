/**
 * intake.ts — vault-native replacement for the browser Studio's
 * drop / choose / paste intake: use the active note, pick a vault file,
 * or paste raw text.
 */
import { button, errorBox, hideError, showError } from "./ui";
import type { IntakeResult, StudioContext } from "./panel-context";

export interface IntakeOpts {
  /** Label above the intake controls, e.g. "Load the original". */
  label: string;
  onText: (text: string, name: string) => Promise<void>;
}

export function buildIntake(parent: HTMLElement, ctx: StudioContext, opts: IntakeOpts): void {
  const box = parent.createDiv({ cls: "ks-intake" });
  box.createDiv({ cls: "ks-intake-label", text: opts.label });
  const err = errorBox(box);

  const handle = async (r: IntakeResult | null): Promise<void> => {
    if (!r) {
      showError(err, "No active markdown note. Open the file you want to load, or pick one from the vault.");
      return;
    }
    hideError(err);
    try {
      await opts.onText(r.text, r.name);
    } catch (e) {
      showError(err, e instanceof Error ? e.message : String(e));
    }
  };

  const btns = box.createDiv({ cls: "ks-rowbtns" });
  button(btns, "Use active note", async () => {
    try {
      await handle(await ctx.activeNote());
    } catch (e) {
      showError(err, e instanceof Error ? e.message : String(e));
    }
  });
  button(btns, "Choose from vault…", () => ctx.pickFile((r) => void handle(r)));
  const pasteToggle = button(btns, "Paste text…", () => {
    const open = pasteWrap.hasClass("ks-hidden");
    pasteWrap.toggleClass("ks-hidden", !open);
    pasteToggle.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) area.focus();
  });
  pasteToggle.setAttribute("aria-expanded", "false");

  const pasteWrap = box.createDiv({ cls: "ks-pastewrap ks-hidden" });
  const area = pasteWrap.createEl("textarea", {
    attr: { rows: "6", "aria-label": "Pasted KNOBE file text" },
    placeholder: "Paste the full text of a .knobe.md file",
  });
  button(pasteWrap, "Load pasted text", async () => {
    if (!area.value.trim()) {
      showError(err, "Paste the full text of a .knobe.md file first.");
      return;
    }
    await handle({ text: area.value, name: "pasted text", file: null });
  });
}
