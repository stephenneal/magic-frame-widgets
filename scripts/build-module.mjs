#!/usr/bin/env node
/**
 * Magic-Dashboard Custom-Module Builder
 *
 * Usage:
 *   node scripts/build-module.mjs <source.js|.tsx> [out-dir]
 *
 * Erwartet ein Modul-File mit:
 *   - default export der `render(ctx)`-Funktion (oder ein Objekt mit render+manifest)
 *   - optional ein named export `manifest` mit Modul-Metadaten
 *
 * Liefert:
 *   <out-dir>/module.json    — Manifest
 *   <out-dir>/bundle.js      — IIFE-Bundle das gegen window.MagicFrame.registerWidget() callt
 *   <out-dir>/<type>.zip     — beides zusammen, hochladbar in der UI
 *
 * Beispiel-Modul:
 *
 *   // hello-widget.js
 *   export const manifest = {
 *     type: "hello",
 *     label: "Hallo-Welt",
 *     iconEmoji: "👋",
 *     fields: [{ key: "name", label: "Name", type: "text", default: "Welt" }],
 *   };
 *   export default function render(ctx) {
 *     const h = ctx.createElement;
 *     const name = ctx.config.name || "Welt";
 *     return h("div", { className: "w-full h-full flex items-center justify-center text-[1.5em] font-bold" },
 *       `Hallo, ${name}!`);
 *   }
 */
import { build } from "esbuild";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createWriteStream } from "node:fs";
import { createGzip } from "node:zlib";

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: build-module.mjs <source.js|.tsx> [out-dir]");
  process.exit(1);
}
const srcPath = path.resolve(args[0]);
const outDir = path.resolve(args[1] ?? "dist-module");

if (!existsSync(srcPath)) {
  console.error(`Source-File nicht gefunden: ${srcPath}`);
  process.exit(1);
}

// 1) Modul kompilieren — IIFE-Bundle, das die Default-Function gegen
//    window.MagicFrame.registerWidget meldet. Wir bauen einen kleinen Wrapper
//    der das Source-File importiert (esbuild inlined das), das Manifest +
//    die render-Funktion extrahiert und registriert.
const wrapperSrc = `
import * as Mod from ${JSON.stringify(srcPath)};

(function () {
  if (typeof window === "undefined" || !window.MagicFrame) {
    console.warn("[CustomModule] window.MagicFrame fehlt — Modul wird ignoriert.");
    return;
  }
  var manifest = Mod.manifest || (Mod.default && Mod.default.manifest);
  var render = (typeof Mod.default === "function") ? Mod.default : (Mod.default && Mod.default.render);
  if (!manifest || !render) {
    console.warn("[CustomModule] Modul exportiert kein manifest + render — bitte 'export const manifest' und 'export default function(...)' setzen.");
    return;
  }
  var type = String(manifest.type || "").trim();
  if (!type) {
    console.warn("[CustomModule] Manifest hat keinen type.");
    return;
  }
  if (!type.startsWith("custom:")) type = "custom:" + type;
  window.MagicFrame.registerWidget({ type: type, render: render });
})();
`;

// esbuild braucht ein "stdin" Eintrag — wir geben ihm den Wrapper als String,
// und es findet die echte Modul-Datei via dem import oben.
const result = await build({
  stdin: {
    contents: wrapperSrc,
    resolveDir: path.dirname(srcPath),
    sourcefile: "magic-module-entry.js",
    loader: "ts",
  },
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["es2020"],
  minify: true,
  loader: { ".ts": "ts", ".tsx": "tsx", ".js": "jsx", ".jsx": "jsx" },
  jsx: "automatic",
  // React/ReactDOM sind im Host vorhanden — nicht ins Bundle ziehen,
  // sondern aus ctx.createElement nutzen. Wer React-JSX nutzt, muss
  // sicherstellen dass JSX-Runtime auf das ctx-API zeigt (siehe Doku).
  write: false,
});

if (!result.outputFiles || result.outputFiles.length === 0) {
  console.error("Build hat keine Output-Files produziert.");
  process.exit(1);
}
const bundleJs = result.outputFiles[0].text;

// 2) Manifest aus dem Source extrahieren — wir kompilieren ein zweites Mal,
//    diesmal als CommonJS, eval'en es und lesen das Manifest aus.
const manifestExtract = await build({
  stdin: {
    contents: `import * as Mod from ${JSON.stringify(srcPath)}; export const manifest = Mod.manifest || (Mod.default && Mod.default.manifest) || null;`,
    resolveDir: path.dirname(srcPath),
    sourcefile: "magic-manifest-extract.js",
    loader: "ts",
  },
  bundle: true,
  format: "cjs",
  platform: "node",
  target: ["es2020"],
  loader: { ".ts": "ts", ".tsx": "tsx" },
  jsx: "automatic",
  write: false,
});
const manifestCjs = manifestExtract.outputFiles[0].text;
const exports = {};
const mod = { exports };
// eslint-disable-next-line no-new-func
new Function("module", "exports", manifestCjs)(mod, exports);
const manifest = mod.exports.manifest;
if (!manifest) {
  console.error("Konnte `manifest` nicht aus dem Source extrahieren — bitte 'export const manifest = { type, label, ... }' setzen.");
  process.exit(1);
}

// Sanity-Check der Felder
if (typeof manifest.type !== "string" || !manifest.type) {
  console.error("Manifest braucht ein nicht-leeres `type`.");
  process.exit(1);
}
if (typeof manifest.label !== "string" || !manifest.label) {
  console.error("Manifest braucht ein nicht-leeres `label`.");
  process.exit(1);
}

// 3) Outputs schreiben
await mkdir(outDir, { recursive: true });
const manifestOut = path.join(outDir, "module.json");
const bundleOut = path.join(outDir, "bundle.js");
await writeFile(manifestOut, JSON.stringify(manifest, null, 2), "utf-8");
await writeFile(bundleOut, bundleJs, "utf-8");

// 4) Tarball für Upload (statt ZIP — Node hat tar nicht built-in aber wir
//    schreiben einfach beide Files separat; die Upload-UI nimmt eh einzelne Files)
const typeSafe = manifest.type.replace(/[^a-z0-9_-]/gi, "_");
console.log("");
console.log("✓ Modul gebaut:");
console.log("   Manifest: " + manifestOut);
console.log("   Bundle:   " + bundleOut + " (" + bundleJs.length + " bytes)");
console.log("");
console.log("Upload via Settings → Module → 'Modul hochladen' (beide Files auswählen)");
console.log("oder via API:");
console.log("   curl -X POST http://localhost/api/admin/modules \\");
console.log("        -H 'Content-Type: application/json' \\");
console.log("        --cookie 'magic_session=...' \\");
console.log("        -d @<(jq -n --arg js \"$(cat " + bundleOut + ")\" --argjson m \"$(cat " + manifestOut + ")\" '{manifest:$m, bundleJs:$js}')");
console.log("");
console.log("Type-ID: " + (manifest.type.startsWith("custom:") ? manifest.type : "custom:" + manifest.type));
