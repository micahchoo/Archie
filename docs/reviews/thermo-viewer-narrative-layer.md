# Thermo-Nuclear Review — VIEWER subsystem (narrative-as-additive-layer, Phase 1)

Reviewer scope: `apps/viewer/`. Contract: ADR-0016 + the keystone "single source of layout
derivation = `resolveLayout`, content only, `exhibit.layout` ignored." Reviewed against
`docs/reviews/_SHARED-BRIEF.md` rubric.

## 1. Verdict

**Full Coherence (clean)** for the narrative-layer slice of the viewer. The keystone is honored
exactly: the viewer derives its leading surface purely from content via a single `resolveLayout`
call, holds **no** read of a stored `exhibit.layout`, retains **no** picker references, and the
1-object auto-open + back-suppression invariants survive unchanged under always-derive. The shared
fixture drop is safe and the `test-fixtures` rule is honored.

One process caveat (not a code defect): the working tree **commingles** a second, unrelated feature
(cite-cards + "Hide all" declutter) into the same uncommitted diff, including the very files the task
brief expected to be untouched. The narrative-relevant logic in those files is genuinely untouched;
the noise just muddies the Phase-1 boundary. See Finding V-1.

## 2. The Domino

**None — findings are independent.** There is no single restructuring that collapses others; the
narrative-layer viewer work is already minimal (it is a *deletion* of author-facing layout intent
from the fixture, plus reliance on a derivation that already existed). The deletion test has already
been applied by the design: the `exhibit.layout` read path was removed, not rearranged.

## 3. Findings

### V-1 (minor, process) — Two features commingled in one uncommitted diff
`apps/viewer/src/components/ExhibitView.svelte`, `Reader.svelte`, `NarrativeReader.svelte`,
`ReadingLegend.svelte`, plus new `cite-cards.ts`, `cite-context.ts`, `ProseCites.svelte`,
`ExhibitCiteCard.svelte`, `published-base.ts`, `published.ts`, `gen-published.mts`.

The brief states ExhibitView/Reader are "UNCHANGED per the plan." They **are** changed — but every
change is the **cite-cards + Hide-all declutter** feature (intra-Library cite link-scent, `notesHidden`
prop threading, ReadingLegend "Hide all" toggle, `WORKING_IRI_BASE`/`VIEWER_BASE` publish-base
rework). None of it touches layout derivation or routing. So the *narrative-layer* claim holds; the
finding is that the Phase-1 commit boundary is not clean — these unrelated edits will ride along if
the narrative work is committed from the working tree as-is.

**Remedy:** stage the narrative-layer change (the `sample-data.ts` `layout`-drop is the only viewer
file it owns) separately from the cite-cards/declutter feature. Do not let one commit straddle two
ADRs (0016 vs the cite/map work).

### V-2 (nit, cross-subsystem signal — NOT a viewer fix) — Stale "picker"/"author intent" framing on `LayoutType`
`packages/render-core/src/model/model.ts:27-42,157`.

Out of my subsystem, surfaced because the viewer's contract reads from here. The comments still call
`LayoutType` "the author's declaration of reading intent" and say "the layout-picker groups by this
… so the picker never sprawls into a template menu" (`:29,:37`), and `readingFamily`'s doc says it is
what "the layout-picker groups by" (`:36-37`). Per ADR-0016 the picker is removed and `LayoutType` is
now purely the **resolved descriptor type** (correctly documented as such in `layout.ts:1-5`). The
prose in `model.ts` describes a world that no longer exists. The `layout?: LayoutType` field
(`:157`) being optional is correct and load-bearing for the fixture drop — keep it; only the framing
comments are stale. **Owner: render-core review.** Flagged here only so synthesis routes it.

## 4. What earns its keep (considered, passed the deletion test)

- **`resolveLayout(exhibit)` call in `ExhibitView.svelte:52`** — this is the *only* derivation site in
  the viewer; it is the keystone, not a duplicate. There is no inline `currentLayout` mirror anywhere
  in the viewer (grepped: zero `.layout` reads, zero `currentLayout`). Earns its keep absolutely.
- **`selectedObjectId = l.type === "grid" ? null : l.objects[0]?.id` (`ExhibitView.svelte:55`)** — the
  single-line expression of both the 1-object auto-open (`single` pre-selects obj[0]) and the
  narrative pre-select. Not spaghetti: it is the exact behavior ADR-0016 specifies ("auto-opens its
  only object … computed by resolveLayout's existing fallback"). Leave it.
- **`onback={isGrid ? … : undefined}` (`ExhibitView.svelte:223`)** — back-suppression as a pure
  function of the derived `isGrid`. Single and narrative get no back affordance; grid does. Exactly
  the §"back affordance suppressed" rule. Leave it.
- **`PublishedExhibit = PortableExhibit` (`published.ts:18`)** — the viewer read seam carries `sections`
  and `objects` but **never** `layout` (0 occurrences in `published.ts`). The deprecated field cannot
  even reach the viewer through the published path. This is the structural reason the keystone can't
  be violated by accident. Leave it.

## 5. Keystone scrutiny results (the adversarial questions, answered)

- **Duplicate derivation that can drift?** No. One `resolveLayout` call (`ExhibitView.svelte:52`);
  every downstream predicate (`isGrid` `:83`, narrative route `:197`, carousel gate `:176`, auto-open
  `:55`, back `:223`) reads the **derived** `layout` descriptor, never a stored field. `NarrativeReader`
  receives `sections` as a prop and performs no derivation of its own.
- **Dead/leftover picker or stored-layout read paths?** None. `grep` for `LayoutPicker|setLayout|
  layoutPickerOpen|currentLayout` and for any `.layout` property read across `apps/viewer/src`,
  `fixtures`, `scripts`: **zero** matches (publish-output JSON excluded).
- **Fixture drop honor the `test-fixtures` rule?** Yes. `sample-data.ts` dropped `layout` from all five
  exhibits; its **only** consumer is `gen-published.mts`, which does not assert on `.layout`. No new
  fixture needed because no consumer reads the removed field. Comments were updated to ADR-0016 framing
  ("`layout` is no longer authored or written … deprecated, ignored on read").
- **Deprecated field handled coherently?** Yes at the viewer boundary: `layout?` stays optional in
  `model.ts:157` (so omission type-checks), and the viewer never constructs or reads it
  (`ExhibitView.svelte:47-51` builds the Exhibit with id/slug/title/objects/sections/summary, no
  `layout`). Coherence of the model.ts/working.ts pass-throughs themselves is render-core/studio's
  review.
- **Rewritten tests assert the NEW contract?** The keystone contract test is
  `packages/render-core/src/model/layout.test.ts` (render-core's to verify — out of my subsystem). The
  viewer has **no** routing test of its own (pre-existing gap, not introduced here). The two viewer
  tests present (`cite-cards.test.ts`, `published.test.ts`) belong to the commingled cite feature, not
  the narrative layer, so they are not evidence for or against this contract.

## 6. Cross-subsystem hooks

- **render-core `model.ts:27-42`** — stale picker/author-intent framing on `LayoutType`/`readingFamily`
  (Finding V-2). render-core review should reconcile the comments to "resolved descriptor type."
- **render-core `layout.test.ts`** — the keystone always-derive contract test lives there; confirm it
  asserts that a stored `layout` is ignored (not just that derivation works). The viewer relies on
  that contract but cannot test it from this subsystem.
- **Cite-cards / publish-base feature (`published.ts`, `published-base.ts`, `gen-published.mts`,
  `cite-*`)** — a separate feature riding in the same working tree (Finding V-1); synthesis should keep
  it out of the narrative-layer commit and route it to its own review (likely the ADR-0015 map / cite
  work), not this one.
