import { describe, expect, test } from "vitest";
import { createKnobe, verify } from "../src/engine/knobe-core.js";
import { buildExampleJourney, exampleJourneySteps } from "../src/classroom-kit";

describe("Classroom teaching kit", () => {
  test("example sequence chains draft/revision onto earlier steps", () => {
    const steps = exampleJourneySteps();
    expect(steps).toHaveLength(4);
    expect(steps[0].sealer).toBe("instructor");
    expect(steps[2].builds_on).toEqual([0, 1]); // draft builds on spec + reading
    expect(steps[3].builds_on).toEqual([2]); // revision builds on draft
  });

  test("example journey seals to a verified journey file", async () => {
    const { fields, body } = buildExampleJourney("Dr. Example", "2026-07-06");
    const r = await createKnobe({ fields, body });
    expect(r.report.state).toBe("verified");
    const back = await verify(r.text);
    const j = back.payload!.journey!;
    expect(j.steps).toHaveLength(4);
    expect(j.course).toBe("Example 101");
    // 1-based builds_on; spec §5 serializes numerics as strings, so they
    // round-trip through verify() as string values.
    expect(j.steps![2]!.builds_on).toEqual(["1", "2"]);
  });

  test("blank instructor falls back to a placeholder", () => {
    const { fields } = buildExampleJourney("", "2026-07-06");
    const attribution = (fields.attribution as { sources: Array<{ author: string }> });
    expect(attribution.sources[0].author).toBe("Instructor");
  });
});
