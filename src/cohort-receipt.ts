/**
 * cohort-receipt.ts — pure port of knobe.org/studio's cohort receipt: one
 * sealed KNOBE attesting that, at seal time, the listed files existed with
 * these payload hashes and produced these verdicts. Anchoring its single
 * payload hash anywhere with an independent timestamp timestamps every
 * listed submission at once.
 */
import { chainVerdict, localToday, singleLine, type CohortExpectation, type CohortRow } from "./studio-core";

export interface CohortReceiptRow {
  file: string;
  stored: string | null;
  integrity: string;
  conformance: string;
  chain: "linked" | "no_link" | "not_checked";
}

/**
 * One snapshot feeds both payload and body. Exact (file, hash) duplicates
 * from repeated intake are dropped, and rows sort by codepoint so the sealed
 * bytes are machine-independent (localeCompare is locale-dependent).
 */
export function cohortReceiptRows(rows: CohortRow[], expectation: CohortExpectation | null): CohortReceiptRow[] {
  const seen = new Set<string>();
  const out: CohortReceiptRow[] = [];
  for (const r of rows) {
    const key = r.file + " " + (r.stored ?? "");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      file: singleLine(r.file),
      stored: r.stored ?? null,
      integrity: r.state,
      conformance: r.conformance,
      chain: !expectation ? "not_checked" : chainVerdict(r, expectation).text === "linked" ? "linked" : "no_link",
    });
  }
  const sortKey = (r: CohortReceiptRow): string => r.file + " " + (r.stored ?? "");
  return out.sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : sortKey(a) > sortKey(b) ? 1 : 0));
}

/**
 * Fields and body for a cohort receipt, ported from knobe.org/studio. Author
 * names and AI-disclosure text are deliberately left out: payload hashes are
 * the probative identifier, and names would turn every dispute disclosure
 * into a roster disclosure. Counts are sealed as strings (spec §5).
 */
export function buildCohortReceipt(
  cohortRows: CohortRow[],
  expectation: CohortExpectation | null,
  sealerName: string,
  today: string = localToday()
): { fields: Record<string, unknown>; body: string } {
  const rows = cohortReceiptRows(cohortRows, expectation);
  const ok = rows.filter((r) => r.integrity === "verified" || r.integrity === "verified-body-modified").length;
  const bad = rows.length - ok;
  const files = rows.length + " file" + (rows.length === 1 ? "" : "s");
  const title = "Cohort check receipt: " + (expectation ? expectation.title : "an unnamed batch") + ", " + today;

  const block: Record<string, unknown> = {
    checked_date: today,
    engine: "knobe-core.js via KNOBE Studio cohort check",
    submission_count: String(rows.length),
    verified_count: String(ok),
    failed_or_unreadable_count: String(bad),
    submissions: rows.map((r) => {
      const s: Record<string, string> = { file: r.file, integrity: r.integrity, conformance: r.conformance, chain: r.chain };
      if (r.stored) s.payload_hash = r.stored;
      return s;
    }),
  };
  if (expectation) {
    block.assignment = expectation.title;
    block.expectation_hashes = [...expectation.hashes].sort();
  }

  const fields: Record<string, unknown> = {
    title,
    summary: "Sealed record of a cohort integrity check: " + files + ", " + ok + " verified, " + bad + " failed or unreadable.",
    content_type: "collection",
    created_date: today,
    license: "All rights reserved",
    privacy_level: "internal",
    quarantine_status: "trusted",
    attribution: {
      good_faith_declaration: true,
      sources: [{
        author: sealerName,
        contribution: "Ran the cohort check in KNOBE Studio and attested the listed verdicts at seal time.",
        rights_bearing: true,
        role: "cohort_verifier",
      }],
    },
    fidelity_limits: {
      represents: "the verdicts KNOBE Studio's cohort check produced for the listed files at seal time",
      trust_as: "the sealer's attestation, on the stated date, that files with these payload hashes existed and produced these verdicts",
      do_not_infer: [
        "that created_date is machine-verified wall-clock time; it is the sealer's declared date until the receipt hash is anchored externally",
        "that a verified verdict establishes authorship, originality, or policy compliance for any submission",
        "that this list is the complete set of submissions for the assignment",
        "that file names identify students; authorship claims live in the submissions themselves",
      ],
    },
    use_conditions: {
      permitted: ["course records and grading workflow", "academic integrity review", "dispute resolution concerning a listed submission"],
      requested_preservations: [
        "keep within course staff and institutional review processes",
        "cite this receipt's payload_hash when quoting any row",
      ],
      consent_note: "File names come from the LMS export and may contain student names. FERPA applies.",
    },
    tags: ["cohort-receipt"],
    "education:cohort_receipt": block,
  };
  if (expectation && expectation.stored) {
    fields.parents = [{ payload_hash: expectation.stored, title: expectation.title, relationship: "responds_to" }];
  }

  const L = ["# " + title, ""];
  L.push(
    "Checked " + today + " by " + sealerName + ". " + files + ": " + ok + " verified, " + bad + " failed or unreadable." +
    (expectation ? ' Chain checked against "' + expectation.title + '".' : " No chain expectation was loaded.")
  );
  L.push("");
  L.push("This receipt attests that the sealer ran the check and saw these verdicts at seal time. It is not an independent wall-clock timestamp until its payload hash is anchored somewhere the sealer does not control.");
  L.push("");
  L.push("| File | Payload hash | Integrity | Conformance | Chain |");
  L.push("|---|---|---|---|---|");
  for (const r of rows) {
    L.push("| " + r.file.replace(/\|/g, "\\|") + " | " + (r.stored ?? "(unreadable)") + " | " + r.integrity + " | " + r.conformance + " | " + r.chain + " |");
  }
  L.push("");
  L.push("To use this receipt in a dispute: verify this file, verify the disputed submission, and confirm the submission's recomputed payload hash appears in its row above. The attribution and date then attest the file existed with that content when the check ran.");
  return { fields, body: L.join("\n") };
}
