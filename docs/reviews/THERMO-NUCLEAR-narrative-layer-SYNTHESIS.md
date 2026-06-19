# THERMO-NUCLEAR Review — Synthesis: "Narrative as an Additive Layer" (Phase 1)

**Branch:** `feat/narrative-as-additive-layer` (uncommitted, branched from `main`)
**Design of record:** `docs/adr/0016-narrative-as-emergent-reading-mode.md`
**Subsystem reviews:** `docs/reviews/thermo-render-core-narrative-layer.md`, `thermo-studio-narrative-layer.md`, `thermo-viewer-narrative-layer.md`
**Synthesis date:** 2026-06-19

## Overall verdict: **ship-after-must-fix**

The mechanical core is correct and the keystone is honored *in render-core* — `resolveLayout`
(`packages/render-core/src/model/layout.ts:16-26`) is a pure function of content, the
`exhibit.layout ??` override is gone, the LayoutPicker and all its triggers are deleted, the
deprecated field is annotated, and the rewritten tests genuinely assert the new contract. There
is exactly **one** ship-blocker: the Studio declined to *consume* the canonical function and
hand-copied its discriminant inline, re-introducing the very dual-source-of-truth the ADR exists
to retire. Fix that one domino and this is shippable.

---

## Keystone honored end-to-end? **NO — broken at one seam (Studio).**

The ADR keystone (§Decision, §Consequences): *"`resolveLayout` becomes the single source of
truth … `layout.ts` already encodes the discriminant; this decision makes it the only source."*

| Surface | Derivation source | Honored? |
|---|---|---|
| render-core `resolveLayout` (`layout.ts:19-20`) | content (`sections`/`objects`) | YES — canonical |
| Viewer `ExhibitView.svelte:52` | calls `resolveLayout` | YES — consumes canonical |
| **Studio `App.svelte:441-443`** | **inline hand-copied discriminant** | **NO — duplicate** |

The Studio's `currentLayout = $derived(...)` re-implements `layout.ts:19-20` byte-for-byte
(`sections.length > 0 ? "narrative" : objects.length > 1 ? "grid" : "single"`). The diff removed
the *stored* second source (`exhibit.layout`) and replaced it with a *computed* second source.
The duplication is acknowledged in prose, not avoided: `App.svelte:438` says "Mirrors render-core
resolveLayout" and `ExhibitOverview.svelte:58` calls the prop "App's resolveLayout-mirror." Two
reviewers (render-core, studio) independently flagged the identical lines as `high`. This is the
exact anti-pattern ADR-0016 §Rejected-(a) names: "two sources of truth free to disagree." It
agrees with the canonical function only by coincidence of identical hand-copied logic; a v1.1
`compare` threshold (which the `LayoutType` comment explicitly reserves room for) would silently
desync the Studio's overview intent line from the published leading surface, with no test guarding
the equivalence.

**This is not justified by the `WorkingExhibitMeta`-vs-`Exhibit` type gap.** I checked:
`resolveLayout(exhibit: Exhibit)` reads only `exhibit.objects.length` and `exhibit.sections.length`.
Studio's `currentExhibit` is `WorkingExhibitMeta | undefined` — `WorkingObjectMeta` and `AObject`
diverge (both extend `RightsFields`), so the *element types* of `.objects` differ, but
`resolveLayout` never touches an element. The only friction is (a) the object-element-type
mismatch and (b) the `| undefined`. Neither requires duplicating the logic; both are handled by a
3-line structural projection. The duplication has no type-gap excuse.

---

## MUST-FIX (genuine ship-blockers for the mechanical core)

### MF-1 — Studio: consume `resolveLayout`, delete the inline duplicate. (the domino)
**Location:** `apps/studio/src/App.svelte:441-443` (import at `:26`).
**Why blocker:** it is the single defect that makes the keystone false end-to-end. It is also the
domino — fixing it closes the only `high` finding raised by *two* subsystems at once.
**Fix:** add a value import (App.svelte:26 currently imports only `type LayoutType` from
`@render/core` — `resolveLayout` is exported via the barrel `export * from "./model/layout.js"`
at `index.ts:52`, verified) and derive from the canonical function. Because `currentExhibit` is
`WorkingExhibitMeta | undefined` and resolveLayout reads only `.objects.length` / `.sections.length`:

```ts
import { resolveLayout, type LayoutType, /* … */ } from "@render/core";
// …
const currentLayout = $derived<LayoutType>(
  currentExhibit
    ? resolveLayout({ objects: currentExhibit.objects, sections: currentExhibit.sections } as unknown as Exhibit).type
    : "single",
);
```
(or expose a `resolveLayoutType(objects, sections)` 2-arg overload in `layout.ts` if the cast
offends — the projection is the boring, correct shape. The Viewer already calls `resolveLayout`
directly; Studio is the lone violator.) `hasOverview` (`App.svelte:452`) is intentionally
object-count-only per ADR §Consequences and is **not** a duplicate — leave it.

> **Caveat surfaced by the fix:** the Studio has **no type-check gate** (`apps/studio/package.json`:
> `build = vite build`, `test = vitest run`; no `svelte-check`/`tsc`). The structural mismatch
> above would not fail CI today — which is *why* the inline copy looked free. File a follow-up
> seed for a Studio `check` script (see SF-2); it is the root cause that let this and the store.ts
> rot stay invisible. Until then, prefer the explicit projection over relying on transpile-only.

There are **no other must-fixes.** The leftover-reference scan is clean (the only surviving
`LayoutPicker` token is a comment at `App.svelte:440`; `setLayout`/`layoutPickerOpen` are fully
gone; `LayoutPicker.svelte` is deleted). The deprecated field is never written
(`App.svelte:334` confirms "No `layout` written"). The keystone tests pass and assert the real
contract.

---

## SHOULD-FIX (quality / cleanup — not blockers)

- **SF-1 — render-core doc-coherence: reconcile the stale `model.ts` prose as ONE set.**
  `model.ts:27-43` still frames `LayoutType` as "the author's declaration of reading intent,"
  line 33 still says "the v1 layout set" (ADR-0016 marks CONTEXT §105 "Layout v1 set"
  SUPERSEDED), and `readingFamily`'s docstring (`:37`) still says "the layout-picker groups by
  this" — the picker is deleted. `layout.ts:1-5` is correctly reworded; `model.ts` describes a
  removed world. *Three reviewers touched facets of this* (viewer-nit, studio-nit, render-core).
  Reword to "the resolved reading-mode descriptor (ADR-0016)" and drop the "v1 set"/"picker"
  framing. The `@deprecated` JSDoc on `Exhibit.layout` (`model.ts:153-157`) is correctly present
  and added by this diff — leave it.

- **SF-2 — Studio dead duplicate type block (PRE-EXISTING, but this diff fed it).**
  `apps/studio/src/store.ts:77-97` locally redeclares `ExhibitMeta`/`ObjectMeta`/`ObjectProvenance`/
  `LibraryMeta` while *also* re-exporting `WorkingExhibitMeta as ExhibitMeta` (`:18`) — a TS2484
  export-conflict that survives only because Studio has no type-check gate (SF-2 root cause = same
  as MF-1's caveat). The re-export is the live shape; the local block is dead. This diff *touched*
  the dead block (added `import type LayoutType` at `:10`, rewrote `layout?` + deprecation JSDoc),
  maintaining a phantom the compiler would reject. **Delete the local block; revert the
  LayoutType import added only to feed it; file the Studio `check: svelte-check` seed.** Attribute
  the duplicate block itself as pre-existing.

- **SF-3 — render-core: resolve `readingFamily` / `ReadingFamily` orphan status.**
  `model.ts:41-43` — its only *production* consumer on `main` was `LayoutPicker.svelte`, which this
  diff deletes. It is now tested (`model.test.ts:15-21`) but unused in production. ADR-0016
  §Consequences explicitly listed it for audit "against the smaller union"; that step was skipped.
  **Pick one:** delete `readingFamily`/`ReadingFamily` + its `model.test.ts` block, OR add a
  one-line "reserved for v1.1 `compare`, no v1 consumer" note so a future reviewer does not
  re-flag it. Do not leave it silently orphaned.

- **SF-4 — render-core: deprecation annotation coherence across the three layout-field copies.**
  `Exhibit.layout` (`model.ts:153`) got the `@deprecated(ADR-0016)` JSDoc; the most load-bearing
  copy — `WorkingExhibitMeta.layout` (`working.ts:81`), the shape Studio actually persists and
  re-exports — kept a bare `layout?: LayoutType;` with no notice. **Add the matching
  `@deprecated(ADR-0016)` JSDoc to `working.ts:81`** so the deprecation reads coherently across
  `model.ts` / `working.ts` / `store.ts`. No behavioral impact (still ignored by resolveLayout).

- **SF-5 — render-core test coverage: pin the reverse legacy-coercion case.**
  `layout.test.ts:14-22` proves stale `layout:"single"`→grid and `layout:"grid"`-loses-to-sections,
  but not the case ADR-0016 §Consequences calls the migration's whole point: a legacy
  `layout:"narrative"` + **zero** sections must coerce to grid/single, never narrative. Code is
  provably correct (the `??` short-circuit is gone; the field is read on no path), so this is
  coverage, not correctness. **Add:** `resolveLayout(ex({ layout: "narrative", objects: [a] })).type === "single"`
  (+ the 2-object → "grid" variant). Cheap; pins the field-is-never-read contract from both directions.

- **SF-6 — DIRTY COMMIT BOUNDARY (process, not code): split the commit.**
  The working tree commingles a **second, unrelated feature** with the narrative layer:
  cite-cards intra-Library link-scent + "Hide all" canvas declutter + publish-base
  (`WORKING_IRI_BASE`/`VIEWER_BASE`) rework — touching `ExhibitView.svelte`, `Reader.svelte`,
  `NarrativeReader.svelte`, `ReadingLegend.svelte`, new `cite-cards.ts`/`cite-context.ts`/
  `ProseCites.svelte`/`ExhibitCiteCard.svelte`, `published-base.ts`, `published.ts`,
  `gen-published.mts`, the regenerated `public/published/**` fixtures, and `link.ts`/`portable.ts`/
  `site.ts`/`sanitize.ts`. The narrative-layer change's only viewer-side file is
  `apps/viewer/fixtures/sample-data.ts` (the layout-field drop). **Commit the narrative layer
  separately** so one commit does not straddle two ADRs. (The cite/declutter feature is out of
  scope for this review — it is flagged only so the narrative commit lands clean.)

---

## NOT findings (recorded so synthesis is not re-litigated)

- **`working.ts:137,174` layout pass-throughs** are NOT a re-introduced read path: pre-existing on
  `main` (the only working.ts diff is the unrelated `WORKING_IRI_BASE`/`LIVE_CHANNEL` additions),
  they round-trip a deprecated optional field through the documented faithful working↔library
  inverse mapping and never consult it for behavior. Drop them only when `Exhibit.layout` is
  finally removed (the field's own docstring states that condition). Harmless.
- **`Exhibit.layout?` field + `@deprecated` JSDoc** (`model.ts:153-157`): coherent — never written,
  never read, removal condition stated. Keep.
- **`hasOverview` (`App.svelte:452`)** is object-count-only by ADR design (§Consequences: "sections/
  narrative do NOT trigger it"). Not a duplicate of resolveLayout. Keep.
- **Phase 2 staging UX** (matched-pair cues, recessed card, overview invitation) is intentionally
  out of this diff per ADR §Consequences. Its absence is not a defect.

---

## Cross-subsystem seam coherence

The seams cohere **once MF-1 lands.** Today the single-source derivation is honored at two of three
consumers (render-core defines it; Viewer consumes it) and violated at the third (Studio copies it).
After MF-1, all three read from `resolveLayout` and the keystone holds literally. The deprecated-field
handling is *behaviorally* coherent across `model.ts` / `working.ts` / `store.ts` (never read on any
path) but *documentationally* uneven (SF-1, SF-4) — annotations and prose lag the code on the
secondary copies. The render-core layer itself is clean and canonical; every cross-subsystem
`high`/`moderate` finding routes back to the Studio's refusal to consume it (MF-1) or to doc lag on
the deprecated field (SF-1/SF-4). No genuine logic leaked into a shared path.

## Tests

Meaningful, not gamed. `layout.test.ts:14-22` sets a stored `layout` that pre-diff `exhibit.layout ??`
code would have honored and asserts the *derived* result instead — it would fail against pre-diff
code, the hallmark of a real contract test. `model.test.ts` is unchanged and still valid (the
`LayoutType` union is intentionally untouched). The in-scope viewer fixture change (dropping `layout`
from `sample-data.ts`) needed no test change — its sole consumer (`gen-published.mts`) never asserts
on `.layout`; the `test-fixtures` rule is honored. Gaps: no Studio-side test pins
`currentLayout === resolveLayout(...).type` (the gap that let MF-1 drift undetected — closes once
MF-1 makes them the same expression), and SF-5's reverse-coercion case.
