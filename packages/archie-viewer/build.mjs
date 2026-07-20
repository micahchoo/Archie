// Build the single self-contained <archie-viewer> bundle for jsDelivr (canvas-panel dist/bundle.js
// style): one ESM file the host drops in via `<script type="module" src="…/bundle.js">`, after which
// `<archie-viewer>` is registered (index.ts side-effect). OSD is bundled IN (the embed must be
// self-contained — a CDN consumer has no build step). The deep-zoom reader is dynamic-imported in
// element.ts, so esbuild emits it as a SEPARATE async chunk → the gallery path doesn't ship OSD until
// an object is opened (code-splitting requires `splitting: true` + an outdir).
//
// `--check` compares the bundle's gz size against the stored baseline (docs/bundle-size.json sibling),
// failing on growth > max(10%, 10KB) — the same ratchet shape as scripts/bundle-size.mjs.
//
// DEFERRED (named, not silently dropped): (1) the live strict-CSP browser smoke run — asserting the
// bundle registers + renders under `script-src 'self'` (no unsafe-eval) in a real webview — is a
// Phase-1 manual/playwright gate, not a node build step. (2) the two-bundle editor/read split (a
// separate authoring bundle) stays out of scope; this is the READ bundle only (ADR-0019).

import { gzipSync } from "node:zlib";
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire as makeRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTDIR = join(__dirname, "dist");
const BASELINE = join(__dirname, "bundle-size.json");

// esbuild is a DECLARED devDep of this package, so the compiler is a lockfile-pinned build input —
// not whatever the pnpm store happens to sort last. This used to scan node_modules/.pnpm and take
// `.sort().pop()`, which is LEXICOGRAPHIC, not semver ("0.9.0" > "0.27.7", "0.25.9" > "0.25.12"):
// the compiler for a committed, CDN-published artifact was picked by string sort over an ambient
// directory. scripts/bundle-size.mjs keeps that scan deliberately — any esbuild measures, and its
// ratchet compares only vite-built app dists — but here the compiler's output IS the shipped bytes.
// Range is ^0.27.3 to match astro's own declared range, so this stays deduped with astro/vite rather
// than orphaning a second store entry; bounded (caret-on-0.x = <0.28.0) per the undici-8 lesson.
const require = makeRequire(import.meta.url);
const esbuild = require("esbuild");

function gzKB(bytes) {
  return +(gzipSync(Buffer.from(bytes)).length / 1024).toFixed(1);
}
function rawKB(bytes) {
  return +(bytes.length / 1024).toFixed(1);
}

async function build() {
  rmSync(OUTDIR, { recursive: true, force: true });
  mkdirSync(OUTDIR, { recursive: true });
  const result = await esbuild.build({
    entryPoints: [join(__dirname, "src", "index.ts")],
    bundle: true,
    minify: true,
    format: "esm",
    splitting: true, // emit the lazy reader (OSD) as a separate async chunk
    platform: "browser",
    outdir: OUTDIR,
    entryNames: "archie-viewer",
    metafile: true,
    logLevel: "info",
  });
  return result;
}

// Sum the gz size of every emitted .js chunk (entry + async reader chunk) — the total a host would
// transfer if it opened an object (the worst case). The entry-only number is reported separately.
function measureDist() {
  let totalGz = 0;
  let entryGz = 0;
  let entryRaw = 0;
  for (const name of readdirSync(OUTDIR)) {
    if (!name.endsWith(".js")) continue;
    const bytes = readFileSync(join(OUTDIR, name));
    totalGz += gzipSync(bytes).length;
    if (name === "archie-viewer.js") { entryGz = gzipSync(bytes).length; entryRaw = bytes.length; }
  }
  return {
    entryRawKB: +(entryRaw / 1024).toFixed(1),
    entryGzKB: +(entryGz / 1024).toFixed(1),
    totalGzKB: +(totalGz / 1024).toFixed(1),
  };
}

const CHECK = process.argv.includes("--check");

await build();
const m = measureDist();

if (CHECK) {
  if (!existsSync(BASELINE)) {
    console.warn(`no baseline at ${BASELINE} — run \`node build.mjs\` once to set it`);
    process.exit(0);
  }
  const base = JSON.parse(readFileSync(BASELINE, "utf8"));
  const allowed = Math.max(base.totalGzKB * 0.1, 10);
  const delta = +(m.totalGzKB - base.totalGzKB).toFixed(1);
  const verdict = delta > allowed ? "FAIL" : "ok";
  console.log(`${verdict} bundle total ${base.totalGzKB}KB → ${m.totalGzKB}KB gz (Δ ${delta >= 0 ? "+" : ""}${delta}KB, allowed +${allowed.toFixed(1)}KB)`);
  process.exit(delta > allowed ? 1 : 0);
}

console.log(`<archie-viewer> bundle:`);
console.log(`  entry  ${m.entryRawKB}KB min  ${m.entryGzKB}KB gz  (gallery path — OSD NOT included)`);
console.log(`  total  ${m.totalGzKB}KB gz  (entry + lazy reader/OSD chunk — opening an object)`);
writeFileSync(BASELINE, JSON.stringify({ measuredAt: new Date().toISOString(), ...m }, null, 2) + "\n");
console.log(`  baseline written → ${BASELINE}`);
