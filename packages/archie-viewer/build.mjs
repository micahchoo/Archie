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
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire as makeRequire } from "node:module";
import { TOKENS_MODULE_ID, TOKENS_CSS_PATH } from "./tokens-source.mjs";

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

// Resolve `virtual:archie-tokens` (src/tokens.ts) to the shell's token file, minified. The embed
// injects those bytes into its SHADOW ROOT, where a `<link>` cannot reach, so the token layer has to
// travel as a string rather than a stylesheet. Minifying does not weaken the sharing — the custom
// properties and their values are byte-identical, which is the whole content of the contract — and it
// is worth 2.5KB gz on the EAGER path (3.9KB → 1.4KB, measured). vitest.config.ts mirrors this
// exactly; `tokens-source.mjs` holds the single declaration of the path and the id.
const archieTokens = {
  name: "archie-tokens",
  setup(build) {
    build.onResolve({ filter: new RegExp(`^${TOKENS_MODULE_ID}$`) }, () => ({
      path: TOKENS_CSS_PATH,
      namespace: "archie-tokens",
    }));
    build.onLoad({ filter: /.*/, namespace: "archie-tokens" }, async (args) => {
      const { code } = await esbuild.transform(readFileSync(args.path, "utf8"), { loader: "css", minify: true });
      return { contents: `export default ${JSON.stringify(code)};`, loader: "js" };
    });
  },
};

async function build(outdir) {
  rmSync(outdir, { recursive: true, force: true });
  mkdirSync(outdir, { recursive: true });
  const result = await esbuild.build({
    entryPoints: [join(__dirname, "src", "index.ts")],
    bundle: true,
    minify: true,
    format: "esm",
    splitting: true, // emit the lazy reader (OSD) as a separate async chunk
    platform: "browser",
    outdir,
    entryNames: "archie-viewer",
    metafile: true,
    logLevel: "info",
    plugins: [archieTokens],
  });
  return result;
}

// The EAGER closure: every chunk reachable from the entry through STATIC (`import-statement`) edges
// only — i.e. exactly what a host downloads and parses on page load, before opening anything. Walked
// from esbuild's metafile, which is the only place the static/dynamic distinction actually survives.
//
// This metric exists because the two below could not see the regression they were meant to prevent.
// A leak shipped where index.ts (the bundle ENTRY) statically re-exported openObject from reader.js,
// so `dist/archie-viewer.js` opened with a top-level `import … from "./chunk-<osd>.js"` and every
// embed paid ~231KB gz of OSD/pixi at page load. entryGzKB never saw it — that measures the entry
// FILE (6.1KB), not its graph. totalGzKB never saw it either — the chunk was already in the total,
// eagerly or lazily. Both numbers moved <0.2KB when the leak was fixed and 225KB left the load path.
// A lazy boundary is only real if something measures the closure; the file sizes cannot express it.
function measureEagerGz(outdir, metafile) {
  const outputs = metafile.outputs;
  const entry = Object.keys(outputs).find((p) => basename(p) === "archie-viewer.js");
  const reachable = new Set();
  const walk = (p) => {
    if (!p || reachable.has(p) || !outputs[p]) return;
    reachable.add(p);
    for (const imp of outputs[p].imports ?? []) {
      if (imp.kind === "import-statement") walk(imp.path); // static only — dynamic-import is the boundary
    }
  };
  walk(entry);
  let gz = 0;
  for (const p of reachable) gz += gzipSync(readFileSync(join(outdir, basename(p)))).length;
  return +(gz / 1024).toFixed(1);
}

// Sum the gz size of every emitted .js chunk (entry + async reader chunk) — the total a host would
// transfer if it opened an object (the worst case). The entry-only number is reported separately.
function measureDist(outdir, metafile) {
  let totalGz = 0;
  let entryGz = 0;
  let entryRaw = 0;
  for (const name of readdirSync(outdir)) {
    if (!name.endsWith(".js")) continue;
    const bytes = readFileSync(join(outdir, name));
    totalGz += gzipSync(bytes).length;
    if (name === "archie-viewer.js") { entryGz = gzipSync(bytes).length; entryRaw = bytes.length; }
  }
  return {
    entryRawKB: +(entryRaw / 1024).toFixed(1),
    entryGzKB: +(entryGz / 1024).toFixed(1),
    eagerGzKB: measureEagerGz(outdir, metafile),
    totalGzKB: +(totalGz / 1024).toFixed(1),
  };
}

const CHECK = process.argv.includes("--check");

// --check measures a THROWAWAY build in a temp dir. It must not write OUTDIR: packages/archie-viewer/
// dist/ is the committed, CDN-published artifact (scripts/sync-dist.mjs mirrors it to the repo root
// for jsDelivr's /gh/ serving), and a verification step that rewrites the bytes it verifies is not a
// verification step — `bundle:check` used to leave the released tree dirty as a side effect.
const outdir = CHECK ? mkdtempSync(join(tmpdir(), "archie-viewer-check-")) : OUTDIR;
const result = await build(outdir);
const m = measureDist(outdir, result.metafile);
if (CHECK) rmSync(outdir, { recursive: true, force: true });

if (CHECK) {
  if (!existsSync(BASELINE)) {
    console.warn(`no baseline at ${BASELINE} — run \`node build.mjs\` once to set it`);
    process.exit(0);
  }
  const base = JSON.parse(readFileSync(BASELINE, "utf8"));
  // Both metrics ratchet on the same max(10%, 10KB) shape as scripts/bundle-size.mjs. eagerGzKB is
  // the load-bearing one — a lazy boundary that silently goes static lands as a large eager delta
  // while totalGzKB barely moves (that is exactly how the OSD leak shipped). Baselines predating
  // this field skip its gate rather than fail closed on a missing number.
  const gates = [
    { label: "eager (page load)", cur: m.eagerGzKB, base: base.eagerGzKB },
    { label: "total (object open)", cur: m.totalGzKB, base: base.totalGzKB },
  ];
  let failed = false;
  for (const g of gates) {
    if (typeof g.base !== "number") {
      console.warn(`no baseline for ${g.label} — run \`node build.mjs\` once to record it`);
      continue;
    }
    const allowed = Math.max(g.base * 0.1, 10);
    const delta = +(g.cur - g.base).toFixed(1);
    const bad = delta > allowed;
    failed ||= bad;
    console.log(`${bad ? "FAIL" : "ok  "} ${g.label.padEnd(20)} ${g.base}KB → ${g.cur}KB gz (Δ ${delta >= 0 ? "+" : ""}${delta}KB, allowed +${allowed.toFixed(1)}KB)`);
  }
  process.exit(failed ? 1 : 0);
}

console.log(`<archie-viewer> bundle:`);
console.log(`  entry  ${m.entryRawKB}KB min  ${m.entryGzKB}KB gz  (the entry FILE alone)`);
console.log(`  eager  ${m.eagerGzKB}KB gz  (page load — entry's STATIC closure; OSD must NOT be here)`);
console.log(`  total  ${m.totalGzKB}KB gz  (entry + lazy reader/OSD chunk — opening an object)`);
writeFileSync(BASELINE, JSON.stringify({ measuredAt: new Date().toISOString(), ...m }, null, 2) + "\n");
console.log(`  baseline written → ${BASELINE}`);
