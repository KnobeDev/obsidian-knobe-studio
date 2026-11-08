import esbuild from "esbuild";
import process from "node:process";
import { builtinModules } from "node:module";

const prod = process.argv[2] === "production";

// One plugin: src/main.ts -> main.js (KNOBE Studio, including the Teaching
// Studio dashboard view).
const options = {
  entryPoints: ["src/main.ts"],
  outfile: "main.js",
  bundle: true,
  external: ["obsidian", "electron", "@codemirror/*", ...builtinModules],
  format: "cjs",
  target: "es2020",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
};

if (prod) {
  await esbuild.build(options);
  process.exit(0);
} else {
  const ctx = await esbuild.context(options);
  await ctx.watch();
}
