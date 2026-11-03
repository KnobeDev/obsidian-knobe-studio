/**
 * view.ts — the KNOBE Studio dashboard: an ItemView holding the six-tab
 * workbench (Create · Verify · Transform · Journey · Cohort check · Adapt),
 * with an accessible tablist (roving tabindex, arrow-key navigation) and
 * the StudioContext implementation panels use to reach the vault.
 */
import { ItemView, MarkdownView, TFile, TFolder, WorkspaceLeaf } from "obsidian";
import type KnobeStudioPlugin from "./main";
import type { IntakeResult, JourneyPrime, StudioContext, TabId } from "./panel-context";
import { courseFolder } from "./studio-core";
import { isUnderFolder, saveSealedFile } from "./vault";
import { FolderSuggestModal, KnobeFileSuggestModal } from "./modals";
import { CreatePanel } from "./panels/create";
import { VerifyPanel } from "./panels/verify";
import { TransformPanel } from "./panels/transform";
import { JourneyPanel } from "./panels/journey";
import { CohortPanel } from "./panels/cohort";
import { AdaptPanel } from "./panels/adapt";
import { announce } from "./ui";

export const KNOBE_STUDIO_VIEW = "knobe-studio-view";

const TAB_DEFS: Array<{ id: TabId; label: string }> = [
  { id: "create", label: "Create" },
  { id: "verify", label: "Verify" },
  { id: "transform", label: "Transform" },
  { id: "journey", label: "Journey" },
  { id: "cohort", label: "Cohort check" },
  { id: "adapt", label: "Adapt" },
];

export class KnobeStudioView extends ItemView {
  plugin: KnobeStudioPlugin;
  private tabs = new Map<TabId, HTMLElement>();
  private panels = new Map<TabId, HTMLElement>();
  private currentTab: TabId | null = null;
  private createPanel!: CreatePanel;
  private verifyPanel!: VerifyPanel;

  constructor(leaf: WorkspaceLeaf, plugin: KnobeStudioPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return KNOBE_STUDIO_VIEW;
  }

  getDisplayText(): string {
    return "KNOBE Studio";
  }

  getIcon(): string {
    return "stamp";
  }

  private demoBanner: HTMLElement | null = null;

  /** Apply the appearance setting: follow Obsidian, or pin light/dark. */
  applyAppearance(): void {
    const mode = this.plugin.settings.appearance;
    this.contentEl.toggleClass("ks-theme-light", mode === "light");
    this.contentEl.toggleClass("ks-theme-dark", mode === "dark");
  }

  /** Show/hide the persistent "demo mode" banner at the top of the view. */
  refreshDemoBanner(): void {
    if (!this.demoBanner) return;
    const on = this.plugin.isDemoMode();
    this.demoBanner.toggleClass("ks-hidden", !on);
    this.demoBanner.setText(
      on
        ? "Demo / presentation mode — safe to screen-share. File access is confined to " +
            this.plugin.effectiveOutputFolder() + "; real records elsewhere in the vault are not shown."
        : ""
    );
  }

  async onOpen(): Promise<void> {
    const container = this.contentEl;
    container.empty();
    container.addClass("knobe-studio");
    this.applyAppearance();

    const header = container.createDiv({ cls: "ks-header" });
    header.createEl("h2", { text: "KNOBE Studio" });
    header.createEl("p", {
      cls: "ks-help",
      text: "Create, verify, and transform knowledge objects that keep their context when they move. Everything runs locally in your vault: no upload, no server, no account.",
    });

    this.demoBanner = container.createDiv({ cls: "ks-demo-banner ks-hidden", attr: { role: "status" } });
    this.refreshDemoBanner();

    const tablist = container.createDiv({
      cls: "ks-tablist",
      attr: { role: "tablist", "aria-label": "Studio tools" },
    });
    const panelsWrap = container.createDiv({ cls: "ks-panels" });

    const ctx = this.buildContext();
    for (const def of TAB_DEFS) {
      const tab = tablist.createEl("button", {
        cls: "ks-tab",
        text: def.label,
        attr: {
          type: "button",
          role: "tab",
          id: "ks-tab-" + def.id,
          "aria-selected": "false",
          "aria-controls": "ks-panel-" + def.id,
          tabindex: "-1",
        },
      });
      tab.addEventListener("click", () => this.selectTab(def.id));
      tab.addEventListener("keydown", (e) => this.onTabKey(e, def.id));
      this.tabs.set(def.id, tab);

      const panel = panelsWrap.createEl("section", {
        cls: "ks-panel",
        attr: {
          role: "tabpanel",
          id: "ks-panel-" + def.id,
          "aria-labelledby": "ks-tab-" + def.id,
          tabindex: "0",
        },
      });
      panel.hidden = true;
      this.panels.set(def.id, panel);
    }

    this.createPanel = new CreatePanel(ctx, this.panels.get("create")!);
    this.verifyPanel = new VerifyPanel(ctx, this.panels.get("verify")!);
    new TransformPanel(ctx, this.panels.get("transform")!);
    new JourneyPanel(ctx, this.panels.get("journey")!);
    new CohortPanel(ctx, this.panels.get("cohort")!);
    new AdaptPanel(ctx, this.panels.get("adapt")!);

    this.selectTab("create", { silent: true });
  }

  private onTabKey(e: KeyboardEvent, id: TabId): void {
    const order = TAB_DEFS.map((d) => d.id);
    const i = order.indexOf(id);
    let next: TabId | null = null;
    if (e.key === "ArrowRight") next = order[(i + 1) % order.length];
    else if (e.key === "ArrowLeft") next = order[(i + order.length - 1) % order.length];
    else if (e.key === "Home") next = order[0];
    else if (e.key === "End") next = order[order.length - 1];
    if (next) {
      e.preventDefault();
      this.selectTab(next);
    }
  }

  selectTab(id: TabId, opts?: { silent?: boolean; announce?: boolean }): void {
    for (const def of TAB_DEFS) {
      const on = def.id === id;
      const tab = this.tabs.get(def.id)!;
      tab.setAttribute("aria-selected", on ? "true" : "false");
      tab.tabIndex = on ? 0 : -1;
      tab.toggleClass("is-active", on);
      this.panels.get(def.id)!.hidden = !on;
    }
    const changed = this.currentTab !== null && this.currentTab !== id;
    this.currentTab = id;
    if (opts?.silent) return;
    this.tabs.get(id)!.focus();
    // The tabs pattern leaves focus on the tab, so say that the panel
    // content changed too.
    if (changed && opts?.announce !== false) announce(TAB_DEFS.find((d) => d.id === id)!.label + " workspace shown.");
  }

  /** Programmatic entries used by plugin commands. */
  async verifyTextInPanel(text: string, name: string): Promise<void> {
    this.selectTab("verify", { silent: true });
    await this.verifyPanel.verifyText(text, name);
  }

  private buildContext(): StudioContext {
    const app = this.app;
    const plugin = this.plugin;
    const view = this;
    return {
      app,
      settings: plugin.settings,
      async saveSealed(fileName: string, text: string, dest?: { term?: string; course?: string }): Promise<TFile> {
        const folder = courseFolder(plugin.effectiveOutputFolder(), dest?.term ?? "", dest?.course ?? "");
        return saveSealedFile(app, folder, fileName, text, plugin.demoScope());
      },
      saveFolder(): string {
        return plugin.effectiveOutputFolder();
      },
      demoScope(): string | null {
        return plugin.demoScope();
      },
      openFile(file: TFile): void {
        void app.workspace.getLeaf("tab").openFile(file);
      },
      async activeNote(): Promise<IntakeResult | null> {
        const mdView = app.workspace.getActiveViewOfType(MarkdownView);
        const file = mdView?.file ?? app.workspace.getActiveFile();
        if (!file) return null;
        // Demo mode: refuse to read a note outside the sandbox, so a real
        // record the teacher happens to have open is never pulled onto a
        // projected screen (FERPA/HIPAA).
        if (!isUnderFolder(file.path, plugin.demoScope())) {
          throw new Error(
            "Demo mode is on: only notes inside " + plugin.effectiveOutputFolder() +
            " can be loaded. This protects real records from being shown while presenting."
          );
        }
        const text = await app.vault.read(file);
        return { text, name: file.name, file };
      },
      pickFile(onPick: (r: IntakeResult) => void): void {
        new KnobeFileSuggestModal(app, (file) => {
          void app.vault.read(file).then((text) => onPick({ text, name: file.name, file }));
        }, plugin.demoScope()).open();
      },
      pickFolder(onPick: (folder: TFolder) => void): void {
        new FolderSuggestModal(app, onPick, plugin.demoScope()).open();
      },
      selectTab(id: TabId): void {
        view.selectTab(id);
      },
      openCreateWithJourney(args: JourneyPrime): void {
        view.createPanel.primeWithJourney(args);
        // The primed banner (a status region) already says where the user
        // landed; a second tab announcement would talk over it.
        view.selectTab("create", { announce: false });
      },
    };
  }

  async onClose(): Promise<void> {
    this.contentEl.empty();
  }
}
