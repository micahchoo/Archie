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

---

# ADDENDUM — end-to-end validation (2026-07-24, later)

The follow-up above ("the tiling numbers are bench-measured, not observed in a real publish") was
run. `scripts/perf/publishbench.ts` drives the real `publishLibrary` over a whole library, with
`tileObject` transcribed from `publish-flows.svelte.ts`, into the real fs backends.

**It found a bug in what this ledger shipped, and it cut the headline number by an order of magnitude.**

## 1. The worker pool self-destructed at library scale, silently

`sliceToDziPooled` created a fresh pool per call, and `POOL_BYTE_BUDGET` bounded only that one call.
The real caller is not one call: `publishLibrary` runs `mapLimit(exhibits, 6)` over an **uncapped**
`Promise.all` across each exhibit's objects, so a 10×7 library reaches ~42 simultaneous `tileObject`
calls → ~42 × 8 = **336 workers**, each decoding its own ~76 MB source (~25 GB asked for at once).

Measured at 70 objects: every pool died (`The source image could not be decoded` / `Readback of the
source image has failed`) and **all 70 fell back to the inline slicer**. The publish succeeded and
looked healthy. This is exactly the silent degradation the fallback was flagged for — the difference
is that here it was firing in the product's own realistic path, and only an end-to-end measurement
could see it. The isolated bench measured one image at a time, which is the one condition the caller
never satisfies.

Fixed with a process-wide gate (`withPoolGate`) so one pyramid slices at a time; concurrent callers
queue instead of competing for memory that does not exist. Serializing costs nothing real — the
parallelism that matters is *within* a pyramid. Regression tests in `dzi-slice-pool.test.ts`.
(`bake-async.ts` never had this: its pool is module-level and shared. The asymmetry is the bug.)

## 2. The honest end-to-end number is 1.9x–4.7x, not 37x

5000×3800 masters (the band `MAX_MASTER_DIM`/`TILE_MIN_EDGE` actually allow for an import), every
object tileable — the worst case. `serial` is the real pre-change slicer at `encodeConcurrency = 1`.
Tiling share is computed by DIFFERENCE against the same publish with tiling off; summing per-call
timers double-counts, because objects tile concurrently (the first draft of this bench reported
"tiling = 883% of total", which is how that was caught).

| library | sink | serial | pooled | end-to-end |
|---|---|---|---|---|
| 10 objects | OPFS | 8422 ms | 2126 ms | **4.0x** |
| 10 objects | zip-stream | 7805 ms | 1675 ms | **4.7x** |
| 70 objects | OPFS | 24875 ms | 12954 ms | **1.9x** |
| 70 objects | zip-stream | 20294 ms | 10909 ms | **1.9x** |

**Why the gap.** The publish engine ALREADY fans out across objects. 42 objects each idling on serial
encode round-trips still keep the CPU busy, so cross-object concurrency was recovering most of the
waste that the per-image fix removes. At 70 objects `serial → inline` is only **1.26x**, against 19x
for a single image in isolation. The per-image win was substantially redundant with concurrency the
engine already had — invisible from the primitive, obvious from the flow.

**What the target choice got right:** tiling really is ~99% of publish wall-clock in the all-tileable
case (a 70-object publish with tiling off is 179 ms). So tiling was the correct thing to attack; only
the magnitude was overstated.

**Where the floor is.** 12954 ms / 70 ≈ 185 ms per image, against ~170 ms for one 5000×3800 pyramid
measured alone — ~92% efficiency. The pool is saturated and the remaining time is real encode work
(~26 600 tiles). Further gain needs fewer or cheaper encodes (quality, level count), which is a
product decision, not a scheduling one.

## Lesson for the next sweep

A primitive benchmarked in isolation can be both correct and irrelevant. Two things only the
end-to-end run could show: that the caller's concurrency had already claimed most of the win, and
that the optimization actively broke itself at real scale while reporting success.

---

# ADDENDUM — end-to-end validation (2026-07-24, later)

The follow-up above ("the tiling numbers are bench-measured, not observed in a real publish") was
run. `scripts/perf/publishbench.ts` drives the real `publishLibrary` over a whole library, with
`tileObject` transcribed from `publish-flows.svelte.ts`, into the real fs backends.

**It found a bug in what this ledger shipped, and it cut the headline number by an order of magnitude.**

## 1. The worker pool self-destructed at library scale, silently

`sliceToDziPooled` created a fresh pool per call, and `POOL_BYTE_BUDGET` bounded only that one call.
The real caller is not one call: `publishLibrary` runs `mapLimit(exhibits, 6)` over an **uncapped**
`Promise.all` across each exhibit's objects, so a 10×7 library reaches ~42 simultaneous `tileObject`
calls → ~42 × 8 = **336 workers**, each decoding its own ~76 MB source (~25 GB asked for at once).

Measured at 70 objects: every pool died (`The source image could not be decoded` / `Readback of the
source image has failed`) and **all 70 fell back to the inline slicer**. The publish succeeded and
looked healthy. This is exactly the silent degradation the fallback was flagged for — the difference
is that here it was firing in the product's own realistic path, and only an end-to-end measurement
could see it. The isolated bench measured one image at a time, which is the one condition the caller
never satisfies.

Fixed with a process-wide gate (`withPoolGate`) so one pyramid slices at a time; concurrent callers
queue instead of competing for memory that does not exist. Serializing costs nothing real — the
parallelism that matters is *within* a pyramid. Regression tests in `dzi-slice-pool.test.ts`.
(`bake-async.ts` never had this: its pool is module-level and shared. The asymmetry is the bug.)

## 2. The honest end-to-end number is 1.9x–4.7x, not 37x

5000×3800 masters (the band `MAX_MASTER_DIM`/`TILE_MIN_EDGE` actually allow for an import), every
object tileable — the worst case. `serial` is the real pre-change slicer at `encodeConcurrency = 1`.
Tiling share is computed by DIFFERENCE against the same publish with tiling off; summing per-call
timers double-counts, because objects tile concurrently (the first draft of this bench reported
"tiling = 883% of total", which is how that was caught).

| library | sink | serial | pooled | end-to-end |
|---|---|---|---|---|
| 10 objects | OPFS | 8422 ms | 2126 ms | **4.0x** |
| 10 objects | zip-stream | 7805 ms | 1675 ms | **4.7x** |
| 70 objects | OPFS | 24875 ms | 12954 ms | **1.9x** |
| 70 objects | zip-stream | 20294 ms | 10909 ms | **1.9x** |

**Why the gap.** The publish engine ALREADY fans out across objects. 42 objects each idling on serial
encode round-trips still keep the CPU busy, so cross-object concurrency was recovering most of the
waste that the per-image fix removes. At 70 objects `serial → inline` is only **1.26x**, against 19x
for a single image in isolation. The per-image win was substantially redundant with concurrency the
engine already had — invisible from the primitive, obvious from the flow.

**What the target choice got right:** tiling really is ~99% of publish wall-clock in the all-tileable
case (a 70-object publish with tiling off is 179 ms). So tiling was the correct thing to attack; only
the magnitude was overstated.

**Where the floor is.** 12954 ms / 70 ≈ 185 ms per image, against ~170 ms for one 5000×3800 pyramid
measured alone — ~92% efficiency. The pool is saturated and the remaining time is real encode work
(~26 600 tiles). Further gain needs fewer or cheaper encodes (quality, level count), which is a
product decision, not a scheduling one.

## Lesson for the next sweep

A primitive benchmarked in isolation can be both correct and irrelevant. Two things only the
end-to-end run could show: that the caller's concurrency had already claimed most of the win, and
that the optimization actively broke itself at real scale while reporting success.

---

# ADDENDUM — end-to-end validation (2026-07-24, later)

The follow-up above ("the tiling numbers are bench-measured, not observed in a real publish") was
run. `scripts/perf/publishbench.ts` drives the real `publishLibrary` over a whole library, with
`tileObject` transcribed from `publish-flows.svelte.ts`, into the real fs backends.

**It found a bug in what this ledger shipped, and it cut the headline number by an order of magnitude.**

## 1. The worker pool self-destructed at library scale, silently

`sliceToDziPooled` created a fresh pool per call, and `POOL_BYTE_BUDGET` bounded only that one call.
The real caller is not one call: `publishLibrary` runs `mapLimit(exhibits, 6)` over an **uncapped**
`Promise.all` across each exhibit's objects, so a 10×7 library reaches ~42 simultaneous `tileObject`
calls → ~42 × 8 = **336 workers**, each decoding its own ~76 MB source (~25 GB asked for at once).

Measured at 70 objects: every pool died (`The source image could not be decoded` / `Readback of the
source image has failed`) and **all 70 fell back to the inline slicer**. The publish succeeded and
looked healthy. This is exactly the silent degradation the fallback was flagged for — the difference
is that here it was firing in the product's own realistic path, and only an end-to-end measurement
could see it. The isolated bench measured one image at a time, which is the one condition the caller
never satisfies.

Fixed with a process-wide gate (`withPoolGate`) so one pyramid slices at a time; concurrent callers
queue instead of competing for memory that does not exist. Serializing costs nothing real — the
parallelism that matters is *within* a pyramid. Regression tests in `dzi-slice-pool.test.ts`.
(`bake-async.ts` never had this: its pool is module-level and shared. The asymmetry is the bug.)

## 2. The honest end-to-end number is 1.9x–4.7x, not 37x

5000×3800 masters (the band `MAX_MASTER_DIM`/`TILE_MIN_EDGE` actually allow for an import), every
object tileable — the worst case. `serial` is the real pre-change slicer at `encodeConcurrency = 1`.
Tiling share is computed by DIFFERENCE against the same publish with tiling off; summing per-call
timers double-counts, because objects tile concurrently (the first draft of this bench reported
"tiling = 883% of total", which is how that was caught).

| library | sink | serial | pooled | end-to-end |
|---|---|---|---|---|
| 10 objects | OPFS | 8422 ms | 2126 ms | **4.0x** |
| 10 objects | zip-stream | 7805 ms | 1675 ms | **4.7x** |
| 70 objects | OPFS | 24875 ms | 12954 ms | **1.9x** |
| 70 objects | zip-stream | 20294 ms | 10909 ms | **1.9x** |

**Why the gap.** The publish engine ALREADY fans out across objects. 42 objects each idling on serial
encode round-trips still keep the CPU busy, so cross-object concurrency was recovering most of the
waste that the per-image fix removes. At 70 objects `serial → inline` is only **1.26x**, against 19x
for a single image in isolation. The per-image win was substantially redundant with concurrency the
engine already had — invisible from the primitive, obvious from the flow.

**What the target choice got right:** tiling really is ~99% of publish wall-clock in the all-tileable
case (a 70-object publish with tiling off is 179 ms). So tiling was the correct thing to attack; only
the magnitude was overstated.

**Where the floor is.** 12954 ms / 70 ≈ 185 ms per image, against ~170 ms for one 5000×3800 pyramid
measured alone — ~92% efficiency. The pool is saturated and the remaining time is real encode work
(~26 600 tiles). Further gain needs fewer or cheaper encodes (quality, level count), which is a
product decision, not a scheduling one.

## Lesson for the next sweep

A primitive benchmarked in isolation can be both correct and irrelevant. Two things only the
end-to-end run could show: that the caller's concurrency had already claimed most of the win, and
that the optimization actively broke itself at real scale while reporting success.


---

# ADDENDUM 2 — the ingest claim was wrong (2026-07-24, later still)

The last unvalidated figure from this ledger ("the 22.4 s ingest number is arithmetic, not a measured
70-file import") was measured. `scripts/perf/ingestbench.ts`, 70 real 6000x4000 files, 67 MB:

| | 70-file import |
|---|---|
| SERIAL, DOM canvas (pre-change) | 21.27 s |
| SERIAL, worker pool (**what ships**) | **20.05 s — 1.06x** |
| concurrent x2, same worker pool | 10.28 s (2.1x) |
| concurrent x4, same worker pool | **5.60 s (3.8x)** |
| concurrent x6 | **crashed** — `InvalidStateError: The source image could not be decoded` |

**The "7.9x" in the section above is wrong, and the error is instructive.** It came from a fleet of 24
concurrent bakes — but `ingest-flows.ts#addFiles` is a strictly SERIAL `for` loop
(`await addObjectFromFile` per file). I measured a shape the caller does not have. Same mistake as the
tiling headline, one sweep later, in the same ledger.

What the worker pool actually buys on ingest is **1.06x of throughput and a responsive UI** — per image
the worker was never faster (315 ms vs 319 ms, measured in the original sweep); the work is relocated,
not reduced. A 70-file import still takes ~20 s. It is no longer 20 s of frozen browser, which is a
real and worthwhile improvement — it is just not a throughput win, and this ledger claimed one.

## The 3.8x that IS available, and what blocks it

Bounded concurrency in `addFiles` reaches 5.60 s at x4 with the pool that already ships. Three things
block it, none of them incidental:

1. **The terminal storage refusal.** `if (r.reason === "storage") { notAttempted = …; break; }` assumes
   sequential order — the device is full, so every later write is doomed. Under concurrency, in-flight
   files still land (the residue `mapLimit`'s own contract warns about).
2. **Progress reporting.** `run.tick({ index: i + 1, total })` is sequential by construction.
3. **Object order.** `AppendBatch` appends in file order; concurrent completion would reorder objects
   inside the exhibit, which the author sees.

And a hard ceiling: **x6 crashed**, decoding failures under memory pressure — the same failure mode as
the per-call DZI pools (ADDENDUM 1). `bake-async`'s pool is `POOL_MAX = 6`, so six concurrent callers
put six 96 MB decodes in flight at once. Any concurrency here is bounded at ~4 AND wants the byte
budget the DZI pool now has, not a core count.


---

# ADDENDUM 2 — the ingest claim was wrong (2026-07-24, later still)

The last unvalidated figure from this ledger ("the 22.4 s ingest number is arithmetic, not a measured
70-file import") was measured. `scripts/perf/ingestbench.ts`, 70 real 6000x4000 files, 67 MB:

| | 70-file import |
|---|---|
| SERIAL, DOM canvas (pre-change) | 21.27 s |
| SERIAL, worker pool (**what ships**) | **20.05 s — 1.06x** |
| concurrent x2, same worker pool | 10.28 s (2.1x) |
| concurrent x4, same worker pool | **5.60 s (3.8x)** |
| concurrent x6 | **crashed** — `InvalidStateError: The source image could not be decoded` |

**The "7.9x" in the section above is wrong, and the error is instructive.** It came from a fleet of 24
concurrent bakes — but `ingest-flows.ts#addFiles` is a strictly SERIAL `for` loop
(`await addObjectFromFile` per file). I measured a shape the caller does not have. Same mistake as the
tiling headline, one sweep later, in the same ledger.

What the worker pool actually buys on ingest is **1.06x of throughput and a responsive UI** — per image
the worker was never faster (315 ms vs 319 ms, measured in the original sweep); the work is relocated,
not reduced. A 70-file import still takes ~20 s. It is no longer 20 s of frozen browser, which is a
real and worthwhile improvement — it is just not a throughput win, and this ledger claimed one.

## The 3.8x that IS available, and what blocks it

Bounded concurrency in `addFiles` reaches 5.60 s at x4 with the pool that already ships. Three things
block it, none of them incidental:

1. **The terminal storage refusal.** `if (r.reason === "storage") { notAttempted = …; break; }` assumes
   sequential order — the device is full, so every later write is doomed. Under concurrency, in-flight
   files still land (the residue `mapLimit`'s own contract warns about).
2. **Progress reporting.** `run.tick({ index: i + 1, total })` is sequential by construction.
3. **Object order.** `AppendBatch` appends in file order; concurrent completion would reorder objects
   inside the exhibit, which the author sees.

And a hard ceiling: **x6 crashed**, decoding failures under memory pressure — the same failure mode as
the per-call DZI pools (ADDENDUM 1). `bake-async`'s pool is `POOL_MAX = 6`, so six concurrent callers
put six 96 MB decodes in flight at once. Any concurrency here is bounded at ~4 AND wants the byte
budget the DZI pool now has, not a core count.


---

# ADDENDUM 2 — the ingest claim was wrong (2026-07-24, later still)

The last unvalidated figure from this ledger ("the 22.4 s ingest number is arithmetic, not a measured
70-file import") was measured. `scripts/perf/ingestbench.ts`, 70 real 6000x4000 files, 67 MB:

| | 70-file import |
|---|---|
| SERIAL, DOM canvas (pre-change) | 21.27 s |
| SERIAL, worker pool (**what ships**) | **20.05 s — 1.06x** |
| concurrent x2, same worker pool | 10.28 s (2.1x) |
| concurrent x4, same worker pool | **5.60 s (3.8x)** |
| concurrent x6 | **crashed** — `InvalidStateError: The source image could not be decoded` |

**The "7.9x" in the section above is wrong, and the error is instructive.** It came from a fleet of 24
concurrent bakes — but `ingest-flows.ts#addFiles` is a strictly SERIAL `for` loop
(`await addObjectFromFile` per file). I measured a shape the caller does not have. Same mistake as the
tiling headline, one sweep later, in the same ledger.

What the worker pool actually buys on ingest is **1.06x of throughput and a responsive UI** — per image
the worker was never faster (315 ms vs 319 ms, measured in the original sweep); the work is relocated,
not reduced. A 70-file import still takes ~20 s. It is no longer 20 s of frozen browser, which is a
real and worthwhile improvement — it is just not a throughput win, and this ledger claimed one.

## The 3.8x that IS available, and what blocks it

Bounded concurrency in `addFiles` reaches 5.60 s at x4 with the pool that already ships. Three things
block it, none of them incidental:

1. **The terminal storage refusal.** `if (r.reason === "storage") { notAttempted = …; break; }` assumes
   sequential order — the device is full, so every later write is doomed. Under concurrency, in-flight
   files still land (the residue `mapLimit`'s own contract warns about).
2. **Progress reporting.** `run.tick({ index: i + 1, total })` is sequential by construction.
3. **Object order.** `AppendBatch` appends in file order; concurrent completion would reorder objects
   inside the exhibit, which the author sees.

And a hard ceiling: **x6 crashed**, decoding failures under memory pressure — the same failure mode as
the per-call DZI pools (ADDENDUM 1). `bake-async`'s pool is `POOL_MAX = 6`, so six concurrent callers
put six 96 MB decodes in flight at once. Any concurrency here is bounded at ~4 AND wants the byte
budget the DZI pool now has, not a core count.
