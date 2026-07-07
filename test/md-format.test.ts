import { describe, expect, test } from "vitest";
import {
  applyMdAction, insertLink, toggleLinePrefix, toggleOrderedList, toggleWrap,
  type EditState,
} from "../src/md-format";

const st = (value: string, selStart: number, selEnd: number): EditState => ({ value, selStart, selEnd });

describe("toggleWrap (bold/italic/code)", () => {
  test("wraps the selection and selects the inner text", () => {
    const r = toggleWrap(st("make bold here", 5, 9), "**", "bold");
    expect(r.value).toBe("make **bold** here");
    expect(r.value.slice(r.selStart, r.selEnd)).toBe("bold");
  });

  test("inserts a placeholder when nothing is selected", () => {
    const r = toggleWrap(st("", 0, 0), "*", "italic");
    expect(r.value).toBe("*italic*");
    expect(r.value.slice(r.selStart, r.selEnd)).toBe("italic");
  });

  test("unwraps when the selection is already wrapped", () => {
    // "a **bold** b": the inner "bold" spans indices 4–8.
    const r = toggleWrap(st("a **bold** b", 4, 8), "**", "bold");
    expect(r.value).toBe("a bold b");
    expect(r.value.slice(r.selStart, r.selEnd)).toBe("bold");
  });
});

describe("toggleLinePrefix (heading/quote/bullet)", () => {
  test("prefixes every line the selection spans", () => {
    const r = toggleLinePrefix(st("one\ntwo\nthree", 0, 13), "- ");
    expect(r.value).toBe("- one\n- two\n- three");
  });

  test("removes the prefix when all lines already have it", () => {
    const r = toggleLinePrefix(st("## a\n## b", 0, 8), "## ");
    expect(r.value).toBe("a\nb");
  });

  test("prefixes a single line from a caret position", () => {
    const r = toggleLinePrefix(st("hello", 2, 2), "> ");
    expect(r.value).toBe("> hello");
  });
});

describe("toggleOrderedList", () => {
  test("numbers the selected lines", () => {
    const r = toggleOrderedList(st("a\nb\nc", 0, 5));
    expect(r.value).toBe("1. a\n2. b\n3. c");
  });

  test("toggles numbering off", () => {
    const r = toggleOrderedList(st("1. a\n2. b", 0, 9));
    expect(r.value).toBe("a\nb");
  });
});

describe("insertLink", () => {
  test("wraps the selection as link text and selects the URL", () => {
    const r = insertLink(st("see docs today", 4, 8), "https://");
    expect(r.value).toBe("see [docs](https://) today");
    expect(r.value.slice(r.selStart, r.selEnd)).toBe("https://");
  });

  test("uses a placeholder label when nothing is selected", () => {
    const r = insertLink(st("", 0, 0), "https://");
    expect(r.value).toBe("[link text](https://)");
  });
});

describe("applyMdAction dispatch", () => {
  test("routes each action kind to its transform", () => {
    expect(applyMdAction(st("x", 0, 1), { kind: "wrap", marker: "`" }).value).toBe("`x`");
    expect(applyMdAction(st("x", 0, 1), { kind: "prefix", prefix: "## " }).value).toBe("## x");
    expect(applyMdAction(st("x", 0, 1), { kind: "ordered" }).value).toBe("1. x");
    expect(applyMdAction(st("x", 0, 1), { kind: "link" }).value).toBe("[x](https://)");
  });
});
