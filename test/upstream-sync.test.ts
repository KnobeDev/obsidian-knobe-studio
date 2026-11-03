/**
 * Drift guard: lock the vendored engine and the bundled conformance vectors
 * to the upstream KNOBE Protocol repository, so an upstream revision can
 * never silently pass here against a stale copy.
 *
 * Set KNOBE_PROTOCOL_DIR to a clone of github.com/KnobeOne/knobe-protocol.
 * CI checks it out; locally the known clone paths are tried, and the block
 * skips when none is present (CI fails instead, so the guard always runs
 * where it matters).
 */
import { describe, expect, test } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

function resolveUpstream(): string | null {
  const candidates = [
    process.env.KNOBE_PROTOCOL_DIR,
    "/mnt/devdrive/knobe-protocol",
  ].filter((c): c is string => !!c);
  for (const base of candidates) {
    if (existsSync(join(base, "knobe-core.js")) && existsSync(join(base, "test-vectors"))) return base;
  }
  return null;
}

/** Every file under dir, as paths relative to it, sorted. */
function walk(dir: string, root = dir): string[] {
  return readdirSync(dir)
    .flatMap((name) => {
      const p = join(dir, name);
      return statSync(p).isDirectory() ? walk(p, root) : [relative(root, p)];
    })
    .sort();
}

const UPSTREAM = resolveUpstream();
if (!UPSTREAM && process.env.CI) {
  throw new Error("KNOBE_PROTOCOL_DIR is not set to a knobe-protocol clone; CI must check it out.");
}

describe.skipIf(!UPSTREAM)("vendored engine and vectors match upstream knobe-protocol", () => {
  const up = UPSTREAM as string;
  const bundled = join(__dirname, "vectors");

  test("src/engine/knobe-core.js is byte-identical to upstream knobe-core.js", () => {
    const ours = readFileSync(join(__dirname, "..", "src", "engine", "knobe-core.js"));
    expect(ours.equals(readFileSync(join(up, "knobe-core.js")))).toBe(true);
  });

  test("bundled vector set is complete (core, adversarial, interpretation)", () => {
    expect(walk(bundled)).toEqual(walk(join(up, "test-vectors")));
  });

  test("every bundled vector is byte-identical to upstream", () => {
    const drifted = walk(bundled).filter(
      (f) => !readFileSync(join(bundled, f)).equals(readFileSync(join(up, "test-vectors", f)))
    );
    expect(drifted).toEqual([]);
  });
});
