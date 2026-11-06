/**
 * studio-core.ts — pure, DOM-free port of the KNOBE Studio application logic
 * (knobe.org/studio). Every function here maps form/state objects to the
 * engine's createKnobe/transformKnobe argument shapes, so the Obsidian view
 * layer stays thin and this layer stays unit-testable.
 */
import type { CreateArgs, JourneyPayloadStep, VerifyReport } from "./engine/knobe-core";

// ---- small utilities -------------------------------------------------------

export const singleLine = (v: unknown): string =>
  String(v ?? "").replace(/[\r\n]+/g, " ").trim();

export const linesToArray = (v: unknown): string[] =>
  String(v ?? "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);

export const localToday = (): string => {
  const d = new Date();
  return (
    d.getFullYear() +
    "-" + String(d.getMonth() + 1).padStart(2, "0") +
    "-" + String(d.getDate()).padStart(2, "0")
  );
};

export const slugify = (title: unknown): string => {
  const s = String(title ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return (s || "untitled") + ".knobe.md";
};

export const BEGIN_MARKER = "-----BEGIN KNOBE B64-----";

/**
 * Sanitize a term/course name into a single safe folder segment: path
 * separators and other filesystem-hostile characters become "-", and
 * dot-only names (".", "..") are rejected so a segment can never traverse
 * or nest beyond its one level.
 */
export function folderSegment(name: unknown): string {
  const s = singleLine(name).replace(/[\\/:*?"<>|]/g, "-").replace(/^\.+$/, "");
  return s;
}

/**
 * Vault folder for course work: Term is the top-level folder, course the
 * sub-level — e.g. "KNOBE/Fall 2026/HIS 101". Empty parts collapse out.
 */
export function courseFolder(base: string, term: unknown, course: unknown): string {
  const parts = [base, folderSegment(term), folderSegment(course)].filter(Boolean);
  return parts.join("/");
}

// ---- Create form -----------------------------------------------------------

export interface ExtraSource {
  author: string;
  contribution: string;
  role: string;
  rights: boolean;
}

export interface CreateFormState {
  title: string;
  summary: string;
  contentType: string;
  createdDate: string;
  license: string;
  privacyLevel: string;
  quarantineStatus: string;
  author: string;
  contribution1: string;
  role1: string;
  rights1: boolean;
  goodFaith: boolean;
  extraSources: ExtraSource[];
  represents: string;
  trustAs: string;
  doNotInfer: string;
  permitted: string;
  preservations: string;
  consentNote: string;
  language: string;
  tags: string;
  body: string;
}

export interface JourneyContext {
  forStudent: boolean;
  aiUI: "none" | "attest" | "disclose";
  assignmentContext: Record<string, unknown>;
  parents: Array<{ payload_hash: string; title: string; relationship: string }>;
  aiName?: string;
  aiWhat?: string;
  /** Save destination: Term is the top-level folder, course the sub-level. */
  term?: string;
  course?: string;
}

export function emptyCreateState(today: string = localToday()): CreateFormState {
  return {
    title: "", summary: "", contentType: "original", createdDate: today,
    license: "", privacyLevel: "public", quarantineStatus: "quarantine",
    author: "", contribution1: "", role1: "", rights1: false, goodFaith: false,
    extraSources: [], represents: "", trustAs: "", doNotInfer: "",
    permitted: "", preservations: "", consentNote: "", language: "", tags: "",
    body: "",
  };
}

/** Port of the Studio's collectCreate(): form state → createKnobe args. */
export function buildCreateArgs(
  state: CreateFormState,
  journeyCtx: JourneyContext | null
): CreateArgs {
  const fields: Record<string, unknown> = {};
  const title = singleLine(state.title);
  if (title) fields.title = title;
  const summary = state.summary.trim();
  if (summary) fields.summary = summary;
  fields.content_type = state.contentType;
  fields.created_date = state.createdDate || localToday();
  const lic = singleLine(state.license);
  if (lic) fields.license = lic;
  fields.privacy_level = state.privacyLevel;
  fields.quarantine_status = state.quarantineStatus;

  const sources: Array<Record<string, unknown>> = [];
  const s1: Record<string, unknown> = {
    author: singleLine(state.author) || "Anonymous",
    contribution: singleLine(state.contribution1) || "author",
  };
  const role1 = singleLine(state.role1);
  if (role1) s1.role = role1;
  if (state.rights1) s1.rights_bearing = true;
  sources.push(s1);

  for (const extra of state.extraSources) {
    const author = singleLine(extra.author);
    const contribution = singleLine(extra.contribution);
    if (!author && !contribution) continue;
    const s: Record<string, unknown> = {
      author: author || "Anonymous",
      contribution: contribution || "contributor",
    };
    const role = singleLine(extra.role);
    if (role) s.role = role;
    if (extra.rights) s.rights_bearing = true;
    sources.push(s);
  }

  if (journeyCtx && journeyCtx.aiUI === "disclose") {
    const aiWhat = singleLine(journeyCtx.aiWhat);
    if (aiWhat) {
      sources.push({
        author: singleLine(journeyCtx.aiName) || "AI Assistant (unnamed model)",
        contribution: aiWhat,
        rights_bearing: false,
        role: "ai_assistant",
      });
    }
  }

  const attribution: Record<string, unknown> = { sources };
  if (state.goodFaith) attribution.good_faith_declaration = true;
  fields.attribution = attribution;

  const fl: Record<string, unknown> = {};
  const rep = singleLine(state.represents);
  if (rep) fl.represents = rep;
  const tr = singleLine(state.trustAs);
  if (tr) fl.trust_as = tr;
  const dni = linesToArray(state.doNotInfer);
  if (dni.length) fl.do_not_infer = dni;
  if (Object.keys(fl).length) fields.fidelity_limits = fl;

  const uc: Record<string, unknown> = {};
  const perm = linesToArray(state.permitted);
  if (perm.length) uc.permitted = perm;
  const pres = linesToArray(state.preservations);
  if (pres.length) uc.requested_preservations = pres;
  const cn = singleLine(state.consentNote);
  if (cn) uc.consent_note = cn;
  if (Object.keys(uc).length) fields.use_conditions = uc;

  const lang = singleLine(state.language);
  if (lang) fields.language = lang;
  const tags = String(state.tags || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (tags.length) fields.tags = tags;

  if (journeyCtx) {
    fields.assignment_context = journeyCtx.assignmentContext;
    if (journeyCtx.forStudent) {
      fields.education_review = {
        submission_status: "submitted",
        review_status: "pending_instructor_review",
      };
    }
    if (journeyCtx.parents.length) fields.parents = journeyCtx.parents;
  }

  return { fields, body: state.body, author: null };
}

// ---- templates -------------------------------------------------------------

export interface TemplateSpec {
  content_type?: string;
  license?: string;
  privacy?: string;
  quarantine?: string;
  contribution1?: string;
  role1?: string;
  rights1?: boolean;
  goodFaith?: boolean;
  represents?: string;
  trustAs?: string;
  doNotInfer?: string;
  permitted?: string;
  preservations?: string;
  tags?: string;
  extraSource?: { author: string; contribution: string; rights: boolean };
}

export const TEMPLATES: Record<string, TemplateSpec> = {
  blank: {},
  instructor: {
    content_type: "original", license: "All rights reserved", privacy: "internal", quarantine: "trusted",
    contribution1: "author of the assigned reading", role1: "instructor", rights1: true, goodFaith: true,
    permitted: "course reading and discussion\nstudent citation in course assignments",
    preservations: "do not redistribute outside the enrolled course group",
    tags: "assigned-reading",
  },
  student: {
    content_type: "original", license: "All rights reserved", privacy: "internal", quarantine: "quarantine",
    contribution1: "wrote all prose in this reflection", role1: "student_author", rights1: true, goodFaith: true,
    represents: "a first-draft course reflection",
    trustAs: "the student's own thinking at submission time",
    doNotInfer: "that this is a polished or final position\nthat AI contributed beyond anything disclosed in attribution",
  },
  researcher: {
    content_type: "original", license: "All rights reserved", privacy: "sensitive", quarantine: "quarantine",
    contribution1: "interview instrument and transcription", role1: "researcher", goodFaith: true,
    represents: "a verbatim transcript of the recorded session",
    trustAs: "the words as transcribed; transcription may contain errors",
    doNotInfer: "speaker intent beyond the transcribed words\nthat the transcript was independently checked against the recording",
    tags: "interview, transcript",
    extraSource: { author: "Participant (pseudonym)", contribution: "interview responses", rights: true },
  },
  enterprise: {
    content_type: "compression", license: "All rights reserved", privacy: "internal", quarantine: "quarantine",
    contribution1: "wrote the summary from the source policy", role1: "summary_author", goodFaith: true,
    represents: "a condensed summary of the underlying policy",
    trustAs: "a starting point to be checked against the full policy text",
    doNotInfer: "that this summary overrides the full policy\nthat exceptions and edge cases are fully captured",
    permitted: "internal review",
    preservations: "keep quarantine status until a review clears it",
  },
};

export function applyTemplate(name: string, today: string = localToday()): CreateFormState {
  const t = TEMPLATES[name] ?? {};
  const state = emptyCreateState(today);
  if (t.content_type) state.contentType = t.content_type;
  if (t.license) state.license = t.license;
  if (t.privacy) state.privacyLevel = t.privacy;
  if (t.quarantine) state.quarantineStatus = t.quarantine;
  if (t.contribution1) state.contribution1 = t.contribution1;
  if (t.role1) state.role1 = t.role1;
  if (t.rights1) state.rights1 = true;
  if (t.goodFaith) state.goodFaith = true;
  if (t.represents) state.represents = t.represents;
  if (t.trustAs) state.trustAs = t.trustAs;
  if (t.doNotInfer) state.doNotInfer = t.doNotInfer;
  if (t.permitted) state.permitted = t.permitted;
  if (t.preservations) state.preservations = t.preservations;
  if (t.tags) state.tags = t.tags;
  if (t.extraSource) {
    state.extraSources.push({
      author: t.extraSource.author,
      contribution: t.extraSource.contribution,
      role: "",
      rights: t.extraSource.rights,
    });
  }
  return state;
}

// ---- Journey ---------------------------------------------------------------

export const JKINDS: Record<string, { label: string; content_type: string; relationship: string }> = {
  spec:        { label: "Assignment spec",           content_type: "seed",        relationship: "synthesis_input" },
  reading:     { label: "Reading / source material", content_type: "original",    relationship: "synthesis_input" },
  writing:     { label: "Student writing",           content_type: "original",    relationship: "synthesis_input" },
  summary:     { label: "Summary / compression",     content_type: "compression", relationship: "compression_of" },
  feedback:    { label: "Feedback / annotation",     content_type: "annotation",  relationship: "responds_to" },
  revision:    { label: "Revision",                  content_type: "original",    relationship: "supersedes" },
  translation: { label: "Translation",               content_type: "translation", relationship: "adaptation_of" },
};

export const JPOLICIES: Record<string, { label: string; ui: "none" | "attest" | "disclose" }> = {
  prohibited:               { label: "AI not allowed",               ui: "attest" },
  limited_with_disclosure:  { label: "AI allowed with disclosure",   ui: "disclose" },
  required_with_disclosure: { label: "AI required, with disclosure", ui: "disclose" },
  not_applicable:           { label: "AI policy not applicable",     ui: "none" },
};

export const JSEALERS: Record<string, string> = {
  instructor: "Instructor",
  student: "Student",
  ta: "TA",
  peer: "Peer reviewer",
};

export interface JourneyStep {
  title: string;
  sealer: string;
  kind: string;
  ai_policy: string;
  ai_detail: string;
  expectations: string;
  builds_on: number[];
  spec_hash: string;
}

export interface JourneyMeta {
  course: string;
  term: string;
  title: string;
  instructor: string;
}

export function newJourneyStep(): JourneyStep {
  return {
    title: "", sealer: "student", kind: "writing",
    ai_policy: "limited_with_disclosure", ai_detail: "",
    expectations: "", builds_on: [], spec_hash: "",
  };
}

/** Human-readable syllabus body sealed inside the journey file. */
export function buildJourneyBody(meta: JourneyMeta, steps: JourneyStep[]): string {
  const course = singleLine(meta.course) || "Course";
  const term = singleLine(meta.term);
  const title = singleLine(meta.title) || "Assignment sequence";
  const instructor = singleLine(meta.instructor);
  const L: string[] = [];
  L.push("# " + title);
  L.push("");
  L.push(course + (term ? " · " + term : "") + (instructor ? " · " + instructor : ""));
  L.push("");
  L.push(
    "This sequence uses sealed KNOBE files. Each step is a plain-text file that records who made it, " +
    "what it builds on, and the AI policy it was made under. Open this journey file in the KNOBE Studio " +
    "dashboard to start your step; submit the sealed file it gives you to the assignment."
  );
  steps.forEach((s, i) => {
    L.push("");
    L.push("## Step " + (i + 1) + ": " + (s.title || "Untitled step"));
    L.push("");
    L.push("- Sealed by: " + (JSEALERS[s.sealer] ?? s.sealer));
    L.push("- Kind of work: " + (JKINDS[s.kind] ? JKINDS[s.kind].label : s.kind));
    L.push(
      "- AI policy: " + (JPOLICIES[s.ai_policy] ? JPOLICIES[s.ai_policy].label : s.ai_policy) +
      (s.ai_detail ? ". " + s.ai_detail : "")
    );
    if (s.builds_on.length) L.push("- Builds on: " + s.builds_on.map((n) => "Step " + (n + 1)).join(", "));
    if (s.expectations) L.push("- Expectations: " + s.expectations);
  });
  return L.join("\n");
}

/** Steps as sealed in the journey payload (1-based numbering). */
export function journeyPayloadSteps(steps: JourneyStep[]): JourneyPayloadStep[] {
  return steps.map((s, i) => {
    const kind = JKINDS[s.kind] ?? JKINDS.writing;
    const out: JourneyPayloadStep = {
      n: i + 1,
      title: singleLine(s.title) || "Untitled step",
      sealer: s.sealer,
      kind: s.kind,
      content_type: kind.content_type,
      relationship: kind.relationship,
      ai_policy: s.ai_policy,
      builds_on: s.builds_on.map((n) => n + 1),
    };
    const det = singleLine(s.ai_detail);
    if (det) out.ai_policy_detail = det;
    const exp = singleLine(s.expectations);
    if (exp) out.expectations = exp;
    if (s.spec_hash) out.spec_hash = s.spec_hash;
    return out;
  });
}

/** Fields for sealing the journey specification itself. */
export function buildJourneyFields(
  meta: JourneyMeta,
  steps: JourneyStep[],
  loadedFrom: { hash: string; title: string } | null,
  today: string = localToday()
): Record<string, unknown> {
  const course = singleLine(meta.course) || "Untitled course";
  const title = singleLine(meta.title) || "Assignment sequence";
  const instructor = singleLine(meta.instructor) || "Instructor";
  const fields: Record<string, unknown> = {
    title: title + " (" + course + ")",
    summary: "Journey specification: " + steps.length + " steps for " + course + ".",
    content_type: "seed",
    created_date: today,
    license: "All rights reserved",
    privacy_level: "internal",
    quarantine_status: "trusted",
    attribution: {
      good_faith_declaration: true,
      sources: [{
        author: instructor,
        contribution: "Designed this assignment sequence, its step policies, and its AI-use terms.",
        rights_bearing: true,
        role: "instructor_prompt",
      }],
    },
    fidelity_limits: {
      represents: "the instructor's journey specification as issued",
      trust_as: "the authoritative sequence and step policies for " + title + ", " + course,
      do_not_infer: [
        "that these steps or policies apply to other courses or assignments",
        "that the AI policies here represent the instructor's policy beyond this sequence",
      ],
    },
    use_conditions: {
      permitted: ["enrolled student use", "course design reference with attribution"],
      requested_preservations: ["do not modify and redistribute as if the sequence were unchanged"],
    },
    tags: ["journey"],
    journey: { course, title, steps: journeyPayloadSteps(steps) },
  };
  const term = singleLine(meta.term);
  if (term) (fields.journey as Record<string, unknown>).term = term;
  if (loadedFrom) {
    fields.parents = [{ payload_hash: loadedFrom.hash, title: loadedFrom.title, relationship: "supersedes" }];
    fields.transformation_history = [{
      date: today,
      who: instructor,
      strategy: "revision",
      notes: "Journey revised in KNOBE Studio; this version supersedes the parent.",
    }];
  }
  return fields;
}

export interface LoadedJourney {
  course?: string;
  term?: string;
  title?: string;
  steps: JourneyPayloadStep[];
}

/** Student flow: derive the Create-panel journey context for one step. */
export function journeyContextForStep(
  journey: LoadedJourney,
  stepIndex: number,
  journeyHash: string
): JourneyContext {
  const step = journey.steps[stepIndex];
  if (!step) throw new Error("The journey has no step " + (stepIndex + 1) + ".");
  const course = typeof journey.course === "string" ? journey.course : "this course";
  const policy = JPOLICIES[String(step.ai_policy)] ?? JPOLICIES.not_applicable;

  const buildsOn = Array.isArray(step.builds_on) ? step.builds_on : [];
  const parentSteps = buildsOn
    .map((n) => journey.steps[Number(n) - 1])
    .filter((s): s is JourneyPayloadStep => !!s && typeof s.spec_hash === "string" && !!s.spec_hash);
  const rel = typeof step.relationship === "string" && step.relationship ? step.relationship : "synthesis_input";

  const assignmentContext: Record<string, unknown> = {
    course,
    ai_policy: step.ai_policy || "not_applicable",
    assignment_type: step.kind || "writing",
    journey_knobe_hash: journeyHash,
  };
  if (typeof step.ai_policy_detail === "string" && step.ai_policy_detail) {
    assignmentContext.ai_policy_detail = step.ai_policy_detail;
  }
  const specStep = parentSteps.find((s) => s.kind === "spec") ?? parentSteps[0];
  if (specStep) assignmentContext.assignment_knobe_hash = specStep.spec_hash;

  return {
    forStudent: true,
    aiUI: policy.ui,
    assignmentContext,
    parents: parentSteps.map((s) => ({
      payload_hash: String(s.spec_hash),
      title: typeof s.title === "string" ? s.title : "Untitled step",
      relationship: rel,
    })),
    term: typeof journey.term === "string" ? journey.term : "",
    course: typeof journey.course === "string" ? journey.course : "",
  };
}

/** Instructor flow: Create-panel context for sealing one journey step spec. */
export function journeyContextForInstructorStep(
  steps: JourneyStep[],
  stepIndex: number,
  course: string,
  term = ""
): JourneyContext {
  const s = steps[stepIndex];
  if (!s) throw new Error("No step " + (stepIndex + 1) + " to seal.");
  const kind = JKINDS[s.kind] ?? JKINDS.reading;
  const assignmentContext: Record<string, unknown> = {
    course: singleLine(course) || "Untitled course",
    ai_policy: s.ai_policy,
    assignment_type: s.kind,
  };
  const det = singleLine(s.ai_detail);
  if (det) assignmentContext.ai_policy_detail = det;
  return {
    forStudent: false,
    aiUI: "none",
    assignmentContext,
    parents: s.builds_on
      .filter((n) => steps[n] && steps[n].spec_hash)
      .map((n) => ({
        payload_hash: steps[n].spec_hash,
        title: singleLine(steps[n].title) || "Untitled step",
        relationship: kind.relationship,
      })),
    term: singleLine(term),
    course: singleLine(course),
  };
}

// ---- Cohort ----------------------------------------------------------------

export interface CohortRow {
  file: string;
  title: string;
  author: string;
  state: string;
  conformance: string;
  ai: string;
  chainHashes: string[];
  review: string;
  stored: string | null;
  parents: Array<{ payload_hash?: string; title?: string; relationship?: string }>;
  error?: string;
}

export interface CohortExpectation {
  title: string;
  hashes: Set<string>;
  /** The expectation file's own payload hash: a receipt's responds_to parent. */
  stored: string | null;
}

const truncate = (v: string, n: number): string => (v.length > n ? v.slice(0, n - 1) + "…" : v);

export function cohortRowFromReport(fileName: string, report: VerifyReport): CohortRow {
  const p = report.payload ?? {};
  const sources = p.attribution && Array.isArray(p.attribution.sources) ? p.attribution.sources : [];
  const studentSrc = sources.find((s) => s && s.role === "student_author") ?? sources[0] ?? null;
  const aiSrcs = sources.filter((s) => s && s.role === "ai_assistant");
  const chainHashes: string[] = [];
  (Array.isArray(p.parents) ? p.parents : []).forEach((pa) => {
    if (pa && typeof pa.payload_hash === "string") chainHashes.push(pa.payload_hash);
  });
  const ac = (p.assignment_context ?? {}) as Record<string, unknown>;
  if (typeof ac.assignment_knobe_hash === "string") chainHashes.push(ac.assignment_knobe_hash);
  if (typeof ac.journey_knobe_hash === "string") chainHashes.push(ac.journey_knobe_hash);
  const review = p.education_review as Record<string, unknown> | undefined;
  return {
    file: fileName,
    title: typeof p.title === "string" ? truncate(p.title, 80) : "",
    author: studentSrc && typeof studentSrc.author === "string" ? truncate(studentSrc.author, 60) : "",
    state: report.state,
    conformance: report.conformance,
    ai: aiSrcs.length
      ? truncate(aiSrcs.map((s) => s.contribution).filter((x): x is string => typeof x === "string").join(" | "), 140)
      : "none declared",
    chainHashes,
    review: review && typeof review.submission_status === "string" ? review.submission_status : "",
    stored: typeof report.stored === "string" ? report.stored : null,
    parents: Array.isArray(p.parents) ? p.parents : [],
  };
}

export function unreadableCohortRow(fileName: string, message: string): CohortRow {
  return {
    file: fileName, title: "", author: "", state: "unreadable", conformance: "invalid",
    ai: "", chainHashes: [], review: "", stored: null, parents: [], error: message,
  };
}

export function chainVerdict(
  row: CohortRow,
  expectation: CohortExpectation | null
): { text: string; cls: "cok" | "cbad" | "cneutral" } {
  if (!expectation) return { text: "—", cls: "cneutral" };
  const ok = row.chainHashes.some((h) => expectation.hashes.has(h));
  return ok ? { text: "linked", cls: "cok" } : { text: "no link", cls: "cbad" };
}

/** Lower score = more anomalous; anomalies sort to the top. */
export function anomalyScore(row: CohortRow, expectation: CohortExpectation | null): number {
  const integ = row.state === "verified" || row.state === "verified-body-modified" ? 1 : 0;
  const chain = !expectation ? 1 : row.chainHashes.some((h) => expectation.hashes.has(h)) ? 1 : 0;
  return integ + chain;
}

export function sortCohortRows(rows: CohortRow[], expectation: CohortExpectation | null): CohortRow[] {
  return [...rows].sort(
    (a, b) => anomalyScore(a, expectation) - anomalyScore(b, expectation) || a.file.localeCompare(b.file)
  );
}

export function cohortCsv(rows: CohortRow[], expectation: CohortExpectation | null): string {
  // Cell values come from attacker-controlled payloads (titles, authors) and
  // the CSV is opened in Excel/Sheets: neutralize formula injection (CWE-1236)
  // by prefixing leading =, +, -, @, tab, or CR with an apostrophe.
  const esc = (v: unknown): string => {
    let s = String(v ?? "");
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  };
  const head = ["file", "title", "author", "integrity", "conformance", "ai_disclosure", "chain", "review_status"];
  const lines = [head.join(",")];
  for (const row of rows) {
    lines.push(
      [row.file, row.title, row.author, row.state, row.conformance, row.ai, chainVerdict(row, expectation).text, row.review]
        .map(esc)
        .join(",")
    );
  }
  return lines.join("\n");
}

/** Accepted chain hashes from an expectation file: its own hash plus any sealed step hashes. */
export function expectationFromReport(report: VerifyReport): CohortExpectation {
  const hashes = new Set<string>();
  const stored = typeof report.stored === "string" ? report.stored : null;
  if (stored) hashes.add(stored);
  const j = report.payload?.journey;
  if (j && Array.isArray(j.steps)) {
    for (const s of j.steps) {
      if (typeof s.spec_hash === "string" && s.spec_hash) hashes.add(s.spec_hash);
    }
  }
  return {
    title: typeof report.payload?.title === "string" ? report.payload.title : "Untitled",
    hashes,
    stored,
  };
}

// ---- Adapt -----------------------------------------------------------------

export const ATYPES: Record<string, { label: string; suffix: string; represents: string }> = {
  simplification: {
    label: "Plain language / simplification", suffix: "Plain-Language Version",
    represents: "the source work in plain language",
  },
  translation: {
    label: "Translation", suffix: "Translation",
    represents: "the source work in another language",
  },
  caption: {
    label: "Transcript / captions", suffix: "Transcript",
    represents: "the spoken or audio content of the source work as text",
  },
  "alt-text": {
    label: "Alt-text / description", suffix: "Description",
    represents: "a textual description of the source work's visual content",
  },
  multimodal: {
    label: "Multimodal version", suffix: "Multimodal Version",
    represents: "the source work re-presented in an additional modality",
  },
};

/** Normalize pasted adaptation text: smart punctuation, stray HTML, whitespace. */
export function cleanupAdaptText(before: string): string {
  let t = before.replace(/\r\n/g, "\n");
  t = t.replace(/[‘’‛]/g, "'").replace(/[“”‟]/g, '"');
  t = t.replace(/…/g, "...")
    .replace(/[  -  　]/g, " ")
    .replace(/[​-‍﻿]/g, "");
  t = t.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>\s*/gi, "\n\n").replace(/<p[^>]*>/gi, "\n\n");
  t = t.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'");
  t = t.split("\n").map((s) => s.replace(/[ \t]+$/, "")).join("\n").replace(/\n{3,}/g, "\n\n");
  return t;
}

export interface AdaptParams {
  type: string;
  sourceTitle: string;
  sourceReport: VerifyReport;
  sourceAuthor: string;
  adapter: string;
  aiName: string;
  aiWhat: string;
  reviewer: string;
  title: string;
  license: string;
  preserved: string;
  omitted: string;
  today: string;
}

/** Fields for sealing an accessibility adaptation bound to its source hash. */
export function buildAdaptFields(params: AdaptParams): Record<string, unknown> {
  const t = ATYPES[params.type];
  if (!t) throw new Error("Unknown adaptation type: " + params.type);
  const adapter = singleLine(params.adapter);
  if (!adapter) throw new Error("Name who made this adaptation; the credit is part of the record.");
  const aiName = singleLine(params.aiName);
  const aiWhat = singleLine(params.aiWhat);
  if (aiName && !aiWhat) throw new Error("You named an AI tool. Say what it did and what you did yourself.");
  const reviewer = singleLine(params.reviewer);
  const preserved = params.preserved.trim().replace(/\s+/g, " ");
  const omitted = params.omitted.trim().replace(/\s+/g, " ");
  const stored = params.sourceReport.stored;
  if (!stored) throw new Error("The source has no sealed hash to bind to.");
  const today = params.today;

  const sources: Array<Record<string, unknown>> = [];
  if (params.sourceAuthor) {
    sources.push({ author: params.sourceAuthor, contribution: "Author of the source work", rights_bearing: true });
  }
  sources.push({
    author: adapter,
    contribution: "Produced this adaptation (" + t.label + ")",
    rights_bearing: true,
    role: "adapter",
  });
  if (aiName) sources.push({ author: aiName, contribution: aiWhat, rights_bearing: false, role: "ai_assistant" });
  if (reviewer) {
    sources.push({
      author: reviewer,
      contribution: "Reviewed this adaptation for accuracy and access",
      rights_bearing: false,
      role: "accessibility_reviewer",
    });
  }

  const dot = (s: string): string => (/[.!?]$/.test(s) ? s : s + ".");
  const noteParts: string[] = [];
  if (preserved) noteParts.push("Preserves: " + dot(preserved));
  if (omitted) noteParts.push("Omits or changes: " + dot(omitted));
  noteParts.push("See fidelity_limits.");

  const srcPrivacy = params.sourceReport.payload?.privacy_level;
  const fields: Record<string, unknown> = {
    title: singleLine(params.title) || params.sourceTitle + " (" + t.suffix + ")",
    summary:
      "A " + t.label.toLowerCase() + ' of "' + params.sourceTitle +
      '", bound to its source by payload hash and credited to its adapter.',
    content_type: params.type === "translation" ? "translation" : "adaptation",
    created_date: today,
    quarantine_status: "quarantine",
    privacy_level:
      typeof srcPrivacy === "string" && ["public", "internal", "sensitive", "restricted"].includes(srcPrivacy)
        ? srcPrivacy
        : "internal",
    attribution: { good_faith_declaration: true, sources },
    fidelity_limits: {
      represents: t.represents,
      trust_as: "an access-focused adaptation; the source work remains authoritative",
      do_not_infer: [
        "that this replaces the source work",
        omitted
          ? "that this is the complete source work; it omits or changes: " + dot(omitted)
          : "that this carries every detail of the source work",
        "that omission implies the omitted material is unimportant",
      ],
    },
    use_conditions: {
      permitted: ["use, redistribution, and further adaptation within the terms of the source work's license"],
      requested_preservations: [
        "keep the link to the source by hash when redistributing",
        "credit the adapter when further adapting",
        "preserve the fidelity limits when quoting or excerpting",
      ],
    },
    parents: [{ payload_hash: stored, title: params.sourceTitle, relationship: "adaptation_of" }],
    accessibility: [{
      adaptation_type: params.type,
      adapted_from: stored,
      adaptation_contributor: aiName ? adapter + " (direction); " + aiName + " (drafting)" : adapter,
      note: noteParts.join(" "),
      review_date: today,
    }],
    transformation_history: [{
      date: today,
      who: aiName ? adapter + " with " + aiName : adapter,
      strategy: "adaptation",
      parent_hashes: [stored],
      notes: t.label + " produced in KNOBE Studio. Source bound by payload_hash.",
    }],
  };
  const lic = singleLine(params.license);
  if (lic) fields.license = lic;
  return fields;
}
