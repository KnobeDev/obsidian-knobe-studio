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

// Expected results transcribed from the upstream adversarial/ and
// interpretation/ READMEs. Unreadable files must report body_verified as
// omitted; machine output may spell that "omitted" or null (erratum E11).
const OMITTED = ["omitted", null];

describe("engine reproduces the adversarial vector verdicts", () => {
  const CASES: Array<[string, string, string | null, string]> = [
    ["bad-attribution-sources-type.knobe.md", "verified", "omitted", "invalid"],
    ["bad-body-hash-format.knobe.md", "verified-body-modified", "modified", "invalid"],
    ["bad-created-date.knobe.md", "verified", "omitted", "invalid"],
    ["control-character-title.knobe.md", "verified", "omitted", "valid"],
    ["duplicate-key.knobe.md", "unreadable", null, "invalid"],
    ["multi-block-warning.knobe.md", "verified", "omitted", "warnings"],
    ["nfc-key-collision.knobe.md", "unreadable", null, "invalid"],
    ["no-frontmatter-valid-payload.knobe.md", "verified", "omitted", "invalid"],
    ["payload-array.knobe.md", "unreadable", null, "invalid"],
    ["unsupported-spec-version.knobe.md", "unreadable", null, "invalid"],
  ];

  test.each(CASES)("%s → %s / %s / %s", async (file, state, body, conformance) => {
    const report = await verify(vector("adversarial/" + file));
    expect(report.state).toBe(state);
    expect(report.conformance).toBe(conformance);
    if (body === null) expect(OMITTED).toContain(report.body_verified);
    else expect(report.body_verified).toBe(body);
  });
});

describe("engine follows the ERRATA rulings pinned by the interpretation vectors", () => {
  const CASES: Array<[string, string, string | null, string]> = [
    ["boolean-null-values.knobe.md", "verified", "omitted", "valid"],
    ["spec-version-frontmatter-mismatch.knobe.md", "verified", "omitted", "warnings"],
    ["begin-marker-mid-line.knobe.md", "verified", "yes", "valid"],
    ["base64-unpadded.knobe.md", "unreadable", null, "invalid"],
    ["attribution-missing.knobe.md", "verified", "omitted", "invalid"],
    ["astral-unicode-literal.knobe.md", "verified", "omitted", "valid"],
  ];

  test.each(CASES)("%s → %s / %s / %s", async (file, state, body, conformance) => {
    const report = await verify(vector("interpretation/" + file));
    expect(report.state).toBe(state);
    expect(report.conformance).toBe(conformance);
    if (body === null) expect(OMITTED).toContain(report.body_verified);
    else expect(report.body_verified).toBe(body);
  });

  test("E5: frontmatter/payload spec_version disagreement names both values", async () => {
    const report = await verify(vector("interpretation/spec-version-frontmatter-mismatch.knobe.md"));
    expect(report.conformance_issues).toContain(
      "frontmatter spec_version '1.1' does not match sealed payload spec_version '1.0'"
    );
  });

  test("E9: a wholly absent attribution reports exactly one issue", async () => {
    const report = await verify(vector("interpretation/attribution-missing.knobe.md"));
    expect(report.conformance_issues.filter((i) => i.includes("attribution"))).toEqual([
      "required field missing: attribution",
    ]);
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
