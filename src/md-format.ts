/**
 * md-format.ts — pure text transforms for the Create panel's Markdown
 * toolbar. Each takes the current value and selection and returns the new
 * value plus where the selection should land, so the DOM layer stays a thin
 * wrapper and the editing logic is unit-testable.
 */

export interface EditState {
  value: string;
  selStart: number;
  selEnd: number;
}

const lineBounds = (value: string, pos: number): { start: number; end: number } => {
  const start = value.lastIndexOf("\n", pos - 1) + 1;
  const nl = value.indexOf("\n", pos);
  const end = nl === -1 ? value.length : nl;
  return { start, end };
};

/** Wrap the selection in `marker` (bold/italic/code); unwrap if already wrapped. */
export function toggleWrap(s: EditState, marker: string, placeholder = "text"): EditState {
  const { value, selStart, selEnd } = s;
  const selected = value.slice(selStart, selEnd);
  const m = marker.length;
  const already =
    value.slice(selStart - m, selStart) === marker && value.slice(selEnd, selEnd + m) === marker;
  if (already) {
    const inner = value.slice(selStart, selEnd);
    const next = value.slice(0, selStart - m) + inner + value.slice(selEnd + m);
    return { value: next, selStart: selStart - m, selEnd: selEnd - m };
  }
  const body = selected || placeholder;
  const next = value.slice(0, selStart) + marker + body + marker + value.slice(selEnd);
  const innerStart = selStart + m;
  return { value: next, selStart: innerStart, selEnd: innerStart + body.length };
}

/** Toggle a line prefix ("## ", "- ", "> ") on every line the selection spans. */
export function toggleLinePrefix(s: EditState, prefix: string): EditState {
  const { value, selStart, selEnd } = s;
  const first = lineBounds(value, selStart).start;
  const last = lineBounds(value, selEnd).end;
  const block = value.slice(first, last);
  const lines = block.split("\n");
  const allHave = lines.every((l) => l.startsWith(prefix));
  const out = lines.map((l) => (allHave ? l.slice(prefix.length) : prefix + l)).join("\n");
  const next = value.slice(0, first) + out + value.slice(last);
  return { value: next, selStart: first, selEnd: first + out.length };
}

/** Number the selected lines "1. ", "2. …"; toggle off if already numbered. */
export function toggleOrderedList(s: EditState): EditState {
  const { value, selStart, selEnd } = s;
  const first = lineBounds(value, selStart).start;
  const last = lineBounds(value, selEnd).end;
  const lines = value.slice(first, last).split("\n");
  const allHave = lines.every((l) => /^\d+\.\s/.test(l));
  const out = lines
    .map((l, i) => (allHave ? l.replace(/^\d+\.\s/, "") : i + 1 + ". " + l))
    .join("\n");
  const next = value.slice(0, first) + out + value.slice(last);
  return { value: next, selStart: first, selEnd: first + out.length };
}

/** Insert a Markdown link around the selection (used as the link text). */
export function insertLink(s: EditState, url = "https://"): EditState {
  const { value, selStart, selEnd } = s;
  const label = value.slice(selStart, selEnd) || "link text";
  const snippet = "[" + label + "](" + url + ")";
  const next = value.slice(0, selStart) + snippet + value.slice(selEnd);
  // Select the URL so the user can type over the placeholder immediately.
  const urlStart = selStart + label.length + 3;
  return { value: next, selStart: urlStart, selEnd: urlStart + url.length };
}

export type MdAction =
  | { kind: "wrap"; marker: string; placeholder?: string }
  | { kind: "prefix"; prefix: string }
  | { kind: "ordered" }
  | { kind: "link" };

export function applyMdAction(s: EditState, action: MdAction): EditState {
  switch (action.kind) {
    case "wrap":
      return toggleWrap(s, action.marker, action.placeholder);
    case "prefix":
      return toggleLinePrefix(s, action.prefix);
    case "ordered":
      return toggleOrderedList(s);
    case "link":
      return insertLink(s);
  }
}
