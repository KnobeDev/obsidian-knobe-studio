/**
 * classroom.ts — the KNOBE Instructor Studio dashboard (an ItemView). It
 * gathers the semester workflow (who does what, when) into one place and
 * routes one click into the actual tools, which live in the separate KNOBE
 * Studio plugin. It holds no tools of its own — a single Studio instance stays
 * the source of truth — reaching Studio only through the KnobeStudioApi
 * contract. It does bundle the engine so its teaching kit can seal an example
 * journey and demo submissions directly.
 *
 * The internal view-type id ("knobe-classroom-view") and class name are kept
 * stable across the "Classroom" → "Instructor Studio" rename so open tabs and
 * saved workspace state are not orphaned.
 */
import { ItemView, Notice, WorkspaceLeaf } from "obsidian";
import type { KnobeStudioApi } from "./api";
import type { TabId } from "./panel-context";
import { createKnobe } from "./engine/knobe-core";
import { courseFolder, localToday, slugify } from "./studio-core";
import { buildDemoSubmission, buildExampleJourney, exampleJourneyMeta } from "./classroom-kit";
import { saveSealedFile } from "./vault";
import { announce, button, checkField, errorBox, helpText, hideError, sectionHeading, showError } from "./ui";

export const KNOBE_CLASSROOM_VIEW = "knobe-classroom-view";

interface RolePath {
  role: string;
  who: string;
  steps: string[];
  cta: { label: string; tab: TabId };
}

const PATHS: RolePath[] = [
  {
    role: "Instructor",
    who: "You design the assignment and set the rules.",
    steps: [
      "Open the Journey maker and lay out the steps: reading, draft, revision, and who seals each.",
      "Set the AI policy per step (not allowed · allowed with disclosure · required with disclosure).",
      "Seal any instructor-authored steps (the prompt, the reading); their hashes flow into the journey.",
      "Seal the journey and hand the file out — post it to your LMS or drop it in a shared vault folder.",
    ],
    cta: { label: "Open the Journey maker →", tab: "journey" },
  },
  {
    role: "Student",
    who: "You complete one step of the sequence.",
    steps: [
      "Load the journey file your instructor handed out on the Journey tab.",
      "Pick your step; the Create form opens pre-filled with the right context, fidelity limits, and AI-disclosure prompt.",
      "Write your response, disclose any AI use honestly, and seal.",
      "Save the sealed .knobe.md and submit it.",
    ],
    cta: { label: "Start a step from a journey →", tab: "journey" },
  },
  {
    role: "TA / grader",
    who: "You check a whole cohort at once.",
    steps: [
      "Collect submissions into a vault folder (unzip an LMS bulk download into it).",
      "Load the journey as the expectation, then run Cohort check on the folder.",
      "Anomalies sort to the top: broken seals and files that don't chain to the assignment.",
      "Export CSV for the gradebook.",
    ],
    cta: { label: "Open Cohort check →", tab: "cohort" },
  },
  {
    role: "Accessibility",
    who: "Anyone producing an accessible version.",
    steps: [
      "Load the source work on the Adapt tab (it must verify first).",
      "Choose the adaptation: plain language, translation, transcript, alt-text, or multimodal.",
      "Declare what it preserves and what it omits; credit the adapter and any reviewer.",
      "Seal — the adaptation is bound to its source by hash, with a recorded accessibility lineage.",
    ],
    cta: { label: "Open Adapt →", tab: "adapt" },
  },
];

export class KnobeClassroomView extends ItemView {
  private resolveApi: () => KnobeStudioApi | null;
  private err: HTMLElement | null = null;
  private demoBanner: HTMLElement | null = null;
  private demoToggle: HTMLInputElement | null = null;

  constructor(leaf: WorkspaceLeaf, resolveApi: () => KnobeStudioApi | null) {
    super(leaf);
    this.resolveApi = resolveApi;
  }

  getViewType(): string {
    return KNOBE_CLASSROOM_VIEW;
  }

  getDisplayText(): string {
    return "KNOBE Instructor Studio";
  }

  getIcon(): string {
    return "graduation-cap";
  }

  /** Match the Studio's appearance setting (follow Obsidian, or pin light/dark). */
  applyAppearance(): void {
    const mode = this.resolveApi()?.appearance() ?? "follow";
    this.contentEl.toggleClass("ks-theme-light", mode === "light");
    this.contentEl.toggleClass("ks-theme-dark", mode === "dark");
  }

  /** Reflect demo-mode state in the banner and toggle after any change. */
  refreshDemoBanner(): void {
    if (!this.demoBanner) return;
    const api = this.resolveApi();
    const on = api?.isDemoMode() ?? false;
    this.demoBanner.toggleClass("ks-hidden", !on);
    this.demoBanner.setText(
      on && api
        ? "Demo / presentation mode is ON — safe to screen-share. File pickers, saves, and active-note reads are confined to " +
            api.effectiveOutputFolder() + "; real records elsewhere in the vault are never shown."
        : ""
    );
    if (this.demoToggle) this.demoToggle.checked = on;
  }

  async onOpen(): Promise<void> {
    const c = this.contentEl;
    c.empty();
    // Reuse the Studio's themed token surface, plus a classroom modifier.
    c.addClass("knobe-studio");
    c.addClass("knobe-classroom");
    this.applyAppearance();

    const header = c.createDiv({ cls: "ks-header" });
    header.createEl("h2", { text: "KNOBE Instructor Studio" });
    header.createEl("p", {
      cls: "ks-help",
      text: "The semester workflow in one place: who seals what, and when. Each path opens the matching tool in the Studio dashboard — the Instructor Studio guides; the Studio does the sealing.",
    });

    // Re-theme / re-sync when this view becomes active again (e.g. after the
    // teacher toggled demo mode from Studio's settings tab in another plugin).
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => {
      if (this.app.workspace.getActiveViewOfType(KnobeClassroomView) === this) {
        this.applyAppearance();
        this.refreshDemoBanner();
      }
    }));

    if (!this.resolveApi()) {
      this.renderMissingStudio(c);
      return;
    }

    this.demoBanner = c.createDiv({ cls: "ks-demo-banner ks-hidden", attr: { role: "status" } });
    this.err = errorBox(c);
    this.renderDemoControls(c);

    const grid = c.createDiv({ cls: "ks-role-grid" });
    for (const path of PATHS) this.renderRole(grid, path);

    this.refreshDemoBanner();

    sectionHeading(c, "Teaching kit");
    helpText(c, "Get started without building a journey from scratch. This seals a four-step example sequence (prompt → reading → draft → revision) into your output folder; open it on the Journey tab to adapt it, or hand it to students to try the student flow.");
    const kitRow = c.createDiv({ cls: "ks-rowbtns" });
    button(kitRow, "Seal an example journey into my vault", () => this.sealExampleJourney(), { cta: true });
    button(kitRow, "Open the Studio dashboard", () => void this.resolveApi()?.openStudioAt("journey"));

    this.renderCompliance(c);
  }

  private renderMissingStudio(c: HTMLElement): void {
    const box = c.createDiv({ cls: "ks-banner" });
    box.createEl("p", {
      text: "KNOBE Instructor Studio needs the KNOBE Studio plugin, which provides the tools this dashboard opens.",
    });
    box.createEl("p", {
      text: "Enable KNOBE Studio in Settings → Community plugins, then reopen this dashboard.",
    });
  }

  private renderDemoControls(c: HTMLElement): void {
    const demoCard = c.createDiv({ cls: "ks-demo-card" });
    demoCard.createEl("h3", { cls: "ks-subhead", text: "Presenting to students" });
    helpText(demoCard, "Turn on demo mode before you screen-share. It confines every file picker, save, and \"use active note\" to the demo folder, so real student records (FERPA) and any health information (HIPAA) elsewhere in your vault can never appear on the projector. It does not delete or move anything — it just narrows what the dashboards can see while it's on.");
    const demoRow = demoCard.createDiv({ cls: "ks-rowbtns" });
    this.demoToggle = checkField(demoRow, "Demo / presentation mode (safe to screen-share)", this.resolveApi()?.isDemoMode() ?? false, (v) => {
      const api = this.resolveApi();
      if (api) void api.setDemoMode(v).then(() => this.refreshDemoBanner());
    });
    button(demoRow, "Set up demo sandbox", () => this.setUpDemoSandbox(), { cta: true });
    helpText(demoCard, "\"Set up demo sandbox\" seals a demo journey and two clearly-labeled sample submissions (Sample Student A, Sample Student B — no real names, no real work) into the demo folder, so you have a complete lifecycle to walk through: build → seal → cohort-check.");
  }

  private renderCompliance(c: HTMLElement): void {
    sectionHeading(c, "Privacy & compliance");
    const compliance = c.createDiv({ cls: "ks-compliance" });
    const ul = compliance.createEl("ul");
    ul.createEl("li", { text: "Local only. Sealing and verification run in your vault — no upload, no server, no account. Nothing is transmitted." });
    ul.createEl("li", { text: "FERPA. Student submissions are sealed with an internal privacy level and a FERPA consent note; keep real submissions in a folder you don't screen-share, and use demo mode when presenting." });
    ul.createEl("li", { text: "HIPAA / PHI. If your vault holds any health information, demo mode's folder confinement keeps it out of the pickers while you present — but the plugin does not classify or encrypt data, so store PHI according to your institution's policy." });
    ul.createEl("li", { text: "Not a compliance certification. KNOBE records interpretive context and integrity; it does not enforce access control or attest that a workflow is FERPA/HIPAA compliant. Follow your institution's data-handling rules." });
  }

  private renderRole(grid: HTMLElement, path: RolePath): void {
    const card = grid.createDiv({ cls: "ks-role-card" });
    card.createEl("h3", { cls: "ks-role-title", text: path.role });
    card.createEl("p", { cls: "ks-role-who", text: path.who });
    const ol = card.createEl("ol", { cls: "ks-role-steps" });
    for (const step of path.steps) ol.createEl("li", { text: step });
    const row = card.createDiv({ cls: "ks-rowbtns" });
    button(row, path.cta.label, () => void this.resolveApi()?.openStudioAt(path.cta.tab));
  }

  private async sealExampleJourney(): Promise<void> {
    const api = this.resolveApi();
    if (!api || !this.err) return;
    hideError(this.err);
    try {
      const { fields, body } = buildExampleJourney(api.defaultAuthor(), localToday());
      const r = await createKnobe({ fields, body });
      // Course hierarchy: Term > Course under the output folder.
      const meta = exampleJourneyMeta(api.defaultAuthor());
      const folder = courseFolder(api.effectiveOutputFolder(), meta.term, meta.course);
      const file = await saveSealedFile(this.app, folder, slugify(r.payload.title), r.text, api.demoScope());
      announce("Example journey sealed and saved to " + file.path + ".");
      if (api.openAfterSeal()) this.app.workspace.getLeaf("tab").openFile(file);
    } catch (e) {
      showError(this.err, "Could not seal the example journey: " + (e instanceof Error ? e.message : String(e)));
    }
  }

  /**
   * Seal a full demo lifecycle into the demo folder: the journey plus two
   * synthetic submissions (one chained to the journey, one deliberately not,
   * so Cohort check shows a "no link" anomaly). Turns demo mode on so the
   * teacher is immediately in the safe-to-present state.
   */
  private async setUpDemoSandbox(): Promise<void> {
    const api = this.resolveApi();
    if (!api || !this.err) return;
    hideError(this.err);
    try {
      const today = localToday();
      const folder = api.demoFolder();

      const journey = buildExampleJourney(api.defaultAuthor() || "Demo Instructor", today);
      const jr = await createKnobe(journey);
      await saveSealedFile(this.app, folder, slugify(jr.payload.title), jr.text);

      // Sample A chains to the journey (a clean, linked submission).
      const a = buildDemoSubmission("Sample Student A", jr.payloadHash, today);
      const ar = await createKnobe(a);
      await saveSealedFile(this.app, folder, slugify(ar.payload.title), ar.text);

      // Sample B has no chain link — demonstrates a cohort-check anomaly.
      const b = buildDemoSubmission("Sample Student B", null, today);
      const br = await createKnobe(b);
      await saveSealedFile(this.app, folder, slugify(br.payload.title), br.text);

      if (!api.isDemoMode()) await api.setDemoMode(true);
      this.refreshDemoBanner();

      announce("Demo sandbox ready in " + folder + ": one journey and two sample submissions. Demo mode is on.");
      new Notice("Demo sandbox created in " + folder + " and demo mode turned on.");
    } catch (e) {
      showError(this.err, "Could not set up the demo sandbox: " + (e instanceof Error ? e.message : String(e)));
    }
  }

  async onClose(): Promise<void> {
    this.contentEl.empty();
  }
}
