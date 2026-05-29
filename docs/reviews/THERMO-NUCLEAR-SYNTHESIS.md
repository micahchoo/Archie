# Thermo-Nuclear Code-Quality Review — Synthesis (all subsystems)

**Date:** 2026-05-29 · **Branch:** `main` · **Scope:** full-source audit, every subsystem.
Per-subsystem detail: [`thermo-studio.md`](thermo-studio.md), [`thermo-viewer.md`](thermo-viewer.md),
[`thermo-render-core.md`](thermo-render-core.md), [`thermo-render-mount-svelte.md`](thermo-render-mount-svelte.md).

## Overall verdict: **Pragmatic Partial**

The codebase is competently built and its apparent complexity is overwhelmingly ADR-justified — the
review found **no spaghetti regressions to undo and no unjustified abstractions to tear out**. What it
found instead is **duplication that wants deleting**, concentrated on the read seam. Nothing here is a
"behavior is wrong" finding; everything is "the same behavior can be expressed once instead of three
times." That is exactly the outcome the harsh pass is for.

Per-subsystem verdicts: studio **Pragmatic Partial** (1 deferred blocker), viewer **Pragmatic Partial**,
render-core **Pragmatic Partial**, render-mount + render-svelte **Full Coherence** (clean — deep
modules, nothing to do but delete 3 dead exports).

## THE GLOBAL DOMINO — unify the three published-tree readers (crosses render-core ↔ viewer)

This was found **independently by the viewer agent and the render-core agent**, with the same remedy.
It is the single highest-leverage move in the whole codebase.

Three functions read the **identical** published on-disk layout with the **same traversal**
(manifest → objectsFromManifest → canvasIdMap → sectionsFromManifest → per-object annotation pages → rightsFromIIIF):

| Reader | Location | Byte source | Post-transform | Readings? |
|---|---|---|---|---|
| `readPublishedExhibit` | `render-core/publish/site.ts:329` | Filesystem | identity | **no** (ADR-0007 drift) |
| `loadPortableExhibit` | `render-core/publish/portable.ts:134` | Filesystem | blob-rewrite + revoke | yes |
| `loadPublishedExhibit` | `apps/viewer/src/published.ts:139` | HTTP fetch | identity | yes |

They vary on exactly **two axes, each with ≥2 real implementors** — byte source (fs vs HTTP) and
post-transform (identity vs blob-rewrite). The seam discriminator passes; this is a real seam, not a
hypothetical one. **ADR-0010 explicitly defers this exact deletion** ("the portable reader
re-implements the readings read ~30 LOC") — so this is paying down a *sanctioned* debt, not inventing churn.

**Remedy:** extract `readExhibitTree(source, slug, transform?)` in `render-core/publish`, parameterized by
a `ReadSource`/`JsonSource` (fetch-backed + Filesystem-backed are the two implementors), with the
blob-rewrite as the optional transform. The viewer's HTTP reader becomes a thin source; the portable
reader becomes the transform. Collapses render-core Findings 1–3 **and** viewer M1.

**Two caveats baked in by the agents (honor them):**
1. The blob transform is **fs-coupled** — it reads asset bytes via `mintAssetBlob`, not pure notes→notes.
   Keep it as a transform hook, don't pretend it's pure.
2. Keep the unification **behavior-preserving**: `site.ts` currently ignores readings. The ADR-0007
   readings fix is a **separate behavior change** — flag it, land it on its own, do not smuggle it into the refactor.

## CROSS-CUTTING #2 — note-body accessors duplicated across studio, viewer, and core's own tests

Independently flagged by studio (MAJOR + hook), viewer (M2/M3), and render-core (the missing helper).
**The reconciliation the per-subsystem agents could not make:** there are **two distinct annotation
shapes**, so this is *not* one helper — it is one existing helper plus one missing one.

- **Internal `AnnotationRecord`** (flat `.reading`): `render-core/query/filter.ts` **already exports**
  `tagsOf` / `baseNotes` / `filterByReading`. **Studio** hand-rolls `tagsOf`/`bodies`/`commentOf` and the
  reading-filter ternary instead of importing these → **route studio through the existing canonical helper** (Standard 6). No new code.
- **Published `W3CAnnotation`** (nested `archie:reading`): **viewer** reimplements `bodies`/`commentOf`/
  `tagsOf` 4× (plus an `as unknown as` cast), because `filter.ts` is typed for the *internal* shape and
  does **not** fit the published shape. → render-core must **grow a published-side accessor**
  (`W3CAnnotation → comment / tags / reading / bodies` + base+reading overlay). This new helper is the
  home for viewer M2 **and** M3, and for the `commentOf`/`bodyValue` extractor render-core's own tests hand-roll.

**Net:** one routing change (studio → existing `filter.ts`) + one new canonical published-side accessor
in render-core (absorbs viewer M2/M3 and core's test duplication). The viewer agent also noted
`MediaPlayer.bodyText` reads `body[0]` only — consolidating onto the accessor **fixes a latent lossy-read
bug**, the only behavior-adjacent item in the review (call it out, don't silently change it).

## CROSS-CUTTING #3 — `m:ss` time formatter reimplemented 3× (studio-local, minor)

`App.svelte` / `AvEditor.svelte` / `NarrativeEditor.svelte` carry a byte-identical `m:ss` formatter.
render-core owns the selector *grammar* (ADR-0006) but has no display formatter. Low priority,
presentation-only — a shared `formatMMSS`/`parseMMSS` util (studio-local or core/url) when convenient.

## Per-subsystem headlines (detail in the linked files)

- **studio — BLOCKER is deferred-by-decision, not an oversight.** `App.svelte` 1694 lines = god-component,
  but it's tracked as POLISH **Q10** with blessed cuts (`useBinding`/`useNoteEditor`). The recommended
  **first** cut is studio's local domino: a `library-meta` store (`patchLibrary`/`patchExhibit`/`patchObject`)
  collapsing **~14 hand-rolled `{...map()}; persistLibrary()` copies** into ~6 call sites (−~120 lines,
  one persist owner), before the rune-entangled `useNoteEditor` cut. **NOT dead (correction):**
  `MergeReview.svelte` is an unwired prototype tracked as risk-map **R1** and scheduled for edits in
  READINGS-IMPLEMENTATION-STRATEGY — KEEP it (landing-order step 1). `IdentityPrompt.svelte` — confirm
  against the merge roadmap before deleting. Plan drift still valid: `STUDIO-CODE-SPLITTING.md:10` claims
  App imports `MergeReview`; it does not (it's unwired — which is the point, not evidence it's dead).
- **viewer — clean dual-mode.** The `if(portableFs)` seam is the single concentrated seam ADR-0008
  endorses, not scattered conditionals. Findings all fold into the global domino + accessor #2.
- **render-core — the three contracted duplication hypotheses were FALSE** (good news, recorded so it's
  not re-litigated): iiif/ vs wadm/ = **no** dup (wadm = types only, iiif = envelope, spine = bodies);
  serializers = **no** dup (`recordToAnnotation` single-sourced); publish/ vs model/ = **no** dup
  (publish consumes model type-only, never touches reader-side `filter.ts`). The real triplication is the
  *reader* trio (the global domino). Minor: 4× `readJson`, two `xywh` regexes (partly ADR-0006-sanctioned),
  `unknown` on canonical WADM `partOf`/`creator`.
- **render-mount + render-svelte — Full Coherence.** Both deep modules; folding either into core would
  *violate* ADR-0002 (framework-free / node-importable boundary). Only action: delete 3 dead exports
  (`boundsForSelector` — a redundant re-export of core's `selectorBBox` — `RENDER_MOUNT`, `RENDER_SVELTE`).

## What earns its keep (passed the deletion test — do not re-litigate)

store.ts & binding.ts (deep); the single `noteForm` snippet/popover (ADR-0006); narrative framing mode
(ADR-0005); `modeFromProbe`/`ModeProbe` 404-invariant; the `if(portableFs)` seam (ADR-0008); spine
append-only DAG (ADR-0003); `recordToAnnotation` single serializer; render-mount OSD wiring &
`createCanvasController` (headless-testable by design); `sanitize.ts` (snarkdown→DOMPurify, no XSS hole);
`MarkerStyle` re-export (load-bearing app shield).

## Recommended landing order

1. **Delete dead code** (no risk): mount/svelte `boundsForSelector` + `RENDER_MOUNT` + `RENDER_SVELTE` —
   these have **no production consumers; each is referenced only by its own tautological self-test** (e.g.
   `expect(RENDER_SVELTE).toBe("@render/svelte")`), so delete the export *and* its test together. Fix the
   `STUDIO-CODE-SPLITTING.md:10` drift.

   **⚠️ CORRECTION (post-review verify) — do NOT delete `MergeReview.svelte`.** The studio agent's
   deletion test checked importers (zero) but missed the roadmap layer. `MergeReview` is a tracked,
   *unwired* prototype, not dead code: `risk-map.md:19` lists it as **R1 "Merge UI comprehension gate"**
   (an open, prototype-gated invention tied to ADR-0003's append-only version DAG); `subsystems.md:60,86`
   names it in the `Studio → MergeReview → resolveConflict` flow; and `READINGS-IMPLEMENTATION-STRATEGY.md:111`
   **schedules a future edit to `MergeReview.svelte:27`**. Deleting it contradicts the risk-map, the
   subsystems doc, and an active plan. **Keep it.** `IdentityPrompt.svelte` is not named in any ADR/plan
   but is adjacent to the same merge/multi-author identity story — **confirm against the merge roadmap
   before deleting**, do not treat as zero-risk.
2. **Route studio to canonical `filter.ts`** (Standard-6 leak, no new code). **Not a pure no-op:**
   `filter.ts:tagsOf` drops empty/whitespace tags (`v.trim().length > 0`); studio's keeps `""`
   (`value ?? ""`). Routing silently filters empty tags out — almost certainly a bugfix, but it IS a
   behavior change; verify no exhibit relied on empty tags. (`commentOf` has no `filter.ts` equivalent —
   that's the new accessor in step 3, not a route.)
3. **Add render-core published-side annotation accessor**; migrate viewer M2/M3 + core tests onto it;
   the `MediaPlayer.bodyText` consolidation **changes behavior** (`body[0]`-only → all bodies) — intended
   lossy-read fix, land it as a named change, not silently.
4. **The global domino — `readExhibitTree` source-parameterized reader** (render-core/publish), behavior-
   preserving; viewer + portable become thin source/transform. Largest payoff; do it deliberately.
5. **Then** resume studio Q10 decomposition starting with the `library-meta` store.
6. **Separately, on its own change:** the ADR-0007 readings drift in `site.ts` (behavior change — not part of #4).

> **Status (2026-05-29): ALL STEPS 1–6 IMPLEMENTED & verified green** (TDD; full workspace: render-core
> 411 tests, render-mount 17, render-svelte 17, studio 9 [new: 5 reducer + 4 rune-store], viewer 13;
> studio + viewer build clean).
> - #6 (ADR-0007 readings in `site.ts`) — landed first; `preview.test.ts` carries the new assertions.
> - #3 (published-side accessor `query/published.ts`) — viewer migrated; `MediaPlayer.bodyText` lossy-read fixed.
> - #4 (the domino `readExhibitTree`) — all three readers are thin adapters; zero existing-test edits.
> - #5 (`library-meta` store) — App.svelte rewired onto `library-meta.svelte.ts` + tested pure reducers (studio's first tests).
> - **Owed (cannot verify in this environment — no browser):** manual runtime smoke for studio
>   (create/rename/**reload-persists**/binding-chip) and the AV transcript-cue rendering from #3
>   (`transcriptTextOf` now reads all non-tagging bodies vs `body[0]`). Build-green ≠ run-green.
> - Pre-existing (NOT introduced here): studio has no tsconfig/svelte-check in its pipeline; `render-core`
>   `fs/binding.test.ts` + `render-svelte` `controller.test.ts` have stale-type `tsc` errors (vitest passes).
>
> Original plans (unchanged) remain in `docs/reviews/plans/` (`STEP-3-published-accessor.md`,
> `STEP-4-readExhibitTree-domino.md`, `STEP-5-library-meta-store.md`, `STEP-6-site-readings-adr0007.md`),
> each verified against source — read the plan before implementing its step.
>
> **#4 ↔ #6 ordering (reconciled across the two plans):** step-4's design gates readings *I/O* behind a
> `readReadings` flag (site passes `false`), so **#4 is behavior-preserving on its own — ordering is not
> forced.** Recommended: land **#6 before #4** (simpler — #4 then just flips site's flag to `true` instead
> of carving out a site-only exception). Either order is safe; do not let #4 silently start emitting site
> readings (that's #6's deliberate change).

## Test / fixture blast radius (verified)

No recommended fix requires modifying a shared fixture, so the project fixture rule
("never modify a fixture to fix one test") is not triggered. Where the safety nets are:

- **studio has ZERO test files** — the studio fixes (route `tagsOf`, `library-meta` store) cannot break a
  studio test, but ship with no automated guard. Verify by running studio.
- **viewer has ONE test** (`apps/viewer/src/published.test.ts`) + two fixtures (`sample-data.ts`,
  `voynich.ts`, both untouched by these fixes):
  - `MediaPlayer.bodyText` change (step 3) is **not covered** by any viewer test — unguarded.
  - The **domino (step 4)** is *guarded* by `published.test.ts:54`, which pins that portable-mode
    `loadPublishedExhibit` returns `readings: array`. The domino passes iff behavior-preserving; a naive
    unification that drops readings from the portable path fails this line — it's a guardrail, not a victim.
- **Real blast radius is in render-core, not studio/viewer:** `packages/render-core/src/publish/*.test.ts`
  (`site`, `voynich-readings`, `portable`, `interop`, `ghpages`, `preview`). The domino (#4) must keep all
  six green.
  - **CORRECTION (verified while planning #6):** the earlier claim that #6 breaks
    `site.test.ts`/`voynich-readings.test.ts` was **wrong** — both test the *write* path (`publishLibrary`);
    #6 changes the *read* path (`readPublishedExhibit`), whose **only** caller/guard is `preview.test.ts`.
    `readPublishedExhibit` has **zero production consumers** today (latent drift). So #6 = additive
    assertions in `preview.test.ts` (not edits → not fixture-masking); no shared fixture touched. The
    viewer's `published.test.ts:54` has a now-stale *comment* about site omitting readings — coordinate
    cross-subsystem, don't edit in-lane.
