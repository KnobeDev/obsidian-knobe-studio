/**
 * settings.ts — plugin settings: where sealed files land, the defaults that
 * prefill the Create and Adapt forms, demo mode, and the Teaching Studio.
 */
import { App, PluginSettingTab, Setting } from "obsidian";
import type KnobeStudioPlugin from "./main";
import { FOLD_DEFAULTS, type FoldSettings } from "./teaching-fold";

export type StudioAppearance = "follow" | "light" | "dark";

export interface StudioSettings extends FoldSettings {
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
  ...FOLD_DEFAULTS,
};

export class StudioSettingTab extends PluginSettingTab {
  plugin: KnobeStudioPlugin;

  constructor(app: App, plugin: KnobeStudioPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  /** A polite live region inside the settings tab: a region outside an open
   * modal may not be announced, so status messages are written here. */
  private status: HTMLElement | null = null;

  private say(message: string): void {
    const region = this.status;
    if (!region) return;
    region.setText("");
    window.setTimeout(() => {
      if (region.isConnected) region.setText(message);
    }, 30);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    this.status = containerEl.createDiv({
      cls: "ks-sr-only",
      attr: { role: "status", "aria-live": "polite", "aria-atomic": "true" },
    });

    // Obsidian doesn't tie a setting's visible name to its control, so each
    // control is given that name as its accessible name (SC 1.3.1, 4.1.2, 2.5.3).
    // A toggle is named on its checkbox input; never on the role-less wrapper div.
    const nameToggle = (el: HTMLElement, name: string): void => {
      el.querySelector("input")?.setAttr("aria-label", name);
    };

    new Setting(containerEl)
      .setName("Output folder")
      .setDesc("Vault folder where sealed .knobe.md files are saved. Created if missing.")
      .addText((t) =>
        t
          .then((c) => c.inputEl.setAttr("aria-label", "Output folder"))
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
        t.then((c) => c.inputEl.setAttr("aria-label", "Default author")).setValue(this.plugin.settings.defaultAuthor).onChange(async (v) => {
          this.plugin.settings.defaultAuthor = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Default license")
      .setDesc("Prefills the license field when a template does not set one (e.g. CC BY 4.0).")
      .addText((t) =>
        t.then((c) => c.inputEl.setAttr("aria-label", "Default license")).setValue(this.plugin.settings.defaultLicense).onChange(async (v) => {
          this.plugin.settings.defaultLicense = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Appearance")
      .setDesc("The Studio ships two designed themes — archival paper (light) and night grove (dark). Follow Obsidian's theme, or pin one.")
      .addDropdown((d) =>
        d
          .then((c) => c.selectEl.setAttr("aria-label", "Appearance"))
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
        t.then((c) => nameToggle(c.toggleEl, "Open sealed files")).setValue(this.plugin.settings.openAfterSeal).onChange(async (v) => {
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
          .then((c) => c.inputEl.setAttr("aria-label", "Demo folder (sandbox)"))
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
        t.then((c) => nameToggle(c.toggleEl, "Demo / presentation mode")).setValue(this.plugin.settings.demoMode).onChange(async (v) => {
          await this.plugin.setDemoMode(v);
        })
      );

    new Setting(containerEl).setName("Teaching").setHeading();

    new Setting(containerEl)
      .setName("Teaching Studio dashboard")
      .setDesc(
        "A guide to the KNOBE workflow, role by role, with a teaching kit and the demo sandbox. It stays off until you turn it on, here or with the \"Turn on and open Teaching Studio\" button on the Studio dashboard. " +
          "On: adds the \"Open Teaching Studio dashboard\" ribbon button and command. " +
          "Off: removes both and closes an open Teaching Studio tab, and a hotkey you set for the command does nothing; your files and other settings are not affected. " +
          "Earlier versions came with a separate KNOBE Teaching Studio plugin: if it is still under Community plugins, turn it off and uninstall it."
      )
      .addToggle((t) =>
        t.then((c) => nameToggle(c.toggleEl, "Teaching Studio dashboard")).setValue(this.plugin.settings.teachingStudio).onChange(async (v) => {
          await this.plugin.setTeachingStudio(v);
          this.say(v
            ? "Teaching Studio dashboard on. Ribbon button and command added."
            : "Teaching Studio dashboard off. Ribbon button and command removed, and its tab closed.");
        })
      );
  }
}
