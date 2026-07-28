// ESTIMATE vs MEASURED (Archie-c74e). The whole point of this run is that two ledgers made
// predictions about a scale nobody had driven; this reconciles each against the tree that now exists.
//
//   PROTO-folder-probe-2026-07-27.md  — the web tier is 0.1476 bytes per CAPPED pixel, and the file
//                                       count is 7 fixed + 3/exhibit + 3/object.
//   PROBE-tiling-threshold-2026-07-27.md — 592 tiles/object at 6000 px, and the analytic `dziPyramid`
//                                       matched the real slicer at every dimension it swept.
//
// The tile arithmetic here uses render-core's OWN `dziPyramid` rather than a re-derivation, so a
// disagreement is between the MODEL and the TREE — not between two people's arithmetic.
//
// Run: node scripts/accept/reconcile.mjs --root /mnt/Ghar/archie-accept-c74e
import fs from "node:fs";
import path from "node:path";
import { dziPyramid } from "../../packages/render-core/src/geometry/dzi.ts";
import { fitWithin } from "../../packages/render-core/src/geometry/downscale.ts";

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const ROOT = path.resolve(arg("root", "/mnt/Ghar/archie-accept-c74e"));

const corpus = JSON.parse(fs.readFileSync(path.join(ROOT, "corpus-summary.json"), "utf8"));
const ingest = JSON.parse(fs.readFileSync(path.join(ROOT, "ingest-summary.json"), "utf8"));
const publish = JSON.parse(fs.readFileSync(path.join(ROOT, "publish-summary.json"), "utf8"));
const library = JSON.parse(fs.readFileSync(path.join(ROOT, "work", "library.json"), "utf8"));

// The constants, restated as LITERALS from the ledgers they came from — deliberately not imported
// from `archive-probe.ts`. A reconciliation that computes its expectation from the constant it is
// checking is the tautology `PROTO-folder-probe`'s own red-green found live in its first commit.
const WEB_BPP = 0.1476;      // PROTO-folder-probe H2, pooled over 6 masters x 3 dims, n=18 at q0.80
const WEB_MAX_DIM = 2400;    // ibid
const TILE_MIN_EDGE = 4096;  // publish-flows.svelte.ts:195
const TILE_SIZE = 254, OVERLAP = 1; // geometry/dzi.ts defaults, mirrored by the slicer

const objects = library.exhibits.flatMap((e) => e.objects);
const rows = [];
const row = (what, estimate, measured, note) => {
  const delta = measured - estimate;
  const pct = estimate === 0 ? "—" : `${delta >= 0 ? "+" : ""}${((100 * delta) / estimate).toFixed(1)}%`;
  rows.push({ what, estimate, measured, delta, pct, note });
};

// ── WEB TIER BYTES ────────────────────────────────────────────────────────────────────────────
// The model is per-object: cap the object's OWN dimensions to 2400 and multiply the capped pixel
// count by the measured bytes-per-pixel. Anchoring to each file's own size is the probe's own rule
// ("each unsampled file is anchored to its OWN size").
let cappedPixels = 0;
for (const o of objects) { const to = fitWithin(o.width, o.height, WEB_MAX_DIM); cappedPixels += to.width * to.height; }
const webAssetsMeasured = publish.onDisk.web.byExt[".webp"]?.bytes ?? 0;
row("web tier: image bytes", Math.round(cappedPixels * WEB_BPP), webAssetsMeasured,
  `${(cappedPixels / 1e9).toFixed(2)} Gpx capped at ${WEB_MAX_DIM}px x ${WEB_BPP} B/px; measured = the tree's .webp total (masters + thumbnails)`);
row("web tier: whole tree bytes", Math.round(cappedPixels * WEB_BPP), publish.onDisk.web.bytes,
  "the model covers IMAGES only — JSON/HTML/the bundled viewer are on top, and the probe records the viewer as a known omission");

// ── FILE COUNTS ───────────────────────────────────────────────────────────────────────────────
// 7 fixed + 3/exhibit + 3/object, read from site.ts's own write calls (PROTO-folder-probe).
const nEx = library.exhibits.length, nObj = objects.length;
const modelFiles = 7 + 3 * nEx + 3 * nObj;
row("web tier: file count", modelFiles, publish.onDisk.web.files,
  `7 + 3x${nEx} exhibits + 3x${nObj} objects; the model predates the bundled viewer (Archie-e09d) and the fixity manifest (Archie-039e)`);

// ── ARCHIVAL TILE COUNT ───────────────────────────────────────────────────────────────────────
// Analytic, through render-core's own dziPyramid, over the INGESTED dimensions — which is what the
// slicer sees. `PROBE-tiling-threshold` verified this matches the real slicer at every dimension.
let analyticTiles = 0, tiledObjects = 0;
const perObject = [];
for (const o of objects) {
  if (Math.max(o.width, o.height) <= TILE_MIN_EDGE) continue;
  tiledObjects++;
  // `dziPyramid` returns the whole pyramid with its own `totalTiles` — use the function's own
  // number rather than re-summing its levels, so this cannot drift from the slicer.
  const n = dziPyramid(o.width, o.height, TILE_SIZE, OVERLAP).totalTiles;
  analyticTiles += n;
  perObject.push(n);
}
const measuredTiles = (publish.onDisk.archival.byExt[".jpg"]?.n ?? 0) + (publish.onDisk.archival.byExt[".webp"]?.n ?? 0)
  - nObj /* masters */ - nObj /* thumbnails */;
row("archival: DZI tile files", analyticTiles, measuredTiles,
  `${tiledObjects} of ${nObj} objects are above TILE_MIN_EDGE(${TILE_MIN_EDGE}); measured = every .jpg/.webp in the tree minus one master and one thumbnail per object`);
row("archival: total file count", analyticTiles + modelFiles + tiledObjects /* one .dzi-ish descriptor per pyramid */,
  publish.onDisk.archival.files, "tiles + the 7/3/3 model + one descriptor per pyramid");

// The map's own reference point, restated against what a 1,000-object library actually costs here.
const mean = perObject.length > 0 ? analyticTiles / perObject.length : 0;
const at6000 = dziPyramid(6000, 4500, TILE_SIZE, OVERLAP).totalTiles;

console.log(`\ncorpus: ${corpus.count} masters · ${(corpus.totalBytes / 1e9).toFixed(2)} GB · ${(corpus.totalPixels / 1e9).toFixed(2)} Gpx · ${corpus.jpeg.n} jpeg + ${corpus.tiff.n} tiff`);
console.log(`ingest: ${ingest.objects}/${ingest.files} objects, ${ingest.ingestSec.toFixed(0)}s, ${ingest.refusals.length} refusals, ${ingest.bakeFallbacks} worker fallbacks`);
console.log(`publish: archival ${publish.archival.sec.toFixed(0)}s / ${publish.onDisk.archival.files.toLocaleString("en-US")} files · web ${publish.web.sec.toFixed(0)}s / ${publish.onDisk.web.files.toLocaleString("en-US")} files\n`);

const pad = (s, n) => String(s).padEnd(n);
console.log(`${pad("what", 30)} ${pad("estimate", 14)} ${pad("measured", 14)} ${pad("delta", 12)} note`);
for (const r of rows) {
  const f = (n) => (Math.abs(n) > 1e6 ? `${(n / 1e9).toFixed(3)} GB` : n.toLocaleString("en-US"));
  console.log(`${pad(r.what, 30)} ${pad(f(r.estimate), 14)} ${pad(f(r.measured), 14)} ${pad(r.pct, 12)} ${r.note}`);
}
console.log(`\ntiles/object: mean ${mean.toFixed(0)} over the ${tiledObjects} tiled objects · the analytic figure for a 6000x4500 master is ${at6000} (PROBE-tiling-threshold measured 592 at exactly that size, and 592 x 1,000 = 592,000 is the map's own reference point)`);
console.log(`peak RSS: ingest ${ingest.memory.peakRssGB.toFixed(2)} GB · publish ${publish.memory.peakRssGB.toFixed(2)} GB (at t=${publish.memory.peakAtSec.toFixed(0)}s; archival ran 0-${publish.archival.sec.toFixed(0)}s, web ${publish.archival.sec.toFixed(0)}-${(publish.archival.sec + publish.web.sec).toFixed(0)}s)`);
console.log(`library.json: ${ingest.libraryJsonBytes.toLocaleString("en-US")} bytes for ${nObj} objects — read whole (store.ts:182) and written whole (store.ts:217) on every save`);

fs.writeFileSync(path.join(ROOT, "reconcile.json"), JSON.stringify({ rows, tiledObjects, analyticTiles, meanTilesPerTiledObject: mean, tilesAt6000x4500: at6000, cappedPixels }, null, 2));
