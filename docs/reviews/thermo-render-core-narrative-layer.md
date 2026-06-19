# Thermo-Nuclear Review — render-core (model), narrative-as-additive-layer Phase 1

Subsystem: `packages/render-core` (model + publish read-seam)
Reviewer mandate: verify the keystone "single source of layout derivation" is honored; hunt for a
duplicate derivation; check dead picker/deprecated-field references; grade the rewritten tests.
Diff base: `git diff main` on `feat/narrative-as-additive-layer` (uncommitted).

---

## 1. Verdict

**Full Coherence (within render-core).** The render-core slice of this diff is the cleanest part of
the change. The keystone is honored *here*: `resolveLayout` is the sole derivation, the `exhibit.layout ??`
override is gone, the field is correctly `@deprecated` with a precise read-tolerance rationale, the
`LayoutType` union is intentionally unchanged (it is the resolved-descriptor type, as the brief
requires), and the rewritten `layout.test.ts` is a genuine contract test (not gamed). The
working.ts `layout` pass-throughs do **not** re-introduce a read path — they carry a deprecated field
losslessly and are pre-existing, not part of this diff.

The one thing keeping this from a clean bill across the *feature* (not this subsystem) is a
**duplicate derivation in Studio's `App.svelte`** that mirrors `resolveLayout` instead of calling it —
the exact drift hazard ADR-0016 set out to kill. It is out-of-subsystem, so it is logged as a
cross-subsystem hook + one finding for synthesis, not a render-core blocker.

## 2. The Domino

**The single highest-leverage fix is cross-subsystem, not in render-core:** make Studio call
`resolveLayout` instead of re-deriving the discriminant inline. `resolveLayout` is already exported
from `@render/core` (`index.ts:52`) and App.svelte already imports from `@render/core`
(`App.svelte:8-27`) — it imports `type LayoutType` but **not** the `resolveLayout` value. Wiring
`currentLayout = resolveLayout(currentExhibit).type` collapses the second source of truth, makes
finding F1 disappear, and makes ExhibitOverview's "App's resolveLayout-mirror" comment honest. Within
render-core proper there is no domino — the model changes are independently correct.

## 3. Findings

### F1 — DUPLICATE layout derivation in Studio mirrors `resolveLayout` (drift hazard the ADR exists to kill) — MAJOR (cross-subsystem)
`apps/studio/src/App.svelte:441-443` defines `currentLayout` as a `$derived` that **re-implements
`resolveLayout`'s exact discriminant inline**:
```
const currentLayout = $derived<LayoutType>(
  (currentExhibit?.sections?.length ?? 0) > 0 ? "narrative"
    : (currentExhibit?.objects.length ?? 0) > 1 ? "grid" : "single",
);
```
This is byte-for-byte the logic in `layout.ts:19-20`. ADR-0016 §Decision and §Rejected-(a)
name "two sources of truth (the stored `layout` field and `resolveLayout`'s derivation) free to
disagree" as the precise anti-pattern being retired. The diff retired the *stored-field* source but
**introduced a second derivation source** in its place. `ExhibitOverview.svelte:58` then consumes this
value and even calls it "App's resolveLayout-mirror" in a comment — the duplication is acknowledged in
prose rather than removed. If `resolveLayout`'s rule ever gains a case (e.g. the v1.1 `compare`
arrangement the model.ts comment anticipates), this mirror silently goes stale.
**Remedy:** import `resolveLayout` from `@render/core` and set
`currentLayout = $derived(resolveLayout(currentExhibit).type)` (guard the `currentExhibit` undefined
case). Same for any other Studio mirror. Belongs to the Studio subsystem; flagged here because the
render-core keystone's integrity depends on it and the brief's adversarial scrutiny named this exact
shape. **render-core side is correct as written.**

### F2 — `readingFamily` / `ReadingFamily` are now production-dead (this diff removed the last caller) — MINOR
`packages/render-core/src/model/model.ts:38,41-43` (`ReadingFamily` type + `readingFamily()`). On
`main` their *only* production consumer was `apps/studio/src/LayoutPicker.svelte:7,33`
(`readingFamily(o.type)` to group picker options by family). This diff **deletes LayoutPicker.svelte**
(131 lines, `D` in `git diff main --name-status`). After the change, the sole remaining references are
`model.test.ts:15-21` and one prose mention in the `Reading` docstring (`model.ts:123`) — i.e. tested
but unused. ADR-0016 §Consequences explicitly anticipated this: "`readingFamily` in `model.ts:42` [is]
audited against the smaller union." The audit step appears to have been skipped — the helper survived
its last caller's deletion. It is harmless (a one-line pure function on the public barrel), so MINOR,
not a blocker. **Remedy:** either (a) delete `readingFamily`/`ReadingFamily` + their `model.test.ts`
block now that nothing reads the family axis, or (b) if it is being reserved for the v1.1 `compare`
arrangement (defensible — the `LayoutType` comment at `model.ts:30` keeps that door open), add a
one-line "reserved for v1.1, no v1 consumer" note so a future reviewer does not re-flag it. Pick one;
do not leave it as silently-orphaned.

### F3 — no test pins the *reverse* legacy-coercion case (stale `layout:"narrative"` with 0 sections) — MINOR (test gap)
`layout.test.ts:14-22` asserts a stored `layout:"single"` is ignored (multi-object → `grid`) and a
stored `layout:"grid"` loses to sections (→ `narrative`). It does **not** assert the symmetric and
arguably higher-risk case ADR-0016 §Consequences calls out as the migration's whole point: a legacy
exhibit with `layout:"narrative"` but **zero sections** must coerce to `grid`/`single`, never
`narrative`. The code is provably correct (the `??` short-circuit is gone, so `exhibit.layout` is
never read on any path — same code path the existing test exercises), so this is a coverage gap, not a
correctness defect. **Remedy:** add one assertion —
`resolveLayout(ex({ layout: "narrative", objects: [a] })).type` ⇒ `"single"` (and the 2-object → `grid`
variant). Cheap, and it pins the field-is-never-read contract from both directions.

## 4. What earns its keep (considered, passed the deletion test)

- **`Exhibit.layout?` field + its `@deprecated` JSDoc (`model.ts:153-157`).** Kept OPTIONAL for
  read-tolerance of legacy stored data. Not a regression: it is never written (Studio MUST NOT, per the
  doc) and never read (F-checks confirm zero readers in render-core; `resolveLayout` ignores it). The
  docstring states the removal condition ("once no stored exhibit carries it"). Coherent.
- **working.ts `layout` pass-throughs (`working.ts:137` in `workingToLibrary`, `:174` in
  `libraryToWorking`, field at `:81`).** The brief flagged these for "do they re-introduce a read
  path." They do **not**: they are pre-existing on `main` (verified via `git show main:.../working.ts`),
  this diff does not touch them (the only working.ts diff is the unrelated `WORKING_IRI_BASE` /
  `LIVE_CHANNEL` additions), and they merely round-trip a deprecated optional field through the
  working↔library mapping without ever consulting it for behavior. Carrying a deprecated field through a
  faithful inverse mapping is harmless and arguably *correct* (the mapping documents itself as a
  faithful inverse). Leaving them is more coherent than special-casing a drop. Optional cleanup only
  (drop both spreads when the field is finally removed); not a finding.
- **`LayoutType` union unchanged (`model.ts:34`).** Correct per brief and ADR — it is the *resolved
  descriptor* type (`LayoutDescriptor.type`), not an author-facing choice. Narrowing it would have
  broken `resolveLayout`'s return and the `LAYOUT_INTENT` exhaustive map. Intentionally untouched.
- **`isValidMode` (`model.ts:51`).** Already production-dead on `main` (zero callers there too) — a
  forward guard its own docstring reserves for v1.1 mode-binding. NOT introduced by this diff; out of
  scope. Mentioned so synthesis does not attribute it to this change.

## 5. Cross-subsystem hooks

1. **`App.svelte:441` duplicate derivation (F1)** — the keystone's integrity is a Studio concern now.
   render-core publishes the single canonical `resolveLayout`; Studio declined to consume it and
   re-derived. Synthesis should route F1 to the Studio review and confirm the fix imports the function
   rather than copying the rule a third time. The Viewer (`ExhibitView.svelte:52`) *does* call
   `resolveLayout(exhibit)` correctly — so the contract is "use the function," and Studio is the lone
   violator.
2. **`readingFamily` deletion (F2)** spans render-core (the helper) and Studio (the deleted
   LayoutPicker that was its caller). Whoever removes it must touch both `model.ts`/`model.test.ts` and
   confirm no other Studio surface picked it up.
3. **working.ts `WORKING_IRI_BASE` / `LIVE_CHANNEL` additions** in this working tree are **not part of
   the narrative-layer change** (they concern the live-source IRI namespace). Out of scope for this
   review; noted so synthesis does not bundle them into the narrative diff.

---
**Tests:** rewritten `layout.test.ts:14-22` is a genuine new-contract assertion — under the old
`exhibit.layout ??` code it would have failed (old returns `single`/`grid`; test demands `grid`/
`narrative`). Not gamed-to-green. `model.test.ts` unchanged and still valid (union intact). Gap: F3
(reverse coercion). All 11 tests pass (`vitest run`, verified).
