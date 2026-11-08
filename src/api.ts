/**
 * api.ts — the contract between the KNOBE Studio plugin and its Teaching
 * Studio dashboard view. Studio owns the tools, the vault scoping, and the
 * demo state; the dashboard reaches them only through this surface, so it
 * never imports Studio's internals.
 *
 * Studio also keeps this object on `plugin.knobeApi`: the retired standalone
 * Teaching Studio plugin (0.3.2 and earlier) reads it there, so a vault that
 * still has that plugin enabled keeps working until it is uninstalled.
 */
import type { TabId } from "./panel-context";
import type { StudioAppearance } from "./settings";

export interface KnobeStudioApi {
  /** Open the Studio dashboard focused on a given tab. */
  openStudioAt(tab: TabId): Promise<void>;
  isDemoMode(): boolean;
  setDemoMode(on: boolean): Promise<void>;
  /** The active demo sandbox scope, or null when demo mode is off. */
  demoScope(): string | null;
  /** Where sealed files are saved (the sandbox in demo mode, else the output folder). */
  effectiveOutputFolder(): string;
  /** The configured demo sandbox folder, regardless of mode. */
  demoFolder(): string;
  defaultAuthor(): string;
  openAfterSeal(): boolean;
  appearance(): StudioAppearance;
}
