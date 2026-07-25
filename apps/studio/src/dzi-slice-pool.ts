// Off-main-thread DZI slicing (Archie perf 2026-07-24). AUTHOR-SIDE / bake-time ONLY.
//
// Why this exists on top of the already-fast inline slicer: bounding the encodes in sliceToDzi took one
// 8000x6000 from 17.3 s to ~0.9 s, but every one of those milliseconds still runs ON THE UI THREAD, so a
// multi-object publish still janks the app. This moves the pixel work into workers; the extra throughput
// is a bonus, the responsiveness is the point.
//
// MEMORY IS THE BINDING CONSTRAINT. Each worker decodes its own copy of the source (w*h*4 bytes — 192 MB
// for an 8000x6000, 96 MB for the 6000x4000 that MAX_MASTER_DIM caps imports at), so pool width is
// budgeted against the image, NOT against navigator.hardwareConcurrency. A 32-core machine slicing a big
// remote IIIF master must still not open 32 x 192 MB.
//
// OUTPUT IS BYTE-IDENTICAL to the serial slicer — see dzi-tile-worker.ts for the partitioning rule that
// buys that, and scripts/perf/bench.ts compareTiles for the check that proves it per tile.
import {
  dziPyramid, dziTileSource, DZI_TILE_SIZE, DZI_OVERLAP, type DziTileSource, type DziLevel,
} from "@render/core";
import { sliceToDzi, type SlicedDzi } from "./dzi-slicer.js";

/** Rough ceiling on decoded-source bytes held across the whole pool. ~768 MB is comfortable on desktop
 *  while still allowing 4 workers at the 6000x4000 import cap and 4 at 8000x6000-class remote masters. */
const POOL_BYTE_BUDGET = 768 * 1024 * 1024;
/** Never exceed this regardless of how small the image is — past here the encode threads saturate and
 *  the measured curve turns back up (16 was slower than 8 in the 2026-07-24 sweep). */
const POOL_MAX = 8;

/** True when this environment can run the pool at all (workers + OffscreenCanvas). Node/jsdom test runs
 *  and any exotic webview fall back to the inline slicer. */
export function poolAvailable(): boolean {
  return typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined";
}

/** Pool width for a w*h source: memory budget first, core count second, POOL_MAX last. */
export function poolSizeFor(width: number, height: number, cores = navigator.hardwareConcurrency || 4): number {
  const perWorker = width * height * 4;
  const byBudget = Math.floor(POOL_BYTE_BUDGET / Math.max(perWorker, 1));
  return Math.max(1, Math.min(POOL_MAX, byBudget, cores));
}

/**
 * ONE image slices at a time, process-wide.
 *
 * `POOL_BYTE_BUDGET` bounds the workers of a SINGLE call, which is the only thing the isolated bench
 * exercised — and it is not the shape the caller has. `publishLibrary` fans out `mapLimit(exhibits, 6)`
 * over an UNCAPPED `Promise.all` across each exhibit's objects, so a 10x7 library reaches ~42
 * simultaneous `tileObject` calls. Per-call pools then meant ~42 x 8 = 336 workers each decoding its
 * own copy of the source (~76 MB at the 5000x3800 import cap) — ~25 GB asked for at once.
 *
 * Measured end-to-end (scripts/perf/publishbench.ts, 70 objects, OPFS): every pool died with "The
 * source image could not be decoded" / "Readback of the source image has failed" and `sliceToDziAuto`
 * SILENTLY fell back to the inline slicer for all 70. The publish still succeeded and looked healthy —
 * exactly the invisible-degradation the fallback was warned about — while the pooled path contributed
 * nothing but 336 wasted worker spawns.
 *
 * Serializing is not a compromise here: the parallelism that matters is WITHIN one pyramid (bands
 * across workers), and the pass was already thrashing rather than overlapping. Concurrent callers
 * queue instead of competing for memory that does not exist.
 */
let poolGate: Promise<unknown> = Promise.resolve();
/** Exported for the regression test only — production callers reach it through `sliceToDziAuto`. */
export function withPoolGate<T>(fn: () => Promise<T>): Promise<T> {
  const run = poolGate.then(fn, fn); // a prior REJECTION must not poison the queue
  poolGate = run.catch(() => {});
  return run;
}

type Task =
  | { kind: "strip"; level: DziLevel; rowFrom: number; rowTo: number }
  | { kind: "level"; level: DziLevel };

/** Partition the pyramid into tasks. The top level (scale 1, ~70-75% of all tiles) splits into row
 *  bands — exact, because at scale 1 a band render is a blit. Every downscaled level goes whole to one
 *  worker, which keeps its filter taps identical to the serial render. */
export function planTasks(pyr: ReturnType<typeof dziPyramid>, poolSize: number): Task[] {
  const tasks: Task[] = [];
  const top = pyr.levels[pyr.levels.length - 1]!;
  // ~3 bands per worker so one slow band can't strand the pool at the tail.
  const bands = Math.max(1, Math.min(top.rows, poolSize * 3));
  const per = Math.ceil(top.rows / bands);
  for (let r = 0; r < top.rows; r += per) tasks.push({ kind: "strip", level: top, rowFrom: r, rowTo: Math.min(r + per, top.rows) });
  for (const lvl of pyr.levels) if (lvl.level !== top.level) tasks.push({ kind: "level", level: lvl });
  // Biggest first — classic longest-processing-time-first, keeps the tail short.
  return tasks.sort((a, b) => tileCount(b) - tileCount(a));
}

const tileCount = (t: Task) => t.kind === "level" ? t.level.tiles : (t.rowTo - t.rowFrom) * t.level.cols;

/**
 * Slice `blob` into a DZI pyramid across a worker pool. Takes the encoded BLOB (not an ImageBitmap)
 * because each worker decodes its own — an ImageBitmap can only be transferred to one worker, and
 * cloning it would defeat the memory budget.
 *
 * Rejects if the pool can't be created or any worker errors; callers should fall back to sliceToDzi.
 */
export async function sliceToDziPooled(
  blob: Blob,
  width: number,
  height: number,
  filesPath: string,
  format = "image/jpeg",
  quality = 0.82,
  poolSize = poolSizeFor(width, height),
  tileSize = DZI_TILE_SIZE,
  overlap = DZI_OVERLAP,
): Promise<SlicedDzi> {
  const descriptor: DziTileSource = dziTileSource({ width, height, tileSize, overlap }, format, filesPath);
  const pyr = dziPyramid(width, height, tileSize, overlap);
  const tasks = planTasks(pyr, poolSize);
  const workers: Worker[] = [];

  try {
    await Promise.all(Array.from({ length: Math.min(poolSize, tasks.length) }, () => new Promise<void>((resolve, reject) => {
      const wk = new Worker(new URL("./dzi-tile-worker.ts", import.meta.url), { type: "module" });
      wk.onerror = (ev) => reject(new Error(`dzi worker failed to start: ${ev.message}`));
      wk.onmessage = (ev: MessageEvent) => {
        if (ev.data?.kind === "ready") resolve();
        else if (ev.data?.kind === "error") reject(new Error(ev.data.message));
      };
      workers.push(wk);
      wk.postMessage({ kind: "init", blob });
    })));

    // Collect per-TASK, then assemble in pyramid order so the tile Map iterates DETERMINISTICALLY
    // (level ascending, bands top-to-bottom) no matter which worker finished first. That order is not
    // byte-for-byte the serial slicer's col-major walk within a level — only the CONTENTS are asserted
    // identical; nothing downstream reads tile order (writeTilePyramid just iterates to write files).
    const collected = new Array<{ path: string; blob: Blob }[]>(tasks.length);
    let next = 0;
    await Promise.all(workers.map((wk) => new Promise<void>((resolve, reject) => {
      const pump = () => {
        if (next >= tasks.length) return resolve();
        const id = next++;
        const t = tasks[id]!;
        wk.postMessage({ ...t, id, tileSize, overlap, format, quality });
      };
      wk.onerror = (ev) => reject(new Error(`dzi worker error: ${ev.message}`));
      wk.onmessage = (ev: MessageEvent) => {
        if (ev.data?.kind === "error") return reject(new Error(ev.data.message));
        if (ev.data?.kind !== "done") return;
        collected[ev.data.id] = ev.data.tiles;
        pump();
      };
      pump();
    })));

    const byPath = new Map<string, Blob>();
    const order = tasks.map((t, i) => ({ t, i }))
      .sort((a, b) => a.t.level.level - b.t.level.level ||
                      (a.t.kind === "strip" && b.t.kind === "strip" ? a.t.rowFrom - b.t.rowFrom : 0));
    for (const { i } of order) for (const { path, blob: b } of collected[i] ?? []) byPath.set(path, b);
    return { descriptor, tiles: byPath };
  } finally {
    for (const wk of workers) wk.terminate();
  }
}

/**
 * Slice `blob` the best way this environment allows: worker pool where available, the inline slicer
 * otherwise, and the inline slicer as a RECOVERY path if the pool throws (a worker that fails to boot,
 * a CSP that refuses it, an OOM under a huge remote master) — tiling degrading to slow must never
 * degrade to a failed publish, which is the same posture tileObject already takes toward decode errors.
 *
 * Callers pass the encoded blob plus dimensions they have already probed, so the pooled path does not
 * decode on the main thread at all. NOTE the inline fallback necessarily does (one decode, then closed).
 */
export async function sliceToDziAuto(
  blob: Blob,
  width: number,
  height: number,
  filesPath: string,
  format = "image/jpeg",
  quality = 0.82,
): Promise<SlicedDzi> {
  if (poolAvailable()) {
    try {
      // Gated: concurrent callers queue rather than each spawning their own pool. See withPoolGate —
      // without it a library-scale publish exhausts memory and every call degrades to inline, silently.
      return await withPoolGate(() => sliceToDziPooled(blob, width, height, filesPath, format, quality));
    } catch (e) {
      console.warn("dzi: worker pool failed, falling back to the inline slicer", e);
    }
  }
  const bmp = await createImageBitmap(blob);
  try {
    return await sliceToDzi(bmp, filesPath, format, DZI_TILE_SIZE, DZI_OVERLAP, quality);
  } finally {
    bmp.close();
  }
}
