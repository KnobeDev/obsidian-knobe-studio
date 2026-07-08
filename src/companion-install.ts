/**
 * companion-install.ts — ships the built KNOBE Teaching Studio plugin
 * inside the main bundle (see companion-payload.ts, generated at build time)
 * and unpacks it into `<configDir>/plugins/knobe-teaching-studio/`. One
 * install of KNOBE Studio — BRAT, release zip, or build-from-source — then
 * surfaces both plugins in Settings → Community plugins. The Teaching Studio
 * is enabled by default (it exists to teach the workflow); the notice tells
 * users where to toggle it off, and turning it off or removing it sticks.
 */
import { Notice, normalizePath } from "obsidian";
import { decideCompanionAction } from "./companion-logic";
import { COMPANION_MAIN_JS, COMPANION_MANIFEST_JSON, COMPANION_STYLES_CSS } from "./companion-payload";
import type KnobeStudioPlugin from "./main";

/** Id the companion shipped under in 0.2.0, before the Teaching Studio rename. */
const LEGACY_ID = "knobe-instructor-studio";

// Obsidian's plugin manager (app.plugins) is internal API, so every call is
// optional-chained: if a future Obsidian drops one, install still completes
// and the plugin list simply refreshes on the next app restart.
interface PluginManagerLike {
  loadManifests?: () => Promise<void>;
  enabledPlugins?: Set<string>;
  disablePlugin?: (id: string) => Promise<void>;
  enablePlugin?: (id: string) => Promise<void>;
  disablePluginAndSave?: (id: string) => Promise<void>;
  enablePluginAndSave?: (id: string) => Promise<void>;
}

export function companionManifest(): { id: string; name: string; version: string } {
  return JSON.parse(COMPANION_MANIFEST_JSON);
}

/** Install, upgrade, or migrate the companion when warranted; quiet no-op otherwise. */
export async function ensureCompanionInstalled(plugin: KnobeStudioPlugin): Promise<void> {
  const manifest = companionManifest();
  const adapter = plugin.app.vault.adapter;
  const plugins = pluginManager(plugin);
  const dir = companionDir(plugin, manifest.id);

  // One-time migration: same plugin, renamed. Retire the old id entirely and
  // hand its place to the new one, keeping it enabled.
  const legacyDir = companionDir(plugin, LEGACY_ID);
  if (await adapter.exists(`${legacyDir}/manifest.json`)) {
    await (plugins?.disablePluginAndSave ?? plugins?.disablePlugin)?.call(plugins, LEGACY_ID);
    await adapter.rmdir(legacyDir, true);
    await writeCompanion(plugin, dir);
    await enableCompanion(plugins, manifest.id);
    new Notice(
      "KNOBE Instructor Studio is now " + manifest.name + " — same plugin, clearer name. It's enabled; toggle it off anytime in Settings → Community plugins.",
      10000
    );
    return;
  }

  let installedVersion: string | null = null;
  try {
    const raw = await adapter.read(`${dir}/manifest.json`);
    installedVersion = (JSON.parse(raw) as { version?: string }).version ?? "0.0.0";
  } catch {
    installedVersion = null;
  }

  const action = decideCompanionAction({
    installedVersion,
    lastInstalledByUs: plugin.settings.companionInstalledVersion || null,
    embeddedVersion: manifest.version,
  });
  if (action === "skip") return;

  await writeCompanion(plugin, dir);

  if (action === "update") {
    if (plugins?.enabledPlugins?.has(manifest.id)) {
      // Already running an older copy — swap in the new code.
      await plugins.disablePlugin?.(manifest.id);
      await plugins.enablePlugin?.(manifest.id);
    }
  } else {
    // Fresh install: on by default — it's the tool that teaches the rest.
    await enableCompanion(plugins, manifest.id);
    new Notice(
      manifest.name + " is installed and enabled — it walks you through the KNOBE workflow. Toggle it off anytime in Settings → Community plugins.",
      10000
    );
  }
}

/** Settings-tab escape hatch: put the companion back after a manual uninstall. */
export async function reinstallCompanion(plugin: KnobeStudioPlugin): Promise<void> {
  const manifest = companionManifest();
  await writeCompanion(plugin, companionDir(plugin, manifest.id));
  await enableCompanion(pluginManager(plugin), manifest.id);
  new Notice(manifest.name + " reinstalled and enabled.");
}

function companionDir(plugin: KnobeStudioPlugin, id: string): string {
  return normalizePath(`${plugin.app.vault.configDir}/plugins/${id}`);
}

function pluginManager(plugin: KnobeStudioPlugin): PluginManagerLike | undefined {
  return (plugin.app as unknown as { plugins?: PluginManagerLike }).plugins;
}

async function enableCompanion(plugins: PluginManagerLike | undefined, id: string): Promise<void> {
  // AndSave persists the toggle to community-plugins.json; fall back to the
  // session-only enable so at worst the user flips the toggle themselves.
  await (plugins?.enablePluginAndSave ?? plugins?.enablePlugin)?.call(plugins, id);
}

async function writeCompanion(plugin: KnobeStudioPlugin, dir: string): Promise<void> {
  const adapter = plugin.app.vault.adapter;
  if (!(await adapter.exists(dir))) await adapter.mkdir(dir);
  await adapter.write(`${dir}/main.js`, COMPANION_MAIN_JS);
  await adapter.write(`${dir}/styles.css`, COMPANION_STYLES_CSS);
  await adapter.write(`${dir}/manifest.json`, COMPANION_MANIFEST_JSON);

  plugin.settings.companionInstalledVersion = companionManifest().version;
  await plugin.saveSettings();

  // Refresh the registry so the plugin appears in the Community plugins list
  // right away instead of after an app restart.
  await pluginManager(plugin)?.loadManifests?.();
}
