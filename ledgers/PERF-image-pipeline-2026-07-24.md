# PERF — author-side image pipeline (2026-07-24)

Goal: 10x runtime. Target chosen by measurement, not by reading. Harness: `scripts/perf/run.mjs`
(vite dev server + real Chromium), `scripts/perf/worker-smoke.mjs` (built workers in a browser).
Machine: 32 cores, load avg ~1.5 (idle). Source images are procedural noise + gradients — a flat fill
would make JPEG encode ~free and the whole benchmark a lie.

## What was actually slow

Two batch paths, both main-thread-bound, and **zero `Worker` instances existed anywhere in the repo**:

| Path | Site | Shape |
|---|---|---|
| Publish DZI tiling | `apps/studio/src/dzi-slicer.ts:89` | one `await convertToBlob` per tile, serial |
| Ingest bake | `apps/studio/src/bake.ts` | `document.createElement("canvas")`, 2 encodes/image |

Tiling is on by default across all three publish sinks (folder / zip / GH Pages).

Calibration that bounds the real-world case: `MAX_MASTER_DIM = 6000` caps imports and
`TILE_MIN_EDGE = 4096` gates tiling, so an imported asset only ever tiles in a 4097–6000px band
(~521 tiles). `tileRemote` (IIIF `/full/max`) is the uncapped case.

## Tiling — measured

Baseline is the real `sliceToDzi` called with `encodeConcurrency = 1`, which reproduces the
pre-change serial behaviour exactly. Every row was byte-compared against that baseline tile-by-tile
(`compareTiles`); **all identical**.

| Variant | 4096² (416 tiles) | 8000×6000 (1033 tiles) |
|---|---|---|
| concurrency 1 (shipped) | 6917 ms | 17239 ms |
| concurrency 8 | 1050 ms (6.6x) | 2352 ms (7.3x) |
| concurrency 16 | 602 ms (11.5x) | 1310 ms (13.2x) |
| **concurrency 32** | **428 ms (16.2x)** | **918 ms (18.8x)** |
| concurrency 48 (shipped now) | 437 ms | 907 ms (19.0x) |
| concurrency 128 | 433 ms | 902 ms (19.1x) |
| worker pool ×4 | 183 ms (37.8x) | 460 ms (37.5x) |
| worker pool ×8 | 183 ms (37.9x) | 463 ms (37.2x) |
| worker pool ×12 | 193 ms | 506 ms (34.1x) |

**The dominant cost was the serial `await`, not CPU.** Chromium encodes JPEG off-thread, so the old
loop idled on encode round-trips. Overlapping them is ~19x for a few lines. The plateau is at 32;
48 is shipped for headroom, and past ~64 nothing changes.

### Two hypotheses the measurement killed
- **Successive halving of the pyramid buys nothing.** The shipped code resamples the full source once
  per level (14 levels for an 8000×6000, 9 of them emitting a single tile), which looked wasteful.
  Measured: 413 ms vs 437 ms at 4096², and *slower* at 8000×6000 (921 vs 895). Not implemented.
- **More workers is not better.** ×12 and ×16 are slower than ×4. ×4 already saturates.

## Ingest bake — measured (6000×4000 source)

| | master | thumb | per image |
|---|---|---|---|
| DOM canvas (shipped) | 262 ms | 57 ms | 319 ms → **×70 = 22.4 s of frozen UI** |
| worker | 254 ms | 61 ms | 315 ms |

Per image the worker is **not faster** — same work, relocated. The win is that ingest processes
images in batches: a fleet of 24 goes **5944 ms → 752 ms (7.9x)**, and the UI thread is free.

## What shipped

1. `dzi-slicer.ts` — encodes overlapped via render-core's `mapLimit` at `DZI_ENCODE_CONCURRENCY = 48`.
   Bounded, not a bare `Promise.all`: a tile canvas lives until its encode resolves, so an unbounded
   level would hold all 768 top-level tiles at once (~198 MB on top of the ~180–200 MB this file
   already costs). The crop allocation happens *inside* the pooled callback, so live canvases are
   capped by construction. `concurrency.ts` was added to the render-core barrel for this.
2. `dzi-slice-pool.ts` + `dzi-tile-worker.ts` — off-thread slicing. **Memory, not CPU, sizes the pool**:
   each worker decodes its own source (192 MB for an 8000×6000), so width is budgeted
   (`POOL_BYTE_BUDGET` 768 MB), never `hardwareConcurrency`.
   Partitioning is what buys byte-identity: the **top level has scale exactly 1**, so a row band there
   is a 1:1 blit rather than a resample and is pixel-exact — and that is where ~70–75% of tiles live.
   Every *downscaled* level goes whole to one worker, so its filter taps match the serial render.
   `sliceToDziAuto` falls back to the inline slicer if the pool throws.
3. `bake-async.ts` + `bake-worker.ts` — worker-backed ingest bake with a DOM fallback, wired into
   `ingest-flows.ts`. `bakeFallbackCount()` exists because the fallback is **silent**: without it a
   wholly broken worker path looks like a working-but-slow one.

## Verification

- studio `pnpm typecheck` clean · vitest **919/919** (68 files) · svelte-check **0 errors 0 warnings** (1148 files)
- render-core `pnpm typecheck` clean · vitest **1112/1112** (92 files)
- `pnpm build` clean; both worker chunks emitted **and referenced** (`bake-worker-*.js`, `dzi-tile-worker-*.js`)
- Tauri CSP already permits them (`worker-src 'self' blob:`)
- `scripts/perf/worker-smoke.mjs`: both **built** workers boot and reply in real Chromium

### Why the smoke test exists separately
The bench aliases `@render/core` to a pure-geometry shim, so it exercises the worker algorithm but not
the worker's real import graph. The shipped workers pull the full barrel, which re-exports
`text/sanitize.ts` — and that calls `DOMPurify.addHook()` **at module load**, in a scope with no
`document`. That is the same import-time explosion that hung the first bench run for 13 minutes. Both
worker call sites fall back *silently*, so an import-time death would not break the app — it would
quietly revert to the slow path while looking fine, and the measured win simply would not exist in
production. Measured: both boot clean. Keep this gate.

## Not done / follow-ups

- **The tiling numbers are bench-measured, not observed in a real publish.** An end-to-end publish over
  the 70-object seeded fixture would confirm tiling actually dominates publish wall-clock; only the
  per-image primitive is proven here.
- `tileObject`/`tileRemote` still decode once on the **main thread** just to read dimensions before
  handing the blob to the pool. Unchanged from before, but it is now the largest remaining main-thread
  cost on the publish path.
- The 22.4 s ingest figure is arithmetic (319 ms × 70), not a measured 70-file import.
