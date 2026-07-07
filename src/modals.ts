/**
 * modals.ts — vault pickers used by the Studio panels: choose a KNOBE file
 * or a folder without leaving the keyboard.
 */
import { App, FuzzySuggestModal, TFile, TFolder } from "obsidian";
import { allFolders, candidateKnobeFiles } from "./vault";

export class KnobeFileSuggestModal extends FuzzySuggestModal<TFile> {
  private onPick: (file: TFile) => void;
  private scopeFolder: string | null;

  constructor(app: App, onPick: (file: TFile) => void, scope: string | null = null) {
    super(app);
    this.onPick = onPick;
    this.scopeFolder = scope;
    this.setPlaceholder(
      scope
        ? "Demo mode — pick a file from " + scope
        : "Pick a file from the vault (.knobe.md, .md, .txt)"
    );
  }

  getItems(): TFile[] {
    return candidateKnobeFiles(this.app, this.scopeFolder);
  }

  getItemText(file: TFile): string {
    return file.path;
  }

  onChooseItem(file: TFile): void {
    this.onPick(file);
  }
}

export class FolderSuggestModal extends FuzzySuggestModal<TFolder> {
  private onPick: (folder: TFolder) => void;
  private scopeFolder: string | null;

  constructor(app: App, onPick: (folder: TFolder) => void, scope: string | null = null) {
    super(app);
    this.onPick = onPick;
    this.scopeFolder = scope;
    this.setPlaceholder(scope ? "Demo mode — pick a folder in " + scope : "Pick a folder");
  }

  getItems(): TFolder[] {
    return allFolders(this.app, this.scopeFolder);
  }

  getItemText(folder: TFolder): string {
    return folder.path === "/" ? "(vault root)" : folder.path;
  }

  onChooseItem(folder: TFolder): void {
    this.onPick(folder);
  }
}
