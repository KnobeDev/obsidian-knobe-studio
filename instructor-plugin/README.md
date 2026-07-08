# KNOBE Teaching Studio

The teaching dashboard for [KNOBE Studio](https://github.com/KnobeDev/obsidian-knobe-studio) — a separate Obsidian plugin (id `knobe-teaching-studio`) that teaches you the app.

It gathers the whole workflow into one guided place: a role-based guide (Instructor · Student · TA/grader · Accessibility) where each path shows who does what, when, and opens the matching tool in KNOBE Studio with one click, plus a teaching kit that seals a ready-to-use example journey, and a **demo / presentation mode** that confines all file access to a sandbox folder so real student records (FERPA) and health information (HIPAA) can't appear on a projector.

**It requires the KNOBE Studio plugin** — it holds no tools of its own, reaching Studio through a small public API for deep-links, shared demo state, and the save folder. If KNOBE Studio isn't enabled, the dashboard shows a "requires KNOBE Studio" message.

## Install

You don't install this plugin directly: it ships inside KNOBE Studio, which unpacks it into `<vault>/.obsidian/plugins/knobe-teaching-studio/` and enables it on first load — toggle it off in Community plugins once you know the workflow. See the **[main README's Installing section](../README.md#installing)** for the BRAT, AI-desktop, manual, and build-from-source routes. (To place it by hand anyway: copy this folder's `manifest.json`, `main.js`, and `styles.css` into that plugins path.)

## License

MIT. See the [main repository](https://github.com/KnobeDev/obsidian-knobe-studio) for full license and attribution details.
