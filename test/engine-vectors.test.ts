import { describe, expect, test } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  createKnobe,
  permits,
  read,
  transformKnobe,
  verify,
} from "../src/engine/knobe-core.js";

const VECTORS = join(__dirname, "vectors");
const vector = (name: string): string => readFileSync(join(VECTORS, name), "utf-8");

/**
 * Expected results are read from the bundled READMEs' tables, which the drift
 * guard (upstream-sync.test.ts) keeps byte-identical to upstream. A vector
 * added upstream is therefore checked here as soon as it is vendored, and a
 * vector without a README row (or a row without a file) fails the suite.
 */
interface Expected {
  file: string;
  state: string;
  body: string | null; // null: the table shows "—" (unreadable)
  conformance: string;
}

const EM_DASH = String.fromCodePoint(0x2014);
// Unreadable files must report body_verified as omitted; machine output may
// spell that "omitted" or null (erratum E11).
const OMITTED = ["omitted", null];

/** First word of a cell: "verified (last block)" -> "verified". */
const firstWord = (cell: string): string => cell.split(/[\s(]/)[0] ?? "";

/**
 * Rows are read by column position, so every row must sit under a header
 * whose columns are checked first: a renamed, missing or reordered header
 * fails here instead of silently comparing the wrong columns.
 */
function expectations(dir: string): Expected[] {
  const readme = join(dir, "README.md");
  const rows: Expected[] = [];
  let underCheckedHeader = false;
  for (const line of readFileSync(join(VECTORS, readme), "utf-8").split("\n")) {
    if (!line.startsWith("|")) {
      underCheckedHeader = false;
      continue;
    }
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells[0]?.toLowerCase() === "file") {
      expect(cells.slice(1, 4).map((c) => c.replace(/^expected /, "")), readme).toEqual([
        "status",
        "body_verified",
        "conformance",
      ]);
      underCheckedHeader = true;
      continue;
    }
    const file = /^`([^`]+\.knobe\.md)`$/.exec(cells[0] ?? "")?.[1];
    if (!file) continue;
    expect(underCheckedHeader, `${readme}: ${file} is not under a recognized header`).toBe(true);
    const row: Expected = {
      file,
      state: firstWord(cells[1] ?? ""),
      body: firstWord(cells[2] ?? ""),
      conformance: firstWord(cells[3] ?? ""),
    };
    expect(row.state, `${readme}: ${file} status`).toMatch(/^[a-z-]+$/);
    expect(row.conformance, `${readme}: ${file} conformance`).toMatch(/^[a-z]+$/);
    expect(row.body, `${readme}: ${file} body_verified`).toMatch(new RegExp(`^(?:[a-z]+|${EM_DASH})$`));
    rows.push({ ...row, body: row.body === EM_DASH ? null : row.body });
  }
  expect(rows.length, `${readme} has no vector rows`).toBeGreaterThan(0);
  return rows;
}

const bundled = (dir: string): string[] =>
  readdirSync(join(VECTORS, dir)).filter((f) => f.endsWith(".knobe.md")).sort();

describe.each([
  { set: "core", dir: "" },
  { set: "adversarial", dir: "adversarial" },
  { set: "interpretation", dir: "interpretation" },
])("engine reproduces the $set vectors' published results", ({ set, dir }) => {
  const rows = expectations(dir);

  test("every bundled vector has exactly one README row, and every row a file", () => {
    expect(rows.map((r) => r.file).sort()).toEqual(bundled(dir));
  });

  if (set === "core") {
    test("the core set is the nine conformance vectors of spec §10", () => {
      expect(rows).toHaveLength(9);
    });
  }

  test.each(rows)("$file → $state / $body / $conformance", async ({ file, state, body, conformance }) => {
    const report = await verify(vector(join(dir, file)));
    expect(report.state).toBe(state);
    expect(report.conformance).toBe(conformance);
    if (body === null) expect(OMITTED).toContain(report.body_verified);
    else expect(report.body_verified).toBe(body);
  });
});

describe("engine follows ERRATA details the README tables do not show", () => {
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
