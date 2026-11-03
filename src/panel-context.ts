/**
 * panel-context.ts — the surface each Studio panel gets for talking to the
 * vault and to its sibling panels, so panels never reach into each other
 * or into the plugin directly.
 */
import type { App, TFile, TFolder } from "obsidian";
import type { CreateResult, JourneyPayloadStep } from "./engine/knobe-core";
import type { CreateFormState, JourneyContext } from "./studio-core";
import type { StudioSettings } from "./settings";

export type TabId = "create" | "verify" | "transform" | "journey" | "cohort" | "adapt";

/** Journey → Create hand-off: what the Create panel is primed with. */
export interface JourneyPrime {
  journeyCtx: JourneyContext;
  banner: string;
  prefill?: Partial<CreateFormState>;
  onSealed?: (r: CreateResult) => void;
  /** The whole journey, drawn as a map with the step being worked on marked. */
  journeyMap?: { steps: JourneyPayloadStep[]; currentIdx: number };
}

export interface IntakeResult {
  text: string;
  name: string;
  file: TFile | null;
}

export interface StudioContext {
  app: App;
  settings: StudioSettings;

  /**
   * Save sealed text into the effective output folder; returns the file.
   * When `dest` carries a term/course, the file lands in the course hierarchy:
   * Term is the top-level folder, course the sub-level (e.g.
   * "KNOBE/Fall 2026/HIS 101/…"). In demo mode the hierarchy nests inside the
   * sandbox, so the confinement guarantee is unchanged.
   */
  saveSealed(fileName: string, text: string, dest?: { term?: string; course?: string }): Promise<TFile>;
  /** The folder saves currently target (the demo sandbox when demo mode is on). */
  saveFolder(): string;
  /** The active demo sandbox scope, or null when demo mode is off. */
  demoScope(): string | null;
  openFile(file: TFile): void;

  /** Raw text of the currently active markdown note, if any. */
  activeNote(): Promise<IntakeResult | null>;
  pickFile(onPick: (r: IntakeResult) => void): void;
  pickFolder(onPick: (folder: TFolder) => void): void;

  selectTab(id: TabId): void;

  /**
   * Journey → Create flow: open the Create panel primed with a journey
   * context and optional field prefills. onSealed fires when Create seals,
   * so a step's hash can flow back to the Journey panel.
   */
  openCreateWithJourney(args: JourneyPrime): void;
}
