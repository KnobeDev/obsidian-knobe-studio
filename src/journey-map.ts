/**
 * journey-map.ts — pure model for the journey map ported from
 * knobe.org/studio: a "you are here" strip of step nodes for any loaded
 * journey. Journey files can come from third parties, so every displayed
 * string passes through shown() (control and bidi characters escaped, cut at
 * a bounded cost) and builds_on values are coerced, range-checked, and
 * self-excluded.
 */
import { shown } from "./display";
import { JPOLICIES, JSEALERS } from "./studio-core";

export interface JourneyMapNode {
  /** "Step N · Sealer" */
  kicker: string;
  title: string;
  aiLabel: string;
  /** 1-based step numbers this step builds on. */
  buildsOn: number[];
  /** The step's sealed spec hash, when the journey records one. */
  specHash: string | null;
  isHere: boolean;
}

export interface JourneyMapModel {
  /** Visually hidden description read before the list. */
  description: string;
  nodes: JourneyMapNode[];
}

export function journeyMapModel(
  steps: ReadonlyArray<Record<string, unknown>> | null | undefined,
  currentIdx: number | null
): JourneyMapModel {
  const list = Array.isArray(steps) ? steps : [];
  const count = list.length;
  const description =
    "The journey as a sequence of " + count + " step" + (count === 1 ? "" : "s") +
    (currentIdx !== null ? "; the current step is marked" : "") + ".";
  const nodes = list.map((s, i): JourneyMapNode => {
    const sealer = String(s.sealer ?? "");
    const policy = JPOLICIES[String(s.ai_policy)] ?? JPOLICIES.not_applicable;
    const raw: unknown[] = Array.isArray(s.builds_on) ? s.builds_on : [];
    const buildsOn = raw
      .map(Number)
      .filter((n) => Number.isInteger(n) && n >= 1 && n <= count && n !== i + 1);
    return {
      kicker: "Step " + (i + 1) + " · " + (JSEALERS[sealer] ?? shown(sealer || "unassigned", 20)),
      title: shown(typeof s.title === "string" && s.title ? s.title : "Untitled step", 60),
      aiLabel: policy.label,
      buildsOn,
      specHash: typeof s.spec_hash === "string" && s.spec_hash ? shown(s.spec_hash, 100) : null,
      isHere: i === currentIdx,
    };
  });
  return { description, nodes };
}
