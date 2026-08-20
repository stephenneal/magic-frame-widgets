#!/usr/bin/env node
/**
 * Builds every widget under src/<name>/widget.ts into build/<name>/.
 * Usage: node scripts/build-all.mjs
 */
import { readdirSync, statSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const srcDir = path.join(root, "src", "widgets");
const buildScript = path.join(root, "scripts", "build-module.mjs");

const widgets = readdirSync(srcDir).filter((name) =>
  statSync(path.join(srcDir, name)).isDirectory()
);

if (widgets.length === 0) {
  console.error("No widgets found under src/.");
  process.exit(1);
}

let failed = 0;

for (const widget of widgets) {
  const entry = path.join(srcDir, widget, "widget.ts");
  if (!existsSync(entry)) {
    console.warn(`⚠ Skipping ${widget}: no widget.ts found`);
    continue;
  }
  const outDir = path.join(root, "build", widget);
  console.log(`\n— Building ${widget} —`);
  const result = spawnSync("node", [buildScript, entry, outDir], {
    stdio: "inherit",
  });
  if (result.status !== 0) failed++;
}

if (failed > 0) {
  console.error(`\n${failed} widget(s) failed to build.`);
  process.exit(1);
}
console.log(`\nAll ${widgets.length} widget(s) built successfully.`);
