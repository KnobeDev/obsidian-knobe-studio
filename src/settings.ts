/**
 * settings.ts — plugin settings: where sealed files land and the defaults
 * that prefill the Create and Adapt forms.
 */
import { App, PluginSettingTab, Setting } from "obsidian";
import type KnobeStudioPlugin from "./main";

/** Where Teaching Studio's own release zip is published. */
export const TEACHING_STUDIO_RELEASES_URL = "https://github.com/KnobeDev/obsidian-knobe-studio/releases/latest";

export type StudioAppearance = "follow" | "light" | "dark";

export interface StudioSettings {
  outputFolder: string;
  defaultAuthor: string;
  defaultLicense: string;
  openAfterSeal: boolean;
  appearance: StudioAppearance;
  /** Sandbox folder that demo/presentation mode confines all file access to. */
  demoFolder: string;
  /** When true, pickers, saves, and active-note reads are limited to demoFolder. */
  demoMode: boolean;
}

export const DEFAULT_SETTINGS: StudioSettings = {
  outputFolder: "KNOBE",
  defaultAuthor: "",
  defaultLicense: "",
  openAfterSeal: true,
  appearance: "follow",
  demoFolder: "KNOBE/Demo",
  demoMode: false,
};

export class StudioSettingTab extends PluginSettingTab {
  plugin: KnobeStudioPlugin;

  constructor(app: App, plugin: KnobeStudioPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Output folder")
      .setDesc("Vault folder where sealed .knobe.md files are saved. Created if missing.")
      .addText((t) =>
        t
          .setPlaceholder("KNOBE")
          .setValue(this.plugin.settings.outputFolder)
          .onChange(async (v) => {
            this.plugin.settings.outputFolder = v.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Default author")
      .setDesc("Prefills the primary author field on the Create panel.")
      .addText((t) =>
        t.setValue(this.plugin.settings.defaultAuthor).onChange(async (v) => {
          this.plugin.settings.defaultAuthor = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Default license")
      .setDesc("Prefills the license field when a template does not set one (e.g. CC BY 4.0).")
      .addText((t) =>
        t.setValue(this.plugin.settings.defaultLicense).onChange(async (v) => {
          this.plugin.settings.defaultLicense = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Appearance")
      .setDesc("The Studio ships two designed themes — archival paper (light) and night grove (dark). Follow Obsidian's theme, or pin one.")
      .addDropdown((d) =>
        d
          .addOption("follow", "Follow Obsidian")
          .addOption("light", "Archival paper (light)")
          .addOption("dark", "Night grove (dark)")
          .setValue(this.plugin.settings.appearance)
          .onChange(async (v) => {
            this.plugin.settings.appearance = v as StudioAppearance;
            await this.plugin.saveSettings();
            this.plugin.refreshStudioAppearance();
          })
      );

    new Setting(containerEl)
      .setName("Open sealed files")
      .setDesc("Open a sealed file in a new tab right after it is saved.")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.openAfterSeal).onChange(async (v) => {
          this.plugin.settings.openAfterSeal = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl).setName("Presentation").setHeading();

    new Setting(containerEl)
      .setName("Demo folder (sandbox)")
      .setDesc("When demo mode is on, every file picker, save, and active-note read is confined to this folder, so notes elsewhere in the vault, such as real student records, stay off screen while you present.")
      .addText((t) =>
        t
          .setPlaceholder("KNOBE/Demo")
          .setValue(this.plugin.settings.demoFolder)
          .onChange(async (v) => {
            this.plugin.settings.demoFolder = v.trim() || "KNOBE/Demo";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Demo / presentation mode")
      .setDesc("Keeps real student data off screen while you present: confines all file access to the demo folder. Also toggleable from the Teaching Studio dashboard.")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.demoMode).onChange(async (v) => {
          await this.plugin.setDemoMode(v);
        })
      );

    new Setting(containerEl).setName("Teaching Studio").setHeading();

    new Setting(containerEl).setName("Separate install").setDesc(teachingStudioDescription());
  }
}

/**
 * Teaching Studio is a separate install: Studio never writes, enables, or
 * updates another plugin. This only says where to get it.
 */
function teachingStudioDescription(): DocumentFragment {
  return createFragment((f) => {
    f.appendText(
      "KNOBE Teaching Studio (KnobeDev) is a separate plugin with a role-by-role guide to these tools, a teaching kit, and a demo sandbox setup. Studio does not install or update it. To add or update it, download knobe-teaching-studio.zip from the "
    );
    f.createEl("a", { text: "latest release on GitHub (opens in your browser)", href: TEACHING_STUDIO_RELEASES_URL });
    f.appendText(" and unzip it into your vault's plugins folder, replacing any copy an earlier Studio installed.");
  });
}
