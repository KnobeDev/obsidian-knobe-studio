import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createKnobe,
  permits,
  read,
  transformKnobe,
  verify,
} from "../src/engine/knobe-core.js";

const vector = (name: string): string =>
  readFileSync(join(__dirname, "vectors", name), "utf-8");

describe("engine reproduces the nine official test vector verdicts", () => {
  const CASES: Array<[string, string, string]> = [
    ["minimal-valid.knobe.md", "verified", "valid"],
    ["full-valid.knobe.md", "verified", "valid"],
    ["body-modified.knobe.md", "verified-body-modified", "valid"],
    ["payload-modified.knobe.md", "failed", "valid"],
    ["unreadable.knobe.md", "unreadable", "invalid"],
    ["unicode-valid.knobe.md", "verified", "valid"],
    ["numeric-violation.knobe.md", "verified", "invalid"],
    ["omitted-body-hash.knobe.md", "verified", "valid"],
    ["multi-block.knobe.md", "verified", "warnings"],
  ];

  test.each(CASES)("%s → %s / %s", async (file, state, conformance) => {
    const report = await verify(vector(file));
    expect(report.state).toBe(state);
    expect(report.conformance).toBe(conformance);
  });

  test("omitted-body-hash reports body_verified omitted", async () => {
    const report = await verify(vector("omitted-body-hash.knobe.md"));
    expect(report.body_verified).toBe("omitted");
  });

  test("multi-block reports body_verified omitted", async () => {
    const report = await verify(vector("multi-block.knobe.md"));
    expect(report.body_verified).toBe("omitted");
  });
});

describe("authoring round-trips", () => {
  test("createKnobe output verifies as intact", async () => {
    const r = await createKnobe({
      fields: {
        title: "Round trip",
        summary: "A sealed object created in a test.",
        created_date: "2026-07-06",
      },
      body: "# Round trip\n\nBody text.",
      author: "Vitest",
    });
    expect(r.report.state).toBe("verified");
    expect(["valid", "warnings"]).toContain(r.report.conformance);
    const reverify = await verify(r.text);
    expect(reverify.state).toBe("verified");
    expect(reverify.stored).toBe(r.payloadHash);
    expect(reverify.body_verified).toBe("yes");
  });

  test("transformKnobe declares the original as parent by hash", async () => {
    const original = await createKnobe({
      fields: { title: "Parent", summary: "Source.", created_date: "2026-07-06" },
      body: "Source body.",
      author: "Vitest",
    });
    const child = await transformKnobe(original.text, {
      fields: { title: "Child", summary: "Derived.", created_date: "2026-07-06" },
      body: "Derived body.",
      author: "Vitest",
    });
    expect(child.report.state).toBe("verified");
    const parents = child.payload.parents ?? [];
    expect(parents.length).toBeGreaterThan(0);
    expect(parents[parents.length - 1]!.payload_hash).toBe(original.payloadHash);
  });

  test("read returns the markdown body layer", async () => {
    const r = await createKnobe({
      fields: { title: "Readable", summary: "s", created_date: "2026-07-06" },
      body: "The body layer.",
      author: "Vitest",
    });
    const rd = await read(r.text);
    expect(rd.body ?? "").toContain("The body layer.");
  });

  test("permits refuses to evaluate a failed seal", async () => {
    const report = await verify(vector("payload-modified.knobe.md"));
    const p = permits(report, "transform");
    expect(p.allowed).toBe(false);
    expect(p.basis[0]!.field).toBe("integrity");
  });
});
