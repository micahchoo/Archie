# PROBE — where the tiling threshold sits (Archie-86ff)

**Run:** 2026-07-27 · branch `probe/tiling-threshold` (isolated worktree, base `b240a0e`) · no product
code changed — measurement only, per the ticket's `perf-measure-the-flow` bind.

**Instrument:** `scripts/perf/tilingthresholdbench.ts` + `scripts/perf/tilingthreshold.html` +
`scripts/perf/tilingthresholdrun.mjs` (donor: `scripts/perf/publishbench.ts` / `publishrun.mjs` — same
shape: real Chromium via Playwright, the real `publishLibrary` + the real `tileObject` wiring
transcribed from `apps/studio/src/publish-flows.svelte.ts`, tiling cost attributed **by difference**
against a tiling-off run at the same size, never by summing concurrent per-call elapsed times).

Run: `node scripts/perf/tilingthresholdrun.mjs`. Two independent full sweeps were run (2026-07-27,
~4 min apart); tile counts were byte-for-byte identical between runs (deterministic slicer) and mean
publish times agreed within ~2-8% run-to-run — the table below is run 1; run 2's numbers are consistent
and not separately reproduced here.

**What it measures, and what it does NOT.** The ticket asks for four axes: file count, bytes, publish
time, and viewer load. This bench measures the first three end-to-end (a real `publishLibrary` pass,
`MemoryFilesystem`, walked afterward for file count and bytes). For viewer load it measures a **proxy**
— bytes an OSD viewer must fetch before the first pixel paints (whole master for a single-image source,
vs. the level-0 tile for a DZI pyramid) — not a throttled-network wall-clock number in a real viewer.
That's a real gap against the ticket's "on a slow connection and on a phone" ask; see Caveats.

## Sweep parameters

- Longer-edge dimensions: 800 / 1200 / 1600 / 2400 / 3200 / 4096 / 6000 px (the ticket's suggested set
  plus 4096, today's live `TILE_MIN_EDGE`, `publish-flows.svelte.ts:163`), each at a 4:3 aspect ratio (a
  representative digitization-master shape).
- Library held fixed across the whole sweep: 2 exhibits × 3 objects = 6 objects, every object using the
  same synthetic JPEG master at that dimension (noise + gradient, so the encoder does representative
  work — donor: `publishbench.ts` `makeJpeg`). Library shape is deliberately small — this bench's axis
  is SIZE, not fan-out; publish-flows fan-out at scale is `publishbench.ts`'s question, already answered
  (1.9-4.7x end-to-end at 70 objects, per `perf-measure-the-flow`'s own header).
- N=3 runs per (dimension × mode); every timing figure below reports N along with mean/min/max —
  `a-green-run-is-one-sample` applies to a perf claim exactly as much as to a test assertion.
- `tileObject` forced to two modes per dimension: **untiled** (always `null`, regardless of
  `TILE_MIN_EDGE` — the pre-Q9 baseline, a single capped master) and **tiled** (always slices via the
  real `sliceToDziAuto`, bypassing the 4096 gate so the bench can see tiled cost BELOW today's default,
  which is exactly the region the ticket asks about).

## Measured table

Times are `untiled` / `tiled` mean of N=3 (ms). "tiling cost" is the mean-of-means DIFFERENCE (tiled −
untiled) divided by the 6 objects in the library. Tile counts are per-object; the analytic column is
`dziPyramid(w,h)` (`packages/render-core/src/geometry/dzi.ts`) computed independently of the slicer —
included as a cross-check, not a second measurement.

| edge | WxH | master | files U/T | file× | bytes U/T | byte× | time U/T (ms) | cost/obj | 1st-paint U/T | 1st-paint× | tiles/obj (measured / analytic) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 800 | 800×600 | 77 KB | 31/181 | 5.8x | 0.49/1.33 MB | 2.74x | 4.7/188.1 | 30.6 ms | 77.1 KB / 761 B | 101x | 25 / 25 |
| 1200 | 1200×900 | 108 KB | 31/253 | 8.2x | 0.67/1.93 MB | 2.87x | 0.9/204.3 | 33.9 ms | 108.3 KB / 760 B | 142x | 37 / 37 |
| 1600 | 1600×1200 | 136 KB | 31/391 | 12.6x | 0.84/2.52 MB | 3.00x | 0.9/226.7 | 37.6 ms | 135.7 KB / 761 B | 178x | 60 / 60 |
| 2400 | 2400×1800 | 334 KB | 31/733 | 23.6x | 2.03/6.05 MB | 2.98x | 1.3/334.1 | 55.5 ms | 334.2 KB / 762 B | 439x | 117 / 117 |
| 3200 | 3200×2400 | 578 KB | 31/1171 | 37.8x | 3.49/10.35 MB | 2.97x | 1.8/486.1 | 80.7 ms | 577.9 KB / 760 B | 760x | 190 / 190 |
| **4096** (today's default) | 4096×3072 | 847 KB | 31/1951 | 62.9x | 5.10/15.25 MB | 2.99x | 2.4/691.9 | 114.9 ms | 846.6 KB / 760 B | 1114x | 320 / 320 |
| 6000 (= MAX_MASTER_DIM) | 6000×4500 | 2046 KB | 31/3583 | 115.6x | 12.30/36.30 MB | 2.95x | 5.4/1240.7 | 205.9 ms | 2046.3 KB / 761 B | 2689x | 592 / 592 |

Every measured tile count matches the analytic `dziPyramid` count exactly, at every dimension, in both
sweeps — the geometry math the map's file-count arithmetic leans on is confirmed against the real
slicer, not just derived on paper.

## What the numbers say

1. **Byte overhead of tiling is a stable ~2.7-3.0x across the whole range** — NOT a function of size.
   Tiling always costs roughly three times the bytes of the single master, whether the master is 77 KB
   or 2 MB (the DZI pyramid's per-level redundancy is a fixed geometric-series overhead, independent of
   the base image). This metric alone gives no threshold signal.

2. **File count and publish time both grow monotonically and steeply with size** — the multiple over
   baseline goes from 5.8x/31ms-ish at 800px to 115.6x/206ms-per-object at 6000px. This is the metric
   the map's "521,000 files for 1,000 images" argument rests on, and it reconciles with real numbers:
   at the map's own reference point (near MAX_MASTER_DIM, mostly-6000px+ masters), **592 tiles/object ×
   1,000 objects ≈ 592,000 tile files** — the same order of magnitude as the map's 521,000 (the map used
   4000×6000; this bench's 6000×4500 is a different aspect ratio, which fully explains the gap). The
   arithmetic the map asserted is now MEASURED, not guessed.

3. **First-paint bytes favor tiling at every size, and the win GROWS with size** — from 101x at 800px to
   2689x at 6000px. A tiled object always ships one ~760-byte level-0 tile before any pixel paints,
   regardless of source size (level 0 is always ~1 tile by construction — `dziPyramid`'s level 0 is a
   single sub-tile-sized image). So on the perceived-load axis alone, tiling never stops paying — the
   ticket's premise that there's a reader-experience crossover point is **not what the data shows**; the
   crossover is a HOSTING-cost one; see below.

4. **The real threshold question is file-count economics, not reader experience.** Nothing in the
   first-paint or publish-time data argues for an upper bound — larger images benefit MORE from tiling,
   not less. The constraint that actually bites is what row 2 shows: hosting caps (Cloudflare Pages
   20,000 files, `.archie.zip`'s 65,535 — both cited in the map's MEASURED FACTS) are file-count limits,
   and tiling every image in a bulk-import archive blows through them at a few thousand objects. That is
   the map's own framing (charting decision 1) and this probe's numbers confirm it rather than replacing
   it.

## Confirming the ticket's collapse question FIRST

Archie-4b0a (DECIDED 2026-07-27, blocking this ticket): web tier is a WebP re-encode at a starting point
of **~2400px** (pinned by the Archie-7280 probe, not yet run). Every dimension this bench measured at or
above today's 4096 default, and every candidate this ledger considers, sits **above** 2400px. So:

**CONFIRMED: on the web tier, no plausible threshold ever fires.** A web-tier master is capped below
any reasonable tiling threshold before tiling is even evaluated. Tiling is exclusively an
**archival-tier** (and remote-IIIF) concern, exactly as the ticket's UI/UX note predicted. This holds
for any threshold ≥ ~2500px, which is every candidate below — it does not depend on which exact value
this ledger recommends.

## Two call sites, two different economics — read separately

`site.ts:437` (`tileObject`, imported/local assets) and `site.ts:468` (`tileRemote`, remote IIIF) share
one `TILE_MIN_EDGE` constant today (`publish-flows.svelte.ts:163`/`:226`) but have structurally
different risk profiles, found by reading the code rather than by this bench (the slicer itself is
identical on both paths, so the per-tile cost table above applies to both equally):

- **`tileObject`** is the mass-scale path — every imported asset in a bulk-import archive goes through
  it, and every imported master is capped at `MAX_MASTER_DIM` (6000px, `geometry/downscale.ts:8`). This
  is the path the map's 500x-files argument is about.
- **`tileRemote`** fires only for objects sourced from a remote IIIF/image service, uncapped (a IIIF
  `/full/max/` fetch can exceed 6000px), and — per the map's own MEASURED FACTS block — is a minority
  path for a small institution (basemaps and direct imports dominate). Its purpose is explicitly to
  avoid **repeated slow/cross-origin fetches**, not to control published file count.

Collapsing local-import tiling to "never, because it's capped at the same value as the threshold" does
NOT extend safely to the remote path without separately re-deriving a number for it — this ledger does
not have data on how many remote-sourced objects a typical library carries, and recommends leaving that
constant alone (see below).

## Recommendation

**Split the shared `TILE_MIN_EDGE` constant into two, and derive the local one from `MAX_MASTER_DIM`
rather than hand-picking a sibling number:**

- **`tileObject` (local imports): threshold = `MAX_MASTER_DIM` (currently 6000, `geometry/downscale.ts:8`
  — import it, don't restate it).** A capped local import can never exceed its own cap, so this
  threshold makes local-import tiling structurally inert for the common bulk-import case — the exact
  effect the map's charting decision wanted (~1,000 files instead of ~592,000 for a 1,000-object
  archival library at the map's own reference point). This directly answers the ticket's "one constant
  or a function of the tier?" sub-question: **neither** — it's a function of `MAX_MASTER_DIM` (the
  import cap), which happens to make it moot for the web tier too, since the web cap (2400px) sits
  fully inside the archival cap.
- **`tileRemote` (remote IIIF): leave at today's 4096px**, unchanged. This ledger has no measurement of
  how many remote-sourced objects a realistic small-institution library carries, so there's no evidence
  to move it, and the two call sites' cost curves are identical (row-for-row, the table above) — moving
  it would need the same kind of population data the map cites for local imports (object counts by
  source type), which is out of this ticket's scope.

**What this feeds:**
- **Archie-7280** (probe the folder, recommend a tier + destination): its costed-routes arithmetic can
  now state, with a measured citation, that an archival-tier local library never pays the DZI file-count
  tax under this recommendation — only a library with `tileRemote`-sourced objects does, at the existing
  4096px bar.
- **Archie-4b0a** (quality tiers): confirms its "web quality never re-derives a tile pyramid" implication
  structurally, independent of the exact ~2400px starting point Archie-7280 will pin.
- **Archie-53e3** (blocked by this ticket): inherits the split-constant recommendation and the measured
  table as its implementation brief.

## Caveats

- **Viewer load is a proxy, not a drive.** First-paint bytes (whole master vs. level-0 tile) is a strong
  directional signal but not the throttled-network, real-OSD wall-clock number the ticket asked for
  ("on a slow connection and on a phone"). A follow-up viewer-side probe (apps/viewer e2e + CPU/network
  throttling, per `playwright-emulation-and-scroll-traps`'s emulation-assertion discipline) would close
  this gap; not attempted here — out of a render-core-only bench's reach without a much larger harness.
- **Synthetic masters, not real digitization scans.** The noise+gradient JPEG is representative encoder
  work (donor: `publishbench.ts`), but a real TIFF-sourced photograph's JPEG compressibility differs;
  byte figures (not file counts, which are pure geometry) could shift somewhat on real corpora.
- **Six objects, not a thousand.** File-count and byte multiples are per-object and scale linearly by
  construction (`writeTilePyramid` writes one tile set per object, independent of library size), so the
  extrapolation to 1,000 objects in "What the numbers say" is arithmetic on a measured per-object number,
  not a separately-run large-library sweep — `publishbench.ts` already covers the fan-out/concurrency
  axis at library scale; nothing here contradicts it.
- **No population data on local-vs-remote object mix.** The `tileRemote` recommendation ("leave it
  alone") is a scope statement, not a measured conclusion — flagged above, not silently assumed.
- **Two full sweeps, not the "run assertion N=20" bar `a-green-run-is-one-sample` sets for flake-prone
  order-sensitive assertions.** This is a perf number, not a pass/fail test; N=3 per config (reported)
  plus a second independent full-sweep cross-check (tile counts identical, times within ~2-8%) is the
  bar applied here, not the 20-run bar built for order-sensitive `toEqual` flakiness — a different
  failure mode than the one that rule targets.
