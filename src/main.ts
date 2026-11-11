/**
 * main.ts — the KNOBE Studio plugin entry: registers the Studio dashboard
 * and the Teaching Studio dashboard views, commands, ribbon icons, file-menu
 * items, and the settings tab.
 */
import { Menu, Notice, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { KNOBE_STUDIO_VIEW, KnobeStudioView } from "./view";
import { KNOBE_TEACHING_VIEW, KnobeTeachingView } from "./classroom";
import { DEFAULT_SETTINGS, StudioSettingTab, type StudioSettings } from "./settings";
import { retiredCompanionNotice, shouldNoticeRetiredCompanion } from "./teaching-fold";
import { announce, prepareAnnouncer } from "./ui";
import { KNOBE_NAME_RE, isUnderFolder } from "./vault";
import type { TabId } from "./panel-context";
import type { KnobeStudioApi } from "./api";

/** How long the one-time upgrade notice stays up. */
const NOTICE_MS = 20_000;

export default class KnobeStudioPlugin extends Plugin {
  settings: StudioSettings = { ...DEFAULT_SETTINGS };
  /** What the Teaching Studio view calls into (see api.ts). */
  knobeApi!: KnobeStudioApi;
  private teachingRibbon: HTMLElement | null = null;
  /** Set at load: this vault is upgrading and hasn't had the one-time notice. */
  private noticePending = false;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.knobeApi = this.buildApi();

    this.registerView(KNOBE_STUDIO_VIEW, (leaf: WorkspaceLeaf) => new KnobeStudioView(leaf, this));
    this.registerView(KNOBE_TEACHING_VIEW, (leaf: WorkspaceLeaf) => new KnobeTeachingView(leaf, this.knobeApi));
    this.addRibbonIcon("stamp", "Open KNOBE Studio", () => void this.activateView());
    if (this.settings.teachingStudio) this.addTeachingRibbon();
    this.addSettingTab(new StudioSettingTab(this.app, this));

    // Upgrading vaults hear, once, that the Teaching Studio is built in now
    // and any separate copy can go. The live region exists
    // before the message, so screen readers pick it up.
    prepareAnnouncer();
    this.app.workspace.onLayoutReady(() => void this.noticeRetiredCompanion());

    this.addCommand({
      id: "open-studio",
      name: "Open Studio dashboard",
      callback: () => void this.activateView(),
    });

    this.addCommand({
      id: "open-teaching-studio",
      name: "Open Teaching Studio dashboard",
      checkCallback: (checking) => {
        if (!this.settings.teachingStudio) return false;
        if (!checking) void this.activateTeachingView();
        return true;
      },
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
    const saved = (await this.loadData()) as Record<string, unknown> | null;
    this.noticePending = shouldNoticeRetiredCompanion(saved);
    this.settings = { ...DEFAULT_SETTINGS, ...(saved as Partial<StudioSettings> | null) };
    // A fresh install never had the separate plugin, so it never needs the notice.
    if (saved === null) this.settings.retiredCompanionNoticed = true;
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

  /** Re-render the demo banner in every open Studio and Teaching Studio view. */
  refreshDemoState(): void {
    for (const view of this.openViews()) view.refreshDemoBanner();
  }

  /** Re-theme every open Studio and Teaching Studio view after the appearance setting changes. */
  refreshStudioAppearance(): void {
    for (const view of this.openViews()) view.applyAppearance();
  }

  private openViews(): Array<KnobeStudioView | KnobeTeachingView> {
    const { workspace } = this.app;
    return [...workspace.getLeavesOfType(KNOBE_STUDIO_VIEW), ...workspace.getLeavesOfType(KNOBE_TEACHING_VIEW)]
      .map((leaf) => leaf.view)
      .filter((view): view is KnobeStudioView | KnobeTeachingView =>
        view instanceof KnobeStudioView || view instanceof KnobeTeachingView);
  }

  // ---- Teaching Studio ----------------------------------------------------

  async activateTeachingView(): Promise<void> {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(KNOBE_TEACHING_VIEW)[0] ?? null;
    if (!leaf) {
      leaf = workspace.getLeaf("tab");
      await leaf.setViewState({ type: KNOBE_TEACHING_VIEW, active: true });
    }
    await workspace.revealLeaf(leaf);
  }

  /** Show or hide the Teaching Studio: its ribbon icon, its command, and any open tab. */
  async setTeachingStudio(on: boolean): Promise<void> {
    this.settings.teachingStudio = on;
    await this.saveSettings();
    for (const leaf of this.app.workspace.getLeavesOfType(KNOBE_STUDIO_VIEW)) {
      if (leaf.view instanceof KnobeStudioView) leaf.view.refreshTeachingButton();
    }
    if (on) {
      if (!this.teachingRibbon) this.addTeachingRibbon();
      return;
    }
    this.teachingRibbon?.remove();
    this.teachingRibbon = null;
    for (const leaf of this.app.workspace.getLeavesOfType(KNOBE_TEACHING_VIEW)) leaf.detach();
  }

  private addTeachingRibbon(): void {
    // Same name as the command, so voice control and screen readers find one name for one thing.
    this.teachingRibbon = this.addRibbonIcon("graduation-cap", "Open Teaching Studio dashboard", () => void this.activateTeachingView());
  }

  private async noticeRetiredCompanion(): Promise<void> {
    if (!this.noticePending) return;
    this.noticePending = false;
    const message = retiredCompanionNotice(this.settings.teachingStudio);
    // A Notice can't take keyboard focus, so it times out rather than staying
    // until clicked; the live region reads it to screen readers, and the same
    // guidance stays in the Teaching Studio setting's description.
    new Notice(message, NOTICE_MS);
    announce(message);
    this.settings.retiredCompanionNoticed = true;
    await this.saveSettings();
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

  /** Open the Studio dashboard focused on a given tab (used by the Teaching Studio). */
  async openStudioAt(tab: TabId): Promise<void> {
    const view = await this.activateView();
    view.selectTab(tab);
  }

  /** The API surface the Teaching Studio view calls into. */
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
