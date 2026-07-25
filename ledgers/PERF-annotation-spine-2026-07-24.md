# PERF — annotation spine + zip serialize (2026-07-24, second sweep)

Follow-on to `PERF-image-pipeline-2026-07-24.md`, which made image ENCODE 19–37x. This sweep asked
where the remaining wall-clock is. Same method: measure first, and let the numbers kill the guesses.

Harness: vitest in-process for pure logic (`packages/render-core`), `scripts/perf/fsrun.mjs` +
`fsbench.ts` (new — real Chromium, real OPFS) for the fs write path.

## Three hypotheses the measurement killed

Recording these because each looked obviously right from reading the code, and each was wrong.

**1. `writeTilePyramid` is the same serial-await bug as the slicer.** `publish/site.ts:250` walks a
1033-tile Map with a serial `await getFile → writable → write → close`. Identical shape to the encode
loop that was 19x. Measured (`scripts/perf/fsbench.ts`, real backends, 1033 tiles):

| backend | serial (shipped) | best concurrent | |
|---|---|---|---|
| OPFS (folder publish sink) | 509 ms | 222 ms @ ×64 | **2.3x**, and mostly by ×4 |
| zip-stream (`.archie.zip` sink) | 302 ms | 368 ms @ ×4 | **0.8x — slower** |
| memory (scheduling floor) | 71 ms | 48 ms | 1.5x |

The zip sink serializes commits through its own `tail` chain by design, so concurrency there buys
nothing and costs scheduling. Not worth changing for 2.3x on one backend against a 460 ms encode.

**2. The publish ENGINE is a scaling wall.** It is linear and cheap: a 100-exhibit × 20-object library
with 40 000 annotations publishes its whole data tree in **359 ms** (10×7×5 → 9 ms; 50×10×10 → 49 ms).

**3. The viewer search index is a freeze.** Linear, and modest: MiniSearch `addAll` is 174 ms at
20 000 notes (7 ms at 500). One-time per overlay open. Left alone.

## What was actually slow: the interactive edit path

Every `AnnotationSession` mutation replaces `this.log` with a new array, which invalidates the
identity-keyed memos on `heads()` and `conflicts()`. Both then rebuilt by scanning the WHOLE log —
and each built its own `headsByLogicalId`, so the same group-by ran **twice per edit**. Attribution
at 8000 records (`edit + notes() + conflicts()`, 4.31 ms total):

| pass | cost | share |
|---|---|---|
| `projectHeads` (what `notes()` recomputes) | 2.468 ms | 57% |
| `headsByLogicalId` (what `conflicts()` ALSO does) | 1.531 ms | 36% |
| `linearHead`'s whole-log `filter` (inside `appendEdit`) | 0.234 ms | 5% |
| `[...log, record]` + `Object.freeze` | 0.008 ms | **0.2%** |

The array copy — the thing that looks most obviously wasteful — was 0.2% of it. Had this not been
measured, the "fix" would have been to break the immutable-log contract for nothing.

## What shipped

**`spine/head-index.ts` (new) — `HeadIndex`.** The same projection, maintained incrementally: a
record touches exactly one logicalId, so only that group's heads can change. Per append it is
O(versions of that note) plus one binary-searched splice, independent of log length. Wired into
`AnnotationSession` (`heads`/`notes`/`conflicts`/`conflictHeads`), which now folds each new record in
with `index.append` and rebuilds via `setLog` on merge/resolve.

**`spine/log.ts` — `linearHeadOf`.** The absent / plural / cyclic guards, extracted so they have ONE
definition reachable two ways: by scanning (`linearHead`, unchanged) or from the index. `appendEdit`
and `appendDelete` take an optional pre-resolved head, so the session's O(1) route runs the *same*
guards rather than a second copy that could drift.

Measured, before vs after — the "before" is not a transcription: `projectHeads`/`headsByLogicalId`/
`linearHead` are still exported and unchanged, so the old per-edit work is composed from them in the
same process on the same log.

| log size | before | after | |
|---|---|---|---|
| 500 | 0.36 ms | 0.016 ms | 23x |
| 2 000 | 0.95 ms | 0.007 ms | 131x |
| 8 000 | 5.01 ms | 0.016 ms | 314x |
| 20 000 | **17.75 ms** | **0.137 ms** | **130x** |

The per-edit cost is now flat instead of linear, so bulk loops (App.svelte's per-canvas bulk delete
at :517/:890 and carry-on-replace at :948) stop being quadratic: deleting 200 of 4000 went
**21 ms → 1 ms**. At 20 000 records the old path was past this repo's own 16 ms interactivity bar for
a SINGLE edit.

**`fs/zip.ts` — per-entry compression level in `toZip()`.** A published library is overwhelmingly
JPEG tiles/thumbnails/masters, already entropy-coded. Measured on a 1073-entry, 9.4 MB tree shaped
like one pyramid: deflate at fflate's default cost **150 ms and saved 0.7%**; storing costs **19 ms**
(~8x) and 0.7% the other way. Media is now STORED, text still deflates. `toZip` is synchronous on the
main thread, so this is a hard freeze that scaled with library size.

## Verification

- render-core `tsc --noEmit` (TS7) clean · vitest **1135/1135** (93 files; was 1112/92 — +22
  head-index, +1 zip)
- studio `pnpm typecheck` clean · vitest **919/919** (68 files, unchanged) · svelte-check
  **1149 files, 0 errors, 0 warnings**
- viewer vitest **136/136** · svelte-check **1465 files, 0/0**
- `pnpm build` clean · `archie-viewer build.mjs --check` eager 32.9KB / total 261.8KB, both Δ+0KB
- `scripts/perf/worker-smoke.mjs`: both shipped workers still boot

### Why the HeadIndex tests look the way they do

`HeadIndex` is a performance MIRROR of `heads.ts`, so its only real contract is agreement. The tests
never assert hand-written expected values — they replay operation sequences (including 1000
randomized create/edit/delete steps across 5 seeds) and compare against `projectHeads` /
`headsByLogicalId` / `headsOf` / `linearHead` recomputed from scratch **after every step**.

That suite was then **mutation-tested, and the first version failed**: three deliberate bugs —
dropping the rev-sort on spliced-in plural heads, ignoring `mergeParents`, and never clearing the
plural set — ALL survived it. Root cause: every plural/merge test built the index with
`HeadIndex.from`, which shares almost no code with `append`, so the incremental path was only ever
exercised on single-head linear sequences. The added `incremental path through plural states` block
closes that, and a further mutant (`resplice` counting tombstone heads as occupying a slot) forced a
test for **an edit arriving after a tombstone head** — the delete-vs-edit conflict, where a
miscounted splice evicts a *neighbouring note* from the projection. All 8 mutants now die.

One non-obvious contract the tests pin: `heads()` array **identity**. `projectHeads` allocated per
call, so a Svelte `$derived` could treat "same array" as "nothing changed". The index mutates its
sorted array in place, so it hands out a snapshot that is stable between mutations and fresh after
each — without it the UI would silently strand on stale notes, a bug no assertion on contents would
catch and which vitest (no reactivity graph) cannot see.

## Not done — the next measured 10x, and why it needs a decision

**`append`'s full-log copy is now the dominant quadratic**, on the note-CREATION path. `append` is
`Object.freeze([...log, record])`, so building a log of N notes copies O(N²) elements. Attribution at
20 000 creates: **638 ms is the copy alone**; the new index adds 30 ms of the 777 ms total. It was
always there — it was just hidden behind the projection cost this sweep removed (at 8000 it is 0.2%
of an *edit*, but 66% of a *bulk create*).

Not fixed here because the fix subtracts a safety property rather than adding a provable mirror:
`append`'s "pure, returns a NEW frozen log" is relied on across the spine and the merge contract. The
contained version — the session accumulates into a mutable array and materializes a frozen snapshot
only when `entries` is read, the same shape as the heads snapshot above — is plausible but is a
design decision about the log's contract, not a local optimization. **Worth ~10x on bulk create;
needs a call.**

Also still open from the first sweep: an end-to-end publish measured over the 70-object fixture (the
tiling numbers remain bench-measured primitives), and `tileObject`/`tileRemote`'s main-thread decode
used only to read dimensions.
