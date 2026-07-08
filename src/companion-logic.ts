/**
 * companion-logic.ts — decides whether the embedded KNOBE Teaching Studio
 * plugin should be written into the vault. Pure functions, no Obsidian and no
 * generated-payload imports, so tests can exercise every branch directly.
 */

export interface CompanionState {
  /** Version from the manifest already in the vault, or null if absent/unreadable. */
  installedVersion: string | null;
  /** Version this plugin last wrote (from settings), or null if it never has. */
  lastInstalledByUs: string | null;
  /** Version of the companion embedded in this bundle. */
  embeddedVersion: string;
}

export type CompanionAction = "install" | "update" | "skip";

/** Compare dotted numeric versions: negative if a < b, 0 if equal, positive if a > b. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

export function decideCompanionAction(s: CompanionState): CompanionAction {
  if (s.installedVersion === null) {
    // Not in the vault. If we put it there before, the user removed it on
    // purpose — respect that (the settings tab offers a reinstall button).
    return s.lastInstalledByUs ? "skip" : "install";
  }
  // Present (whether installed by us or by hand): refresh only on upgrade, so
  // a locally-built or newer copy is never clobbered by an older bundle.
  return compareVersions(s.embeddedVersion, s.installedVersion) > 0 ? "update" : "skip";
}
