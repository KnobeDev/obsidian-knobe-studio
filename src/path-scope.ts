/**
 * path-scope.ts — dependency-free vault-path scoping used by demo mode.
 * Kept free of the `obsidian` import so it stays unit-testable in Node.
 */

/** Normalize a vault path for comparison (mirrors Obsidian's normalizePath). */
export function normalizeVaultPath(p: string): string {
  return String(p ?? "")
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .trim();
}

/**
 * True if `path` sits inside `folder` (or `folder` is the whole vault).
 * A null/empty/root folder means "no scope" — everything is in scope.
 * A shared name prefix does NOT count (KNOBE/DemoReal is not under KNOBE/Demo).
 *
 * Comparison is case-SENSITIVE on purpose. On a case-sensitive filesystem
 * (Linux) "KNOBE/demo" and "KNOBE/Demo" are genuinely different folders, so
 * case-folding could merge a real-records folder into the demo scope — an
 * unsafe false positive. Exact matching fails safe: a case-mismatched sandbox
 * simply shows nothing (a visible empty picker), never a leak. Set the demo
 * folder to match its actual on-disk casing.
 */
export function isUnderFolder(path: string, folder: string | null): boolean {
  if (!folder) return true;
  const scope = normalizeVaultPath(folder);
  if (scope === "") return true;
  const p = normalizeVaultPath(path);
  return p === scope || p.startsWith(scope + "/");
}
