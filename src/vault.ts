/**
 * vault.ts — vault-native replacements for the browser Studio's file
 * download / drag-drop intake: save sealed objects into the vault and
 * read candidate KNOBE files back out of it.
 */
import { App, Notice, TFile, TFolder, normalizePath } from "obsidian";

// Accepted file types are defined once in text-formats; re-exported under the
// historical name so existing call sites (file-menu, vault pickers) keep working.
export { TEXT_NAME_RE as KNOBE_NAME_RE } from "./text-formats";
import { TEXT_NAME_RE as KNOBE_NAME_RE } from "./text-formats";

// isUnderFolder lives in the obsidian-free path-scope module so it stays
// unit-testable; re-exported here for existing call sites.
export { isUnderFolder } from "./path-scope";
import { isUnderFolder } from "./path-scope";

/** Ensure the configured output folder exists, returning its normalized path. */
export async function ensureFolder(app: App, folderPath: string): Promise<string> {
  const path = normalizePath(folderPath || "/");
  if (path === "/" || path === "") return "";
  const existing = app.vault.getAbstractFileByPath(path);
  if (existing instanceof TFolder) return path;
  if (existing) throw new Error('"' + path + '" exists but is not a folder.');
  await app.vault.createFolder(path);
  return path;
}

/**
 * Save text into the vault without overwriting; returns the created file.
 * Preserves the ".knobe.md" naming convention (uniqueness suffix goes before
 * the extension: "title-2.knobe.md"), and keeps non-md extensions like .csv.
 *
 * `demoScope` is the fail-closed guard: when demo mode is on the caller passes
 * the sandbox folder, and any write whose target resolves outside it throws
 * instead of silently landing next to real records. Pass null when demo mode
 * is off (no restriction).
 */
export async function saveTextFile(
  app: App,
  folderPath: string,
  fileName: string,
  text: string,
  demoScope: string | null = null
): Promise<TFile> {
  if (demoScope && !isUnderFolder(folderPath, demoScope)) {
    throw new Error(
      "Demo mode is on: refusing to save to " + folderPath + ", which is outside the demo folder " + demoScope + "."
    );
  }
  const folder = await ensureFolder(app, folderPath);
  // The name is user-editable: keep it a plain file name inside the folder.
  const safeName = fileName.replace(/[\\/]/g, "-").replace(/^\.+/, "");
  const m = safeName.match(/^(.*?)((?:\.knobe)?\.md|\.[a-z0-9]+)$/i);
  const base = (m ? m[1] : safeName) || "untitled";
  const ext = m ? m[2] : ".md";
  const pathFor = (suffix: string): string =>
    normalizePath((folder ? folder + "/" : "") + base + suffix + ext);
  let candidate = pathFor("");
  let n = 2;
  while (app.vault.getAbstractFileByPath(candidate)) {
    candidate = pathFor("-" + n);
    n += 1;
  }
  const file = await app.vault.create(candidate, text);
  new Notice("Saved: " + file.path);
  return file;
}

/** Save sealed KNOBE text into the vault; alias kept for intent at call sites. */
export async function saveSealedFile(
  app: App,
  folderPath: string,
  fileName: string,
  text: string,
  demoScope: string | null = null
): Promise<TFile> {
  return saveTextFile(app, folderPath, fileName, text, demoScope);
}

/** Read a vault file as raw text. */
export async function readVaultFile(app: App, file: TFile): Promise<string> {
  return app.vault.read(file);
}

/** Markdown-ish files under a folder (recursive), for cohort checks. */
export function filesUnderFolder(folder: TFolder): TFile[] {
  const out: TFile[] = [];
  const walk = (f: TFolder): void => {
    for (const child of f.children) {
      if (child instanceof TFolder) walk(child);
      else if (child instanceof TFile && KNOBE_NAME_RE.test(child.name)) out.push(child);
    }
  };
  walk(folder);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Plausible KNOBE files in the vault, optionally confined to a scope folder.
 * The scope is the demo-mode privacy boundary: outside files never appear.
 */
export function candidateKnobeFiles(app: App, scope: string | null = null): TFile[] {
  return app.vault
    .getFiles()
    .filter((f) => KNOBE_NAME_RE.test(f.name) && isUnderFolder(f.path, scope));
}

/** All folders in the vault, optionally confined to a scope folder. */
export function allFolders(app: App, scope: string | null = null): TFolder[] {
  const out: TFolder[] = [];
  const walk = (f: TFolder): void => {
    if (isUnderFolder(f.path, scope)) out.push(f);
    for (const child of f.children) if (child instanceof TFolder) walk(child);
  };
  walk(app.vault.getRoot());
  return out;
}
