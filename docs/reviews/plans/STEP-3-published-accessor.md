# STEP-3 — render-core published-side annotation accessor

## 1. Objective

Synthesis **step 3**: add a published-side (`W3CAnnotation`) annotation accessor in render-core, migrate the viewer's four hand-rolled body/reading/overlay readers (M2) and its duplicated base+reading overlay (M3) onto it, fold in render-core's own test hand-roll, and consolidate `MediaPlayer.bodyText` off its lossy `body[0]`-only read (a named behavior change).

## 2. Why this is a deliberate / separate change

Two reasons this was held out of the easy passes:

- **It needs a NEW typed surface, not a route.** Step 2 routed studio's `tagsOf` to the *existing* `query/filter.ts` because studio operates on the internal flat `AnnotationRecord` (`record.reading`). The viewer consumes the **published** `W3CAnnotation` whose reading lives under the JSON-LD key `archie:reading` and whose bodies are W3C-shaped. `filter.ts` is typed for `AnnotationRecord` and does **not** structurally accept `W3CAnnotation` — so the viewer can only reach it via the `as unknown as Record<string, unknown>` cast it hand-rolls today (`Reader.svelte:49`). New code, not a no-op route. (THERMO-NUCLEAR-SYNTHESIS.md:52–62.)
- **It carries the review's only behavior-adjacent item.** `MediaPlayer.bodyText` reads `body[0]` only; consolidating onto the accessor changes what AV note text it surfaces. A latent-bug fix is a behavior change — it must land named, not smuggled into a "pure refactor." (Synthesis:66, 127–129; thermo-viewer.md:68.)

## 3. Current state (verified)

**The two real shapes (render-core `wadm/types.ts`):**
- Internal `AnnotationRecord` — flat `reading?: string` (`types.ts:170`), `body?: W3CBody | W3CBody[]` (`:162`).
- Published `W3CAnnotation` — `body?: W3CBody | W3CBody[]` (`:109`), reading under JSON-LD key `archie:reading` (const `ARCHIE_READING`, `types.ts:34`); no typed reading field on the interface. `W3CBody = W3CTextualBody | W3CExternalBody` (`:68`) — **the same `W3CBody` on both shapes.**

**Existing internal accessor (`query/filter.ts`):** `tagsOf` (`:14`, drops empty/whitespace via `v.trim().length>0`), `readingOf` (`:27`, returns `record.reading`), `baseNotes`/`filterByReading`/`allReadings` (`:32–46`). Private `bodiesOf` (`:7`). Re-exported from the barrel: `index.ts:27` `export * from "./query/filter.js"` → `tagsOf`/`readingOf` are already public names on `@render/core`.

**Viewer call sites (all over `W3CAnnotation`):**
- `Reader.svelte:63` `bodies`; `:64` `commentOf` (finds `purpose === undefined || "commenting"`, fallback `"(untitled)"`); `:65` `tagsOf` (keeps `value ?? ""`, does NOT drop empties); `:48–51` `readingColourOf` (the `as unknown as` cast on `archie:reading`). Consumers: `:68` `splitNoteMedia(commentOf(...))`, `:112` `tagsOf(current)`, `:125` `commentOf(it)` + `readingColourOf(it)`.
- `NarrativeReader.svelte:79–81` — `bodies`/`commentOf`/`tagsOf` **verbatim** copies of Reader's. Consumers: `:83`, `:134`.
- `MediaPlayer.svelte:32–35` `bodyText` — `body[0]` (or bare body) → `.value ?? ""`. **No purpose filter.** Consumer: `:46` cue `text`.
- `ExhibitView.svelte:77–82` `annotationsOf` — base+reading overlay; `:88–96` `readingColourById` (nested loop, minor m1).
- `NarrativeReader.svelte:65–71` `activeNotes` — same overlay rule (comment `:64`: "mirrors ExhibitView.annotationsOf / Reader semantics").

**AV body purpose (load-bearing for the bodyText fix):** transcript cues are `purpose: "supplementing"` (`av/transcript.ts:66`, motivation `supplementing` `:65`). So `commentOf` (which accepts only `undefined`/`commenting`) would **filter every transcript cue out** → `(untitled)`. The bodyText fix must NOT route to `commentOf`.

**render-core's own test hand-roll:** `publish/portable.test.ts:96` and `:100` destructure `(Array.isArray(n.body) ? n.body[0] : n.body)` to read a note value — the same lossy `body[0]` pattern.

**Test reality:** viewer's only test `published.test.ts` exercises the hosted/portable seam and mode-detect (`describe` at `:39,65,75,100`) — it does **not** touch `commentOf`/`tagsOf`/`bodyText`/overlay. The viewer-side migration therefore has **no unit safety net**; its guard is typecheck/build + render-core's `publish/*.test.ts` and the `portable.test.ts` hand-roll (which migrates). render-core has 46 test files / 402 tests.

## 4. Target design

A new published-side accessor module **`packages/render-core/src/query/published.ts`**, sibling to `filter.ts`.

**Location justification (cited):** synthesis fixes the convention — `wadm/` is **types-only**, `iiif/` is the IIIF envelope, and the *record*-typed accessor twins already live in `query/` (Synthesis:88–89; cross-cutting #1 Synthesis:55–62 calls these "the published-annotation twins" of `filter.ts`). Logic in `wadm/` would break the types-only rule; `query/` is the established accessor home.

**Seam discriminator (≥2 real variants — the load-bearing reconciliation).** This is NOT a duplicate of `filter.ts`:
- **Variant 1 — reading extraction.** Internal: `record.reading` (flat field). Published: `anno["archie:reading"]` (JSON-LD key). Two genuinely different reads of the same concept; the published one is exactly what the viewer fakes with `as unknown as`.
- **Variant 2 — `commentOf` has no `filter.ts` equivalent at all** (Synthesis:125: "`commentOf` has no `filter.ts` equivalent — that's the new accessor"). Pure new surface.
- **What is NOT a variant (and must therefore be shared, not re-copied):** `W3CBody` is the *same type* on both shapes (`types.ts:109` vs `:162`). The body-list normalization + `purpose:tagging` filter logic is byte-identical across shapes. The published accessor's `bodies`/`tags` reuse the body-traversal already in `filter.ts` (lift its private `bodiesOf` to a shared internal helper or import it) rather than re-implementing it. **If this plan produced two independent copies of the body traversal, it would fail the discriminator.** The accessor earns its keep on the reading-key read + `commentOf`, not on re-typing `bodiesOf`.

**Proposed surface (published-shape, names disambiguated — see §6 for the collision):**

```
// query/published.ts — accessors over the published W3CAnnotation shape (archie:reading JSON-LD key).
export function bodiesOfAnnotation(a: W3CAnnotation): W3CBody[]
export function commentOfAnnotation(a: W3CAnnotation): string          // purpose undefined|commenting; "(untitled)" fallback
export function tagsOfAnnotation(a: W3CAnnotation): string[]           // purpose:tagging; KEEP empties (viewer parity — see §5)
export function readingIdOf(a: W3CAnnotation): string | undefined       // a["archie:reading"], typed — replaces the cast
export function transcriptTextOf(a: W3CAnnotation): string              // ALL textual-body values (excl. tagging), joined; the bodyText fix
export function overlay(base: W3CAnnotation[], readingNotes: W3CAnnotation[] | undefined): W3CAnnotation[]  // M3
```

- `bodiesOfAnnotation`/`tagsOfAnnotation` delegate to the shared body traversal.
- `transcriptTextOf` is **deliberately distinct from `commentOfAnnotation`** (advisor catch): AV cues are `purpose:"supplementing"`, which `commentOf` drops. It reads all *textual* bodies (excluding `tagging`), joined — see §5 for exact semantics.
- `overlay(base, readingNotes)` = `readingNotes?.length ? [...base, ...readingNotes] : base` — the ADR-0007/Q16 "base always visible, active reading on top" rule, one home for both `ExhibitView.annotationsOf` and `NarrativeReader.activeNotes`.

These are pure functions over plain types — no Svelte, no DOM — so they respect the `@render/core` purity boundary (ADR-0002).

## 5. Behavior changes

1. **`MediaPlayer.bodyText` → `transcriptTextOf` (INTENDED behavior change, named).**
   - Before: `Array.isArray(a.body) ? a.body[0] : a.body` → `.value ?? ""`. Reads only the FIRST body, regardless of purpose.
   - After: all **textual** bodies with `purpose !== "tagging"`, mapped to `.value`, joined with a single space (decide: `"\n"` vs `" "` at implementation — recommend `" "` for a single transcript line). Excludes `tagging` so a tag value never folds into transcript text; includes `supplementing` (the actual cue purpose) and `commenting`.
   - Effect: a cue with a tag body at index 0 no longer renders the tag as transcript text; a note with a comment AND a supplementing body now shows both, not just the first. Latent lossy-read fixed. (Synthesis:66, 127–129.)

2. **`tagsOfAnnotation` empty-tag semantics — PRESERVED (no change).** Viewer's `tagsOf` keeps `value ?? ""` (empty strings render as bare `#`). `filter.ts:tagsOf` drops empties. The published accessor **keeps empties to preserve current viewer output** — this is a fresh function, not a route to `filter.ts`, so step 2's empty-tag concern does NOT recur here. (If the team prefers the trim behavior, that is a separate, flagged change — do not bundle.)

3. **`commentOfAnnotation`, `bodiesOfAnnotation`, `readingIdOf`, `overlay`, `readingColourOf` (Reader), `annotationsOf`/`activeNotes` (overlay) — behavior-preserving.** Same logic, same fallbacks, relocated. `readingIdOf` removes the `as unknown as` cast (Standard-5 boundary smell) with no output change.

4. **`portable.test.ts:96,100` hand-roll → `transcriptTextOf` (or `bodiesOfAnnotation`).** Test reads the same value; assertion unchanged. (Picks up whichever value the test asserts — verify it asserts a single-body note so the join is a no-op; if the fixture note is single-body, output is identical.)

## 6. Blast radius & test impact

**Name-collision gate (advisor catch — BLOCKS if ignored).** `index.ts:27` already wildcard-exports `filter.ts`'s `tagsOf` and `readingOf`. A second wildcard export of the same names from `published.ts` makes them ambiguous → TS build break on `import { tagsOf } from "@render/core"`. **Mitigation (chosen): distinct names** (`tagsOfAnnotation`, `readingIdOf`, `commentOfAnnotation`, `bodiesOfAnnotation`) and add a single line to `index.ts`: `export * from "./query/published.js"`. (Alternative considered: a subpath `@render/core/published` export — heavier wiring in `package.json` for one module; distinct names are cheaper and clearer at call sites.)

**Tests that guard / must change:**
- render-core: ADD `query/published.test.ts` — unit-cover all six functions (this is the accessor's safety net; the viewer side has none). UPDATE `publish/portable.test.ts:96,100` to call the accessor (migrating the hand-roll, not fixture-masking — same input, same asserted value). No shared **fixture** is modified, so the project fixture rule is NOT triggered (Synthesis:137).
- viewer: NO unit test exercises the migrated readers (`published.test.ts` is seam/mode only). **The viewer migration's only gate is typecheck + build.** State this plainly to the executor.

**No coverage:** the viewer components' note rendering has no automated assertion — manual run-verify required (per MEMORY: studio & viewer seed separately; build-green ≠ run-green).

**Verification commands:**
- `pnpm --filter @render/core test` (402 tests + new published.test.ts) — must stay green.
- `pnpm --filter @render/core typecheck` and `pnpm --filter @archie/viewer check` (`astro check`) / `pnpm --filter @archie/viewer build` — the viewer migration gate; a broken accessor surfaces here.
- Manual: run the viewer on the `voynich-reading` published tree, confirm note comments, tags, reading colours, and AV transcript cues render as before (AV cues are the behavior-change focal point).

## 7. ADR alignment

- **ADR-0002 (framework/purity boundary):** the accessor is pure TS over plain types in `@render/core` — no Svelte/DOM. Moving read-logic OUT of the Svelte components INTO core *strengthens* the boundary. No contradiction.
- **ADR-0007 (readings as AnnotationPages):** `overlay` and `readingIdOf` encode the "base always visible; one active reading overlaid" rule (ADR-0007 §Viewer; Q16). Centralizing the overlay is exactly the "when the overlay rule changes (v1.1 multi-membership) it changes in one place" win M3 names. No contradiction.
- **Cross-cutting #1 (Synthesis:55–66):** this plan IS the named home for viewer M2 + M3 + core's test hand-roll. Standard-6 read-side feature logic belongs in the canonical layer.
- **Not the Domino (step 4):** this does NOT touch `publish/site.ts`/`portable.ts` traversal or the `ReadSource` unification — that is a separate work item. No overlap.

## 8. Implementation steps

**Phase 1 — render-core accessor + its test (≤3 files).**
1. Lift `filter.ts`'s private `bodiesOf` into a shared internal helper (or export-internal) so both shapes reuse one body traversal.
2. Create `query/published.ts` with the six functions; `commentOf`/`tags` delegate to the shared traversal; `transcriptTextOf` reads all non-tagging textual bodies; `readingIdOf` reads `a[ARCHIE_READING]` typed.
3. Add `export * from "./query/published.js"` to `index.ts:27`-adjacent.
4. Create `query/published.test.ts` covering: comment fallback, tag empties kept, reading-key read, multi-body transcript join, supplementing-cue inclusion, overlay base-only/with-reading.
**Verify gate:** `pnpm --filter @render/core typecheck && pnpm --filter @render/core test` green (no name-collision error).

**Phase 2 — migrate render-core's own test hand-roll (1 file).**
5. Update `publish/portable.test.ts:96,100` to call the accessor.
**Verify gate:** `pnpm --filter @render/core test` green.

**Phase 3 — viewer migration (≤5 files).**
6. `Reader.svelte`: delete `:63–65` + `:48–51` cast; import + use `bodiesOfAnnotation`/`commentOfAnnotation`/`tagsOfAnnotation`/`readingIdOf` (`readingColourOf` keeps its registry lookup, fed by `readingIdOf`).
7. `NarrativeReader.svelte`: delete `:79–81`; use the same imports; replace `activeNotes` overlay body (`:65–71`) with `overlay(...)`.
8. `ExhibitView.svelte`: replace `annotationsOf` body (`:77–82`) with `overlay(...)`; optionally fold `readingColourById` (m1) onto `readingIdOf` — opportunistic, skip if it adds risk.
9. `MediaPlayer.svelte`: replace `bodyText` (`:32–35`) with `transcriptTextOf`.
**Verify gate:** `pnpm --filter @archie/viewer check` (`astro check`) / `build` clean + manual run-verify on `voynich-reading` (esp. AV cues).

## 9. Acceptance criteria

- `query/published.ts` exists with the six functions; `index.ts` re-exports it; `pnpm --filter @render/core test` + typecheck green with no ambiguous-export error.
- New `query/published.test.ts` asserts: comment fallback `"(untitled)"`, empty tags retained, `readingIdOf` reads `archie:reading`, `transcriptTextOf` includes a `supplementing` body and excludes `tagging`, `overlay` returns base when no reading notes.
- Zero `as unknown as` / `archie:reading` string-key reads remain in `apps/viewer/src` (`grep` clean).
- The `bodies`/`commentOf`/`tagsOf`/`bodyText` inline defs are gone from `Reader.svelte`, `NarrativeReader.svelte`, `MediaPlayer.svelte`; overlay logic gone from `ExhibitView.svelte`/`NarrativeReader.svelte`.
- `pnpm --filter viewer build` clean; manual viewer run shows comments, tags, reading colours, and AV transcript cues correctly (AV cue text now reads all non-tagging bodies, not just `body[0]`).
- `portable.test.ts` uses the accessor; render-core suite green.

## 10. Rollback

Each phase is independently revertible (no schema/data change, no shared fixture touched).
- Phase 3 (viewer): `git checkout` the four `.svelte` files — they revert to inline readers; the accessor in core is harmless dead-until-imported.
- Phase 2: `git checkout publish/portable.test.ts`.
- Phase 1: delete `query/published.ts` + `query/published.test.ts`, revert the `index.ts` export line and the `bodiesOf` lift in `filter.ts`.
Full revert = `git revert` the step-3 commits; no migration to unwind. The MediaPlayer behavior change reverts with the `MediaPlayer.svelte` checkout.
