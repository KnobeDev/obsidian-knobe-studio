# KNOBE Instructor Studio

The educator dashboard for [KNOBE Studio](https://github.com/KnobeDev/obsidian-knobe-studio) — a separate, installable Obsidian plugin (id `knobe-instructor-studio`).

It gathers the semester workflow into one place: a role-based guide (Instructor · Student · TA/grader · Accessibility) where each path opens the matching tool in KNOBE Studio with one click, plus a teaching kit that seals a ready-to-use example journey, and a **demo / presentation mode** that confines all file access to a sandbox folder so real student records (FERPA) and health information (HIPAA) can't appear on a projector.

**It requires the KNOBE Studio plugin** — it holds no tools of its own, reaching Studio through a small public API for deep-links, shared demo state, and the save folder. If KNOBE Studio isn't enabled, the dashboard shows a "requires KNOBE Studio" message.

## Install

This plugin is built from the same repo as KNOBE Studio. See the **[main README's Installing section](../README.md#installing)** for step-by-step manual, BRAT, build-from-source, and AI-desktop instructions. In short: put this folder's `manifest.json`, `main.js`, and `styles.css` into `<vault>/.obsidian/plugins/knobe-instructor-studio/`, install **KNOBE Studio** too, and enable both.

## License

MIT. See the [main repository](https://github.com/KnobeDev/obsidian-knobe-studio) for full license and attribution details.
