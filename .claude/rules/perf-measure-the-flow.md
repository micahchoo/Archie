---
scope:
  - packages/render-core/src/spine/**
  - packages/render-core/src/session/**
  - apps/studio/src/dzi-*.ts
  - apps/studio/src/bake-*.ts
  - scripts/perf/**
tags: [perf, benchmarking, workers, spine]
priority: high
source: hand-written
---

# Perf here: measure the FLOW, and ratchet what you win

Two sweeps on 2026-07-24 (`ledgers/PERF-image-pipeline-*.md`, `ledgers/PERF-annotation-spine-*.md`)
established three things the hard way. Each cost a wrong conclusion before it was caught.

## 1. A primitive benchmark in this codebase is not evidence about a user flow

The tiling work measured **19–37x** on one image. End-to-end over a library it is **1.9–4.7x**,
because `publishLibrary` already fans out across objects (`mapLimit(exhibits, 6)` over an *uncapped*
`Promise.all` per exhibit), so the serial slicer's idle time was already being hidden by cross-object
concurrency. At 70 objects `serial → inline` is 1.26x against 19x for one image alone.

**Apply:** an optimization on anything `publishLibrary` or `ingest-flows` calls per object is not
done until `node scripts/perf/publishrun.mjs` shows the number move. Report the end-to-end figure as
the headline; the primitive is supporting detail.

Corollary for attribution: those call sites run CONCURRENTLY, so **summing per-call elapsed times
double-counts**. The first draft of `publishbench.ts` reported "tiling = 883% of total". Attribute by
DIFFERENCE against a run with the stage disabled.

## 2. A per-call worker pool will destroy itself at library scale, silently

`sliceToDziPooled` budgeted memory per call (`POOL_BYTE_BUDGET`) while the caller made ~42 calls at
once — ~336 workers, each decoding its own ~76 MB source. Every pool died and all 70 objects fell
back to the inline slicer, with a successful, healthy-looking publish.

**Apply:** a worker pool is process-wide, never per call — `bake-async.ts`'s module-level `pool` is
the pattern; `dzi-slice-pool.ts`'s `withPoolGate` is the retrofit. And because both call sites
degrade **silently** by design (tiling must never turn a slow publish into a failed one), a fallback
needs a way to be seen: `bakeFallbackCount()`, and `scripts/perf/worker-smoke.mjs` in CI. If you add
a third worker path, it gets both.

## 3. The spine's hot path is per-EDIT, and regressions there are invisible

`AnnotationSession` replaces its log on every mutation, so any identity-keyed memo over the whole log
is rebuilt per edit. That was 17.75 ms per edit at 20k records — past the 16 ms bar — and made every
bulk loop quadratic. `spine/head-index.ts` maintains the projection incrementally instead.

**Apply:**
- Never add a whole-log operation to `createNote` / `editNote` / `deleteNote` or to `notes()` /
  `conflicts()`. Need a head? `index.linearHead(id)` / `index.headsOf(id)`, not `linearHead(log, id)`.
- `HeadIndex` must agree with `heads.ts` exactly. Change a projection in `heads.ts` and
  `head-index.test.ts` is what tells you this drifted — it asserts agreement, never hand-written
  values.
- `head-index.perf.test.ts` is the ratchet. Its bounds are RATIOS against a single pass over the same
  log, measured in the same process, so they are machine-independent. Don't replace them with
  millisecond thresholds, and don't loosen one to make a change pass — that is the regression.
- `session.records` is appended IN PLACE; `entries` hands out a frozen snapshot. Don't "simplify" it
  by returning `records` directly (it would grow under a caller holding it) and don't reintroduce
  `append`'s `[...log, record]` on the session path (O(log) per write ⇒ quadratic bulk create).

## Writing the tests for any of this

Equivalence and perf suites here are both easy to write in a way that cannot fail. Both happened:

- The first `HeadIndex` equivalence suite passed with **three deliberate bugs injected**, because
  every plural/merge case went through `from()` while the incremental `append()` path was only ever
  exercised on linear single-head sequences.
- The first perf gate passed with a **reverted `deleteNote` scan**, because "a fraction of a full
  projection" is a bound loose enough for a plain scan to slip under.

So: **inject the bug and watch the test fail** before trusting it. `head-index.perf.test.ts`'s header
records which regressions are caught and which are not — keep that list honest rather than implying
the gate is total.
