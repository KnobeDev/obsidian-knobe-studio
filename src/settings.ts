/**
 * settings.ts — plugin settings: where sealed files land and the defaults
 * that prefill the Create and Adapt forms.
 */
import { App, PluginSettingTab, Setting } from "obsidian";
import { companionManifest, reinstallCompanion } from "./companion-install";
import type KnobeStudioPlugin from "./main";


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
  /** Companion (Teaching Studio) version this plugin last wrote into the vault; "" = never. */
  companionInstalledVersion: string;
}

export const DEFAULT_SETTINGS: StudioSettings = {
  outputFolder: "KNOBE",
  defaultAuthor: "",
  defaultLicense: "",
  openAfterSeal: true,
  appearance: "follow",
  demoFolder: "KNOBE/Demo",
  demoMode: false,
  companionInstalledVersion: "",
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
      .setDesc("When demo mode is on, every file picker, save, and active-note read is confined to this folder — so real student records (FERPA) or health information (HIPAA) elsewhere in the vault are never surfaced while screen-sharing.")
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
      .setDesc("Safe to screen-share to students: confines all file access to the demo folder. Also toggleable from the Teaching Studio dashboard.")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.demoMode).onChange(async (v) => {
          await this.plugin.setDemoMode(v);
        })
      );

    new Setting(containerEl).setName("Companion plugin").setHeading();

    new Setting(containerEl)
      .setName("KNOBE Teaching Studio")
      .setDesc(
        "The teaching dashboard ships inside KNOBE Studio (v" +
          companionManifest().version +
          ") and installs itself as its own plugin, enabled by default — toggle it off in Community plugins like any other. If you've removed it, this puts it back."
      )
      .addButton((b) =>
        b.setButtonText("Reinstall").onClick(async () => {
          await reinstallCompanion(this.plugin);
        })
      );
  }
}
