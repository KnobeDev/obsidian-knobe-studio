/**
 * md-toolbar.ts — a small Markdown formatting toolbar bound to a textarea.
 * Buttons apply the pure transforms in md-format at the current cursor /
 * selection, so users don't have to remember syntax. Also renders a one-line
 * syntax cheatsheet for the keyboard-first crowd.
 */
import { applyMdAction, type MdAction } from "./md-format";

interface ToolButton {
  label: string;
  title: string;
  action: MdAction;
}

const BUTTONS: ToolButton[] = [
  { label: "H2", title: "Heading", action: { kind: "prefix", prefix: "## " } },
  { label: "B", title: "Bold", action: { kind: "wrap", marker: "**", placeholder: "bold" } },
  { label: "I", title: "Italic", action: { kind: "wrap", marker: "*", placeholder: "italic" } },
  { label: "“ ”", title: "Quote", action: { kind: "prefix", prefix: "> " } },
  { label: "• List", title: "Bulleted list", action: { kind: "prefix", prefix: "- " } },
  { label: "1. List", title: "Numbered list", action: { kind: "ordered" } },
  { label: "Link", title: "Insert link", action: { kind: "link" } },
  { label: "Code", title: "Inline code", action: { kind: "wrap", marker: "`", placeholder: "code" } },
];

/**
 * Build the toolbar above `textarea`. `onChange` is called after each edit so
 * the panel can sync its state and preview (the textarea's own "input" event
 * does not fire for programmatic value changes).
 */
export function buildMarkdownToolbar(
  parent: HTMLElement,
  textarea: HTMLTextAreaElement,
  onChange: (value: string) => void
): void {
  const bar = parent.createDiv({ cls: "ks-mdbar", attr: { role: "toolbar", "aria-label": "Markdown formatting" } });
  for (const b of BUTTONS) {
    const btn = bar.createEl("button", {
      text: b.label,
      cls: "ks-mdbtn",
      attr: { type: "button", title: b.title, "aria-label": b.title },
    });
    btn.addEventListener("click", () => {
      const next = applyMdAction(
        { value: textarea.value, selStart: textarea.selectionStart, selEnd: textarea.selectionEnd },
        b.action
      );
      textarea.value = next.value;
      textarea.setSelectionRange(next.selStart, next.selEnd);
      textarea.focus();
      onChange(next.value);
    });
  }
  parent.createDiv({
    cls: "ks-help ks-mdhint",
    text: "Markdown: # Heading · **bold** · *italic* · - bullet · 1. numbered · [text](url) link · `code`. Or compose in a note and use “Start from active note”.",
  });
}
