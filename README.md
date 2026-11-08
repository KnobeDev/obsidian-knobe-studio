# KNOBE Studio (KnobeDev)

An Obsidian dashboard modeled on the steward's browser workbench, [KNOBE Studio](https://knobe.org/studio/). Create, verify, and transform sealed KNOBE Protocol v1 knowledge objects without leaving your vault — no upload, no server, no account.

KnobeDev (Joshua Hori) maintains this plugin. It is not the steward's knobe.org/studio and not an official KNOBE Protocol project. Every verdict and seal comes from the protocol's own `knobe-core.js`, called unmodified (see [Engine](#engine)).

A KNOBE is a single markdown file with three layers: YAML frontmatter you can scan, a markdown body you can read anywhere, and a Base64 JSON payload that records attribution, transformation history, fidelity limits, use conditions, and a SHA-256 integrity hash. This plugin brings the full Studio to your vault.

## The dashboard

Open it from the ribbon (stamp icon) or the command palette: **KNOBE Studio: Open Studio dashboard**. Six tools, one workbench:

| Tab | What it does |
|-----|--------------|
| **Create** | Seal new content into a `.knobe.md` knowledge object. Start blank, from a template (instructor reading, student reflection, research transcript, enterprise summary), or from the active note. A Markdown toolbar (headings, bold/italic, lists, links, quotes, code) formats the body without memorizing syntax. Live preview shows the exact file the Seal button produces. |
| **Verify** | Check whether a sealed record is intact: integrity state, body verification, and spec conformance, with the full report rendered in-panel. |
| **Transform** | Derive a new object from a verified original. The derivative declares its parent by payload hash, and the sealed `use_conditions` are evaluated (`permits("transform")`) before you start. |
| **Journey** | Instructors design assignment sequences: each step records who seals it, the kind of work, its AI policy, and what it builds on. Steps sealed through Create flow their hashes back into the journey. A **journey map** draws the sequence (who seals each step, its AI policy, what it builds on, which steps are hash-anchored) and marks "You are here" while you work a step. Students load a journey to start a step with context, fidelity limits, and use conditions pre-filled, including an internal privacy level and a consent note. |
| **Cohort check** | Batch-verify a vault folder of submissions. Anomalies sort to the top: broken seals and files with no chain link to the loaded journey/assignment. View the lineage between submissions and export CSV. **Seal a cohort receipt**: one sealed file attesting which files (by payload hash) produced which verdicts at seal time; student names are left out, and anchoring its single hash anywhere with an independent timestamp timestamps every listed submission. |
| **Adapt** | Create accessibility adaptations — plain language, translation, transcript/captions, alt-text, multimodal — sealed with lineage (`adaptation_of` + `accessibility` record) bound to the source by hash. |

## Course folder hierarchy

Course work files itself: **Term is the top-level folder, course the sub-level** — `KNOBE/Fall 2026/HIS 101/…`. Sealing a journey saves it under its term/course, and any work sealed *from* that journey (instructor step specs, student submissions) inherits the same destination. Term and course names are sanitized into single folder segments, and in demo mode the hierarchy nests inside the sandbox, so the confinement guarantee is unchanged. Files sealed with no course context (plain Create, Transform, Adapt) land in the output folder root as before.

## Vault-native by design

Where the browser Studio downloads files, this plugin saves them into your vault (configurable output folder, `*.knobe.md` naming preserved, never overwrites). Where the browser drops files onto the page, the dashboard reads your **active note**, a **vault picker**, or **pasted text**. Cohort check scans a vault folder recursively.

Extra commands:

- **Verify current note in Studio** (also on the file context menu)
- **Seal current note** (opens Create)
- **Cohort check a folder**

## Importing files (LMS / Notion / Overleaf exports)

Submissions rarely start life in your vault, so both Verify and Cohort read from anywhere:

- **A vault folder** — the folder picker (Cohort).
- **Files or a folder on disk** — "Add files from disk…" / "Add a folder from disk…" (Cohort) and "Verify a file from disk…" (Verify), for exports that haven't been filed into the vault yet.
- **A ZIP** — "Add a ZIP…" / "Verify from a ZIP…", for LMS bulk downloads and Notion/Overleaf archives.

**What counts as importable:** KNOBE seals and verifies *text*, so any text-based format is read directly with no conversion — Markdown (Notion, Obsidian, general), LaTeX source (`.tex`, Overleaf), HTML exports, plain text, CSV, and other lightweight-markup formats. **Binary documents (`.docx`, `.pdf`, `.pptx`, …) are not text** and must be converted to Markdown/text first (Pandoc, LibreOffice, and similar) — KNOBE is a text-integrity tool, not a document converter, so it deliberately ships no importer for binaries. When you add a folder or ZIP, binary files are skipped with a "convert first" note rather than silently ignored.

### Privacy: no network, and files outside the vault only when you pick them

- **No network use.** Sealing, verification, and every other feature run locally. The plugin makes no network requests, has no telemetry, and needs no account.
- **Files outside your vault.** "Add files from disk…", "Add a folder from disk…" (Cohort), and "Verify a file from disk…" (Verify) open your operating system's file or folder picker so you can check exports that aren't in the vault yet. The plugin reads only the files you choose, in memory, and never writes outside the vault; anything you seal or export is saved inside your vault.

### ZIP hardening

The ZIP reader is dependency-free and hardened against hostile archives:

- Entries are read **in memory only** — never extracted to disk under their archive names, which eliminates zip-slip as a write primitive; display names are additionally sanitized.
- Zip-bomb guards: per-file (10 MB), whole-archive (100 MB), entry-count (2000), and decompression **work-budget** caps; entries whose data inflates past their declared size are dropped as tampered.
- Encrypted entries, exotic compression methods, and ZIP64 archives are skipped/rejected with a stated reason; images, `__MACOSX/`, and other junk are ignored.
- Anything skipped is reported, never silently dropped.

## Teaching Studio (the built-in guide)

KNOBE Studio includes a second dashboard, the **Teaching Studio**, that teaches you the app: a role-based guide (Instructor · Student · TA/grader · Accessibility) mirroring knobe.org/teaching, where each path lists "who does what, when" and opens the matching Studio tool with one click. Once it's on, open it from the ribbon (graduation cap) or the command **Open Teaching Studio dashboard**.

It starts **off**. Turn it on with the **Turn on and open Teaching Studio** button on the Studio dashboard or the **Teaching Studio dashboard** setting; turning it off again removes its ribbon button and command and closes its tab. The Teaching Studio holds no tools of its own; every path opens the one Studio dashboard, so there's a single source of truth.

**Upgrading from 0.3.x:** earlier versions came with the Teaching Studio as a separate plugin, *KNOBE Teaching Studio*: Studio 0.3.3 and earlier installed it for you, and 0.3.4 offered it as a separate download. It's built in now, so turn that plugin off and uninstall it in **Settings → Community plugins** (Studio shows a one-time reminder). If a blank tab is left over from the old dashboard, close it. Studio never installs, enables, or updates another plugin.

It also carries a **teaching kit**: one click seals a ready-to-use four-step example journey (prompt → reading → draft → revision, with per-step AI policies) into your output folder, so you can start from a working sequence instead of a blank Journey maker.

### Demo / presentation mode

Demo mode keeps real student data off screen while you present. When you screen-share the dashboards to students, you don't want the file pickers listing real submissions or any other sensitive vault content. **Demo mode** (toggle in the Teaching Studio's "Presenting to students" card, in settings, or via the *Toggle demo / presentation mode* command) confines **every** vault touchpoint to a single sandbox folder (`demoFolder`, default `KNOBE/Demo`):

- File and folder pickers only list items inside the sandbox.
- Saves (sealed files, cohort CSV, example journey) go to the sandbox.
- "Use active note" / "Start from active note" / "Add active note" refuse a note outside the sandbox.
- The file-menu **Verify in KNOBE Studio** and the *Verify current note* command refuse out-of-sandbox files.
- A persistent banner in both dashboards shows the mode is on.

**Set up demo sandbox** seals a demo journey plus two clearly-synthetic submissions (Sample Student A / B — one chained to the journey, one deliberately unlinked to show a cohort-check anomaly) into the sandbox and turns demo mode on, giving you a complete lifecycle to walk through with no real data on screen.

Demo mode narrows what the dashboards can *see*; it never deletes or moves anything. KNOBE records interpretive context and integrity — it is not a compliance certification and does not enforce access control, so store real records per your institution's policy.

## Engine

Verification and sealing run on `knobe-core.js`, the official KNOBE Protocol v1 JavaScript engine from [knobe.org](https://knobe.org), vendored verbatim (Apache-2.0) from [knobe-protocol](https://github.com/KnobeOne/knobe-protocol) at `8d664d3`. That copy includes the sealer's refusal of code points its Unicode tables leave unassigned ([knobe-protocol#34](https://github.com/KnobeOne/knobe-protocol/pull/34)). The plugin adds no verification logic of its own.

The test suite runs the engine over all 33 vectors in knobe-protocol's `test-vectors/` at `8d664d3` (9 core, 17 adversarial, 7 interpretation) and checks `status`, `body_verified` and `conformance` against the published README tables, plus round-trip create → verify → transform → adapt chains. CI compares the vendored engine and every bundled vector with knobe-protocol's current `main`, and fails if any byte differs. A verified result confirms integrity, not truth.

## Installing

**You install one plugin: KNOBE Studio (KnobeDev).** The Teaching Studio guide is part of it; it starts off, and you turn it on from the Studio dashboard or Studio's settings.

Two easy ways in. Pick whichever fits how you work:

### Easy way 1 — BRAT (in-app, auto-updating)

1. In Obsidian, install and enable **BRAT** from Community plugins (search "BRAT").
2. Open BRAT's settings → **Add Beta plugin** → paste:
   ```
   https://github.com/KnobeDev/obsidian-knobe-studio
   ```
3. In **Settings → Community plugins**, toggle on **KNOBE Studio (KnobeDev)**.

BRAT keeps KNOBE Studio updated. Done.

### Easy way 2 — Ask your AI desktop

If you use an agentic AI assistant with access to your machine — **Claude Desktop, Claude Code, Antigravity, Codex**, or similar — paste this and swap in your vault path:

> Download `knobe-studio.zip` from the latest release at https://github.com/KnobeDev/obsidian-knobe-studio/releases and unzip it into `<PATH-TO-YOUR-VAULT>/.obsidian/plugins/` (creating the folder `knobe-studio/` with `manifest.json`, `main.js`, `styles.css` inside). Then restart Obsidian and tell me how to enable it.

That's the entire job — one zip, no build tools, no Node. When Obsidian reopens, toggle on **KNOBE Studio (KnobeDev)** in **Settings → Community plugins** (the AI can often do this too by adding `"knobe-studio"` to `.obsidian/community-plugins.json` while Obsidian is closed). For the Teaching Studio guide, choose **Turn on and open Teaching Studio** on the Studio dashboard.

### Manual install (no tools at all)

The same thing your AI would do, by hand:

1. On the **[Releases](https://github.com/KnobeDev/obsidian-knobe-studio/releases)** page, download **`knobe-studio.zip`** from the latest release's Assets. It's the only file you need.
2. Find your vault's plugins folder: in Obsidian, **Settings → Community plugins → Installed plugins → the folder icon** opens `<vault>/.obsidian/plugins/`. (`.obsidian` is hidden; enable "show hidden files" if you navigate there yourself.)
3. Unzip *into* that folder, so you end up with:
   ```
   <vault>/.obsidian/plugins/
     └─ knobe-studio/            (manifest.json, main.js, styles.css)
   ```
4. Back in **Settings → Community plugins**: turn off "Restricted mode" if it's on, click the **reload/refresh** icon (or restart Obsidian), and toggle **KNOBE Studio (KnobeDev)** on.
5. Look for the ribbon icons in the left gutter: a **stamp** (Studio) and, once you turn the Teaching Studio on, a **graduation cap**.

### Build from source (developers)

```bash
git clone https://github.com/KnobeDev/obsidian-knobe-studio.git
cd obsidian-knobe-studio
npm install && npm run build
```

This produces `main.js`. Copy `manifest.json` + `main.js` + `styles.css` into `<vault>/.obsidian/plugins/knobe-studio/`, or symlink the folder for live development:

```bash
ln -s "$(pwd)" "<vault>/.obsidian/plugins/knobe-studio"
```

Then enable it in Community plugins.

## Themes

The dashboard ships two designed themes built from knobe.org's own palette, both WCAG 2.1 AA contrast-verified:

- **Archival paper (light)** — warm paper surfaces, deep green ink, moss seals
- **Night grove (dark)** — pine-black surfaces, paper-tinted ink, lit moss accents

By default the Studio follows Obsidian's theme; the **Appearance** setting can pin either theme regardless of what the rest of the vault looks like.

## Settings

- **Appearance** — follow Obsidian, or force archival paper / night grove
- **Output folder** — where sealed files land (default `KNOBE`)
- **Default author** — prefills Create and Adapt
- **Default license** — prefills when a template doesn't set one
- **Open sealed files** — open each sealed file after saving
- **Demo folder** and **Demo / presentation mode** — see [Demo / presentation mode](#demo--presentation-mode)
- **Teaching Studio dashboard** — turn the built-in guide on or off (off until you turn it on)

## Development

```bash
npm run dev     # watch build
npm test        # vitest: engine vectors + studio-core + demo-scope logic
npm run build   # production build + type-check
```

## License

Plugin code: MIT. Vendored `src/engine/knobe-core.js`: Apache-2.0, © the KNOBE Protocol project; the license text is in [`src/engine/LICENSE`](src/engine/LICENSE). Test vectors: CC0-1.0 (David Kyle, UC Davis). See [knobe.org](https://knobe.org) for the protocol specification and threat model.
