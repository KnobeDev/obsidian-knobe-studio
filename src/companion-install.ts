/**
 * companion-install.ts — ships the built KNOBE Instructor Studio plugin
 * inside the main bundle (see companion-payload.ts, generated at build time)
 * and unpacks it into `<configDir>/plugins/knobe-instructor-studio/`. One
 * install of KNOBE Studio — BRAT, release zip, or build-from-source — then
 * surfaces both plugins in Settings → Community plugins, each behind the
 * normal enable toggle. The companion is never auto-enabled.
 */
import { Notice, normalizePath } from "obsidian";
import { decideCompanionAction } from "./companion-logic";
import { COMPANION_MAIN_JS, COMPANION_MANIFEST_JSON, COMPANION_STYLES_CSS } from "./companion-payload";
import type KnobeStudioPlugin from "./main";

// Obsidian's plugin manager (app.plugins) is internal API, so every call is
// optional-chained: if a future Obsidian drops one, install still completes
// and the plugin list simply refreshes on the next app restart.
interface PluginManagerLike {
  loadManifests?: () => Promise<void>;
  enabledPlugins?: Set<string>;
  disablePlugin?: (id: string) => Promise<void>;
  enablePlugin?: (id: string) => Promise<void>;
}

export function companionManifest(): { id: string; name: string; version: string } {
  return JSON.parse(COMPANION_MANIFEST_JSON);
}

/** Install or upgrade the companion when warranted; quiet no-op otherwise. */
export async function ensureCompanionInstalled(plugin: KnobeStudioPlugin): Promise<void> {
  const manifest = companionManifest();
  const dir = companionDir(plugin);

  let installedVersion: string | null = null;
  try {
    const raw = await plugin.app.vault.adapter.read(`${dir}/manifest.json`);
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

  const plugins = pluginManager(plugin);
  if (action === "update" && plugins?.enabledPlugins?.has(manifest.id)) {
    // Already running an older copy — swap in the new code.
    await plugins.disablePlugin?.(manifest.id);
    await plugins.enablePlugin?.(manifest.id);
  } else if (action === "install") {
    new Notice(
      manifest.name + " is now installed. Enable it in Settings → Community plugins when you're ready to teach.",
      10000
    );
  }
}

/** Settings-tab escape hatch: put the companion back after a manual uninstall. */
export async function reinstallCompanion(plugin: KnobeStudioPlugin): Promise<void> {
  await writeCompanion(plugin, companionDir(plugin));
  new Notice(companionManifest().name + " reinstalled — enable it in Settings → Community plugins.");
}

function companionDir(plugin: KnobeStudioPlugin): string {
  return normalizePath(`${plugin.app.vault.configDir}/plugins/${companionManifest().id}`);
}

function pluginManager(plugin: KnobeStudioPlugin): PluginManagerLike | undefined {
  return (plugin.app as unknown as { plugins?: PluginManagerLike }).plugins;
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
