import { describe, expect, test } from "vitest";
import { createKnobe, verify } from "../src/engine/knobe-core.js";
import {
  buildAdaptFields,
  buildCreateArgs,
  buildJourneyBody,
  buildJourneyFields,
  cleanupAdaptText,
  cohortCsv,
  courseFolder,
  cohortRowFromReport,
  chainVerdict,
  anomalyScore,
  emptyCreateState,
  journeyContextForStep,
  journeyPayloadSteps,
  linesToArray,
  newJourneyStep,
  singleLine,
  slugify,
  TEMPLATES,
  applyTemplate,
  type CohortRow,
  type CreateFormState,
} from "../src/studio-core";

describe("term/course folder hierarchy", () => {
  test("Term is the top-level folder, course the sub-level", () => {
    expect(courseFolder("KNOBE", "Fall 2026", "HIS 101")).toBe("KNOBE/Fall 2026/HIS 101");
  });

  test("missing term or course collapses cleanly", () => {
    expect(courseFolder("KNOBE", "", "HIS 101")).toBe("KNOBE/HIS 101");
    expect(courseFolder("KNOBE", "Fall 2026", "")).toBe("KNOBE/Fall 2026");
    expect(courseFolder("KNOBE", "", "")).toBe("KNOBE");
    expect(courseFolder("", "Fall 2026", "HIS 101")).toBe("Fall 2026/HIS 101");
  });

  test("segments are sanitized so they cannot escape or nest", () => {
    expect(courseFolder("KNOBE", "Fall/2026", "HIS: 101?")).toBe("KNOBE/Fall-2026/HIS- 101-");
    expect(courseFolder("KNOBE", "..", "HIS 101")).toBe("KNOBE/HIS 101");
  });

  test("journeyContextForStep carries term and course for save pathing", () => {
    const journey = {
      course: "HIS 101",
      term: "Fall 2026",
      title: "Seq",
      steps: [
        { n: 1, title: "Draft", sealer: "student", kind: "writing", ai_policy: "not_applicable", builds_on: [] },
      ],
    };
    const ctx = journeyContextForStep(journey, 0, "a".repeat(64));
    expect(ctx.term).toBe("Fall 2026");
    expect(ctx.course).toBe("HIS 101");
  });
});

describe("small utilities", () => {
  test("slugify produces a .knobe.md filename", () => {
    expect(slugify("Week 6: Reading Response!")).toBe("week-6-reading-response.knobe.md");
    expect(slugify("")).toBe("untitled.knobe.md");
  });

  test("singleLine collapses newlines and trims", () => {
    expect(singleLine(" a\r\nb ")).toBe("a b");
  });

  test("linesToArray splits, trims, and drops blanks", () => {
    expect(linesToArray("one\n  two  \n\nthree\n")).toEqual(["one", "two", "three"]);
  });
});

describe("Create form → createKnobe args", () => {
  test("builds fields exactly like the Studio collectCreate", () => {
    const state: CreateFormState = {
      ...emptyCreateState("2026-07-06"),
      title: "My Note",
      summary: "A summary.",
      contentType: "original",
      createdDate: "2026-07-06",
      license: "CC BY 4.0",
      privacyLevel: "public",
      quarantineStatus: "quarantine",
      author: "Ada",
      contribution1: "wrote everything",
      role1: "author",
      rights1: true,
      goodFaith: true,
      represents: "a first draft",
      trustAs: "work in progress",
      doNotInfer: "that it is final\nthat AI helped",
      permitted: "course use",
      preservations: "keep attribution",
      consentNote: "ok to share in class",
      language: "en",
      tags: "Draft, Course-Work",
      body: "# Body\n\nText.",
    };
    const args = buildCreateArgs(state, null);
    expect(args.body).toBe("# Body\n\nText.");
    const f = args.fields as Record<string, any>;
    expect(f.title).toBe("My Note");
    expect(f.attribution.sources[0]).toEqual({
      author: "Ada",
      contribution: "wrote everything",
      role: "author",
      rights_bearing: true,
    });
    expect(f.attribution.good_faith_declaration).toBe(true);
    expect(f.fidelity_limits.do_not_infer).toEqual(["that it is final", "that AI helped"]);
    expect(f.use_conditions.permitted).toEqual(["course use"]);
    expect(f.tags).toEqual(["draft", "course-work"]);
    expect(f.language).toBe("en");
  });

  test("blank author becomes Anonymous; empty groups are omitted", () => {
    const state = emptyCreateState("2026-07-06");
    const f = buildCreateArgs(state, null).fields as Record<string, any>;
    expect(f.attribution.sources[0].author).toBe("Anonymous");
    expect(f.fidelity_limits).toBeUndefined();
    expect(f.use_conditions).toBeUndefined();
    expect(f.tags).toBeUndefined();
  });

  test("journey context adds assignment_context, review status, and parents", () => {
    const state = { ...emptyCreateState("2026-07-06"), title: "Step work" };
    const ctx = {
      forStudent: true,
      aiUI: "disclose" as const,
      assignmentContext: { course: "HIS 101", ai_policy: "limited_with_disclosure" },
      parents: [{ payload_hash: "a".repeat(64), title: "Spec", relationship: "synthesis_input" }],
      aiName: "Claude",
      aiWhat: "clarity review after drafting",
    };
    const f = buildCreateArgs(state, ctx).fields as Record<string, any>;
    expect(f.assignment_context.course).toBe("HIS 101");
    expect(f.education_review.submission_status).toBe("submitted");
    expect(f.parents).toHaveLength(1);
    const ai = f.attribution.sources.find((s: any) => s.role === "ai_assistant");
    expect(ai.author).toBe("Claude");
    expect(ai.rights_bearing).toBe(false);
  });

  test("sealed output verifies", async () => {
    const state = {
      ...emptyCreateState("2026-07-06"),
      title: "Sealed from state",
      summary: "s",
      body: "Body.",
    };
    const r = await createKnobe(buildCreateArgs(state, null));
    expect(r.report.state).toBe("verified");
  });

  test("applyTemplate(student) sets quarantine and fidelity limits", () => {
    const state = applyTemplate("student", "2026-07-06");
    expect(state.quarantineStatus).toBe("quarantine");
    expect(state.represents).toContain("reflection");
    expect(TEMPLATES.student).toBeDefined();
  });
});

describe("Journey", () => {
  test("journeyPayloadSteps numbers steps and maps builds_on to 1-based", () => {
    const s1 = { ...newJourneyStep(), title: "Reading", sealer: "instructor", kind: "reading" };
    const s2 = { ...newJourneyStep(), title: "Response", builds_on: [0] };
    const steps = journeyPayloadSteps([s1, s2]);
    expect(steps[0]).toMatchObject({ n: 1, title: "Reading", content_type: "original" });
    expect(steps[1]!.builds_on).toEqual([1]);
    expect(steps[1]!.relationship).toBe("synthesis_input");
  });

  test("buildJourneyBody renders a syllabus block", () => {
    const body = buildJourneyBody(
      { course: "HIS 101", term: "Fall", title: "Essay sequence", instructor: "Dr. K" },
      [{ ...newJourneyStep(), title: "Reading", kind: "reading", ai_policy: "prohibited" }]
    );
    expect(body).toContain("# Essay sequence");
    expect(body).toContain("## Step 1: Reading");
    expect(body).toContain("AI not allowed");
  });

  test("journey seals and reloads as a valid journey payload", async () => {
    const meta = { course: "HIS 101", term: "", title: "Essay sequence", instructor: "Dr. K" };
    const steps = [
      { ...newJourneyStep(), title: "Reading", sealer: "instructor", kind: "reading" },
      { ...newJourneyStep(), title: "Response", builds_on: [0] },
    ];
    const fields = buildJourneyFields(meta, steps, null, "2026-07-06");
    const r = await createKnobe({ fields, body: buildJourneyBody(meta, steps) });
    expect(r.report.state).toBe("verified");
    const back = await verify(r.text);
    const j = back.payload!.journey!;
    expect(j.steps).toHaveLength(2);
    expect(j.course).toBe("HIS 101");
  });

  test("revision records the loaded journey as superseded parent", () => {
    const fields = buildJourneyFields(
      { course: "C", term: "", title: "T", instructor: "I" },
      [newJourneyStep()],
      { hash: "b".repeat(64), title: "Old journey" },
      "2026-07-06"
    ) as Record<string, any>;
    expect(fields.parents[0]).toMatchObject({
      payload_hash: "b".repeat(64),
      relationship: "supersedes",
    });
    expect(fields.transformation_history[0].strategy).toBe("revision");
  });

  test("journeyContextForStep builds student context with journey hash", () => {
    const journey = {
      course: "HIS 101",
      title: "Seq",
      steps: [
        { n: 1, title: "Spec", sealer: "instructor", kind: "spec", ai_policy: "not_applicable", builds_on: [], spec_hash: "c".repeat(64) },
        { n: 2, title: "Draft", sealer: "student", kind: "writing", ai_policy: "prohibited", builds_on: [1], relationship: "synthesis_input" },
      ],
    };
    const ctx = journeyContextForStep(journey, 1, "d".repeat(64));
    expect(ctx.forStudent).toBe(true);
    expect(ctx.aiUI).toBe("attest");
    expect(ctx.assignmentContext.journey_knobe_hash).toBe("d".repeat(64));
    expect(ctx.assignmentContext.assignment_knobe_hash).toBe("c".repeat(64));
    expect(ctx.parents[0]!.payload_hash).toBe("c".repeat(64));
  });
});

describe("Cohort", () => {
  test("cohortRowFromReport extracts student, AI disclosure, and chain hashes", async () => {
    const r = await createKnobe({
      fields: {
        title: "Submission",
        summary: "s",
        created_date: "2026-07-06",
        attribution: {
          sources: [
            { author: "Stu Dent", contribution: "wrote it", role: "student_author" },
            { author: "Claude", contribution: "checked grammar", role: "ai_assistant" },
          ],
        },
        parents: [{ payload_hash: "e".repeat(64), title: "Spec", relationship: "synthesis_input" }],
        assignment_context: { journey_knobe_hash: "f".repeat(64) },
        education_review: { submission_status: "submitted" },
      },
      body: "work",
    });
    const report = await verify(r.text);
    const row = cohortRowFromReport("stu.knobe.md", report);
    expect(row.author).toBe("Stu Dent");
    expect(row.ai).toContain("checked grammar");
    expect(row.chainHashes).toContain("e".repeat(64));
    expect(row.chainHashes).toContain("f".repeat(64));
    expect(row.review).toBe("submitted");
  });

  test("chainVerdict and anomalyScore rank unlinked/broken rows first", () => {
    const expectation = { title: "Journey", hashes: new Set(["e".repeat(64)]) };
    const linked: CohortRow = {
      file: "a", title: "", author: "", state: "verified", conformance: "valid",
      ai: "none declared", chainHashes: ["e".repeat(64)], review: "", stored: "x", parents: [],
    };
    const broken: CohortRow = { ...linked, file: "b", state: "failed", chainHashes: [] };
    expect(chainVerdict(linked, expectation).text).toBe("linked");
    expect(chainVerdict(broken, expectation).text).toBe("no link");
    expect(anomalyScore(broken, expectation)).toBeLessThan(anomalyScore(linked, expectation));
  });

  test("cohortCsv escapes quotes and includes the header", () => {
    const row: CohortRow = {
      file: 'has"quote.md', title: "T", author: "A", state: "verified", conformance: "valid",
      ai: "none declared", chainHashes: [], review: "", stored: null, parents: [],
    };
    const csv = cohortCsv([row], null);
    expect(csv.split("\n")[0]).toBe("file,title,author,integrity,conformance,ai_disclosure,chain,review_status");
    expect(csv).toContain('"has""quote.md"');
  });

  test("cohortCsv neutralizes formula injection from hostile titles/authors (CWE-1236)", () => {
    const row: CohortRow = {
      file: "=cmd.md", title: "=cmd|'/c calc'!A1", author: "@SUM(1,2)", state: "verified",
      conformance: "valid", ai: "+dde", chainHashes: [], review: "-2+3", stored: null, parents: [],
    };
    const csv = cohortCsv([row], null);
    const dataLine = csv.split("\n")[1]!;
    // Every cell that began with a formula trigger is defused with a leading apostrophe.
    expect(dataLine).toContain("\"'=cmd.md\"");
    expect(dataLine).toContain("\"'=cmd|'/c calc'!A1\"");
    expect(dataLine).toContain("\"'@SUM(1,2)\"");
    expect(dataLine).toContain("\"'+dde\"");
    expect(dataLine).toContain("\"'-2+3\"");
    expect(dataLine).not.toMatch(/,"=/);
  });
});

describe("Adapt", () => {
  test("cleanupAdaptText normalizes smart punctuation, HTML breaks, and whitespace", () => {
    const messy = "“Hi”…<br>x</p><p>y&nbsp;&amp; z  \n\n\n\nend";
    const clean = cleanupAdaptText(messy);
    expect(clean).toContain('"Hi"...');
    expect(clean).not.toMatch(/<br|<\/p>|&nbsp;| /);
    expect(clean).not.toMatch(/\n{3,}/);
  });

  test("buildAdaptFields binds parents and accessibility record to the source hash", async () => {
    const src = await createKnobe({
      fields: { title: "Lecture", summary: "s", created_date: "2026-07-06" },
      body: "Source.",
      author: "Prof",
    });
    const report = await verify(src.text);
    const fields = buildAdaptFields({
      type: "simplification",
      sourceTitle: "Lecture",
      sourceReport: report,
      sourceAuthor: "Prof",
      adapter: "Casey",
      aiName: "",
      aiWhat: "",
      reviewer: "",
      title: "",
      license: "CC BY 4.0",
      preserved: "all definitions",
      omitted: "the appendix",
      today: "2026-07-06",
    }) as Record<string, any>;
    expect(fields.parents[0].payload_hash).toBe(src.payloadHash);
    expect(fields.accessibility[0].adapted_from).toBe(src.payloadHash);
    expect(fields.accessibility[0].adaptation_type).toBe("simplification");
    expect(fields.content_type).toBe("adaptation");
    expect(fields.title).toBe("Lecture (Plain-Language Version)");
    const sealed = await createKnobe({ fields, body: "Plain version." });
    expect(sealed.report.state).toBe("verified");
  });

  test("adapter is required; AI name without contribution throws", async () => {
    const src = await createKnobe({
      fields: { title: "T", summary: "s", created_date: "2026-07-06" },
      body: "b",
    });
    const report = await verify(src.text);
    const base = {
      type: "translation" as const,
      sourceTitle: "T", sourceReport: report, sourceAuthor: "",
      adapter: "", aiName: "", aiWhat: "", reviewer: "", title: "", license: "",
      preserved: "", omitted: "", today: "2026-07-06",
    };
    expect(() => buildAdaptFields(base)).toThrow(/adaptation/i);
    expect(() => buildAdaptFields({ ...base, adapter: "X", aiName: "Bot" })).toThrow(/what it did/i);
  });
});
