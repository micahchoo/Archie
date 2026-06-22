import { gzipSync } from "node:zlib";
import { writeFileSync, readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

// esbuild is a transitive (vitest/vite) dep, not hoisted — resolve it from the pnpm store.
// Version-agnostic: a hardcoded esbuild@X pin broke every time the lockfile re-resolved.
const require = createRequire(import.meta.url);
const storeDir = `${process.cwd()}/node_modules/.pnpm`;
const esbuildEntry = readdirSync(storeDir)
  .filter((d) => /^esbuild@/.test(d))
  .sort() // lexicographic is fine for picking deterministically; any vendored esbuild measures
  .pop();
if (!esbuildEntry) throw new Error("no esbuild in the pnpm store — run install first");
const esbuild = require(`${storeDir}/${esbuildEntry}/node_modules/esbuild`);

const root = process.cwd();

async function measureEntry(label, entry, external = []) {
  const r = await esbuild.build({ entryPoints: [entry], bundle: true, minify: true, format: "esm", write: false, external, platform: "browser", logLevel: "silent" });
  return size(label, r.outputFiles[0].contents);
}
async function measureStdin(label, contents, resolveDir) {
  const r = await esbuild.build({ stdin: { contents, resolveDir, loader: "ts" }, bundle: true, minify: true, format: "esm", write: false, platform: "browser", logLevel: "silent" });
  return size(label, r.outputFiles[0].contents);
}
function size(label, raw) {
  return { label, minKB: +(raw.length / 1024).toFixed(1), gzKB: +(gzipSync(Buffer.from(raw)).length / 1024).toFixed(1) };
}

const rows = [];
// Archie's own data-layer code (fflate external — the part WE wrote).
rows.push(await measureEntry("@render/core (fflate external)", `${root}/packages/render-core/src/index.ts`, ["fflate"]));
// Archie core including its only runtime dep, fflate.
rows.push(await measureEntry("@render/core + fflate", `${root}/packages/render-core/src/index.ts`));
// The renderer floor: OSD + Annotorious (the 240KB-budget concern, BEFORE any Archie code).
rows.push(await measureStdin("OSD + Annotorious + plugin-tools", `import "openseadragon"; import "@annotorious/openseadragon"; import "@annotorious/plugin-tools";`, `${root}/packages/render-mount`));
// The READ-ONLY mount entry (ADR-0019 keystone): OSD kept, @annotorious/* + pixi ABSENT (DOM-SVG
// overlay, no unsafe-eval). Measured next to the OSD+Annotorious floor so the drop is visible — this
// gz number MUST be lower than that floor (the eval-causing dep is gone). P0-10 asserts the absence at
// the source level; this records the bundle-level number. Live strict-CSP browser run = Phase-1.
// `globalThis.X =` keeps the named export live so esbuild can't tree-shake the side-effect-free import.
rows.push(await measureStdin("read-only mount (OSD, NO Annotorious/pixi)", `import { createReadOnlyMount } from "${root}/packages/render-mount/src/read-mount.ts"; globalThis.__readonly = createReadOnlyMount;`, `${root}/packages/render-mount`));

// --- app-dist measurement + ratchet (worklist 4.3): the BUILT apps are the numbers that matter.
// Baseline = a real measurement, never an aspirational figure (the 240KB budget was retired as
// fiction — retrospective 2026-06-11). `--check` compares a fresh measurement against the stored
// baseline and fails on growth > max(10%, 10KB) gz; the default mode re-measures + writes baseline.
function distGzKB(dir) {
  let total = 0;
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(js|css)$/.test(name)) total += gzipSync(readFileSync(p)).length;
    }
  };
  walk(dir);
  return +(total / 1024).toFixed(1);
}
const appBundles = [];
for (const [label, dist] of [["apps/studio dist (js+css gz)", `${root}/apps/studio/dist`], ["apps/viewer dist (js+css gz)", `${root}/apps/viewer/dist`]]) {
  if (existsSync(dist)) appBundles.push({ label, gzKB: distGzKB(dist) });
  else console.warn(`(skip ${label} — no dist; build first)`);
}

const CHECK = process.argv.includes("--check");
if (CHECK) {
  const baseline = JSON.parse(readFileSync(`${root}/docs/bundle-size.json`, "utf8"));
  let failed = false;
  for (const cur of appBundles) {
    const base = (baseline.appBundles ?? []).find((b) => b.label === cur.label);
    if (!base) { console.warn(`no baseline for "${cur.label}" — run without --check to set one`); continue; }
    const allowed = Math.max(base.gzKB * 0.1, 10);
    const delta = +(cur.gzKB - base.gzKB).toFixed(1);
    const verdict = delta > allowed ? "FAIL" : "ok";
    if (delta > allowed) failed = true;
    console.log(`${verdict.padEnd(5)} ${cur.label.padEnd(32)} ${base.gzKB}KB → ${cur.gzKB}KB (Δ ${delta >= 0 ? "+" : ""}${delta}KB, allowed +${allowed.toFixed(1)}KB)`);
  }
  process.exit(failed ? 1 : 0);
}

for (const r of rows) console.log(`${r.label.padEnd(36)} ${String(r.minKB).padStart(8)}KB min  ${String(r.gzKB).padStart(8)}KB gz`);
for (const r of appBundles) console.log(`${r.label.padEnd(36)} ${"-".padStart(8)}        ${String(r.gzKB).padStart(8)}KB gz`);
writeFileSync(`${root}/docs/bundle-size.json`, JSON.stringify({
  measuredAt: new Date().toISOString(),
  note: "gz = minified+gzipped. Renderer floor has no tree-shaking applied. appBundles = the built apps (the ratchet baseline; check with `node scripts/bundle-size.mjs --check`). No aspirational budget — the baseline IS a measurement (retro 2026-06-11).",
  rows,
  appBundles,
}, null, 2) + "\n");
