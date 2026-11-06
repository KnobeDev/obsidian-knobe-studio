/**
 * panels/journey.ts — the Journey panel: instructors design an assignment
 * sequence (each step with sealer, kind, AI policy, and builds-on links),
 * seal individual steps through Create (hashes flow back), and seal the
 * whole journey. Students load a journey here or on Create to start a step.
 */
import { createKnobe, verify, type CreateResult } from "../engine/knobe-core";
import { shown } from "../display";
import {
  JKINDS, JPOLICIES, JSEALERS,
  buildJourneyBody, buildJourneyFields, journeyContextForInstructorStep,
  journeyContextForStep, journeyPayloadSteps, localToday, newJourneyStep, singleLine, slugify,
  type JourneyMeta, type JourneyStep, type LoadedJourney,
} from "../studio-core";
import {
  announce, button, copyToClipboard, debounce, errorBox, helpText, hideError,
  row2, sectionHeading, selectField, showError, textAreaField, textField,
} from "../ui";
import { buildIntake } from "../intake";
import { renderJourneyMap } from "../journey-map-view";
import type { StudioContext } from "../panel-context";

let stepIdSeq = 0;

const optionPairs = (rec: Record<string, string | { label: string }>): Array<[string, string]> =>
  Object.entries(rec).map(([k, v]) => [k, typeof v === "string" ? v : v.label]);

export class JourneyPanel {
  private ctx: StudioContext;
  private steps: JourneyStep[] = [];
  private loadedFrom: { hash: string; title: string } | null = null;
  private result: CreateResult | null = null;

  private course!: HTMLInputElement;
  private term!: HTMLInputElement;
  private title!: HTMLInputElement;
  private instructor!: HTMLInputElement;
  private stepsEl!: HTMLElement;
  private mapEl!: HTMLElement;
  private addStepBtn!: HTMLButtonElement;
  private revisionNote!: HTMLElement;
  private preview!: HTMLElement;
  private err!: HTMLElement;
  private resBox!: HTMLElement;
  private resText!: HTMLElement;
  private resHash!: HTMLElement;
  private fileName!: HTMLInputElement;
  private pickerBox!: HTMLElement;

  constructor(ctx: StudioContext, root: HTMLElement) {
    this.ctx = ctx;
    helpText(root, "Design an assignment sequence as a sealed journey file. Each step records who seals it, the kind of work, its AI policy, and what it builds on. Students load the journey to start a step with the right context pre-filled.");

    sectionHeading(root, "Start a step from a journey (student flow)");
    buildIntake(root, ctx, {
      label: "Load a journey file to begin one of its steps",
      onText: (text) => this.loadForStudent(text),
    });
    this.pickerBox = root.createDiv({ cls: "ks-hidden" });

    sectionHeading(root, "Journey maker (instructor flow)");
    const meta = root.createDiv();
    const r1 = row2(meta);
    this.course = textField(r1, "Course", "", { placeholder: "HIS 101", onInput: () => this.schedulePreview() });
    this.term = textField(r1, "Term", "", { placeholder: "Fall 2026", onInput: () => this.schedulePreview() });
    const r2 = row2(meta);
    this.title = textField(r2, "Sequence title", "", { placeholder: "Primary-source essay sequence", onInput: () => this.schedulePreview() });
    this.instructor = textField(r2, "Instructor", this.ctx.settings.defaultAuthor, { onInput: () => this.schedulePreview() });

    this.revisionNote = root.createDiv({ cls: "ks-banner ks-hidden", attr: { role: "status" } });
    this.stepsEl = root.createDiv();
    this.mapEl = root.createDiv({ cls: "ks-hidden" });

    const btns = root.createDiv({ cls: "ks-rowbtns" });
    this.addStepBtn = button(btns, "Add step", () => {
      this.steps.push(newJourneyStep());
      this.renderSteps();
      this.schedulePreview();
      announce("Step " + this.steps.length + " added.");
    });
    button(btns, "Load existing journey to revise…", () => {
      this.ctx.pickFile((r) => void this.loadForRevision(r.text).catch((e: unknown) => {
        showError(this.err, e instanceof Error ? e.message : String(e));
      }));
    }, { link: true });
    button(btns, "Reset", () => {
      this.steps = [];
      this.loadedFrom = null;
      this.result = null;
      this.course.value = ""; this.term.value = ""; this.title.value = "";
      this.instructor.value = this.ctx.settings.defaultAuthor;
      this.revisionNote.addClass("ks-hidden");
      this.resBox.addClass("ks-hidden");
      hideError(this.err);
      this.renderSteps();
      this.schedulePreview();
    }, { link: true });

    this.err = errorBox(root);
    const sealRow = root.createDiv({ cls: "ks-rowbtns ks-sealrow" });
    button(sealRow, "Seal journey", () => this.seal(), { cta: true });
    button(sealRow, "Copy syllabus block", async () => {
      await copyToClipboard(this.buildBody());
    });

    this.resBox = root.createDiv({ cls: "ks-result ks-hidden", attr: { tabindex: "-1" } });
    this.resText = this.resBox.createDiv({ cls: "ks-restext" });
    this.resHash = this.resBox.createDiv({ cls: "ks-mono ks-reshash" });
    const nameRow = this.resBox.createDiv({ cls: "ks-rowbtns" });
    this.fileName = textField(nameRow, "File name", "journey.knobe.md");
    button(nameRow, "Save to vault", async () => {
      if (!this.result) return;
      // Course hierarchy: Term is the top-level folder, course the sub-level.
      const file = await this.ctx.saveSealed(this.fileName.value.trim() || "journey.knobe.md", this.result.text, {
        term: this.term.value,
        course: this.course.value,
      });
      if (this.ctx.settings.openAfterSeal) this.ctx.openFile(file);
    }, { cta: true });
    button(nameRow, "Copy file text", async () => {
      if (this.result) await copyToClipboard(this.result.text);
    });

    sectionHeading(root, "Syllabus preview");
    this.preview = root.createEl("pre", { cls: "ks-preview" });
  }

  private meta(): JourneyMeta {
    return {
      course: this.course.value,
      term: this.term.value,
      title: this.title.value,
      instructor: this.instructor.value,
    };
  }

  private buildBody(): string {
    return buildJourneyBody(this.meta(), this.steps);
  }

  private schedulePreview = debounce(() => {
    this.preview.setText(this.buildBody());
    renderJourneyMap(this.mapEl, journeyPayloadSteps(this.steps));
  }, 300);

  private renderSteps(): void {
    const box = this.stepsEl;
    box.empty();
    this.steps.forEach((s, i) => {
      // Each step is a group named by its visible "Step N", so a screen
      // reader says which step's fields it is in; the number tracks moves
      // because this rebuilds.
      const numId = "ks-jstep-" + ++stepIdSeq;
      const card = box.createDiv({ cls: "ks-jstep", attr: { role: "group", "aria-labelledby": numId } });
      const head = card.createDiv({ cls: "ks-jstephead" });
      head.createSpan({ cls: "ks-jstepnum", text: "Step " + (i + 1), attr: { id: numId } });
      const btns = head.createDiv({ cls: "ks-jstepbtns" });
      // Unique names ("Up step 2") keep these distinguishable in a controls
      // list; the visible word leads the name (SC 2.5.3 Label in Name).
      const stepButton = (verb: string, onClick: () => void): void => {
        button(btns, verb, onClick, { link: true }).setAttribute("aria-label", verb + " step " + (i + 1));
      };
      if (i > 0) stepButton("Up", () => { this.swap(i, i - 1); });
      if (i < this.steps.length - 1) stepButton("Down", () => { this.swap(i, i + 1); });
      stepButton("Remove", () => {
        this.steps.splice(i, 1);
        this.steps.forEach((t) => {
          t.builds_on = t.builds_on.filter((n) => n !== i).map((n) => (n > i ? n - 1 : n));
        });
        this.renderSteps();
        this.schedulePreview();
        // renderSteps rebuilt the DOM; park focus somewhere stable and say why.
        this.addStepBtn.focus();
        announce("Step " + (i + 1) + " removed.");
      });

      const r1 = row2(card);
      textField(r1, "Step title", s.title, {
        placeholder: i === 0 ? "Week 6 reading" : "",
        onInput: (v) => { s.title = v; this.schedulePreview(); },
      });
      selectField(r1, "Sealed by", optionPairs(JSEALERS), s.sealer, (v) => {
        s.sealer = v;
        this.renderSteps();
        this.schedulePreview();
      });
      const r2 = row2(card);
      selectField(r2, "Kind of work", optionPairs(JKINDS), s.kind, (v) => { s.kind = v; this.schedulePreview(); });
      selectField(r2, "AI policy for this step", optionPairs(JPOLICIES), s.ai_policy, (v) => { s.ai_policy = v; this.schedulePreview(); });

      textAreaField(card, "AI policy detail (shown to the student)", s.ai_detail, {
        rows: 2,
        placeholder: "e.g. AI may be used for terminology lookup or post-draft clarity review, not to draft content.",
        onInput: (v) => { s.ai_detail = v; this.schedulePreview(); },
      });
      textAreaField(card, "Expectations", s.expectations, {
        rows: 2,
        placeholder: "What this step should contain, in a sentence or two.",
        onInput: (v) => { s.expectations = v; this.schedulePreview(); },
      });

      if (i > 0) {
        const builds = card.createDiv({
          cls: "ks-jbuilds",
          attr: { role: "group", "aria-label": "Step " + (i + 1) + " builds on" },
        });
        builds.createSpan({ text: "Builds on:", attr: { "aria-hidden": "true" } });
        for (let k = 0; k < i; k++) {
          const lab = builds.createEl("label");
          const cb = lab.createEl("input", { type: "checkbox" });
          cb.checked = s.builds_on.includes(k);
          cb.addEventListener("change", () => {
            if (cb.checked) {
              if (!s.builds_on.includes(k)) s.builds_on.push(k);
            } else {
              s.builds_on = s.builds_on.filter((n) => n !== k);
            }
            this.schedulePreview();
          });
          lab.createSpan({ text: " Step " + (k + 1) + (this.steps[k].title ? ": " + shown(this.steps[k].title, 60) : "") });
        }
      }

      if (s.spec_hash) card.createDiv({ cls: "ks-mono ks-sealedhash", text: "sealed: " + s.spec_hash });
      if (s.sealer === "instructor") {
        button(card.createDiv({ cls: "ks-rowbtns" }),
          s.spec_hash ? "Reseal this step in Create" : "Seal this step in Create",
          () => this.sealStepInCreate(i), { link: true });
      }
    });
  }

  private swap(a: number, b: number): void {
    [this.steps[a], this.steps[b]] = [this.steps[b], this.steps[a]];
    this.steps.forEach((t, self) => {
      t.builds_on = t.builds_on
        .map((n) => (n === a ? b : n === b ? a : n))
        .filter((n) => n < self);
    });
    this.renderSteps();
    this.schedulePreview();
    // Keep keyboard focus with the moved step after the rebuild, on the same
    // direction's button when it still exists, so repeated moves need no re-tabbing.
    const dir = b < a ? "Up" : "Down";
    const movedCard = this.stepsEl.children[b] as HTMLElement | undefined;
    const same = movedCard?.querySelector<HTMLButtonElement>('button[aria-label^="' + dir + ' "]');
    (same ?? movedCard?.querySelector("button"))?.focus();
    announce("Step moved " + dir.toLowerCase() + " to position " + (b + 1) + " of " + this.steps.length + ".");
  }

  private sealStepInCreate(i: number): void {
    // Capture the step OBJECT, not the index: the user can reorder or remove
    // steps while the Create tab holds the pending seal, and the hash must
    // flow back to this exact step (or nowhere, if it was removed).
    const s = this.steps[i];
    const kind = JKINDS[s.kind] ?? JKINDS.reading;
    this.ctx.openCreateWithJourney({
      journeyCtx: journeyContextForInstructorStep(this.steps, i, this.course.value, this.term.value),
      journeyMap: { steps: journeyPayloadSteps(this.steps), currentIdx: i },
      banner: "Sealing journey step " + (i + 1) + ": " + shown(s.title || "Untitled step", 90) + ". The sealed hash will flow back into the journey.",
      prefill: {
        title: s.title,
        contentType: kind.content_type,
        license: "All rights reserved",
        privacyLevel: "internal",
        quarantineStatus: "trusted",
        contribution1: "Designed this step of the course sequence.",
        role1: "instructor_prompt",
        rights1: true,
        goodFaith: true,
        author: singleLine(this.instructor.value),
      },
      onSealed: (r) => {
        if (this.steps.includes(s)) {
          s.spec_hash = r.payloadHash;
          this.renderSteps();
          this.schedulePreview();
          announce("Step sealed; its hash was recorded in the journey.");
        } else {
          announce("The sealed step is no longer in the journey; its hash was not recorded.");
        }
      },
    });
  }

  private async seal(): Promise<void> {
    hideError(this.err);
    try {
      if (!this.steps.length) throw new Error("Add at least one step first.");
      const fields = buildJourneyFields(this.meta(), this.steps, this.loadedFrom, localToday());
      this.result = await createKnobe({ fields, body: this.buildBody() });
      this.resText.setText("Sealed. Self-check: " + this.result.report.state + " · " + this.result.report.conformance + ".");
      this.resHash.setText("payload_hash " + this.result.payloadHash);
      this.fileName.value = slugify(this.result.payload.title);
      this.resBox.removeClass("ks-hidden");
      this.resBox.focus();
    } catch (e) {
      showError(this.err, "Sealing did not complete: " + (e instanceof Error ? e.message : String(e)));
    }
  }

  private async loadForRevision(text: string): Promise<void> {
    hideError(this.err);
    const report = await verify(text);
    if (report.state !== "verified" && report.state !== "verified-body-modified") {
      throw new Error("This file does not verify (status: " + report.state + ").");
    }
    const j = report.payload?.journey;
    if (!j || !Array.isArray(j.steps)) throw new Error("This file carries no journey specification.");
    this.course.value = typeof j.course === "string" ? j.course : "";
    this.term.value = typeof j.term === "string" ? j.term : "";
    this.title.value = typeof j.title === "string" ? j.title : "";
    const src = report.payload?.attribution?.sources?.[0];
    this.instructor.value = src && typeof src.author === "string" ? src.author : "";
    this.steps = j.steps.map((s) => ({
      title: typeof s.title === "string" ? s.title : "",
      sealer: JSEALERS[String(s.sealer)] ? String(s.sealer) : "student",
      kind: JKINDS[String(s.kind)] ? String(s.kind) : "writing",
      ai_policy: JPOLICIES[String(s.ai_policy)] ? String(s.ai_policy) : "not_applicable",
      ai_detail: typeof s.ai_policy_detail === "string" ? s.ai_policy_detail : "",
      expectations: typeof s.expectations === "string" ? s.expectations : "",
      builds_on: Array.isArray(s.builds_on) ? s.builds_on.map((n) => Number(n) - 1).filter((n) => n >= 0) : [],
      spec_hash: typeof s.spec_hash === "string" ? s.spec_hash : "",
    }));
    this.loadedFrom = {
      hash: typeof report.stored === "string" ? report.stored : "",
      title: typeof report.payload?.title === "string" ? report.payload.title : "Untitled journey",
    };
    this.revisionNote.setText(
      "Revising: " + shown(this.loadedFrom.title, 120) +
      ". Sealing will produce a new version that records this one as its superseded parent."
    );
    this.revisionNote.removeClass("ks-hidden");
    this.renderSteps();
    this.schedulePreview();
  }

  private async loadForStudent(text: string): Promise<void> {
    const report = await verify(text);
    if (report.state !== "verified" && report.state !== "verified-body-modified") {
      throw new Error("The journey file does not verify (status: " + report.state + "). Ask your instructor for a fresh copy.");
    }
    const j = report.payload?.journey;
    if (!j || !Array.isArray(j.steps)) {
      throw new Error("This file carries no journey specification. Check that you loaded the journey file, not another KNOBE.");
    }
    const journey: LoadedJourney = { course: j.course, term: j.term, title: j.title, steps: j.steps };
    const journeyTitle = typeof report.payload?.title === "string" ? report.payload.title : "Untitled journey";
    const journeyHash = typeof report.stored === "string" ? report.stored : "";

    this.pickerBox.empty();
    this.pickerBox.removeClass("ks-hidden");
    renderJourneyMap(this.pickerBox.createDiv(), j.steps);
    this.pickerBox.createDiv({ cls: "ks-intake-label", text: "Pick your step:" });
    const btns = this.pickerBox.createDiv({ cls: "ks-rowbtns" });
    const studentSteps = j.steps.map((s, i) => ({ s, i })).filter((x) => x.s.sealer === "student");
    const list = studentSteps.length ? studentSteps : j.steps.map((s, i) => ({ s, i }));
    for (const { s, i } of list) {
      button(btns, "Step " + (i + 1) + ": " + (typeof s.title === "string" && s.title ? shown(s.title, 120) : "Untitled step"), () => {
        this.startStudentStep(journey, i, journeyHash, journeyTitle);
      });
    }
  }

  private startStudentStep(journey: LoadedJourney, idx: number, journeyHash: string, journeyTitle: string): void {
    const step = journey.steps[idx];
    const course = typeof journey.course === "string" ? journey.course : "this course";
    const policy = JPOLICIES[String(step.ai_policy)] ?? JPOLICIES.not_applicable;
    const journeyCtx = journeyContextForStep(journey, idx, journeyHash);
    const preservations = [
      "do not redistribute outside the course without the student's consent",
      "preserve the fidelity limits if quoting or summarizing",
    ];
    if (policy.ui === "disclose") preservations.push("do not remove the AI contribution disclosure");
    this.ctx.openCreateWithJourney({
      journeyCtx,
      journeyMap: { steps: journey.steps, currentIdx: idx },
      banner:
        "Journey: " + shown(journeyTitle, 90) + " · Step " + (idx + 1) + " of " + journey.steps.length +
        ": " + shown(step.title ?? "Untitled step", 90) + " · " + policy.label + ".",
      prefill: {
        title: typeof step.title === "string" ? step.title : "",
        contentType: typeof step.content_type === "string" && step.content_type ? step.content_type : "original",
        license: "All rights reserved",
        privacyLevel: "internal",
        quarantineStatus: "quarantine",
        contribution1: "Wrote all prose in this submission.",
        role1: "student_author",
        rights1: true,
        goodFaith: true,
        // step.title is unchecked journey data; concatenating an object would throw.
        represents: 'a submission for "' + (typeof step.title === "string" && step.title ? step.title : "this step") + '" (' + course + ")",
        trustAs: "the student's own work at submission time",
        doNotInfer: [
          "that this represents the student's final or settled view",
          "that claims are fully researched or cited unless the work explicitly does so",
          "that AI contributed beyond anything disclosed in attribution",
        ].join("\n"),
        permitted: ["instructor review and grading", "student's own reference and future use"].join("\n"),
        preservations: preservations.join("\n"),
        consentNote: "This is student work submitted under course privacy expectations. FERPA applies.",
      },
    });
    this.pickerBox.addClass("ks-hidden");
  }
}
