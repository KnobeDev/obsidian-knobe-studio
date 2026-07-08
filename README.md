# KNOBE Studio for Obsidian

The [KNOBE Studio](https://knobe.org/studio/) workbench, rebuilt as an Obsidian dashboard. Create, verify, and transform sealed KNOBE Protocol v1 knowledge objects without leaving your vault — no upload, no server, no account.

A KNOBE is a single markdown file with three layers: YAML frontmatter you can scan, a markdown body you can read anywhere, and a Base64 JSON payload that records attribution, transformation history, fidelity limits, use conditions, and a SHA-256 integrity hash. This plugin brings the full Studio to your vault.

## The dashboard

Open it from the ribbon (stamp icon) or the command palette: **KNOBE Studio: Open Studio dashboard**. Six tools, one workbench:

| Tab | What it does |
|-----|--------------|
| **Create** | Seal new content into a `.knobe.md` knowledge object. Start blank, from a template (instructor reading, student reflection, research transcript, enterprise summary), or from the active note. A Markdown toolbar (headings, bold/italic, lists, links, quotes, code) formats the body without memorizing syntax. Live preview shows the exact file the Seal button produces. |
| **Verify** | Check whether a sealed record is intact: integrity state, body verification, and spec conformance, with the full report rendered in-panel. |
| **Transform** | Derive a new object from a verified original. The derivative declares its parent by payload hash, and the sealed `use_conditions` are evaluated (`permits("transform")`) before you start. |
| **Journey** | Instructors design assignment sequences: each step records who seals it, the kind of work, its AI policy, and what it builds on. Steps sealed through Create flow their hashes back into the journey. Students load a journey to start a step with context, fidelity limits, and FERPA-aware use conditions pre-filled. |
| **Cohort check** | Batch-verify a vault folder of submissions. Anomalies sort to the top: broken seals and files with no chain link to the loaded journey/assignment. View the lineage between submissions and export CSV. |
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

### ZIP hardening

The ZIP reader is dependency-free and hardened against hostile archives:

- Entries are read **in memory only** — never extracted to disk under their archive names, which eliminates zip-slip as a write primitive; display names are additionally sanitized.
- Zip-bomb guards: per-file (10 MB), whole-archive (100 MB), entry-count (2000), and decompression **work-budget** caps; entries whose data inflates past their declared size are dropped as tampered.
- Encrypted entries, exotic compression methods, and ZIP64 archives are skipped/rejected with a stated reason; images, `__MACOSX/`, and other junk are ignored.
- Anything skipped is reported, never silently dropped.

## Teaching Studio (the bundled guide plugin)

The teaching dashboard ships as its **own plugin**, `knobe-teaching-studio`, in the [`instructor-plugin/`](instructor-plugin/) folder — built from this same repo. It teaches you the app: a role-based guide (Instructor · Student · TA/grader · Accessibility) mirroring knobe.org/teaching, where each path lists "who does what, when" and opens the matching KNOBE Studio tool with one click. It has its own ribbon icon (graduation cap) and command **Open Teaching Studio dashboard**.

**It requires the KNOBE Studio plugin.** The Teaching Studio holds no tools of its own — it reaches Studio through a small public API (`knobeApi`) for deep-links, shared demo state, and the save folder, so there is exactly one source of truth and no duplicated tools. If KNOBE Studio isn't enabled, the dashboard shows a "requires KNOBE Studio" message instead of failing.

There's nothing extra to install or turn on: KNOBE Studio bundles it, unpacks it into `<vault>/.obsidian/plugins/knobe-teaching-studio/` on first load, and enables it — it's the tool that teaches the rest. Once you know the workflow, toggle **KNOBE Teaching Studio** off in Community plugins (or remove it) and it stays off.

It also carries a **teaching kit**: one click seals a ready-to-use four-step example journey (prompt → reading → draft → revision, with per-step AI policies) into your output folder, so you can start from a working sequence instead of a blank Journey maker.

### Demo / presentation mode (FERPA / HIPAA-safe)

When you screen-share the dashboards to students, you don't want the file pickers listing real submissions or any other sensitive vault content. **Demo mode** (toggle in the Teaching Studio's "Presenting to students" card, in settings, or via the *Toggle demo / presentation mode* command) confines **every** vault touchpoint to a single sandbox folder (`demoFolder`, default `KNOBE/Demo`):

- File and folder pickers only list items inside the sandbox.
- Saves (sealed files, cohort CSV, example journey) go to the sandbox.
- "Use active note" / "Start from active note" / "Add active note" refuse a note outside the sandbox.
- The file-menu **Verify in KNOBE Studio** and the *Verify current note* command refuse out-of-sandbox files.
- A persistent banner in both dashboards shows the mode is on.

**Set up demo sandbox** seals a demo journey plus two clearly-synthetic submissions (Sample Student A / B — one chained to the journey, one deliberately unlinked to show a cohort-check anomaly) into the sandbox and turns demo mode on, giving you a complete lifecycle to walk through with no real data on screen.

Demo mode narrows what the dashboards can *see*; it never deletes or moves anything. KNOBE records interpretive context and integrity — it is not a compliance certification and does not enforce access control, so store real records per your institution's policy.

## Engine

Verification and sealing run on `knobe-core.js`, the official KNOBE Protocol v1 JavaScript engine from [knobe.org](https://knobe.org), vendored verbatim (Apache-2.0). The test suite confirms it reproduces all nine official test-vector verdicts, plus round-trip create → verify → transform → adapt chains. A verified result confirms integrity, not truth.

## Installing

**You only ever install one thing: KNOBE Studio.** The Teaching Studio (the guide that teaches you the app) is bundled inside it and installs itself as a second plugin, **enabled by default** so the guide is there on first launch. Both live in **Settings → Community plugins** behind normal toggles:

| Toggle | What it turns on | Default |
|--------|------------------|---------|
| **KNOBE Studio** | the six-tab workbench | you enable it once |
| **KNOBE Teaching Studio** | the guide dashboard (needs KNOBE Studio on) | on — toggle off when you know the ropes |

Turning the Teaching Studio off or removing it sticks — Studio won't re-add or re-enable it. The **Reinstall** button in Studio's settings brings it back.

Two easy ways in. Pick whichever fits how you work:

### Easy way 1 — BRAT (in-app, auto-updating)

1. In Obsidian, install and enable **BRAT** from Community plugins (search "BRAT").
2. Open BRAT's settings → **Add Beta plugin** → paste:
   ```
   https://github.com/KnobeDev/obsidian-knobe-studio
   ```
3. In **Settings → Community plugins**, toggle on **KNOBE Studio**. It brings the **KNOBE Teaching Studio** along, already enabled.

BRAT keeps KNOBE Studio updated, and each update carries the matching Teaching Studio with it. Done.

### Easy way 2 — Ask your AI desktop

If you use an agentic AI assistant with access to your machine — **Claude Desktop, Claude Code, Antigravity, Codex**, or similar — paste this and swap in your vault path:

> Download `knobe-studio.zip` from the latest release at https://github.com/KnobeDev/obsidian-knobe-studio/releases and unzip it into `<PATH-TO-YOUR-VAULT>/.obsidian/plugins/` (creating the folder `knobe-studio/` with `manifest.json`, `main.js`, `styles.css` inside). Then restart Obsidian and tell me how to enable it.

That's the entire job — one zip, no build tools, no Node. When Obsidian reopens, toggle on **KNOBE Studio** in **Settings → Community plugins** (the AI can often do this too by adding `"knobe-studio"` to `.obsidian/community-plugins.json` while Obsidian is closed). On first load, Studio installs and enables **KNOBE Teaching Studio** next to itself — the graduation-cap ribbon icon walks you through the workflow, and you can toggle it off there once you don't need it.

### Manual install (no tools at all)

The same thing your AI would do, by hand:

1. On the **[Releases](https://github.com/KnobeDev/obsidian-knobe-studio/releases)** page, download **`knobe-studio.zip`** from the latest release's Assets. It's the only file you need. (`knobe-teaching-studio.zip` is still published for anyone placing that plugin by hand.)
2. Find your vault's plugins folder: in Obsidian, **Settings → Community plugins → Installed plugins → the folder icon** opens `<vault>/.obsidian/plugins/`. (`.obsidian` is hidden; enable "show hidden files" if you navigate there yourself.)
3. Unzip *into* that folder, so you end up with:
   ```
   <vault>/.obsidian/plugins/
     └─ knobe-studio/            (manifest.json, main.js, styles.css)
   ```
4. Back in **Settings → Community plugins**: turn off "Restricted mode" if it's on, click the **reload/refresh** icon (or restart Obsidian), and toggle **KNOBE Studio** on. It installs and enables **KNOBE Teaching Studio** alongside itself (toggle it off there whenever you like).
5. Look for the ribbon icons in the left gutter: a **stamp** (Studio) and a **graduation cap** (Teaching Studio).

### Build from source (developers)

```bash
git clone https://github.com/KnobeDev/obsidian-knobe-studio.git
cd obsidian-knobe-studio
npm install && npm run build
```

This produces `main.js` (Studio, with the built Teaching Studio embedded) and `instructor-plugin/main.js` (Teaching Studio standalone). Copy `manifest.json` + `main.js` + `styles.css` into `<vault>/.obsidian/plugins/knobe-studio/` — the Teaching Studio installs itself from there — or symlink the folders for live development:

```bash
ln -s "$(pwd)" "<vault>/.obsidian/plugins/knobe-studio"
ln -s "$(pwd)/instructor-plugin" "<vault>/.obsidian/plugins/knobe-teaching-studio"
```

Then enable both in Community plugins.

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

## Development

```bash
npm run dev     # watch build (both plugins)
npm test        # vitest: engine vectors + studio-core + demo-scope logic
npm run build   # type-check + production build of both plugins
```

The build produces two plugins from one repo: `main.js` (KNOBE Studio, from `src/main.ts`) and `instructor-plugin/main.js` (KNOBE Teaching Studio, from `src/instructor-main.ts`), with `instructor-plugin/styles.css` kept in sync automatically.

## License

Plugin code: MIT. Vendored `src/engine/knobe-core.js`: Apache-2.0, © the KNOBE Protocol project. Test vectors: CC0-1.0 (David Kyle, UC Davis). See [knobe.org](https://knobe.org) for the protocol specification and threat model.
