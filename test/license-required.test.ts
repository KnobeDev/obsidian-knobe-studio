/**
 * An explicit license is required on every Studio form. The bundled engine
 * seals "CC BY 4.0" when no license is given; Studio refuses before the
 * engine is called, so nothing is sealed under a license nobody chose.
 */
import { describe, expect, test } from "vitest";
import { createKnobe, verify } from "../src/engine/knobe-core.js";
import {
  LicenseRequiredError,
  TEMPLATES,
  applyTemplate,
  buildAdaptFields,
  buildCreateArgs,
  buildJourneyFields,
  buildTransformFields,
  emptyCreateState,
  isBlankLicense,
  requireLicense,
  type AdaptParams,
} from "../src/studio-core";
import { buildCohortReceipt } from "../src/cohort-receipt";
import { buildDemoSubmission, buildExampleJourney } from "../src/classroom-kit";
import { sourceLicenseNote } from "../src/display";

// Empty, whitespace (ASCII and beyond), absent, and text that shows nothing:
// NEL and a unit separator, a zero-width space, a word joiner, a soft hyphen,
// a variation selector, and a mix with a bidi mark.
const BLANKS: unknown[] = [
  "", "   ", "\t\r\n", "\u00a0\u3000\ufeff", null, undefined,
  "\u0085", "\u001f", "\u200b", "\u2060", "\u00ad", "\ufe0f", " \u200b\u200e ",
];

describe("requireLicense", () => {
  test("returns the license as typed, on one line and trimmed", () => {
    expect(requireLicense("  All rights\nreserved ")).toBe("All rights reserved");
    expect(requireLicense("CC BY-NC 4.0")).toBe("CC BY-NC 4.0");
  });

  test.each(BLANKS)("refuses a blank license: %j", (blank) => {
    expect(() => requireLicense(blank)).toThrow(LicenseRequiredError);
  });

  test("an invisible character beside a visible license is not blank", () => {
    expect(isBlankLicense("\u200bMIT")).toBe(false);
    expect(requireLicense("\u200bMIT")).toBe("\u200bMIT");
  });

  test("the refusal says what to do and that nothing is chosen for you", () => {
    try {
      requireLicense("");
      throw new Error("did not refuse");
    } catch (e) {
      expect(e).toBeInstanceOf(LicenseRequiredError);
      expect((e as Error).name).toBe("LicenseRequiredError");
      expect((e as Error).message).toMatch(/^Enter a license/);
      expect((e as Error).message).toMatch(/does not choose one/);
      expect((e as Error).message).not.toMatch(/CC BY/);
    }
  });

  test("a note about the source's license is appended for derivatives", () => {
    expect(() => requireLicense("", 'The original is licensed "All rights reserved".'))
      .toThrow(/Enter a license.*The original is licensed "All rights reserved"\.$/);
  });
});

describe("Create form", () => {
  test("the form starts with no license", () => {
    expect(emptyCreateState("2026-11-15").license).toBe("");
    expect(applyTemplate("blank", "2026-11-15").license).toBe("");
  });

  test.each(BLANKS)("buildCreateArgs refuses a blank license: %j", (blank) => {
    const state = { ...emptyCreateState("2026-11-15"), title: "T", license: blank as string };
    expect(() => buildCreateArgs(state, null)).toThrow(LicenseRequiredError);
  });

  test("the license typed is the license sealed", async () => {
    const state = { ...emptyCreateState("2026-11-15"), title: "T", license: "All rights reserved", body: "Body." };
    const r = await createKnobe(buildCreateArgs(state, null));
    expect(r.report.state).toBe("verified");
    const back = await verify(r.text);
    expect(back.payload!.license).toBe("All rights reserved");
    expect(r.text).toContain("\nlicense: All rights reserved\n");
    expect(r.text).not.toContain("CC BY 4.0");
  });

  test("a license swapped in the payload after sealing no longer verifies", async () => {
    const state = { ...emptyCreateState("2026-11-15"), title: "T", license: "All rights reserved", body: "Body." };
    const sealed = (await createKnobe(buildCreateArgs(state, null))).text;
    const block = /(-----BEGIN KNOBE B64-----\n)([\s\S]*?)(\n-----END KNOBE B64-----)/.exec(sealed)!;
    const payload = Buffer.from(block[2].replace(/\n/g, ""), "base64").toString("utf8");
    expect(payload).toContain('"license":"All rights reserved"');
    const swapped = Buffer.from(payload.replace('"license":"All rights reserved"', '"license":"CC BY 4.0"'), "utf8")
      .toString("base64");
    const tampered = sealed.replace(block[0], block[1] + swapped + block[3]);
    expect((await verify(sealed)).state).toBe("verified");
    expect((await verify(tampered)).state).toBe("failed");
  });
});

describe("Transform form", () => {
  const base = { title: "Child", summary: "s", type: "compression", privacy: "internal", today: "2026-11-15" };

  test.each(BLANKS)("buildTransformFields refuses a blank license: %j", (blank) => {
    expect(() => buildTransformFields({ ...base, license: blank as string })).toThrow(LicenseRequiredError);
  });

  test("the refusal carries the note about the original's license", () => {
    const note = sourceLicenseNote("All rights reserved", "original");
    expect(() => buildTransformFields({ ...base, license: " ", sourceLicenseNote: note }))
      .toThrow(/The original is licensed "All rights reserved"\./);
  });

  test("builds the same fields the panel built before, with the license given", () => {
    expect(buildTransformFields({ ...base, license: " CC BY-SA 4.0 " })).toEqual({
      title: "Child",
      summary: "s",
      content_type: "compression",
      created_date: "2026-11-15",
      license: "CC BY-SA 4.0",
      privacy_level: "internal",
    });
    const sparse = buildTransformFields({ ...base, title: "  ", summary: "", license: "MIT" });
    expect(sparse).not.toHaveProperty("title");
    expect(sparse).not.toHaveProperty("summary");
  });
});

describe("Adapt form", () => {
  async function params(over: Partial<AdaptParams>): Promise<AdaptParams> {
    const src = await createKnobe({
      fields: { title: "Lecture", summary: "s", created_date: "2026-11-15", license: "All rights reserved" },
      body: "Source.",
      author: "Prof",
    });
    return {
      type: "simplification", sourceTitle: "Lecture", sourceReport: await verify(src.text), sourceAuthor: "Prof",
      adapter: "Casey", aiName: "", aiWhat: "", reviewer: "", title: "", license: "All rights reserved",
      preserved: "", omitted: "", today: "2026-11-15", ...over,
    };
  }

  test.each(BLANKS)("buildAdaptFields refuses a blank license: %j", async (blank) => {
    const p = await params({ license: blank as string });
    expect(() => buildAdaptFields(p)).toThrow(LicenseRequiredError);
  });

  test("the missing adapter is still reported before the missing license", async () => {
    const p = await params({ adapter: "", license: "" });
    expect(() => buildAdaptFields(p)).toThrow(/Name who made/);
  });

  test("the license given is the license in the fields", async () => {
    const fields = buildAdaptFields(await params({ license: "CC BY 4.0" }));
    expect(fields.license).toBe("CC BY 4.0");
  });
});

describe("sourceLicenseNote", () => {
  test("names the source's license", () => {
    expect(sourceLicenseNote("CC BY-NC 4.0", "source")).toBe('The source is licensed "CC BY-NC 4.0".');
  });

  test.each(["", "  ", null, undefined, 4, {}])("says so when the source declares none: %j", (lic) => {
    expect(sourceLicenseNote(lic, "original")).toBe("The original declares no license.");
  });

  test("a quotation mark in the license cannot pass for the end of its name", () => {
    expect(sourceLicenseNote('x". Enter CC0 "', "original")).toBe('The original is licensed "x\\". Enter CC0 \\"".');
  });

  test("a hostile license is escaped and bounded before it is shown", () => {
    const note = sourceLicenseNote("MIT\u202e" + "x".repeat(5000), "original");
    expect(note).not.toContain("\u202e");
    expect(note.length).toBeLessThan(400);
  });
});

describe("sealing paths with no license field always name a license", () => {
  const explicit = (v: unknown): void => {
    expect(typeof v).toBe("string");
    expect((v as string).trim()).not.toBe("");
  };

  test("journey specification", () => {
    explicit(buildJourneyFields({ course: "C", term: "", title: "T", instructor: "I" }, [], null, "2026-11-15").license);
  });

  test("cohort receipt", () => {
    explicit(buildCohortReceipt([], null, "Prof. X", "2026-11-15").fields.license);
  });

  test("classroom example journey and demo submissions", () => {
    explicit(buildExampleJourney("Dr. Example", "2026-11-15").fields.license);
    explicit(buildDemoSubmission("Student", "a".repeat(64), "2026-11-15").fields.license);
    explicit(buildDemoSubmission("Student", null, "2026-11-15").fields.license);
  });

  test("every template other than blank names a license", () => {
    for (const [name, spec] of Object.entries(TEMPLATES)) {
      if (name === "blank") continue;
      explicit(spec.license);
      explicit(applyTemplate(name, "2026-11-15").license);
    }
  });
});
