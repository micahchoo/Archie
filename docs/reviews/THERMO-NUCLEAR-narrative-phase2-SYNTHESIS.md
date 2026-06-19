# THERMO-NUCLEAR Review — Narrative-as-Layer Phase 2 (staging UX) — SYNTHESIS

**Scope.** The uncommitted Phase-2 staging-UX diff on `feat/narrative-as-additive-layer`, across two subsystems:
Studio (`apps/studio/src/{App.svelte, NarrativeEditor.svelte, ExhibitOverview.svelte}`) and Viewer
(`apps/viewer/src/components/{ExhibitView.svelte, NarrativeReader.svelte}`). Spec: ADR-0016 + NARRATIVE-AS-LAYER-STRATEGY.md.
Unrelated working-tree noise (cite-cards, ProseCites, published-base, public/published, .claude, .mulch) excluded.

**This is the review of record before commit.** Findings verified against source, not just inherited from the subsystem agents.

---

## Verdict: **ship-after-must-fix**

The keystone state machine is **correct in its detection logic** but has **one reachable correctness/UX defect** (stale
`pendingClear`). The viewer escape state machine has **one genuine dead-end trap** (index-AV) that directly violates the
ADR-0016 §223 anti-trap / §137 escape-out invariant the whole keystone is built on. Both are mechanical, binary,
unit-testable facts — not comprehension questions. Fix the two, land the rest. Phase 2 is invented UX; the owed
real-user comprehension gate is per-spec (philosophy #6) and is NOT a code-review blocker.

The diff is otherwise high quality: token-clean, quiet curator voice, rationed accent, copy verbatim against the
strategy doc, no scope leak into the unrelated in-flight cite feature beyond a co-bundled (coherent, low-risk)
active-reading/⌘K cleanup that should be split into its own commit.

---

## The Domino

**There is no single cross-subsystem domino** — the two must-fixes are independent (one Studio, one Viewer). But each
subsystem has its own local domino:

- **Studio:** extracting a pure `narrativeCueReducer(prev, next, seen) → { commit, cue, markSeen }` (the established
  `library-meta-reducers.ts` idiom) collapses M1 into a one-assertion test AND gives the keystone its missing regression
  seam. The strategy doc itself mandates a "write the corpus FIRST" flip table — this is where it lands.
- **Viewer:** threading an optional `onback` into `MediaPlayer` (or dropping the `indexIsAV ? undefined` carousel
  special-case in the `$effect`) fixes V-1 AND untangles the three-way `inNarrative` ternary the same lift addresses.

---

## MUST-FIX (genuine ship-blockers)

### MF-1 — Viewer index-AV dead-end trap (HIGH)
`apps/viewer/src/components/ExhibitView.svelte:216-217` + `MediaPlayer.svelte` (verified: props are `object`,
`annotations`, `rights` — **no `onback`**) + the `$effect` at `:188` + `ViewerShell.svelte:147-149` (`showCrumbs`).

An AV object opened from the narrative index renders `MediaPlayer`, which has **no escape**. The image branch
(`:219-232`) has `onback={() => (indexObjectId = null)}`; the AV branch has nothing. Every other escape is suppressed
exactly here: the top-bar carousel is killed by `navObject = inNarrative ? (indexIsAV ? undefined : …)` (`:188`); the
breadcrumb requires a multi-exhibit gallery (`showCrumbs`), so a single-exhibit / portable library shows none; `.to-read`
and `.to-index` are not mounted in this state. **A single-exhibit narrative mixing image + AV objects strands the
visitor** — only browser-back or "Open another library" escapes. Directly violates the ADR-0016 keystone invariant
("reachable behind it as an index … not a dead-end takeover", §137/§223). Mechanical, binary, unit-testable.

**Fix:** thread an optional `onback` into `MediaPlayer` and wire `onback={() => (indexObjectId = null)}` (matches the
`Reader.onback` idiom; additive, back-compat for existing AV callers); OR drop the `indexIsAV ? undefined` special-case
in the `$effect` so the persistent top-bar carousel/escape stays alive for index-AV (also resolves the `$effect`
tangle). Add a component test walking spine → index → AV-object → back.

### MF-2 — Studio stale `pendingClear` (MODERATE, but reachable correctness + false UI state)
`apps/studio/src/App.svelte:247-260` (`setSections`) with render at `:1062-1074`.

The last→0 confirm strip is non-blocking and the always-mounted `NarrativeEditor` (`:1074`, `onchange={setSections}`)
renders below it with the live section card and its "＋ Add" button. If the author resolves the last-remove by **adding**
instead of Keep/Remove: `pendingClear` was set but never committed the empty array, so `currentExhibit.sections` is still
length 1 → `prev=1`, `next=2` → falls through the `prev>0 && next===0` guard → `patchExhibit` commits 2 sections →
**`pendingClear` is never reset.** The "Remove the last section?" strip stays pinned above a 2-section spine with
now-false copy, and `Remove` (`confirmClear`) would then wipe **both** sections without a fresh confirm. Reachable;
non-destructive immediately but a real correctness/UX defect. (Verified: `setSections` has no `pendingClear` reset on the
committed-write path; only `confirmClear`/`cancelClear`/`openExhibit` clear it.)

**Fix:** add `pendingClear = null;` on every committed (non-clearing) write in `setSections` — immediately after the
last→0 guard, before `patchExhibit`. Also covers the symmetric "edit a title while the confirm is up" case. Folds the
`role="alertdialog"` (S-low below) into the same fix.

---

## SHOULD-FIX

- **S-1 — Extract a pure `narrativeCueReducer` for the keystone (Studio).** The whole cue machine
  (`firstAddCueSlug` / `pendingClear` / `clearedSlug`, the 0→1 and last→0 detection) is pure logic (count-in → cue +
  commit-intent out) but lives entirely inline in a ~1300-line `App.svelte` with **no seam and zero tests**. None of the
  brief's adversarial cases (0→1 fire-once, 1→2 no-refire, last→0 stash-not-commit, non-last silent delete, fire-time
  flag, cross-exhibit reset) are covered. The app already has the idiom (`library-meta-reducers.ts`: pure reducer + thin
  caller + colocated `.test.ts`) and the strategy doc mandates the flip corpus. Extracting it makes MF-2 a one-assertion
  test and protects an invented-UX keystone. **Single biggest test gap; recommended before commit.**

- **S-2 — Add a viewer escape component test (NOT a reducer).** One consumer; reifying a machine would be premature
  decomposition. Walk spine → index → image-object → back AND spine → index → AV-object → back (the no-back case). This
  is the test that would have caught MF-1. Lands with the MF-1 fix.

- **S-3 — Derive one nav shape in the ExhibitView `$effect` (`:184-201`).** It branches on `inNarrative` three times in
  three parallel ternaries to serve two Readers with one snapshot emitter (Standard #2 "ad-hoc conditionals bolted into
  one flow"). Derive `const reader = $derived(inNarrative ? {…} : {…})`; the `$effect` consumes one object. Behavior-
  preserving, deletes a branch, and is exactly where the MF-1 carousel fix lands cleanly. Pairs with MF-1.

- **S-4 — `.to-read` escape shares the top-left corner with the persistent top bar.** `ExhibitView.svelte:244-246` +
  `.to-read` style — `position:fixed; top:space-5; left:space-5; z-index:30` collides with `ViewerShell` `.topbar`
  (`z-35`, owns the breadcrumb zone). It is the only escape that is global fixed chrome rather than canvas-relative like
  its sibling `.to-index` (correctly `position:absolute`). Anchor it to the index grid the way `.to-index` anchors to the
  canvas, or nudge it clear of the top-bar band. Visual, not functional.

- **S-5 — Split the co-bundled non-narrative UX into its own commit (Studio).** The diff bundles the draw-time
  active-reading destination cue and cite/⌘K dogfood fixes. Coherent, token-clean, coupled to nothing narrative — but not
  the Phase-2 staging spec; it dilutes reviewability of the keystone change. Not a defect and not a revert request — just
  split so the keystone + MF fixes can be reasoned about in isolation. (Per the brief's scope question: no leak into the
  unrelated in-flight cite-cards feature itself.)

- **S-6 — `role="alertdialog"` on the non-blocking confirm strip (Studio, `:1066`).** Enforces no modality (no focus
  trap, editor stays live — by design "non-blocking"), so a screen-reader user is announced an "alert dialog" then handed
  a live editor. Downgrade to `role="alert"`, or keep `alertdialog` only if focus moves to it and Add/edit dismiss it.
  Folds into the MF-2 fix.

---

## Keystone state machine + viewer escape — correctness assessment

**Keystone (Studio 0↔1 cue machine): CORRECT detection, ONE reachable defect.** Verified against source:
- **0→1 fires once per exhibit** (`:256-259`): guarded by `!firstAddSeen(currentSlug)` and immediately `markFirstAddSeen`
  at fire-time — rapid multi-add cannot re-fire (1→2 has `next!==1`, and the flag is already set). Correct.
- **last→0 stashes, does not commit** (`:252`): returns early with `pendingClear`, never silently clears. Correct.
- **non-last delete** (e.g. 2→1): falls through to `patchExhibit`, no cue, no confirm. Correct (matches spec §7 "no
  confirm on non-last deletes").
- **Sections loaded from storage already >0 then edited:** `prev` reads `currentExhibit.sections.length`, so an edit at
  count ≥1 never spuriously fires the 0→1 cue. Correct.
- **Switching exhibits mid-cue** (`openExhibit`, `:179`): resets `firstAddCueSlug`, `pendingClear`, `clearedSlug` — no
  cross-exhibit cue leak. Correct.
- **fire-time flag:** `markFirstAddSeen` is called at the moment the cue is raised (not on dismiss), so a refresh before
  dismiss won't re-fire. Correct.
- **THE DEFECT (MF-2):** the confirm/cancel path is correct, but the *non-blocking* confirm coexists with a live editor,
  and resolving last→0 by **adding** leaves `pendingClear` stale (never reset on the committed-write path). This is the
  one hole — `setSections` resets `pendingClear` nowhere on commit.

**Viewer escape: CORRECT except the index-AV branch (MF-1).** Verified:
- **{#key} remount genuinely resets index state:** `ViewerShell.svelte:234` wraps the whole `ExhibitView` in
  `{#key route.slug/noteId}`; `narrativeIndex` and `indexObjectId` are `$state` *inside* ExhibitView, so a new
  slug/deep-link mounts a fresh component with both at their initial `false`/`null`. **No state leak across
  exhibits/deep-links.** Correct.
- **Two-level reversible path** (spine → index grid → index object → back) is correct for **image** objects: `.to-read`
  returns grid→spine, `Reader.onback` returns object→index. Reversible.
- **Single-object suppression:** `NarrativeReader.svelte:130` gates `.to-index` on `onindex && objects.length > 1` — a
  1-object exhibit hides the index affordance. Correct.
- **THE TRAP (MF-1):** the index-AV object (`:216-217`) is the one state with no path back — `MediaPlayer` has no
  `onback`, the carousel is killed for it, the breadcrumb needs a multi-exhibit gallery. A confident-wrong path shipped.

**NarrativeReader `state_referenced_locally` (~:67-68): BENIGN, not a bug.** `let selected = $state(initialSelected)` is
local UI state seeded once from the deep-link prop and meant to diverge; re-seeding on a new deep-link is handled
structurally by the `{#key slug/noteId}` remount. Identical accepted pattern in `Reader.svelte:67` and
`NoteLightbox.svelte:20`. No fix required; if silencing, apply `// svelte-ignore` across all three call sites or none.
(The Studio NarrativeEditor:~68 instance is also pre-existing/benign — the `citeInto` closure reading `proseEls` at click
time, an intended current-value read, unchanged from main. Phase 2 introduces no new instance.)

---

## Tests

No tests accompany either state machine. **Two distinct test gaps, two distinct remedies:**
1. **Studio keystone → extract + unit-test** (S-1): pure count-in/cue-out logic, established reducer idiom, strategy-doc
   flip corpus mandated. The reducer earns its keep (the deletion test: extracted, the cue logic is testable and MF-2
   becomes one assertion; inline, it is six $state vars braided into a 1300-line component with zero protection).
2. **Viewer escape → component test, NOT a reducer** (S-2): one consumer; a reified machine would be premature
   decomposition (fails the seam discriminator — only one thing varies). Test the component's spine→index→object→back
   walks, including the AV no-back case.

Both should land with their respective must-fix. The comprehension gate (2–3 first-time authors per strategy §81) is
owed for the invented UX but is **not** a code-review defect and not a ship-blocker per the brief.

---

## What earns its keep (do not re-litigate)

- The always-mounted `NarrativeEditor` (mirrors the always-mounted `ReadingsRail` idiom; ADR-0016 mandates ungating).
- `resolveLayout` as single source of the leading surface (the ADR-0016 contract; the keystone projects off it).
- The `{#key slug/noteId}` remount as the deep-link state-reset mechanism (structural, not a leak).
- The `setSections` funnel as the single mutation chokepoint (correct place to own crossing-detection — MF-2 is a
  missing line in it, not a wrong location).

---

## Scope check

No leak into the unrelated in-flight cite-cards / ProseCites / published-base feature. The one scope observation is the
co-bundled active-reading/⌘K cleanup (S-5) — coherent and low-risk, but belongs in its own commit so the keystone diff
is reasoned about in isolation.
