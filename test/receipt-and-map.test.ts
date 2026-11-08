import { describe, expect, test } from "vitest";
import { createKnobe, permits, verify } from "../src/engine/knobe-core.js";
import { expectationFromReport, type CohortExpectation, type CohortRow } from "../src/studio-core";
import { buildCohortReceipt, cohortReceiptRows } from "../src/cohort-receipt";
import { journeyMapModel } from "../src/journey-map";

const H = (c: string): string => c.repeat(64);

const row = (file: string, over: Partial<CohortRow> = {}): CohortRow => ({
  file, title: "T", author: "Student Name", state: "verified", conformance: "valid",
  ai: "none declared", chainHashes: [], review: "", stored: H("a"), parents: [], ...over,
});

const EXPECT: CohortExpectation = { title: "Essay journey", hashes: new Set([H("e")]), stored: H("e") };

describe("cohort receipt rows", () => {
  test("dedupes exact (file, hash) repeats and sorts by codepoint, not locale", () => {
    const rows = cohortReceiptRows(
      [row("b.md"), row("B.md"), row("a.md"), row("b.md"), row("b.md", { stored: H("c") })],
      null
    );
    expect(rows.map((r) => r.file + ":" + r.stored![0])).toEqual(["B.md:a", "a.md:a", "b.md:a", "b.md:c"]);
  });

  test("chain is not_checked without an expectation, else linked / no_link", () => {
    expect(cohortReceiptRows([row("x.md")], null)[0]!.chain).toBe("not_checked");
    const rows = cohortReceiptRows(
      [row("in.md", { chainHashes: [H("e")] }), row("out.md")],
      EXPECT
    );
    expect(rows.map((r) => r.chain)).toEqual(["linked", "no_link"]);
  });

  test("file names are flattened to a single line", () => {
    expect(cohortReceiptRows([row("a\nb.md")], null)[0]!.file).toBe("a b.md");
  });
});

describe("cohort receipt fields and body", () => {
  test("counts are sealed as strings and author names stay out of the payload", () => {
    const { fields } = buildCohortReceipt(
      [row("a.md"), row("b.md", { state: "failed", stored: H("b") }), row("c.md", { state: "unreadable", stored: null })],
      null, "Prof. X", "2026-11-03"
    );
    const block = fields["education:cohort_receipt"] as Record<string, unknown>;
    expect(block.submission_count).toBe("3");
    expect(block.verified_count).toBe("1");
    expect(block.failed_or_unreadable_count).toBe("2");
    expect(JSON.stringify(fields)).not.toContain("Student Name");
    const subs = block.submissions as Array<Record<string, unknown>>;
    expect(subs.find((s) => s.file === "c.md")).not.toHaveProperty("payload_hash");
    expect(fields).not.toHaveProperty("parents");
    expect(block).not.toHaveProperty("assignment");
  });

  test("a loaded expectation becomes the single responds_to parent", () => {
    const { fields } = buildCohortReceipt([row("a.md", { chainHashes: [H("e")] })], EXPECT, "Prof. X", "2026-11-03");
    expect(fields.parents).toEqual([{ payload_hash: H("e"), title: "Essay journey", relationship: "responds_to" }]);
    const block = fields["education:cohort_receipt"] as Record<string, unknown>;
    expect(block.assignment).toBe("Essay journey");
    expect(block.expectation_hashes).toEqual([H("e")]);
    expect(fields.title).toBe("Cohort check receipt: Essay journey, 2026-11-03");
  });

  test("the body table escapes pipes in file names and marks unreadable rows", () => {
    const { body } = buildCohortReceipt([row("a|b.md"), row("z.md", { stored: null, state: "unreadable" })], null, "X", "2026-11-03");
    expect(body).toContain("| a\\|b.md | " + H("a") + " | verified | valid | not_checked |");
    expect(body).toContain("| z.md | (unreadable) | unreadable | valid | not_checked |");
  });

  test("seals, verifies, and is byte-identical for identical checks in any order", async () => {
    const a = [row("b.md"), row("a.md", { stored: H("b") })];
    const b = [row("a.md", { stored: H("b") }), row("b.md"), row("b.md")];
    const r1 = await createKnobe(buildCohortReceipt(a, EXPECT, "Prof. X", "2026-11-03"));
    const r2 = await createKnobe(buildCohortReceipt(b, EXPECT, "Prof. X", "2026-11-03"));
    expect(r1.payloadHash).toBe(r2.payloadHash);
    const report = await verify(r1.text);
    expect(report.state).toBe("verified");
    expect(report.conformance).toBe("valid");
    const p = permits(report, "share");
    expect(JSON.stringify(p)).toContain("education:cohort_receipt");
  });
});

describe("expectation carries its own payload hash", () => {
  test("expectationFromReport records stored for the receipt's parent link", async () => {
    const r = await createKnobe({ fields: { title: "Spec", summary: "s", created_date: "2026-11-03" }, body: "x", author: "I" });
    const exp = expectationFromReport(await verify(r.text));
    expect(exp.stored).toBe(r.payloadHash);
    expect(exp.hashes.has(r.payloadHash)).toBe(true);
  });
});

describe("journey map model", () => {
  const RLO = String.fromCodePoint(0x202e);
  const steps = [
    { n: 1, title: "Reading", sealer: "instructor", kind: "reading", ai_policy: "prohibited", builds_on: [], spec_hash: H("1") },
    { n: 2, title: "Draft", sealer: "student", kind: "writing", ai_policy: "limited_with_disclosure", builds_on: ["1", 2, 9] },
    { n: 3, title: "", sealer: "robot", kind: "revision", ai_policy: "bogus", builds_on: [1, 2] },
  ];

  test("labels sealers and policies, falling back for unknown values", () => {
    const m = journeyMapModel(steps, null);
    expect(m.description).toBe("The journey as a sequence of 3 steps.");
    expect(m.nodes.map((n) => n.kicker)).toEqual(["Step 1 · Instructor", "Step 2 · Student", "Step 3 · robot"]);
    expect(m.nodes[2]!.title).toBe("Untitled step");
    expect(m.nodes[0]!.aiLabel).toBe("AI not allowed");
    expect(m.nodes[2]!.aiLabel).toBe("AI policy not applicable");
  });

  test("builds_on is coerced from strings, range-filtered, and self-excluded", () => {
    const m = journeyMapModel(steps, null);
    expect(m.nodes[1]!.buildsOn).toEqual([1]);
    expect(m.nodes[2]!.buildsOn).toEqual([1, 2]);
  });

  test("only hash-anchored steps carry a badge; the current step is marked", () => {
    const m = journeyMapModel(steps, 1);
    expect(m.nodes.map((n) => n.specHash)).toEqual([H("1"), null, null]);
    expect(m.nodes.map((n) => n.isHere)).toEqual([false, true, false]);
    expect(m.description).toBe("The journey as a sequence of 3 steps; the current step is marked.");
  });

  test("display text is neutralized and truncated", () => {
    const m = journeyMapModel([{ n: 1, title: "a" + RLO + "b" + "x".repeat(100), sealer: "student", kind: "writing", ai_policy: "prohibited", builds_on: [] }], null);
    expect(m.nodes[0]!.title).not.toContain(RLO);
    expect(m.nodes[0]!.title.length).toBeLessThanOrEqual(61);
  });

  test("a sealed step's hash is escaped and cut for display", () => {
    const m = journeyMapModel([{ n: 1, title: "t", spec_hash: "ab" + RLO + "cd" + "e".repeat(200), sealer: "student", kind: "writing", ai_policy: "prohibited", builds_on: [] }], null);
    expect(m.nodes[0]!.specHash).toBe("ab\\u202ecd" + "e".repeat(90) + "\u2026");
  });

  test("an empty or missing step list yields no nodes", () => {
    expect(journeyMapModel([], null).nodes).toEqual([]);
  });
});
