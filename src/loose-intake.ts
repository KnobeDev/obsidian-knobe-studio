/**
 * loose-intake.ts — OS file/folder pickers for loose (non-zipped) text files.
 * Complements the vault-folder picker (vault only) and the ZIP reader
 * (archives): this reaches files on disk outside the vault, which is where
 * LMS/Notion/Overleaf exports usually land before anyone files them away.
 *
 * Returns the same { entries, skipped } shape as the ZIP reader so callers
 * treat all three intake paths uniformly. Text files are read in memory only
 * and bounded by the same per-file / whole-batch caps; binary documents are
 * skipped with a conversion hint instead of being silently dropped.
 */
import { conversionHintFor, isTextName } from "./text-formats";
import type { ZipReadResult } from "./zip";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 100 * 1024 * 1024;
const MAX_FILES = 2000;

async function readFileList(files: File[]): Promise<ZipReadResult> {
  const entries: ZipReadResult["entries"] = [];
  const skipped: ZipReadResult["skipped"] = [];
  let total = 0;
  const list = files.slice(0, MAX_FILES);
  if (files.length > MAX_FILES) {
    skipped.push({ path: "(selection)", reason: "more than " + MAX_FILES + " files; extra ignored" });
  }
  for (const f of list) {
    // webkitRelativePath is set for directory picks; fall back to the name.
    const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
    const path = rel.replace(/\\/g, "/");
    const name = f.name;
    if (!isTextName(name)) {
      const hint = conversionHintFor(name);
      if (hint) skipped.push({ path, reason: hint });
      continue;
    }
    if (f.size > MAX_FILE_BYTES) {
      skipped.push({ path, reason: "larger than the per-file limit" });
      continue;
    }
    if (total + f.size > MAX_TOTAL_BYTES) {
      skipped.push({ path, reason: "would exceed the whole-batch limit" });
      continue;
    }
    total += f.size;
    entries.push({ path, name, text: await f.text() });
  }
  return { entries, skipped };
}

function pick(attrs: Record<string, string>, onResult: (r: ZipReadResult) => void, onError: (m: string) => void): void {
  const input = createEl("input");
  input.type = "file";
  for (const [k, v] of Object.entries(attrs)) input.setAttribute(k, v);
  input.addEventListener("change", () => {
    const files = input.files ? Array.from(input.files) : [];
    if (!files.length) return;
    void readFileList(files).then(onResult).catch((e: unknown) => onError(e instanceof Error ? e.message : String(e)));
  });
  input.click();
}

/** Pick one or more loose text files from disk. */
export function pickTextFiles(onResult: (r: ZipReadResult) => void, onError: (m: string) => void): void {
  pick({ multiple: "true" }, onResult, onError);
}

/** Pick a whole folder from disk (recurses; text files only). */
export function pickDirectory(onResult: (r: ZipReadResult) => void, onError: (m: string) => void): void {
  pick({ webkitdirectory: "true", directory: "true", multiple: "true" }, onResult, onError);
}
