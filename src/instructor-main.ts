/**
 * instructor-main.ts — the KNOBE Teaching Studio plugin entry. This is a
 * SEPARATE, independently-installable Obsidian plugin (id knobe-teaching-
 * studio) that provides the teaching dashboard. It holds no tools of its own:
 * it resolves the KNOBE Studio plugin's `knobeApi` at runtime and routes into
 * it. If Studio is not enabled, the dashboard shows a "requires KNOBE Studio"
 * message rather than failing.
 */
import { Plugin, WorkspaceLeaf } from "obsidian";
import { KNOBE_CLASSROOM_VIEW, KnobeClassroomView } from "./classroom";
import { getKnobeStudioApi } from "./api";

export default class KnobeInstructorPlugin extends Plugin {
  async onload(): Promise<void> {
    this.registerView(
      KNOBE_CLASSROOM_VIEW,
      (leaf: WorkspaceLeaf) => new KnobeClassroomView(leaf, () => getKnobeStudioApi(this.app))
    );

    this.addRibbonIcon("graduation-cap", "Open KNOBE Teaching Studio", () => void this.activateView());

    this.addCommand({
      id: "open-teaching-studio",
      name: "Open Teaching Studio dashboard",
      callback: () => void this.activateView(),
    });
  }

  onunload(): void {
    // Obsidian detaches registered views automatically.
  }

  async activateView(): Promise<void> {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(KNOBE_CLASSROOM_VIEW)[0] ?? null;
    if (!leaf) {
      leaf = workspace.getLeaf("tab");
      await leaf.setViewState({ type: KNOBE_CLASSROOM_VIEW, active: true });
    }
    await workspace.revealLeaf(leaf);
  }
}
