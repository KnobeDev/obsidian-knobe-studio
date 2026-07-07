/**
 * classroom-kit.ts — pure builders for the Classroom teaching kit: an
 * example assignment journey a teacher can seal into their vault as a
 * starting point. DOM-free so it can be unit-tested.
 */
import {
  buildJourneyBody, buildJourneyFields, newJourneyStep,
  type JourneyMeta, type JourneyStep,
} from "./studio-core";

/** A four-step demonstration sequence: spec → reading → draft → revision. */
export function exampleJourneySteps(): JourneyStep[] {
  const spec: JourneyStep = {
    ...newJourneyStep(),
    title: "Assignment prompt",
    sealer: "instructor",
    kind: "spec",
    ai_policy: "not_applicable",
    expectations: "The assignment prompt and grading criteria, sealed by the instructor.",
  };
  const reading: JourneyStep = {
    ...newJourneyStep(),
    title: "Assigned reading",
    sealer: "instructor",
    kind: "reading",
    ai_policy: "not_applicable",
    expectations: "The source text students respond to.",
  };
  const draft: JourneyStep = {
    ...newJourneyStep(),
    title: "First draft",
    sealer: "student",
    kind: "writing",
    ai_policy: "limited_with_disclosure",
    ai_detail: "AI may be used for terminology lookup or post-draft clarity review, not to draft the argument.",
    expectations: "A first-draft response of roughly 600 words, in the student's own words.",
    builds_on: [0, 1],
  };
  const revision: JourneyStep = {
    ...newJourneyStep(),
    title: "Revision",
    sealer: "student",
    kind: "revision",
    ai_policy: "limited_with_disclosure",
    ai_detail: "Same policy as the draft. Disclose any AI use.",
    expectations: "A revised version that responds to feedback and supersedes the draft.",
    builds_on: [2],
  };
  return [spec, reading, draft, revision];
}

export function exampleJourneyMeta(instructor: string): JourneyMeta {
  return {
    course: "Example 101",
    term: "",
    title: "Primary-source essay sequence",
    instructor: instructor || "Instructor",
  };
}

/** Fields + body for the example journey, ready for createKnobe(). */
export function buildExampleJourney(instructor: string, today: string): {
  fields: Record<string, unknown>;
  body: string;
} {
  const meta = exampleJourneyMeta(instructor);
  const steps = exampleJourneySteps();
  return {
    fields: buildJourneyFields(meta, steps, null, today),
    body: buildJourneyBody(meta, steps),
  };
}

/**
 * A fake student submission for the demo sandbox. Names are obviously
 * synthetic ("Sample Student A") so nothing in a demo resembles a real
 * education record. `journeyHash` chains it to the demo journey; pass null
 * to produce an unlinked submission (to show a cohort-check anomaly).
 */
export function buildDemoSubmission(
  studentName: string,
  journeyHash: string | null,
  today: string
): { fields: Record<string, unknown>; body: string } {
  const fields: Record<string, unknown> = {
    title: "First draft — " + studentName,
    summary: "A sample student submission sealed for demonstration.",
    content_type: "original",
    created_date: today,
    license: "All rights reserved",
    privacy_level: "internal",
    quarantine_status: "quarantine",
    attribution: {
      good_faith_declaration: true,
      sources: [{
        author: studentName,
        contribution: "Wrote all prose in this sample submission.",
        rights_bearing: true,
        role: "student_author",
      }],
    },
    fidelity_limits: {
      represents: "a demonstration submission, not real student work",
      trust_as: "sample content for showing the KNOBE workflow",
      do_not_infer: ["that this is a real education record"],
    },
    use_conditions: {
      permitted: ["demonstration and training"],
      requested_preservations: ["keep the 'sample' framing; this is not real student work"],
      consent_note: "Synthetic sample for demonstration. Not a real education record; no FERPA-protected data.",
    },
    education_review: { submission_status: "submitted", review_status: "pending_instructor_review" },
    tags: ["demo", "sample-submission"],
  };
  if (journeyHash) {
    fields.assignment_context = { course: "Example 101", assignment_type: "writing", journey_knobe_hash: journeyHash };
  }
  return { fields, body: "# First draft\n\nThis is a sample submission used only to demonstrate KNOBE Studio. It contains no real student work." };
}
