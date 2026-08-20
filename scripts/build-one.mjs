#!/usr/bin/env node
/**
 * Builds a single widget by name: src/<name>/widget.ts -> build/<name>/.
 * Usage: node scripts/build-one.mjs <widget-name>
 */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const widget = process.argv[2];
if (!widget) {
  console.error("Usage: node scripts/build-one.mjs <widget-name>");
  process.exit(1);
}

const entry = path.join(root, "src", "widgets", widget, "widget.ts");
if (!existsSync(entry)) {
  console.error(`No widget.ts found at src/widgets/${widget}/widget.ts`);
  process.exit(1);
}

const outDir = path.join(root, "build", widget);
const buildScript = path.join(root, "scripts", "build-module.mjs");

const result = spawnSync("node", [buildScript, entry, outDir], {
  stdio: "inherit",
});
process.exit(result.status ?? 1);
