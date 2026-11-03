/**
 * journey-map-view.ts — renders the journey map model as an ordered strip of
 * step nodes. All text goes through textContent (createEl text), so a
 * third-party journey file has no injection path. Adds no focusable elements.
 */
import { journeyMapModel } from "./journey-map";

export function renderJourneyMap(
  container: HTMLElement,
  steps: ReadonlyArray<Record<string, unknown>> | null | undefined,
  currentIdx: number | null = null
): void {
  container.empty();
  const model = journeyMapModel(steps, currentIdx);
  if (!model.nodes.length) {
    container.addClass("ks-hidden");
    return;
  }
  container.createEl("p", { cls: "ks-sr-only", text: model.description });
  // list-style:none strips list semantics in Safari/VoiceOver; the role restores them.
  const ol = container.createEl("ol", { cls: "ks-jmap", attr: { role: "list" } });
  model.nodes.forEach((n, i) => {
    const li = ol.createEl("li");
    const node = li.createDiv({ cls: "ks-jmap-node" });
    if (n.isHere) {
      li.setAttribute("aria-current", "step");
      node.addClass("is-here");
      node.createSpan({ cls: "ks-jmap-here", text: "You are here" });
    }
    node.createSpan({ cls: "ks-jmap-k", text: n.kicker });
    node.createSpan({ cls: "ks-jmap-t", text: n.title });
    node.createSpan({ cls: "ks-jmap-ai", text: n.aiLabel });
    if (n.buildsOn.length) node.createSpan({ cls: "ks-jmap-builds", text: "Builds on step " + n.buildsOn.join(", ") });
    if (n.specHash) {
      // The hash is in the tooltip for pointer users and in hidden text for
      // keyboard and screen-reader users, who cannot reach a title.
      const badge = node.createSpan({ cls: "ks-jmap-badge", text: "sealed, hash-anchored", attr: { title: n.specHash } });
      badge.createSpan({ cls: "ks-sr-only", text: ". Payload hash " + n.specHash });
    }
    if (i < model.nodes.length - 1) li.createSpan({ cls: "ks-jmap-arrow", text: "→", attr: { "aria-hidden": "true" } });
  });
  container.removeClass("ks-hidden");
}
