/**
 * api.ts — the cross-plugin contract between the KNOBE Studio plugin and the
 * separate KNOBE Teaching Studio plugin. Studio owns the tools, the vault
 * scoping, and the demo state; the Teaching Studio plugin consumes this surface so
 * it never imports Studio's internals. Both plugins bundle this file.
 */
import type { App } from "obsidian";
import type { TabId } from "./panel-context";
import type { StudioAppearance } from "./settings";

export const KNOBE_STUDIO_ID = "knobe-studio";

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

interface WithKnobeApi {
  knobeApi?: KnobeStudioApi;
}

interface AppWithPlugins {
  plugins?: { plugins?: Record<string, WithKnobeApi | undefined> };
}

/**
 * Resolve the Studio plugin's API, or null if the Studio plugin is not
 * installed/enabled yet. Call this lazily (per action / per view open) rather
 * than caching, since plugin load order is not guaranteed.
 */
export function getKnobeStudioApi(app: App): KnobeStudioApi | null {
  const registry = (app as unknown as AppWithPlugins).plugins;
  const studio = registry?.plugins?.[KNOBE_STUDIO_ID];
  return studio?.knobeApi ?? null;
}
