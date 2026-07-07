import { describe, expect, test } from "vitest";
import { createKnobe, verify } from "../src/engine/knobe-core.js";
import { isUnderFolder } from "../src/path-scope";
import { buildDemoSubmission } from "../src/classroom-kit";

describe("isUnderFolder — demo-mode privacy boundary", () => {
  test("null/empty/root scope means everything is in scope", () => {
    expect(isUnderFolder("Students/alice.knobe.md", null)).toBe(true);
    expect(isUnderFolder("Students/alice.knobe.md", "")).toBe(true);
    expect(isUnderFolder("Students/alice.knobe.md", "/")).toBe(true);
  });

  test("only files inside the scope folder are in scope", () => {
    expect(isUnderFolder("KNOBE/Demo/x.knobe.md", "KNOBE/Demo")).toBe(true);
    expect(isUnderFolder("KNOBE/Demo", "KNOBE/Demo")).toBe(true);
    expect(isUnderFolder("Students/alice.knobe.md", "KNOBE/Demo")).toBe(false);
  });

  test("a sibling folder with a shared prefix is NOT in scope", () => {
    // "KNOBE/DemoReal" must not be treated as inside "KNOBE/Demo"
    expect(isUnderFolder("KNOBE/DemoReal/x.md", "KNOBE/Demo")).toBe(false);
  });

  test("scope is normalized (trailing slash tolerated)", () => {
    expect(isUnderFolder("KNOBE/Demo/x.md", "KNOBE/Demo/")).toBe(true);
  });

  test("case-sensitive by design: a different-case path is out of scope (fails safe)", () => {
    // On a case-sensitive FS these are different folders; treating them as the
    // same could pull a real-records folder into the demo scope.
    expect(isUnderFolder("KNOBE/demo/x.md", "KNOBE/Demo")).toBe(false);
  });
});

describe("demo submissions are clearly synthetic and seal cleanly", () => {
  test("carries a not-real-record consent note and demo tags", () => {
    const { fields } = buildDemoSubmission("Sample Student A", "a".repeat(64), "2026-07-06");
    const uc = fields.use_conditions as { consent_note: string };
    expect(uc.consent_note).toMatch(/not a real education record/i);
    expect(fields.tags).toContain("demo");
  });

  test("chained submission records the journey hash; unlinked one omits it", async () => {
    const linked = buildDemoSubmission("Sample Student A", "b".repeat(64), "2026-07-06");
    const lr = await createKnobe(linked);
    expect(lr.report.state).toBe("verified");
    const back = await verify(lr.text);
    expect((back.payload!.assignment_context as { journey_knobe_hash: string }).journey_knobe_hash).toBe("b".repeat(64));

    const unlinked = buildDemoSubmission("Sample Student B", null, "2026-07-06");
    const ur = await createKnobe(unlinked);
    expect(ur.report.state).toBe("verified");
    expect(ur.payload.assignment_context).toBeUndefined();
  });
});
