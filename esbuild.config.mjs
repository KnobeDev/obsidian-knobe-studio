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

// The Teaching Studio plugin reuses the same stylesheet (same tokens and
// classes); keep its copy in sync on every build.
const syncInstructorStyles = () => copyFileSync("styles.css", "instructor-plugin/styles.css");

// Two separately installed plugins built from one repo. Studio does not embed
// or install Teaching Studio; each ships as its own release zip.
//   src/main.ts            -> main.js                     (KNOBE Studio)
//   src/instructor-main.ts -> instructor-plugin/main.js   (KNOBE Teaching Studio)
const instructorTarget = { entryPoints: ["src/instructor-main.ts"], outfile: "instructor-plugin/main.js" };
const mainTarget = { entryPoints: ["src/main.ts"], outfile: "main.js" };

if (prod) {
  await esbuild.build({ ...shared, ...instructorTarget });
  syncInstructorStyles();
  await esbuild.build({ ...shared, ...mainTarget });
  process.exit(0);
} else {
  // Watch mode: re-copy the stylesheet after each Teaching Studio rebuild.
  syncInstructorStyles();
  const instructorCtx = await esbuild.context({
    ...shared,
    ...instructorTarget,
    plugins: [
      {
        name: "sync-instructor-styles",
        setup(build) {
          build.onEnd((result) => {
            if (!result.errors.length) syncInstructorStyles();
          });
        },
      },
    ],
  });
  const mainCtx = await esbuild.context({ ...shared, ...mainTarget });
  await instructorCtx.watch();
  await mainCtx.watch();
}
