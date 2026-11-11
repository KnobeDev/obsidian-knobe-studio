/**
 * Commitments from the steward's listing review (knobe-protocol #16,
 * 2026-11-08): a name and authorship that say whose the plugin is, Studio
 * never installing or enabling another plugin, and documentation without
 * compliance claims or a stale vector count. Since 0.4.0 the Teaching Studio
 * is a view inside Studio (off until turned on), so there is one manifest.
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
  const userFacing = ["README.md", "manifest.json", ...sourceFiles];

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

/**
 * Obsidian's manifest reference (https://docs.obsidian.md/Reference/Manifest):
 * every required field with its type, an id of lowercase letters and hyphens,
 * a name in Basic Latin, x.y.z versions, a minAppVersion that is really the
 * oldest Obsidian the code runs on, and isDesktopOnly false only while no
 * source file needs Node.js or Electron.
 */
const REQUIRED: Record<string, string> = {
  id: "string",
  name: "string",
  version: "string",
  minAppVersion: "string",
  description: "string",
  author: "string",
  isDesktopOnly: "boolean",
};
const OPTIONAL = ["authorUrl", "fundingUrl", "helpUrl"];
const XYZ = /^\d+\.\d+\.\d+$/;

/** Compares two x.y.z versions: negative, zero or positive, like a sort comparator. */
const compareVersions = (a: string, b: string): number => {
  const [x, y] = [a, b].map((v) => v.split(".").map(Number));
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
};

/**
 * Obsidian APIs newer than 1.4.0 that the code must not call while minAppVersion
 * is older. A file that defines a modal and calls `.setTitle(` calls
 * Modal.setTitle; MenuItem.setTitle, used for the file-menu item, is far older.
 * Obsidian's linter (no-unsupported-api) checks every API; this keeps the one
 * most likely to slip in.
 */
const NEWER_APIS = [
  {
    api: "Modal.setTitle",
    since: "1.5.1",
    calls: (source: string): boolean => /extends\s+\w*Modal\b/.test(source) && /\.setTitle\(/.test(source),
  },
];

// The vendored engine is JavaScript, so it is scanned too.
const codeFiles = (readdirSync(join(ROOT, "src"), { recursive: true }) as string[])
  .filter((f) => /\.(ts|js)$/.test(f))
  .map((f) => join("src", f));

describe("manifest.json follows Obsidian's manifest reference", () => {
  const manifest = JSON.parse(read("manifest.json")) as Record<string, unknown>;
  const name = String(manifest.name);
  const description = String(manifest.description);
  const version = String(manifest.version);
  const minAppVersion = String(manifest.minAppVersion);
  const versions = JSON.parse(read("versions.json")) as Record<string, string>;
  const pkg = JSON.parse(read("package.json")) as { version: string };

  test("has every required field with its type, and no field the directory does not know", () => {
    for (const [key, type] of Object.entries(REQUIRED)) expect(typeof manifest[key], key).toBe(type);
    const unknown = Object.keys(manifest).filter((k) => !(k in REQUIRED) && !OPTIONAL.includes(k));
    expect(unknown).toEqual([]);
  });

  test("has an id of lowercase letters and hyphens that does not end with 'plugin'", () => {
    expect(manifest.id).toMatch(/^[a-z]+(-[a-z]+)*$/);
    expect(manifest.id).not.toMatch(/obsidian|plugin$/);
  });

  test("has a name in Basic Latin, with no punctuation but hyphens, plus signs and parentheses", () => {
    expect(name).toMatch(/^[A-Za-z0-9 ()+-]+$/);
    // Like Obsidian's linter, this rejects a leading "ob" as well as "obsi" and
    // "sidian". "plugin" in the name is the forbidden-word test above.
    expect(name.toLowerCase()).not.toMatch(/^ob|obsi|sidian/);
  });

  test("has a description that does not start with the name or talk about itself", () => {
    expect(description.toLowerCase().startsWith(name.toLowerCase())).toBe(false);
    expect(description).not.toMatch(/this plugin|an? plugin (that|for|to|which)/i);
  });

  test("links the author over https", () => {
    expect(manifest.authorUrl).toMatch(/^https:\/\//);
  });

  test("uses x.y.z versions, and package.json and versions.json agree with it", () => {
    expect(version).toMatch(XYZ);
    expect(minAppVersion).toMatch(XYZ);
    expect(pkg.version).toBe(version);
    expect(versions[version]).toBe(minAppVersion);
    for (const [release, app] of Object.entries(versions)) {
      expect(release, "versions.json key").toMatch(XYZ);
      expect(app, `versions.json ${release}`).toMatch(XYZ);
    }
  });

  test.each(NEWER_APIS)("calls $api only if it asks for Obsidian $since or newer", ({ calls, since }) => {
    const callers = codeFiles.filter((f) => calls(read(f)));
    // While minAppVersion is older than `since`, no file may call the API.
    expect(compareVersions(minAppVersion, since) < 0 ? callers : []).toEqual([]);
  });

  test("is not desktop-only, and no source file loads a Node.js or Electron module", () => {
    expect(codeFiles.length, "src/ was scanned").toBeGreaterThan(10);
    expect(manifest.isDesktopOnly).toBe(false);
    // A heuristic, not proof: static, side-effect and dynamic imports of Node.js
    // built-ins or Electron, require(), and the Node globals a plugin would reach for.
    const nodeOnly =
      /(\bfrom\s+|\bimport\s*\(?\s*)["'](node:[^"']+|electron|fs|path|os|child_process|crypto|buffer|stream|zlib|url|util|https?|http2|net|tls|dns|worker_threads)["']|\brequire\s*\(|\bprocess\.(env|platform|versions)\b|\bBuffer\./;
    expect(codeFiles.filter((f) => nodeOnly.test(read(f)))).toEqual([]);
  });
});
