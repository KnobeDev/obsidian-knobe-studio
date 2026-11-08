/**
 * zip-intake.ts — OS file-picker intake for .zip archives (LMS bulk
 * downloads live outside the vault, so this is a real file input, like the
 * web Studio's). Like pasted text, a zip the user explicitly picks is
 * deliberate intake, so it is not demo-scope-gated — but its contents pass
 * through the hardened readZipTextEntries parser before anything renders.
 */
import { readZipTextEntries, type ZipReadResult } from "./zip";
import { shown } from "./display";

export function pickZipFile(onResult: (result: ZipReadResult, zipName: string) => void, onError: (message: string) => void): void {
  const input = createEl("input");
  input.type = "file";
  input.accept = ".zip,application/zip,application/x-zip-compressed";
  input.addEventListener("change", () => {
    const f = input.files?.[0];
    if (!f) return;
    void f
      .arrayBuffer()
      .then((buf) => readZipTextEntries(new Uint8Array(buf)))
      .then((result) => onResult(result, f.name))
      .catch((e: unknown) => onError(e instanceof Error ? e.message : String(e)));
  });
  input.click();
}

/** One-line summary of what a zip read skipped, or "" when nothing was. */
export function skippedSummary(result: ZipReadResult): string {
  if (!result.skipped.length) return "";
  // Entry paths come from the archive: escaped like any other file-derived text.
  const listed = result.skipped.slice(0, 3).map((s) => shown(s.path) + " (" + s.reason + ")").join("; ");
  const more = result.skipped.length > 3 ? "; and " + (result.skipped.length - 3) + " more" : "";
  return "Skipped " + result.skipped.length + ": " + listed + more + ".";
}
