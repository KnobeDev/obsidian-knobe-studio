/**
 * display.ts — display text for payload-derived values. KNOBE files can come
 * from anyone: a title, hash or reason can carry control characters, bidi
 * overrides that reorder what a reader sees, or unpaired surrogates, and a
 * field the spec says is a string can hold any JSON value. Everything shown
 * from a payload goes through shown(), which never throws.
 */
import { canonicalize, safe } from "./engine/knobe-core";

/** Engine-written text (reasons, issues, obligations) that quotes payload text. */
export const REPORT_TEXT_LIMIT = 2000;

/** JSON text of a parsed payload value as the engine's canonicalize() writes
 * it (keys sorted, a large integer kept as a number with every digit, where
 * safe() would quote it as a string). */
function jsonText(value: unknown): string | null {
  try {
    return canonicalize(value);
  } catch {
    return null;
  }
}

const UNSHOWABLE = "(a value that cannot be shown)";

/** Cut escaped text to `limit` code points, never through an escape sequence
 * (\xNN, \uNNNN). safe()'s own limit can cut through an escape it just wrote. */
function cut(text: string, limit: number): string {
  const points = Array.from(text);
  if (points.length <= limit) return text;
  let end = limit;
  for (let i = Math.max(0, end - 5); i < end; i++) {
    if (points[i] !== "\\") continue;
    const len = points[i + 1] === "x" ? 4 : points[i + 1] === "u" ? 6 : 0;
    if (len && i + len > end) {
      end = i;
      break;
    }
  }
  return points.slice(0, end).join("") + "\u2026";
}

/** The engine's safe() (control, bidi and line-separator characters and
 * unpaired surrogates escaped), cut at `limit` code points. A non-string is
 * shown as its JSON text, escaped the same way. */
export function shown(value: unknown, limit = 300): string {
  const text = typeof value === "string" ? value : jsonText(value) ?? UNSHOWABLE;
  return cut(safe(text, null), limit);
}

/** A stored payload_hash for display, or null when there is none. The engine
 * passes the payload's value through, so it may be any JSON value; a
 * non-string is shown for what it is ("12345 (expected a hash, got a number)"). */
export function storedHashText(stored: unknown): string | null {
  if (stored === null || stored === undefined || stored === "") return null;
  if (typeof stored === "string") return shown(stored, 100);
  const json = jsonText(stored);
  if (json === null) return UNSHOWABLE;
  const kind = json === "true" || json === "false" ? "a true/false value"
    : json.startsWith("[") ? "a list"
    : json.startsWith("{") ? "a group of fields"
    : "a number";
  return `${shown(stored, 100)} (expected a hash, got ${kind})`;
}
