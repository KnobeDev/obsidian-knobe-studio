/**
 * Payload values from a hostile file are any JSON value, and the parser
 * builds objects with no prototype, which String() cannot convert (it throws).
 * Plain-text helpers and the journey map must never throw on them.
 */
import { describe, expect, test } from "vitest";
import {
  JPOLICIES,
  cohortCsv,
  journeyContextForStep,
  journeyStepsFromPayload,
  plainText,
  singleLine,
  slugify,
  type CohortRow,
  type LoadedJourney,
} from "../src/studio-core";
import { journeyMapModel } from "../src/journey-map";

function bare(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.assign(Object.create(null) as Record<string, unknown>, fields);
}

describe("plainText", () => {
  test("passes strings through and writes out other scalars", () => {
    expect(plainText("a b")).toBe("a b");
    expect(plainText(12)).toBe("12");
    expect(plainText(true)).toBe("true");
    expect(plainText(123456789012345678901234567890n)).toBe("123456789012345678901234567890");
  });

  test("treats null and undefined as empty", () => {
    expect(plainText(null)).toBe("");
    expect(plainText(undefined)).toBe("");
  });

  test("writes a prototype-less object as its JSON text instead of throwing", () => {
    // Arrange
    const hostile = bare({ b: [1, 2], a: "x" });

    // Act
    const text = plainText(hostile);

    // Assert
    expect(text).toBe('{"a":"x","b":[1,2]}');
  });

  test("the helpers built on it do not throw either", () => {
    const hostile = bare({ t: "x" });
    expect(singleLine(hostile)).toBe('{"t":"x"}');
    expect(slugify(hostile)).toMatch(/\.knobe\.md$/);
  });
});

describe("cohortCsv on a hostile row", () => {
  test("exports a prototype-less title as text, with the formula guard still applied", () => {
    const row = {
      file: "s.knobe.md", title: bare({ "=x": 1 }), author: "=evil", integrity: "verified",
      conformance: "valid", ai: "none declared", chainHashes: [], review: "", stored: null, parents: [],
    } as unknown as CohortRow;
    const dataLine = cohortCsv([row], null).split("\n")[1]!;
    expect(dataLine).toContain('"{""=x"":1}"');
    expect(dataLine).toContain("\"'=evil\"");
  });
});

describe("journeyMapModel on hostile steps", () => {
  test("a null step and object-valued fields do not throw", () => {
    const steps = [
      null,
      bare({ title: "Draft", sealer: bare({}), ai_policy: bare({}), builds_on: [bare({}), "1"] }),
    ] as unknown as Array<Record<string, unknown>>;
    const m = journeyMapModel(steps, null);
    expect(m.nodes).toHaveLength(2);
    expect(m.nodes[0]!.title).toBe("Untitled step");
    expect(m.nodes[1]!.kicker).toBe("Step 2 · unassigned");
    expect(m.nodes[1]!.aiLabel).toBe("AI policy not applicable");
    expect(m.nodes[1]!.buildsOn).toEqual([1]);
  });

  test("a sealer or policy named after an Object method is not looked up as one", () => {
    const m = journeyMapModel([{ title: "t", sealer: "constructor", ai_policy: "toString" }], null);
    expect(m.nodes[0]!.kicker).toBe("Step 1 · constructor");
    expect(m.nodes[0]!.aiLabel).toBe("AI policy not applicable");
  });
});

describe("loading a hostile journey (instructor side)", () => {
  test("object-valued fields and a null step fall back to defaults instead of throwing", () => {
    const steps = journeyStepsFromPayload([
      null,
      bare({ title: "Draft", sealer: bare({}), kind: bare({}), ai_policy: bare({}), builds_on: [bare({}), "1"] }),
    ]);
    expect(steps[0]).toMatchObject({ title: "", sealer: "student", kind: "writing", ai_policy: "not_applicable" });
    expect(steps[1]).toMatchObject({ title: "Draft", sealer: "student", kind: "writing", ai_policy: "not_applicable" });
    expect(steps[1]!.builds_on).toEqual([0]);
  });

  test("a value named after an Object method is not accepted as a known sealer, kind or policy", () => {
    const [s] = journeyStepsFromPayload([{ sealer: "constructor", kind: "toString", ai_policy: "hasOwnProperty" }]);
    expect(s).toMatchObject({ sealer: "student", kind: "writing", ai_policy: "not_applicable" });
  });

  test("known values are kept", () => {
    const [s] = journeyStepsFromPayload([{ title: "Read", sealer: "instructor", kind: "reading", ai_policy: "prohibited", builds_on: [] }]);
    expect(s).toMatchObject({ title: "Read", sealer: "instructor", kind: "reading", ai_policy: "prohibited" });
  });
});

describe("starting a step of a hostile journey (student side)", () => {
  const journeyWith = (step: Record<string, unknown>): LoadedJourney =>
    ({ course: "C", steps: [{ title: "Spec", kind: "spec", spec_hash: "a".repeat(64) }, step] }) as unknown as LoadedJourney;

  test("object-valued policy, kind and builds_on items do not throw or get sealed", () => {
    const ctx = journeyContextForStep(journeyWith(bare({ ai_policy: bare({}), kind: bare({}), builds_on: [bare({}), "1"] })), 1, "b".repeat(64));
    expect(ctx.aiUI).toBe(JPOLICIES.not_applicable!.ui);
    expect(ctx.assignmentContext.ai_policy).toBe("not_applicable");
    expect(ctx.assignmentContext.assignment_type).toBe("writing");
    expect(ctx.parents).toHaveLength(1);
  });

  test("a policy named after an Object method gets the not-applicable UI", () => {
    const ctx = journeyContextForStep(journeyWith({ ai_policy: "constructor", kind: "writing" }), 1, "b".repeat(64));
    expect(ctx.aiUI).toBe(JPOLICIES.not_applicable!.ui);
  });

  test("a custom kind string from the journey is kept as written", () => {
    const ctx = journeyContextForStep(journeyWith({ ai_policy: "prohibited", kind: "lab-report" }), 1, "b".repeat(64));
    expect(ctx.assignmentContext.assignment_type).toBe("lab-report");
    expect(ctx.assignmentContext.ai_policy).toBe("prohibited");
  });
});
