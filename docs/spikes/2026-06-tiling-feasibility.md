# Phase B Tiling — Feasibility Spike (GO/NO-GO)

**Date:** 2026-06-20 · **Branch:** `docs/onboarding-spine` · **Decision:** Q-9 / Q-10
**Status:** SPIKE — written verdict + evidence only. No model / `bake.ts` / viewer / publish
code was touched (that is the gated Task 7, GO-only).

## Question

Is the **web OffscreenCanvas DZI generator** worth building, vs. parking it and letting a
desktop-Rust slicer or an external IIIF endpoint fill the same `tileSource` descriptor? v1
today ships a single responsive JPEG/PNG (`apps/studio/src/bake.ts` `bakeDisplayMaster`).
The 240 KB viewer-island budget (axis 16) was **unmeasured** — measuring it is half the spike.

---

## Step 1 — Measured published viewer bundle (load-bearing number)

Built with `pnpm build` (`astro build`, Astro static, Vite/Rollup). The OSD + Annotorious
island is **`ExhibitView`**, loaded by the exhibit route `[slug].astro` via
`client:only="svelte"`. The home route (`index.astro`) loads only `ViewerShell` (5.7 KB gz),
which lazy-pulls `ExhibitView` on interaction.

Chunk attribution — `grep` for `openseadragon`/`annotorious` hits **only** `ExhibitView`:

| Chunk (`dist/_astro/`)        | raw       | gzipped    | carries OSD/Anno |
|-------------------------------|-----------|------------|------------------|
| **ExhibitView.*.js**          | 997,243 B | **289,211 B = 282.4 KB** | **yes (OSD + Annotorious)** |
| cite-context.*.js             | 105,402 B | 39,386 B = 38.4 KB |  |
| render.*.js                   | 32,742 B  | 12,632 B = 12.3 KB |  |
| ViewerShell.*.js              | 14,110 B  | 5,896 B = 5.7 KB |  |
| client.svelte.*.js            | 1,134 B   | 661 B |  |

**Measured island: 282.4 KB gzipped — already ~42 KB OVER the 240 KB budget**, before any
tiling code is added.

Baselines (node_modules dist builds, gzipped): OpenSeadragon `5.0.1` min ~**66 KB gz**;
`@annotorious/openseadragon` ES build ~**312 KB gz** unminified — tree-shaken hard in the
real bundle, but Annotorious + OSD together are the dominant mass of the 282.4 KB island.

> **SNAG (axis 16):** the interactive island is over budget *independently of tiling*. The
> overage is owned by the OSD + Annotorious baseline, NOT by the slicer. This is a separate
> bundle-budget concern (re-baseline the 240 KB target, or split/defer Annotorious) and must
> not be conflated with the tiling decision below.

---

## Step 2 — OffscreenCanvas DZI generation feasibility

### DZI math — VERIFIED (headless unit test)

Pure descriptor/pyramid geometry isolated in `docs/spikes/dzi-math.ts` (spike scratch),
unit-tested in `docs/spikes/dzi-math.test.ts`:

```
$ pnpm exec vitest run --root ../../docs/spikes dzi-math
 ✓ dzi-math.test.ts (3 tests) 2ms
 Test Files  1 passed (1)
      Tests  3 passed (3)
```

`maxLevel = ceil(log2(maxDim))` confirmed; tile-grid = `ceil(scaledDim / tileSize)` per axis.
For **8000×6000, tileSize 254, overlap 1** (the Deep Zoom default → 256px effective tile):

| Level | scaled WxH | cols×rows | tiles |
|-------|-----------|-----------|-------|
| 13 (full) | 8000×6000 | 32×24 | 768 |
| 12 | 4000×3000 | 16×12 | 192 |
| 11 | 2000×1500 | 8×6 | 48 |
| 10 | 1000×750 | 4×3 | 12 |
| 9 | 500×375 | 2×2 | 4 |
| 0–8 | ≤250px | 1×1 | 1 each (9) |

**maxLevel = 13, levels = 14, total tiles = 1033.** (The top level alone is 768 of the 1033 —
the pyramid is dominated by the highest-resolution level, as expected.)

### Encode path — REASONED (needs browser verification)

The slicer would: `createImageBitmap(blob)` to decode → per level, draw the source into an
`OffscreenCanvas` sized to `scaledW×scaledH` via `ctx.drawImage(...)` → slice each tile with
`drawImage(src, sx,sy,...)` into a tile-sized canvas → `canvas.convertToBlob({type})`.

- **Peak memory (8000×6000):** decoded `ImageBitmap` ≈ W×H×4 = 8000·6000·4 ≈ **183 MB** for the
  full-res RGBA surface, plus one tile canvas (256²·4 ≈ 256 KB, transient). Levels below 12
  are sub-2000px and cheap. Peak is dominated by holding the full-res surface; ~**180–200 MB**
  transient — fine on desktop, the ceiling to watch on low-RAM mobile (consistent with the
  existing LARGE-MEDIA-MEMORY-CEILING posture in `bake.ts`). Releasing the ImageBitmap and
  downscaling progressively (each level from the previous, not from full-res) bounds it.
- **Tile count / wall-clock:** ~1033 `drawImage`+`convertToBlob` ops for an 8000px source.
  `convertToBlob` (JPEG q≈0.8) is the cost; order-of-magnitude **hundreds of ms to low
  single-digit seconds** for a single large image — a one-time author-side bake, not a
  per-view cost. Acceptable.
- **Threading:** `convertToBlob` and the full-res decode would jank the main thread →
  **run in a Web Worker.** OffscreenCanvas + createImageBitmap + convertToBlob are all
  worker-available; this is the canonical use case for OffscreenCanvas-in-worker.
- **Needs real browser verification (Task 7):** actual encoded tile bytes, true peak memory
  under the worker, and **OSD rendering the emitted `.dzi` + pyramid correctly** (the
  output-correctness loop). The math is proven; the pixels are not. No `@napi-rs/canvas` (or
  similar) is a dependency, so no tiles were emitted here — encode stays REASONED, not run.

### Bundle delta of shipping a web slicer

OffscreenCanvas / createImageBitmap / convertToBlob are **browser APIs (zero bytes shipped)**.
The added code is the pyramid math (~1 KB) + the worker glue + `.dzi` XML string assembly.
**Expected added: ≤ ~3 KB gzipped** (likely worker-chunked, off the critical island entirely —
generation is author/bake-time, not viewer-load-time, so it need not enter `ExhibitView` at all).

---

## Step 3 — Verdict

The web slicer is **feasible in-browser**: the geometry is verified headlessly, the encode
path is standard OffscreenCanvas-in-worker, and its bundle cost is near-zero (≤3 KB gz, and
plausibly *zero* on the viewer island since tiling is a bake-time concern). The slicer does
**not** cause the 240 KB overage — that overage is the pre-existing OSD/Annotorious island
mass and is a separate axis-16 problem either way. Parking tiling (NO-GO → v1.2) would force
the desktop-Rust / external-IIIF route to fill the `tileSource` descriptor; those remain valid
fallbacks regardless, but they don't justify *blocking* a generator this cheap to ship. The
only honest gate (Q-9/Q-10: feasible AND within an agreed cap) is satisfied because the
slicer's *own* delta is tiny.

VERDICT: GO

**Task 7 bundle-delta CAP:** the tiling generator must add **≤ 5 KB gzipped to any chunk the
viewer loads**, and SHOULD add **0 KB to the `ExhibitView` island** (generation is author/
bake-time → keep it in a separate worker/studio chunk, never on the viewer critical path).
Exceeding this cap re-opens the decision. Independently, the 282.4 KB island overage must be
tracked as its own axis-16 ticket (re-baseline 240 KB or split Annotorious) — it is NOT a
tiling task and must not be charged against this CAP.
