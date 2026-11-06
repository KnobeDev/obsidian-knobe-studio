/**
 * Payload-derived display text: the vendored engine's handling of hostile
 * payloads, display.ts, and renderReport on a minimal stand-in for
 * Obsidian's createEl DOM helpers.
 */
import { describe, expect, test } from "vitest";
import { createKnobe, verify } from "../src/engine/knobe-core.js";
import { shown, storedHashText } from "../src/display";
import { renderReport } from "../src/ui";
import { skippedSummary } from "../src/zip-intake";

const BLOCK = /-----BEGIN KNOBE B64-----\n([\s\S]*?)\n-----END KNOBE B64-----/;
const HASH = /"payload_hash":"[0-9a-f]{64}"/;
const UNSAFE = /[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069\u2028\u2029]/;

/** Re-encode a sealed document's payload after editing its JSON text. */
function rewritePayload(doc: string, edit: (json: string) => string): string {
  const m = doc.match(BLOCK)!;
  const json = Buffer.from(m[1].replace(/\s+/g, ""), "base64").toString("utf8");
  const b64 = Buffer.from(edit(json), "utf8").toString("base64");
  return doc.replace(m[0], `-----BEGIN KNOBE B64-----\n${b64}\n-----END KNOBE B64-----`);
}

async function sealed(fields: Record<string, unknown> = {}): Promise<string> {
  return (await createKnobe({
    fields: {
      title: "Plain title",
      attribution: {
        good_faith_declaration: true,
        sources: [{ author: "A. Author", contribution: "author", rights_bearing: true }],
      },
      ...fields,
    },
    body: "Hello.\n",
  })).text;
}

/** Just enough of Obsidian's createEl helpers for renderReport. Text is
 * converted with String(), as the textContent setter converts it. */
class FakeEl {
  children: FakeEl[] = [];
  text = "";
  tabIndex = 0;
  constructor(public tag: string, public cls = "", private parent: FakeEl | null = null) {}
  private add(tag: string, o: { cls?: string; text?: unknown } = {}): FakeEl {
    const el = new FakeEl(tag, o.cls ?? "", this);
    if (o.text !== undefined) el.text = String(o.text);
    this.children.push(el);
    return el;
  }
  createDiv(o?: { cls?: string; text?: unknown }) { return this.add("div", o); }
  createSpan(o?: { cls?: string; text?: unknown }) { return this.add("span", o); }
  createEl(tag: string, o?: { cls?: string; text?: unknown }) { return this.add(tag, o); }
  empty() { this.children = []; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this); }
  get childElementCount() { return this.children.length; }
  setAttribute() {}
  removeClass() {}
  focus() {}
  texts(): string[] { return [this.text, ...this.children.flatMap((c) => c.texts())].filter(Boolean); }
  /** The <dd> after the <dt> with this label. */
  row(label: string): string | undefined {
    const dl = this.children.find((c) => c.tag === "dl");
    const r = dl?.children.find((d) => d.children[0]?.text === label);
    return r?.children[1]?.text;
  }
}

async function rendered(doc: string, sourceName?: string): Promise<FakeEl> {
  const box = new FakeEl("div");
  renderReport(box as unknown as HTMLElement, await verify(doc), sourceName);
  return box;
}

describe("vendored engine (upstream PR #11, PR #12 / ERRATA E12)", () => {
  test("a payload with an overflowing number is unreadable instead of throwing", async () => {
    const report = await verify(rewritePayload(await sealed(), (j) => j.replace('"summary":""', '"summary":1e400')));
    expect(report.state).toBe("unreadable");
  });

  test("a no-break space in a payload block is not stripped", async () => {
    const report = await verify((await sealed()).replace(/(-----BEGIN KNOBE B64-----\n.{10})/, "$1\u00a0"));
    expect(report.state).toBe("unreadable");
  });
});

describe("shown()", () => {
  test("escapes control, bidi and separator characters, and unpaired surrogates", () => {
    expect(shown("a\u001b[31m\nb\u202ec\u2028")).toBe("a\\x1b[31m\\x0ab\\u202ec\\u2028");
    expect(shown("x\ud800y\udc00")).toBe("x\\ud800y\\udc00");
    expect(shown("caf\u00e9 \u{1f600}")).toBe("caf\u00e9 \u{1f600}");
  });

  test("cuts at a limit in code points, never through a pair or an escape", () => {
    expect(shown("\u{1f600}".repeat(5), 3)).toBe("\u{1f600}".repeat(3) + "\u2026");
    expect(shown("ab\u001bcd", 4)).toBe("ab\u2026");
    expect(shown("ab\u202ecd", 7)).toBe("ab\u2026");
    expect(shown("ab\u202ecd", 8)).toBe("ab\\u202e\u2026");
  });

  test("shows any JSON value as escaped JSON text and never throws", () => {
    const proto0 = Object.assign(Object.create(null), { a: "\u202e", big: 123456789012345678901234567890n });
    expect(shown(proto0)).toBe('{"a":"\\u202e","big":123456789012345678901234567890}');
    expect(shown(12345)).toBe("12345");
    expect(shown(null)).toBe("null");
    expect(shown(undefined)).toBe("(a value that cannot be shown)");
  });
});

describe("storedHashText()", () => {
  test.each([
    ["", null],
    [null, null],
    ["a".repeat(64), "a".repeat(64)],
    ["\u001b[2J", "\\x1b[2J"],
    [12345, "12345 (expected a hash, got a number)"],
    [true, "true (expected a hash, got a true/false value)"],
    [[1, 2], "[1,2] (expected a hash, got a list)"],
  ])("%j -> %j", (stored, text) => {
    expect(storedHashText(stored)).toBe(text);
  });
});

describe("renderReport", () => {
  test("shows a payload_hash that is an object instead of throwing", async () => {
    const doc = rewritePayload(await sealed(), (j) =>
      j.replace(HASH, '"payload_hash":{"x":123456789012345678901234567890,"y":"\\u202e"}')
    );
    const box = await rendered(doc);
    expect(box.row("stored hash")).toBe('{"x":123456789012345678901234567890,"y":"\\u202e"} (expected a hash, got a group of fields)');
  });

  test("shows a numeric payload_hash for what it is", async () => {
    const box = await rendered(rewritePayload(await sealed(), (j) => j.replace(HASH, '"payload_hash":12345')));
    expect(box.row("stored hash")).toBe("12345 (expected a hash, got a number)");
  });

  test("escapes the title, stored hash and source name", async () => {
    const forged = "\u001b[31mPWNED\n\u202e";
    const doc = rewritePayload(await sealed({ title: "Report\u202e\u2066 \u001b[2J" }), (j) =>
      j.replace(HASH, `"payload_hash":${JSON.stringify(forged)}`)
    );
    const box = await rendered(doc, "sub\u202emissions.zip \u203a evil\u0007.knobe.md");
    expect(box.row("title")).toBe("Report\\u202e\\u2066 \\x1b[2J");
    expect(box.row("stored hash")).toBe("\\x1b[31mPWNED\\x0a\\u202e");
    expect(box.texts()).toContain("sub\\u202emissions.zip \u203a evil\\x07.knobe.md");
    for (const t of box.texts()) expect(t).not.toMatch(UNSAFE);
  });

  test("writes an unpaired surrogate in a duplicate key as \\udXXX", async () => {
    const box = await rendered(rewritePayload(await sealed(), (j) => j.replace("{", '{"\\ud800":1,"\\ud800":2,')));
    expect(box.row("reason")).toContain("duplicate JSON key: \\ud800");
    for (const t of box.texts()) expect(t).not.toMatch(/[\ud800-\udfff]/u);
  });
});

describe("skippedSummary", () => {
  test("escapes archive entry paths, which zip-slip sanitizing leaves alone", () => {
    const text = skippedSummary({ entries: [], skipped: [{ path: "essay\u202egpj.md", reason: "encrypted entry (not extracted)" }] });
    expect(text).toBe("Skipped 1: essay\\u202egpj.md (encrypted entry (not extracted)).");
  });
});
