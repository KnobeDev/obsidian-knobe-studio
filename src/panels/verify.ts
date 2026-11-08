/**
 * panels/verify.ts — the Verify panel: load a sealed file from the vault,
 * paste it, or open a ZIP of exported files (LMS bulk download), and render
 * the full integrity / conformance report.
 */
import { verify } from "../engine/knobe-core";
import { buildIntake } from "../intake";
import { button, errorBox, helpText, hideError, renderReport, showError } from "../ui";
import { pickZipFile, skippedSummary } from "../zip-intake";
import { pickTextFiles } from "../loose-intake";
import { shown } from "../display";
import type { ZipTextEntry } from "../zip";
import type { StudioContext } from "../panel-context";

export class VerifyPanel {
  private result: HTMLElement;
  private zipErr: HTMLElement;
  private zipBox: HTMLElement;

  constructor(ctx: StudioContext, root: HTMLElement) {
    helpText(root, "Check whether a sealed record is intact. Verification recomputes the payload hash locally; nothing leaves your vault.");
    buildIntake(root, ctx, {
      label: "Load the file to verify",
      onText: async (text, name) => {
        const report = await verify(text);
        renderReport(this.result, report, name);
      },
    });

    const zipRow = root.createDiv({ cls: "ks-rowbtns" });
    button(zipRow, "Verify a file from disk…", () => this.loadDiskFiles());
    button(zipRow, "Verify from a ZIP…", () => this.loadZip());
    helpText(root, "Load from a file on disk or a .zip export (Notion, Overleaf, LMS). Any text format is read directly — Markdown, LaTeX, HTML, plain text; binary documents (.docx, .pdf) need converting to text first. Files are read in memory only; encrypted, oversized, or suspicious entries are skipped and reported.");
    this.zipErr = errorBox(root);
    this.zipBox = root.createDiv({ cls: "ks-hidden" });

    // renderReport moves focus into this container; focus arrival announces
    // it, so it must not also be a live region (double announcement).
    this.result = root.createDiv({
      cls: "ks-result ks-hidden",
      attr: { "aria-label": "Verification result" },
    });
  }

  private loadZip(): void {
    hideError(this.zipErr);
    pickZipFile(
      (result, zipName) => this.presentEntries(result, zipName),
      (message) => showError(this.zipErr, "Could not read the ZIP: " + message)
    );
  }

  private loadDiskFiles(): void {
    hideError(this.zipErr);
    pickTextFiles(
      (result) => this.presentEntries(result, "the selected files"),
      (message) => showError(this.zipErr, "Could not read the files: " + message)
    );
  }

  /** Show a picker of the text entries found in a batch; verifying the chosen one. */
  private presentEntries(result: import("../zip").ZipReadResult, sourceName: string): void {
    this.zipBox.empty();
    if (!result.entries.length) {
      showError(this.zipErr, "No verifiable text files were found in " + shown(sourceName) + ". " + skippedSummary(result));
      this.zipBox.addClass("ks-hidden");
      return;
    }
    if (result.entries.length === 1) {
      const only = result.entries[0];
      void this.verifyEntry(only, sourceName);
      this.zipBox.addClass("ks-hidden");
      const note = skippedSummary(result);
      if (note) showError(this.zipErr, note);
      return;
    }
    this.zipBox.removeClass("ks-hidden");
    // Entry paths and file names come from the archive or disk: escape them.
    this.zipBox.createDiv({ cls: "ks-intake-label", text: shown(sourceName) + " — pick a file to verify:" });
    const btns = this.zipBox.createDiv({ cls: "ks-rowbtns" });
    for (const entry of result.entries) {
      button(btns, shown(entry.path), () => this.verifyEntry(entry, sourceName));
    }
    const note = skippedSummary(result);
    if (note) this.zipBox.createDiv({ cls: "ks-help", text: note });
  }

  /** Verify one batch entry; a verifier error is shown, not dropped. */
  private async verifyEntry(entry: ZipTextEntry, sourceName: string): Promise<void> {
    try {
      const report = await verify(entry.text);
      renderReport(this.result, report, sourceName + " › " + entry.path);
    } catch (e) {
      showError(this.zipErr, "Could not verify " + shown(entry.path) + ": " + shown(e instanceof Error ? e.message : String(e)));
    }
  }

  /** Programmatic entry used by the "Verify current note" command. */
  async verifyText(text: string, name: string): Promise<void> {
    const report = await verify(text);
    renderReport(this.result, report, name);
  }
}
