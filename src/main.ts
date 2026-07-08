/**
 * main.ts — the KNOBE Studio plugin entry: registers the Studio dashboard
 * view, commands, ribbon icon, file-menu items, and the settings tab, and
 * exposes `knobeApi` for the separate KNOBE Teaching Studio plugin.
 */
import { Menu, Notice, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { KNOBE_STUDIO_VIEW, KnobeStudioView } from "./view";
import { ensureCompanionInstalled } from "./companion-install";
import { DEFAULT_SETTINGS, StudioSettingTab, type StudioSettings } from "./settings";
import { KNOBE_NAME_RE, isUnderFolder } from "./vault";
import type { TabId } from "./panel-context";
import type { KnobeStudioApi } from "./api";

export default class KnobeStudioPlugin extends Plugin {
  settings: StudioSettings = { ...DEFAULT_SETTINGS };
  /** Public surface consumed by the KNOBE Teaching Studio plugin. */
  knobeApi!: KnobeStudioApi;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.knobeApi = this.buildApi();

    // After startup settles, unpack the bundled Teaching Studio plugin so
    // it appears in Settings → Community plugins without a second download.
    this.app.workspace.onLayoutReady(() => void ensureCompanionInstalled(this));

    this.registerView(KNOBE_STUDIO_VIEW, (leaf: WorkspaceLeaf) => new KnobeStudioView(leaf, this));
    this.addRibbonIcon("stamp", "Open KNOBE Studio", () => void this.activateView());
    this.addSettingTab(new StudioSettingTab(this.app, this));

    this.addCommand({
      id: "open-studio",
      name: "Open Studio dashboard",
      callback: () => void this.activateView(),
    });

    this.addCommand({
      id: "toggle-demo-mode",
      name: "Toggle demo / presentation mode",
      callback: () => {
        void this.setDemoMode(!this.settings.demoMode).then(() =>
          new Notice("Demo mode " + (this.settings.demoMode ? "on — file access confined to " + this.effectiveOutputFolder() : "off"))
        );
      },
    });

    this.addCommand({
      id: "verify-current-note",
      name: "Verify current note in Studio",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file) return false;
        if (!checking) void this.verifyFile(file);
        return true;
      },
    });

    this.addCommand({
      id: "seal-current-note",
      name: "Seal current note (open in Create)",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file) return false;
        if (!checking) void this.openTabForActiveFile("create");
        return true;
      },
    });

    this.addCommand({
      id: "cohort-check",
      name: "Cohort check a folder",
      callback: () => void this.openTab("cohort"),
    });

    this.registerEvent(
      this.app.workspace.on("file-menu", (menu: Menu, file) => {
        if (!(file instanceof TFile) || !KNOBE_NAME_RE.test(file.name)) return;
        menu.addItem((item) =>
          item
            .setTitle("Verify in KNOBE Studio")
            .setIcon("stamp")
            .onClick(() => void this.verifyFile(file))
        );
      })
    );
  }

  onunload(): void {
    // Obsidian detaches registered views automatically.
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  // ---- demo / presentation mode ------------------------------------------
  // In demo mode the plugin is safe to screen-share: all vault file access is
  // confined to the demo folder, so real education records (FERPA) or health
  // information (HIPAA) elsewhere in the vault can never be surfaced.

  isDemoMode(): boolean {
    return this.settings.demoMode;
  }

  /** Folder that scopes all file access when demo mode is on, else null. */
  demoScope(): string | null {
    return this.settings.demoMode ? (this.settings.demoFolder || "KNOBE/Demo") : null;
  }

  /** Where sealed files are saved: the sandbox in demo mode, else the output folder. */
  effectiveOutputFolder(): string {
    return this.settings.demoMode
      ? (this.settings.demoFolder || "KNOBE/Demo")
      : this.settings.outputFolder;
  }

  async setDemoMode(on: boolean): Promise<void> {
    this.settings.demoMode = on;
    await this.saveSettings();
    this.refreshDemoState();
  }

  /** Re-render the demo banner in every open Studio view. */
  refreshDemoState(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(KNOBE_STUDIO_VIEW)) {
      const view = leaf.view;
      if (view instanceof KnobeStudioView) view.refreshDemoBanner();
    }
  }

  /** Re-theme every open Studio view after the appearance setting changes. */
  refreshStudioAppearance(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(KNOBE_STUDIO_VIEW)) {
      const view = leaf.view;
      if (view instanceof KnobeStudioView) view.applyAppearance();
    }
  }

  async activateView(): Promise<KnobeStudioView> {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(KNOBE_STUDIO_VIEW)[0] ?? null;
    if (!leaf) {
      leaf = workspace.getLeaf("tab");
      await leaf.setViewState({ type: KNOBE_STUDIO_VIEW, active: true });
    }
    await workspace.revealLeaf(leaf);
    return leaf.view as KnobeStudioView;
  }

  /** Open the Studio dashboard focused on a given tab (used via knobeApi). */
  async openStudioAt(tab: TabId): Promise<void> {
    const view = await this.activateView();
    view.selectTab(tab);
  }

  /** The cross-plugin API surface consumed by the Teaching Studio plugin. */
  private buildApi(): KnobeStudioApi {
    return {
      openStudioAt: (tab: TabId) => this.openStudioAt(tab),
      isDemoMode: () => this.isDemoMode(),
      setDemoMode: (on: boolean) => this.setDemoMode(on),
      demoScope: () => this.demoScope(),
      effectiveOutputFolder: () => this.effectiveOutputFolder(),
      demoFolder: () => this.settings.demoFolder || "KNOBE/Demo",
      defaultAuthor: () => this.settings.defaultAuthor,
      openAfterSeal: () => this.settings.openAfterSeal,
      appearance: () => this.settings.appearance,
    };
  }

  private async openTab(tab: "create" | "verify" | "transform" | "journey" | "cohort" | "adapt"): Promise<void> {
    const view = await this.activateView();
    view.selectTab(tab);
  }

  private async openTabForActiveFile(tab: "create"): Promise<void> {
    // The Create panel's "Start from active note" reads the workspace's
    // active file, which stays active when the Studio opens in a new tab.
    await this.openTab(tab);
    new Notice('Use "Start from active note" to pull the note into the form.');
  }

  private async verifyFile(file: TFile): Promise<void> {
    // Demo mode: never render a file from outside the sandbox — the file-menu
    // item and the "verify current note" command must not become a leak vector
    // while the teacher is screen-sharing (FERPA/HIPAA).
    if (!isUnderFolder(file.path, this.demoScope())) {
      new Notice("Demo mode is on: only files inside " + this.effectiveOutputFolder() + " can be verified while presenting.");
      return;
    }
    const text = await this.app.vault.read(file);
    const view = await this.activateView();
    await view.verifyTextInPanel(text, file.name);
  }
}
