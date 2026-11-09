/**
 * Commitments from the steward's listing review (knobe-protocol #16,
 * 2026-11-08): names and authorship that say whose these plugins are, Studio
 * never installing or enabling another plugin, and documentation without
 * compliance claims or a stale vector count.
 *
 * The manifest checks mirror the `validate-manifest` rule of Obsidian's own
 * linter, which directory review runs. Both 0.3.0 and 0.5.1 reject "obsidian"
 * in a plugin name; the stricter description format is 0.3.0's.
 */
import { describe, expect, test } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const read = (path: string): string => readFileSync(join(ROOT, path), "utf-8");

const MANIFESTS = [
  { path: "manifest.json", id: "knobe-studio", name: "KNOBE Studio (KnobeDev)" },
  { path: "instructor-plugin/manifest.json", id: "knobe-teaching-studio", name: "KNOBE Teaching Studio (KnobeDev)" },
];

describe.each(MANIFESTS)("$path", ({ path, id, name }) => {
  const manifest = JSON.parse(read(path)) as Record<string, unknown>;

  test("keeps its id, so existing installs keep working", () => {
    expect(manifest.id).toBe(id);
  });

  test("names the maintainer, not the protocol", () => {
    expect(manifest.name).toBe(name);
    expect(manifest.author).toBe("KnobeDev");
    expect(manifest.authorUrl).toBe("https://github.com/KnobeDev");
  });

  test("has no 'obsidian' or 'plugin' in id, name or description", () => {
    for (const key of ["id", "name", "description"]) {
      expect(String(manifest[key]).toLowerCase(), key).not.toMatch(/obsidian|plugin/);
    }
  });

  test("has a description in the directory's format", () => {
    const description = String(manifest.description);
    expect(description.length).toBeGreaterThanOrEqual(10);
    expect(description.length).toBeLessThanOrEqual(250);
    expect(description).toMatch(/^[A-Z]/);
    expect(description.endsWith(".")).toBe(true);
    expect(description).toMatch(/^[A-Za-z0-9\s.,!?'"-]+$/);
  });
});

const sourceFiles = (readdirSync(join(ROOT, "src"), { recursive: true }) as string[])
  .filter((f) => f.endsWith(".ts"))
  .map((f) => join("src", f));

describe("Studio installs no other plugin", () => {
  test("no source file writes into the plugins folder or toggles a plugin", () => {
    expect(sourceFiles.length, "src/ was scanned").toBeGreaterThan(10);
    const offenders = sourceFiles.filter((f) =>
      /configDir|obsidian\/plugins|app\.plugins|enablePlugin|disablePlugin|installPlugin|loadManifests/.test(read(f))
    );
    expect(offenders).toEqual([]);
  });

  test("the build embeds no copy of Teaching Studio in the Studio bundle", () => {
    expect(read("esbuild.config.mjs")).not.toMatch(/companion-payload/);
  });
});

describe("documentation states what the tools do", () => {
  const userFacing = ["README.md", "instructor-plugin/README.md", "manifest.json", "instructor-plugin/manifest.json", ...sourceFiles];

  test("makes no FERPA or HIPAA compliance claims", () => {
    const offenders = userFacing.filter((f) => /ferpa-aware|hipaa-safe|can never appear/i.test(read(f)));
    expect(offenders).toEqual([]);
  });

  test("states the current vector count, set by set", () => {
    const vectors = (dir: string): number =>
      readdirSync(join(ROOT, "test/vectors", dir)).filter((f) => f.endsWith(".knobe.md")).length;
    const claim = /all (\d+) vectors in knobe-protocol's `test-vectors\/` at `[0-9a-f]{7}` \((\d+) core, (\d+) adversarial, (\d+) interpretation\)/.exec(
      read("README.md")
    );
    expect(claim, "README Engine section states the vector count").not.toBeNull();
    const [, total, core, adversarial, interpretation] = (claim ?? []).map(Number);
    expect([core, adversarial, interpretation]).toEqual([vectors(""), vectors("adversarial"), vectors("interpretation")]);
    expect(total).toBe(core + adversarial + interpretation);
    expect(read("README.md")).not.toMatch(/nine official/);
  });
});
