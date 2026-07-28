// Bench — WHERE THE TILING THRESHOLD SITS (Archie-86ff).
//
// Same END-TO-END shape as publishbench.ts (perf-measure-the-flow: measure the flow via
// publishLibrary + the real tileObject wiring, attribute tiling cost by DIFFERENCE against a
// tiling-off run at the same size — never sum concurrent per-call elapsed times).
//
// publishbench.ts answers "how much does tiling cost, at one representative size, across a
// growing library". This bench answers a different question: AT WHAT SOURCE SIZE does a tile
// pyramid stop paying for itself, compared to shipping the capped master as one file? So it holds
// the library shape fixed (small, matches publishbench's realistic worst case) and sweeps the
// MASTER DIMENSION instead — the axis publishbench never varies.
//
// For each dimension it publishes the SAME library twice into a fresh MemoryFilesystem — once
// with tiling forced OFF (tileObject always null, single-image `source`, the pre-Q9 baseline) and
// once with tiling forced ON regardless of TILE_MIN_EDGE (publish-flows.svelte.ts:163) — so this
// bench can see the tiled cost BELOW today's 4096 constant, which is the region the ticket asks
// about. It reports, per dimension: publish time (N=3, so a single sample is never mistaken for a
// result — a-green-run-is-one-sample), total tree file count, total tree bytes, and the bytes an
// OSD viewer must fetch before ANY pixel paints (whole master vs. level-0 tile) — the perceived-load
// proxy the ticket asks for, since a real network+viewer drive is out of scope for a core-only bench.
//
// Run:  node scripts/perf/tilingthresholdrun.mjs        (add HEADED=1 to watch it)
import { publishLibrary } from "../../packages/render-core/src/publish/site.ts";
import { MemoryFilesystem } from "../../packages/render-core/src/fs/memory.ts";
import type { Filesystem, FsDirectory } from "../../packages/render-core/src/fs/seam.ts";
import { appendNew } from "../../packages/render-core/src/spine/log.ts";
import { asClientId, asExhibitId, asLibraryId, asObjectId } from "../../packages/render-core/src/wadm/brand.ts";
import type { AnnotationLog } from "../../packages/render-core/src/wadm/types.ts";
import { sliceToDziAuto } from "../../apps/studio/src/dzi-slice-pool.ts";
import { dziPyramid } from "../../packages/render-core/src/geometry/dzi.ts";

const out = document.querySelector("#out")!;
const say = (s: string) => { out.textContent += s + "\n"; console.log(s); };

const alice = asClientId("alice");

// The ticket's suggested sweep, plus today's live constant (4096, publish-flows.svelte.ts:163) so
// the bench brackets the current default rather than only guessing around it. All are LONGER-EDGE
// dimensions — TILE_MIN_EDGE compares Math.max(width, height), and MAX_MASTER_DIM (6000,
// geometry/downscale.ts:8) is the ceiling an IMPORTED master can reach at all.
const DIMENSIONS = [800, 1200, 1600, 2400, 3200, 4096, 6000] as const;
const RUNS_PER_CONFIG = 3; // denominator for every timing claim below — a-green-run-is-one-sample

/** A real JPEG at (w, h) — noise + gradient so the encoder does representative work, not a flat
 *  fill it would trivially compress. Donor: publishbench.ts makeJpeg. */
async function makeJpeg(w: number, h: number): Promise<Blob> {
  const c = new OffscreenCanvas(w, h);
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, "#2a4"); g.addColorStop(1, "#83b");
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  const cells = Math.max(500, Math.round((w * h) / 3000));
  for (let i = 0; i < cells; i++) {
    ctx.fillStyle = `rgb(${(i * 37) % 255},${(i * 91) % 255},${(i * 13) % 255})`;
    ctx.fillRect((i * 131) % w, (i * 17) % h, 24, 24);
  }
  return await c.convertToBlob({ type: "image/jpeg", quality: 0.85 });
}

// Small library, held FIXED across the whole sweep — 2 exhibits x 3 objects, every object
// tileable, matching publishbench's "worst case" shape at a scale that keeps the dimension sweep
// (7 sizes x 2 modes x 3 runs = 42 publishes) tractable. All objects in one run share the SAME
// master blob — this measures pipeline cost at a given SIZE, not content diversity (that axis is
// publishbench's, not this bench's).
const EXHIBITS = 2;
const OBJECTS_PER_EXHIBIT = 3;

function makeLibrary(master: Blob) {
  void master; // library structure doesn't carry bytes; getAsset always returns the same master
  const logs: Record<string, AnnotationLog> = {};
  const exs = [];
  for (let e = 0; e < EXHIBITS; e++) {
    const objects = [];
    let log: AnnotationLog = [];
    for (let o = 0; o < OBJECTS_PER_EXHIBIT; o++) {
      const name = `img_${e}_${o}.jpg`;
      objects.push({ id: asObjectId(`o${e}_${o}`), source: `/assets/${name}`, label: `Folio ${o}`, width: 4000, height: 3000 });
      log = appendNew(log, { target: `/assets/${name}`, body: { type: "TextualBody", value: `Note on folio ${o}.` }, lastEditor: alice, modifiedAt: "t0", now: 1 }).log;
    }
    logs[`ex${e}`] = log;
    exs.push({ id: asExhibitId(`ex${e}`), slug: `ex${e}`, title: `Exhibit ${e}`, objects, sections: [] });
  }
  return { library: { id: asLibraryId("lib"), title: "Threshold bench", exhibits: exs } as never, getLog: (id: string): AnnotationLog => logs[id] ?? [] };
}

/** Recursively walk a Filesystem's whole tree, summing file count + bytes. Generic over the
 *  FsDirectory seam (works for MemoryFilesystem — no OPFS-specific API needed). */
async function walk(dir: FsDirectory): Promise<{ files: number; bytes: number }> {
  let files = 0;
  let bytes = 0;
  for await (const entry of dir.entries()) {
    if (entry.kind === "file") {
      files++;
      const f = await dir.getFile(entry.name);
      bytes += await f.size();
    } else {
      const sub = await dir.getDirectory(entry.name);
      const r = await walk(sub);
      files += r.files;
      bytes += r.bytes;
    }
  }
  return { files, bytes };
}

/** Bytes an OSD viewer must fetch before the FIRST pixel of an object paints: the whole master for
 *  a single-image source, or just the level-0 tile for a DZI pyramid (OSD requests the lowest level
 *  first — a handful of tiles, typically the whole level-0/1 in one request each). */
async function firstPaintBytes(exDir: FsDirectory, name: string, tiled: boolean): Promise<number> {
  if (!tiled) {
    const assets = await exDir.getDirectory("assets");
    const f = await assets.getFile(name);
    return f.size();
  }
  const filesDir = await exDir.getDirectory(`${name}_files`);
  const level0 = await filesDir.getDirectory("0");
  let bytes = 0;
  for await (const entry of level0.entries()) {
    if (entry.kind !== "file") continue;
    const f = await level0.getFile(entry.name);
    bytes += await f.size();
  }
  return bytes;
}

type Mode = "untiled" | "tiled";

interface RunResult { totalMs: number; files: number; bytes: number; firstPaintBytes: number; tileCount: number }

async function runOnce(dim: number, mode: Mode, master: Blob): Promise<RunResult> {
  const { library, getLog } = makeLibrary(master);
  const fs: Filesystem = new MemoryFilesystem();

  const tileObject = async (_slug: string, name: string, bytes: ArrayBuffer | Blob) => {
    if (mode === "untiled") return null; // force single-image, regardless of TILE_MIN_EDGE
    const blob = bytes instanceof Blob ? bytes : new Blob([bytes]);
    const bmp = await createImageBitmap(blob);
    const { width, height } = bmp;
    bmp.close();
    return await sliceToDziAuto(blob, width, height, `${name}_files`, "image/jpeg");
  };

  const t = performance.now();
  await publishLibrary(fs, library, getLog, {
    baseUrl: "https://u.gh.io/lib/",
    getAsset: async () => master,
    getThumbnail: async () => null,
    tileObject,
  } as never);
  const totalMs = performance.now() - t;

  const root = await fs.root();
  const { files, bytes: totalBytes } = await walk(root);
  const ex0 = await root.getDirectory("ex0");
  const fpBytes = await firstPaintBytes(ex0, "img_0_0.jpg", mode === "tiled");
  let tileCount = 0;
  if (mode === "tiled") {
    // writeTilePyramid (site.ts) writes ONLY the tile files under `_files/{level}/{col}_{row}.ext`
    // — no `.dzi` XML sidecar (the descriptor lives in the manifest's `tileSource`, not as a file)
    // — so every file this walk finds is a tile, no adjustment needed.
    const filesDir = await ex0.getDirectory("img_0_0.jpg_files");
    const r = await walk(filesDir);
    tileCount = r.files;
  }
  return { totalMs, files, bytes: totalBytes, firstPaintBytes: fpBytes, tileCount };
}

function stats(runs: RunResult[]) {
  const ms = runs.map((r) => r.totalMs).sort((a, b) => a - b);
  const mean = ms.reduce((a, b) => a + b, 0) / ms.length;
  return { n: ms.length, meanMs: mean, minMs: ms[0]!, maxMs: ms[ms.length - 1]!, sample: runs[0]! };
}

async function main() {
  const results: Record<string, unknown> = {};
  say(`Archie-86ff tiling-threshold sweep — ${EXHIBITS}x${OBJECTS_PER_EXHIBIT} objects, N=${RUNS_PER_CONFIG} runs/config\n`);

  for (const dim of DIMENSIONS) {
    const w = dim;
    const h = Math.round(dim * 0.75); // 4:3, a representative digitization-master aspect ratio
    say(`── ${w}x${h} (longer edge ${dim}) ──`);
    say(`  building master…`);
    const master = await makeJpeg(w, h);
    say(`  master: ${(master.size / 1e3).toFixed(1)} KB`);

    const analytic = dziPyramid(w, h);

    const untiledRuns: RunResult[] = [];
    for (let i = 0; i < RUNS_PER_CONFIG; i++) untiledRuns.push(await runOnce(dim, "untiled", master));
    const untiled = stats(untiledRuns);

    const tiledRuns: RunResult[] = [];
    for (let i = 0; i < RUNS_PER_CONFIG; i++) tiledRuns.push(await runOnce(dim, "tiled", master));
    const tiled = stats(tiledRuns);

    const deltaMs = tiled.meanMs - untiled.meanMs; // attribute by DIFFERENCE — perf-measure-the-flow
    const objectsInLib = EXHIBITS * OBJECTS_PER_EXHIBIT;

    say(`  untiled  N=${untiled.n}  mean ${untiled.meanMs.toFixed(1)}ms  [${untiled.minMs.toFixed(1)}-${untiled.maxMs.toFixed(1)}]  tree ${untiled.sample.files} files / ${(untiled.sample.bytes / 1e3).toFixed(0)} KB  first-paint ${(untiled.sample.firstPaintBytes / 1e3).toFixed(0)} KB`);
    say(`  tiled    N=${tiled.n}  mean ${tiled.meanMs.toFixed(1)}ms  [${tiled.minMs.toFixed(1)}-${tiled.maxMs.toFixed(1)}]  tree ${tiled.sample.files} files / ${(tiled.sample.bytes / 1e3).toFixed(0)} KB  first-paint ${(tiled.sample.firstPaintBytes / 1e3).toFixed(0)} KB  [${tiled.sample.tileCount} tiles/object, analytic ${analytic.totalTiles}]`);
    say(`  tiling cost (by difference, mean of means): ${deltaMs >= 0 ? "+" : ""}${deltaMs.toFixed(1)}ms across ${objectsInLib} objects (${(deltaMs / objectsInLib).toFixed(1)}ms/object)`);
    say(`  file-count multiple: ${(tiled.sample.files / untiled.sample.files).toFixed(1)}x   byte multiple: ${(tiled.sample.bytes / untiled.sample.bytes).toFixed(2)}x   first-paint-byte ratio (untiled/tiled): ${(untiled.sample.firstPaintBytes / Math.max(1, tiled.sample.firstPaintBytes)).toFixed(1)}x\n`);

    results[String(dim)] = {
      dim, w, h,
      masterBytes: master.size,
      analyticTiles: analytic.totalTiles,
      analyticMaxLevel: analytic.maxLevel,
      untiled: { n: untiled.n, meanMs: untiled.meanMs, minMs: untiled.minMs, maxMs: untiled.maxMs, treeFiles: untiled.sample.files, treeBytes: untiled.sample.bytes, firstPaintBytes: untiled.sample.firstPaintBytes },
      tiled: { n: tiled.n, meanMs: tiled.meanMs, minMs: tiled.minMs, maxMs: tiled.maxMs, treeFiles: tiled.sample.files, treeBytes: tiled.sample.bytes, firstPaintBytes: tiled.sample.firstPaintBytes, tileCountPerObject: tiled.sample.tileCount },
      tilingCostMsByDifference: deltaMs,
      objectsInLib,
    };
  }

  (window as unknown as { __BENCH__: unknown }).__BENCH__ = results;
}

main().catch((e) => {
  say(`ERROR: ${e?.stack ?? e}`);
  (window as unknown as { __BENCH__: unknown }).__BENCH__ = { error: String(e) };
});
