import { describe, expect, test } from "vitest";
import { deflateRawSync } from "node:zlib";
import { readZipTextEntries } from "../src/zip";

/**
 * Minimal in-test ZIP writer: enough of the format (local headers, central
 * directory, EOCD) to build hostile fixtures without a dependency.
 */
interface RawEntry {
  name: string;
  data: Uint8Array;
  method: 0 | 8;
  flags?: number;
  declaredUncompressed?: number; // override to lie about size (bomb headers)
}

function makeZip(entries: RawEntry[]): Uint8Array {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const le16 = (v: number): number[] => [v & 0xff, (v >> 8) & 0xff];
  const le32 = (v: number): number[] => [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff];

  for (const e of entries) {
    const nameB = enc.encode(e.name);
    const comp = e.method === 8 ? new Uint8Array(deflateRawSync(e.data)) : e.data;
    const uncomp = e.declaredUncompressed ?? e.data.length;
    const flags = e.flags ?? 0;
    const local = new Uint8Array([
      ...le32(0x04034b50), ...le16(20), ...le16(flags), ...le16(e.method),
      ...le16(0), ...le16(0), ...le32(0), ...le32(comp.length), ...le32(uncomp),
      ...le16(nameB.length), ...le16(0),
    ]);
    const localOffset = offset;
    chunks.push(local, nameB, comp);
    offset += local.length + nameB.length + comp.length;
    central.push(new Uint8Array([
      ...le32(0x02014b50), ...le16(20), ...le16(20), ...le16(flags), ...le16(e.method),
      ...le16(0), ...le16(0), ...le32(0), ...le32(comp.length), ...le32(uncomp),
      ...le16(nameB.length), ...le16(0), ...le16(0), ...le16(0), ...le16(0),
      ...le32(0), ...le32(localOffset),
    ]), nameB);
  }

  const centralStart = offset;
  for (const c of central) {
    chunks.push(c);
    offset += c.length;
  }
  const centralSize = offset - centralStart;
  chunks.push(new Uint8Array([
    ...le32(0x06054b50), ...le16(0), ...le16(0),
    ...le16(entries.length), ...le16(entries.length),
    ...le32(centralSize), ...le32(centralStart), ...le16(0),
  ]));

  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.length;
  }
  return out;
}

const text = (s: string): Uint8Array => new TextEncoder().encode(s);

describe("readZipTextEntries — happy path", () => {
  test("extracts stored and deflated markdown/text entries", async () => {
    const zip = makeZip([
      { name: "alice.knobe.md", data: text("# Alice\nsealed."), method: 8 },
      { name: "notes.txt", data: text("plain notes"), method: 0 },
    ]);
    const r = await readZipTextEntries(zip);
    expect(r.entries).toHaveLength(2);
    expect(r.entries[0]).toMatchObject({ name: "alice.knobe.md", text: "# Alice\nsealed." });
    expect(r.entries[1]!.text).toBe("plain notes");
  });

  test("skips non-text files (images) and macOS junk, keeping text entries", async () => {
    const zip = makeZip([
      { name: "img.png", data: new Uint8Array([137, 80, 78, 71]), method: 0 },
      { name: "__MACOSX/._alice.knobe.md", data: text("resource fork"), method: 0 },
      { name: "sub/alice.md", data: text("ok"), method: 0 },
    ]);
    const r = await readZipTextEntries(zip);
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0]!.name).toBe("alice.md");
  });
});

describe("readZipTextEntries — hostile input", () => {
  test("zip-slip names are neutralized: no separators or dot-dot survive", async () => {
    const zip = makeZip([
      { name: "../../../etc/passwd.md", data: text("evil"), method: 0 },
      { name: "..\\..\\win\\evil.md", data: text("evil2"), method: 0 },
      { name: "/abs/path/root.md", data: text("evil3"), method: 0 },
    ]);
    const r = await readZipTextEntries(zip);
    expect(r.entries).toHaveLength(3);
    for (const e of r.entries) {
      expect(e.name).not.toMatch(/[\\/]/);
      expect(e.name).not.toContain("..");
      expect(e.path).not.toContain("..");
      expect(e.path.startsWith("/")).toBe(false);
    }
  });

  test("encrypted entries are skipped with a reason, never extracted", async () => {
    const zip = makeZip([
      { name: "secret.md", data: text("cipher-ish"), method: 0, flags: 0x0001 },
      { name: "open.md", data: text("fine"), method: 0 },
    ]);
    const r = await readZipTextEntries(zip);
    expect(r.entries.map((e) => e.name)).toEqual(["open.md"]);
    expect(r.skipped.some((s) => /encrypt/i.test(s.reason))).toBe(true);
  });

  test("a lying header (data expands past its declared size) is skipped — zip-bomb guard", async () => {
    const big = text("A".repeat(50_000));
    const zip = makeZip([
      { name: "bomb.md", data: big, method: 8, declaredUncompressed: 10 },
      { name: "ok.md", data: text("fine"), method: 8 },
    ]);
    const r = await readZipTextEntries(zip);
    expect(r.entries.map((e) => e.name)).toEqual(["ok.md"]);
    expect(r.skipped.some((s) => /declared size/i.test(s.reason))).toBe(true);
  });

  test("per-file and total caps hold", async () => {
    const zip = makeZip([
      { name: "huge.md", data: text("B".repeat(2_000)), method: 0 },
      { name: "a.md", data: text("C".repeat(800)), method: 0 },
      { name: "b.md", data: text("D".repeat(800)), method: 0 },
    ]);
    const r = await readZipTextEntries(zip, { maxFileBytes: 1_000, maxTotalBytes: 1_200 });
    // huge.md over per-file cap; a.md fits; b.md would exceed the total cap.
    expect(r.entries.map((e) => e.name)).toEqual(["a.md"]);
    expect(r.skipped.length).toBe(2);
  });

  test("entry-count cap holds", async () => {
    const zip = makeZip([
      { name: "1.md", data: text("x"), method: 0 },
      { name: "2.md", data: text("y"), method: 0 },
      { name: "3.md", data: text("z"), method: 0 },
    ]);
    const r = await readZipTextEntries(zip, { maxEntries: 2 });
    // Only the first two entries are extracted, and the truncation is
    // reported loudly rather than silently dropped.
    expect(r.entries.length).toBeLessThanOrEqual(2);
    expect(r.skipped.some((s) => /entry count exceeds/i.test(s.reason))).toBe(true);
  });

  test("garbage that is not a zip throws a clear error", async () => {
    await expect(readZipTextEntries(text("not a zip at all"))).rejects.toThrow(/zip/i);
  });

  test("decompression work budget bounds an archive full of lying headers", async () => {
    // Many entries each declaring a large uncompressed size, all backed by a
    // small blob that inflates past nothing: each attempt would cost work
    // without ever succeeding. The cumulative budget must cut them off.
    const blob = text("x");
    const entries: Parameters<typeof makeZip>[0] = [];
    for (let i = 0; i < 10; i++) {
      entries.push({ name: i + ".md", data: blob, method: 8, declaredUncompressed: 900 });
    }
    const r = await readZipTextEntries(makeZip(entries), { maxFileBytes: 1_000, maxTotalBytes: 2_000 });
    expect(r.entries).toHaveLength(0);
    expect(r.skipped.some((s) => /work budget/i.test(s.reason))).toBe(true);
  });

  test("a central-directory record whose lengths run past the buffer is reported corrupt", async () => {
    const zip = makeZip([{ name: "ok.md", data: text("fine"), method: 0 }]);
    // Inflate the final central record's name length past the buffer end.
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    let central = -1;
    for (let i = zip.length - 4; i >= 0; i--) {
      if (view.getUint32(i, true) === 0x02014b50) { central = i; break; }
    }
    view.setUint16(central + 28, 0xffff, true); // nameLen → far past the buffer
    const r = await readZipTextEntries(zip);
    expect(r.entries).toHaveLength(0);
    expect(r.skipped.some((s) => /corrupt central directory/i.test(s.reason))).toBe(true);
  });
});
