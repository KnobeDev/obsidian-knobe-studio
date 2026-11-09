# KNOBE Teaching Studio (KnobeDev)

The teaching dashboard for [KNOBE Studio (KnobeDev)](https://github.com/KnobeDev/obsidian-knobe-studio) — a separate Obsidian plugin (id `knobe-teaching-studio`) that teaches you the app. KnobeDev (Joshua Hori) maintains it; it is not an official KNOBE Protocol project.

It gathers the whole workflow into one guided place: a role-based guide (Instructor · Student · TA/grader · Accessibility) where each path shows who does what, when, and opens the matching tool in KNOBE Studio with one click, plus a teaching kit that seals a ready-to-use example journey, and a **demo / presentation mode** that keeps real student data off screen: it confines all file access to a sandbox folder while you present.

**It requires the KNOBE Studio plugin** — it holds no tools of its own, reaching Studio through a small public API for deep-links, shared demo state, and the save folder. If KNOBE Studio isn't enabled, the dashboard shows a "requires KNOBE Studio" message.

## Install

Install it separately from KNOBE Studio: download `knobe-teaching-studio.zip` from the [latest release](https://github.com/KnobeDev/obsidian-knobe-studio/releases/latest) and unzip it into `<vault>/.obsidian/plugins/`, so you get `knobe-teaching-studio/` with `manifest.json`, `main.js` and `styles.css` inside. Then enable **KNOBE Teaching Studio (KnobeDev)** in Settings → Community plugins. KNOBE Studio does not install, enable or update it. See the **[main README's Installing section](../README.md#installing)** for the AI-desktop, manual and build-from-source routes.

## License

MIT. See the [main repository](https://github.com/KnobeDev/obsidian-knobe-studio) for full license and attribution details.
