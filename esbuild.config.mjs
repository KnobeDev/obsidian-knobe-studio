import esbuild from "esbuild";
import process from "node:process";
import { copyFileSync } from "node:fs";
import builtins from "builtin-modules";

const prod = process.argv[2] === "production";

const shared = {
  bundle: true,
  external: ["obsidian", "electron", "@codemirror/*", ...builtins],
  format: "cjs",
  target: "es2020",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
};

// The Instructor Studio plugin reuses the same stylesheet (same tokens and
// classes); keep its copy in sync on every build.
const syncInstructorStyles = () => copyFileSync("styles.css", "instructor-plugin/styles.css");

// Two independently-installable plugins built from one repo:
//   src/main.ts            -> main.js                     (KNOBE Studio)
//   src/instructor-main.ts -> instructor-plugin/main.js   (KNOBE Instructor Studio)
const targets = [
  { entryPoints: ["src/main.ts"], outfile: "main.js" },
  { entryPoints: ["src/instructor-main.ts"], outfile: "instructor-plugin/main.js" },
];

if (prod) {
  for (const t of targets) await esbuild.build({ ...shared, ...t });
  syncInstructorStyles();
  process.exit(0);
} else {
  syncInstructorStyles();
  for (const t of targets) {
    const ctx = await esbuild.context({ ...shared, ...t });
    await ctx.watch();
  }
}
