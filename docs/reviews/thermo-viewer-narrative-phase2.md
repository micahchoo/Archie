# Thermo-Nuclear Review — VIEWER subsystem (narrative-as-additive-layer, PHASE 2 staging UX)

**Scope:** the uncommitted Phase-2 diff (`git diff HEAD`) in
`apps/viewer/src/components/{ExhibitView.svelte, NarrativeReader.svelte}` — the grid-index escape
state machine, the persistent ReadingLegend wiring, and the `NarrativeReader:68`
`state_referenced_locally` warning. Phase-1 (the `resolveLayout` single-source, union retirement,
1-object auto-open) is reviewed in `thermo-viewer-narrative-layer.md` and not re-litigated here.
The ProseCites / cite-card hunks woven into the same files are the unrelated in-flight feature and
are out of scope per the brief (noted as a process item under Cross-subsystem hooks).

Spec: ADR-0016; `docs/plans/NARRATIVE-AS-LAYER-STRATEGY.md` PHASE 2 + §137 (precision-in /
escape-out) + §223 (anti-trap). ADR-0010 (portable viewer read seam), ADR-0008 (one-shell dual-mode).

---

## 1. Verdict

**Hold + Clarify** — one blocker.

The grid-index escape is well-built for the image path: the three-state machine (spine · index grid ·
index-opened object) is reversible, state lives in one owner (`ExhibitView`), the `{#key slug/noteId}`
remount in `ViewerShell.svelte:234` genuinely resets it across exhibits and deep-links (no leak), AV
routing is correct in the *spine* path, and single-object suppression is right. But the **AV object
opened from the index is a dead-end trap** — it renders `MediaPlayer`, which has no `onback` and no
escape affordance, and in the common single-exhibit-library case every other escape (carousel,
breadcrumb, in-canvas buttons) is simultaneously suppressed. That is a direct violation of the §223
anti-trap invariant the whole feature exists to satisfy, and unlike comprehension it is a mechanical,
unit-testable correctness fact — it must be fixed before commit.

## 2. The Domino

**V-1 (the AV-index trap) is the domino.** It is the one finding that is a true correctness defect
rather than a quality observation; fixing it (give the index-AV path a real escape) is also the
natural place to collapse the awkward `indexIsAV ? undefined` carousel-suppression branch in the
`$effect` (V-3) — one fix, both findings retired. Everything else is minor/nit and independent.

## 3. Findings

### V-1 (BLOCKER — anti-trap correctness) — AV object opened from the narrative index has no escape

`ExhibitView.svelte:215-217`. The index-opened-object state routes AV to `MediaPlayer`:

```svelte
{#if indexObject}
  {#if indexIsAV && indexData}
    <MediaPlayer object={indexData} annotations={…} rights={…} />   <!-- NO onback -->
  {:else}
    <Reader … onback={() => (indexObjectId = null)} … />            <!-- has escape -->
  {/if}
```

`MediaPlayer.svelte` accepts **no `onback` / back prop** (verified: its `$props` carry no escape) and
renders nothing that returns to the index. The image branch (`Reader`) has `onback`; the AV branch has
nothing. Compounding it, every *other* escape is suppressed exactly here:

- The top-bar carousel: the `$effect` sets `navObject = inNarrative ? (indexIsAV ? undefined : …)`
  (`ExhibitView.svelte:188`) → `showCarousel` false → carousel `null` for index-AV.
- The breadcrumb: `showCrumbs` requires a multi-exhibit gallery
  (`ViewerShell.svelte:147-149`, `shouldRenderGalleryFromJson`). A single-exhibit library — the
  collapsed `voynich-reading`-style standalone publish, the *default* portable case (ADR-0008) — shows
  no breadcrumb.
- The `.to-read` "Back to the reading" button lives only in the index-grid state (`:244`); the
  `.to-index` "All objects" button lives only inside `NarrativeReader`. Neither is mounted while the
  index-AV `MediaPlayer` is up.

Net: a visitor of a single-exhibit narrative who opens the index ("All objects") and taps an AV item
is stranded — only the browser back button or "Open another library" escapes. A narrative mixing image
and AV objects is the realistic trigger (and the spine already handles AV, so AV-in-narrative is a
first-class case). This is precisely the §223 anti-trap / §137 escape-out failure the keystone forbids;
ADR-0016 Consequences calls the grid "reachable behind it as an index … not a dead-end takeover."

**Remedy:** give the index-AV branch an escape that returns to the index (symmetry with the image
branch's `onback`). Either (a) thread an `onback` prop into `MediaPlayer` and wire
`onback={() => (indexObjectId = null)}`, mirroring `Reader`; or (b) keep the persistent top-bar
carousel/escape alive for index-AV by dropping the `indexIsAV ? undefined` special-case in the
`$effect` so the bar still offers sibling-nav + (where present) the breadcrumb. (a) is the direct fix
and matches the established `Reader.onback` idiom; (b) also resolves V-3. This invariant is binary and
**unit/component-testable now** — it is not a comprehension question and must not be deferred to the UX
gate.

### V-2 (minor — boundary/legibility) — `to-read` escape button overlaps the persistent top bar; one escape lives outside the canvas-overlay idiom

`ExhibitView.svelte:244-246` + `.to-read` style `:322-331`. The index-grid escape is `position: fixed;
top: var(--space-5); left: var(--space-5); z-index: 30`. The persistent top bar is `position: fixed;
top: 0; left: 0; z-index: 35` (`ViewerShell.svelte:246`) and owns the top-left breadcrumb zone. When a
multi-exhibit gallery renders the breadcrumb there, the z-35 bar paints over the z-30 escape button and
the two crowd the same corner. Functionally tolerable (bar is thin; left zone is `pointer-events:none`
when empty), but it is the one escape affordance that is `position: fixed` global chrome rather than a
canvas-relative overlay like its sibling `.to-index` (which is correctly `position: absolute` inside
`NarrativeReader`). **Remedy:** anchor `.to-read` to the index grid the same way `.to-index` anchors to
the canvas, or nudge it clear of the top-bar band; at minimum confirm it never sits under the
breadcrumb zone. Minor — visual, not a trap.

### V-3 (minor — spaghetti/branching) — the carousel `$effect` overloads one block with two surface modes via ternary fan-out

`ExhibitView.svelte:184-201`. The lifted-nav `$effect` now branches on `inNarrative` three separate
times in three parallel ternaries — `navObject`, `setNav`, and the `indexIsAV ? undefined` guard — to
serve *two* different mounted Readers (the grid/single Reader vs the index-opened Reader) with one
snapshot emitter. It reads correctly but it is exactly the "ad-hoc conditionals bolted into an
unrelated flow" smell (Standard #2): the narrative-index nav and the grid nav are two cases sharing one
tangled expression. **Remedy:** prefer one small derived "the currently-mounted single-object Reader,
and how to navigate it" — `const reader = $derived(inNarrative ? {obj: indexObject, isAV: indexIsAV,
set: (id) => indexObjectId = id} : {obj: !isGrid ? activeObject : undefined, isAV, set: …})` — so the
`$effect` consumes one shape instead of re-deriving the discriminant three times. This is also where the
V-1 fix lands cleanly (the index-AV branch stops being a `undefined` hole and becomes a real escape).
Behavior-preserving; deletes a branch rather than adding one. Minor; not blocking on its own but pairs
with the domino.

### V-4 (nit — benign reactivity, pre-existing pattern) — `NarrativeReader:68` `state_referenced_locally`

`NarrativeReader.svelte:67-68`: `let activeIndex = $state(arrivalSection)` /
`let selected = $state<string|null>(initialSelected)`. `svelte-check` warns
(verified: `NarrativeReader.svelte 68:40 state_referenced_locally`) that `selected` captures only the
*initial* value of the `initialSelected` prop. **This is correct, not a bug.** `selected` is local UI
state (the clicked marker), seeded once from the deep-link prop and intended to diverge thereafter;
re-seeding on prop change is handled structurally by the `{#key slug/noteId}` remount upstream
(`ViewerShell.svelte:234`), which gives a fresh component (and fresh `initialSelected`) for every
deep-link. The identical, accepted pattern exists in `Reader.svelte:67` and `NoteLightbox.svelte:20`.
No fix required; if the warning noise is unwanted, the project-consistent silencer is a one-line
`// svelte-ignore state_referenced_locally` with the "seeded once, remount re-seeds" rationale — but do
it across all three or none (consistency). Nit.

### V-5 (nit — test coverage of a mechanical invariant) — the escape state machine is inline-untested

No test references `narrativeIndex` / `indexObjectId` / "All objects" / "Back to the reading"
(verified: zero matches across `apps/viewer`, e2e). `anti-pattern-report.txt` already flags
`ExhibitView` (8 commits, no test) and `NarrativeReader` (9 commits, no test) as untested-churn. Most
of Phase 2 is correctly comprehension-gated (not a code-review defect, per the brief). But the
**reversibility / no-trap invariant is mechanical**, not a comprehension question: "from any narrative
sub-state there is always a path back to the spine" is a binary assertion. The deceptively-simple
corpus in the strategy doc (§"DECEPTIVELY-SIMPLE items") already names the flip-up/flip-down/escape
cases as the place confident-wrong code ships — V-1 is the proof. A small component test that walks
spine → index → image-object → back and spine → index → **AV-object** → back (the case that currently
has no "back") would have caught V-1 and pins it against regression. **Recommend** (don't block beyond
V-1 itself): add that walk as part of the V-1 fix. No pure-function extraction is warranted — the
machine is a handful of `$state` booleans driving a template; extracting it would be premature
decomposition (fails the seam discriminator — there's one consumer). Test the component, don't reify a
reducer.

## 4. What earns its keep (considered, passed the deletion test)

- **The three-state inline `{#if indexObject}{:else if narrativeIndex}{:else}` machine
  (`ExhibitView.svelte:215-265`).** Considered flagging as a candidate for a `narrativeView` enum/state
  reducer. Passed: it is three template branches over two booleans with one consumer; an enum +
  dispatcher would be a reified abstraction (seam discriminator: one consumer, not ≥2). Keep inline.
  (The carousel `$effect` is the part that tangled — V-3 — not the template.)
- **State owned in `ExhibitView`, reset by `{#key}` remount (not manual reset).** Considered flagging
  the absence of explicit `narrativeIndex = false` on exhibit-switch. Passed: the
  `{#key slug/noteId}` remount (`ViewerShell.svelte:234`) is the *correct* single mechanism — manual
  resets would be a second source of truth competing with the remount. This is the cleaner structure;
  leave it. (Matches the Phase-1 review's note on `{#key}` as the state-leak guard.)
- **Persistent `ReadingLegend` threaded via `activeReading` + `notesHidden` in `ExhibitView`.** The
  "persistent legend across narrative surfaces" claim holds: the same `activeReading`/`notesHidden`
  owner-state feeds both the spine (`NarrativeReader:124`) and the index-opened object
  (`Reader:123`), so a reading/declutter choice carries across the spine↔index-object transition. The
  index *grid* (`ObjectGrid`) correctly has no legend — a thumbnail grid has no canvas to declutter.
  Not a finding; the wiring is right.
- **`canvasNotes` hide-all derivation (`NarrativeReader:91-95`).** A small `$derived.by` that shows
  only the selected mark when hidden. Deep enough (mirrors `Reader.svelte:101`), one clear job. Keep.
- **`{#if onindex && objects.length > 1}` index-button gate (`NarrativeReader:130`).** Correct
  single-object suppression: a 1-object narrative (sections win in `resolveLayout`) has nothing to
  index, so the "All objects" button is hidden. Right.

## 5. Keystone scrutiny results (the adversarial questions, answered)

- **State leak across exhibits / deep-links?** No. `narrativeIndex` + `indexObjectId` are `$state` in
  `ExhibitView`, which `ViewerShell.svelte:234` wraps in `{#key `${route.slug}/${route.noteId ?? ""}`}`
  — slug or note-id change remounts and resets both to `false`/`null`. A stale `indexObjectId` (id not
  in `layout.objects`) makes `indexObject` `undefined` and falls through to the `narrativeIndex` /
  spine branch gracefully. Verified.
- **Any trap (a state with no way back)?** Yes — exactly one: index → AV object (V-1). The image
  paths are all reversible (Reader `onback` → index; `.to-read` → spine).
- **Correct AV routing?** Spine path: correct (`NarrativeReader:105` MediaPlayer for AV active object).
  Index path: routes to MediaPlayer correctly **but** strands it (V-1). Routing right, escape wrong.
- **Single-object suppression?** Correct (V-4 §4 above; `objects.length > 1` gate).
- **`{#key}` remount actually resets `narrativeIndex`/`indexObjectId`?** Yes — the key is in the
  parent (`ViewerShell`), the state is in the child (`ExhibitView`); remounting the child discards its
  `$state`. Confirmed by reading both sides.
- **`NarrativeReader:68` warning real or benign?** Real warning, benign behavior (V-4).

## 6. Cross-subsystem hooks

- **MediaPlayer needs an `onback` (or equivalent escape) prop — the V-1 fix touches
  `MediaPlayer.svelte`**, which is shared by the single-AV, AV-in-grid, spine-AV, and index-AV paths.
  Adding an optional `onback` is additive and back-compat (every existing caller omits it = today's
  behavior), but it crosses the component boundary — flag for the synthesis pass so the AV-escape
  story is consistent across *all four* AV surfaces, not just the index one.
- **Process (already flagged in Phase-1 V-1, restated):** the ProseCites / cite-card hunks
  (`NarrativeReader` import swap `renderMarkdown → ProseCites`, the `a[href*="#/"]::after` ¶ cite-seal
  CSS, `.prose`/`.note-body` link styling) are the **unrelated in-flight cite feature** committed into
  the same files as the narrative work (they appear in `git diff main` but not the Phase-2
  `git diff HEAD` slice). Out of scope for this review; the commingling is a commit-hygiene concern for
  whoever lands the branch — separate the two features into distinct commits.
- No narrative-staging logic leaked into the shared `@render/core` layer — the diff is confined to the
  two viewer components (Standard #6 clean). The escape/index decisions correctly stay in the viewer
  presentation layer; `resolveLayout` (canonical) is untouched by Phase 2.
