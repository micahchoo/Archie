# Thermo-Nuclear Review — STUDIO, narrative-as-layer Phase 2 (staging UX)

**Scope:** `apps/studio/src/{App.svelte, NarrativeEditor.svelte, ExhibitOverview.svelte}`, diff vs `main`.
Phase 1 (LayoutPicker deletion, `store.ts`, `seed-data.ts`, `library-meta`, render-core) and the
unrelated working-tree noise are out of scope and untouched here.
**Spec of record:** ADR-0016 + `docs/plans/NARRATIVE-AS-LAYER-STRATEGY.md` (the staging spec).

---

## 1. Verdict

**Pragmatic Partial.** The keystone state machine is correct on every edge case the brief named
*except one* — a stale `pendingClear` confirm strip survives if the author resolves a last-remove by
*adding* instead of removing (M1). That is a real, reachable correctness defect but narrow and
non-destructive. Everything else — 0→1 / last→0 detection, the per-slug localStorage flag, the
openExhibit reset, single-funnel `setSections`, copy verbatim, token fidelity, derivations — is
clean and faithful to the spec. Fix M1 (and ideally extract the state machine, m1) before commit;
the rest ships.

The `state_referenced_locally` warning is **benign and pre-existing** (not introduced by Phase 2).
The disabled "Preview how it opens" TODO is an **accepted deferral**, not a defect (per the brief
and the build rule). Comprehension-validation is owed at the human gate and is explicitly NOT a
code-review defect.

---

## 2. The Domino

**None — findings are independent.** The one structural lever worth pulling (extract the keystone
state machine to a pure reducer, m1) would make M1 *trivially testable* but does not by itself fix
M1, and does not subsume any other finding. M1 and m1 are best done together; the remaining items
are isolated.

---

## 3. Findings

### M1 — `pendingClear` goes stale if the author ADDS instead of confirming/cancelling the last-remove (moderate)

`App.svelte:240-271`, render at `App.svelte:1062-1072`.

The last→0 guard stashes `pendingClear = { slug }` and renders a confirm strip (`role="alertdialog"`),
but the strip is **non-blocking** — the always-mounted `NarrativeEditor` renders directly below it
(`:1074`) with the still-present (uncommitted) section card *and* its "＋ Add to the narrative"
button. The state machine handles every exit *through the section count* but leaves a hole:

- User clicks ✕ on the last beat → `remove(0)` → `setSections([])` → `prev>0,next===0` → `pendingClear` set, strip shows.
- Instead of "Keep it"/"Remove", the user clicks **＋ Add** → `setSections([…,new])` → `prev=1` (read from `currentExhibit`, still 1 — the clear never committed), `next=2` → falls through to `lib.patchExhibit(currentSlug,{sections})` and commits **2 sections**.
- `pendingClear` is **never reset** on this path → the "Remove the last section? Your exhibit goes back to opening with the media grid." strip stays pinned above a now-2-section spine. The copy is now false, and "Remove" (`confirmClear`) would wipe **both** committed sections without a fresh confirm.

`role="alertdialog"` implies modality the markup does not enforce; the spec calls the cue
"non-blocking", so the fix is not to trap focus but to **invalidate the pending clear whenever the
section count moves off the clear path.** Cleanest: in `setSections`, clear it on every committed
write —

```ts
function setSections(sections: Section[]) {
  const prev = currentExhibit?.sections.length ?? 0;
  const next = sections.length;
  if (prev > 0 && next === 0) { pendingClear = { slug: currentSlug }; return; }
  pendingClear = null;            // any non-clearing write retires a stale confirm
  lib.patchExhibit(currentSlug, { sections });
  …
}
```

(The same line also covers the symmetric "user edits a title while the confirm is up" case.)

### M2 — Keystone state machine is inline-untested with no pure-function seam (moderate)

`App.svelte:240-271` (`setSections`, `confirmClear`, `cancelClear`, `firstAdd*`, `pendingClear`,
`clearedSlug`).

The brief's adversarial list is exactly the surface a unit test should pin: 0→1 fires once; 1→2
never re-fires; last→0 stashes-not-commits; non-last delete commits silently; `firstAddSeen` flag
set at fire-time; cross-exhibit reset; the M1 add-during-pending case. None of it is testable today
— it is six `$state` vars and three closures braided into a 1300-line component, reachable only
through Svelte rendering. The logic is **pure** (count-in → cue-decision + commit-intent out): it
wants a reducer.

**Remedy (m1, the extraction):** lift a pure
`narrativeCueReducer(prev: number, next: number, seen: boolean) → { commit: boolean; cue: 'first-add' | 'confirm-clear' | null; markSeen: boolean }`
into a plain `.ts` next to `library-meta-reducers.ts` (which already establishes the
"pure reducer + thin Svelte caller" idiom in this app). `setSections` becomes a thin dispatcher;
the localStorage flag and `patchExhibit` stay in App. Then the corpus the strategy doc *itself*
mandates ("DECEPTIVELY-SIMPLE items — write the test corpus FIRST", §0↔1 flip row) becomes writable.
Warranted: this is the keystone of an invented-UX feature and currently has zero regression
protection. Pairs with M1 — extract, then the M1 case is one assertion.

### m2 — `role="alertdialog"` overclaims modality (minor; folds into M1)

`App.svelte:1064`. The confirm strip is `role="alertdialog" aria-label="Remove the last section"`
but nothing makes it modal (no focus trap, no inert backdrop, the editor stays fully interactive —
by design, per the "non-blocking" spec). A SR user is told "alert dialog" then handed a live editor.
Once M1 invalidates the pending state on stray writes, downgrade to `role="alert"` (or keep
`alertdialog` only if you also move focus to it and treat Add/edit as dismissal). Cosmetic relative
to M1 but worth the one-word change.

### m3 — Bundled non-narrative UX in the Phase-2 diff (minor; scope)

`App.svelte:573-575` (`activeReading*`), `:715-716`/`:739` (cite-confirmation `importNote`),
`:759-764` (⌘K dead-key hint), `:1032` (`fb-into`), `:1104` (`nn-into`) + their styles.

These are the **draw-time reading-destination cue** and **cite/⌘K dogfood-gap fixes** — coherent,
low-risk, token-clean, and coupled to nothing narrative. But they are *not* the Phase-2 staging
spec; they rode in on this diff. Not a code defect — a reviewability/scope hygiene note: a separate
commit would let the keystone diff be reasoned about in isolation (and would let M1/M2 land without
dragging unrelated P1 work). Flagging per the brief's scope question, not asking for a revert.

### n1 — `setSectionStart` funnels through `setSections` safely, but only by count-coincidence (nit)

`App.svelte:288-289`. Framing a camera maps existing sections (same length) through `setSections`,
so `prev===next` and no spurious cue fires — correct, but it relies on count-invariance rather than
intent. The m1 reducer (which keys on `prev`/`next` counts) preserves this for free; no separate
action needed. Noting so synthesis doesn't re-derive it.

---

## 4. What earns its keep (considered, passed the deletion test)

- **Three separate cue-state vars (`firstAddCueSlug` / `pendingClear` / `clearedSlug`).** They look
  collapsible into one enum, but they carry *different lifetimes*: `firstAddCueSlug` is
  one-time-per-exhibit (persisted flag), `pendingClear` is a transient guarded intent, `clearedSlug`
  is a post-commit empty-state selector. Collapsing them would complect three timelines — leave them.
  (The m1 reducer should still return a single discriminated `cue`, but the App-level *retained*
  state legitimately stays three fields.)
- **Slug-keyed cue state (not object-keyed).** Every cue is exhibit-scoped, so keying on `currentSlug`
  and resetting in `openExhibit` is exactly right — the "cleared" copy correctly persists across
  object switches within the exhibit. Deletion test: object-keying would *reintroduce* the
  cross-exhibit-leak class the openExhibit reset exists to kill.
- **`currentLayout` delegating to `resolveLayoutType`** (`App.svelte:486-488`). Display-only, single
  source of truth (render-core), no stored `layout` read. This is the ADR-0016 contract realized in
  Studio — not a shallow wrapper; it's the projection the spec demands.
- **Always-mounted `NarrativeEditor` (ungated).** Mirrors the ReadingsRail idiom (ADR-0016 §Studio);
  the `{#if currentLayout==='narrative'}` gate is correctly gone. Recessed-vs-card weight is handled
  by `class:recessed`, not by mounting — right call.
- **Derivations `isEmpty`/`onBeatlessObject`/`canReorder`/`sectionPath`/`objectPath`** read props
  inside `$derived` — fully reactive, no `state_referenced_locally` exposure. Consecutive-dupe
  collapse in `objectPath` (`NarrativeEditor:120-125`) correctly renders "one stop per item on the
  walk" per spec §6.

---

## 5. Cross-subsystem hooks

- **Viewer (the matched pair).** The Studio cue *claims* "the media grid becomes a list they can
  still reach." That promise is the Viewer's grid-index-escape work (ExhibitView `narrativeIndex`).
  Synthesis should confirm the Studio copy and the Viewer behavior agree — Studio promises
  reachability; the Viewer must deliver it or the keystone cue lies. (Out of my files; flagging the
  contract.)
- **render-core single source.** `resolveLayoutType(objects, sections)` (`layout.ts:20`) is now the
  *only* discriminant; Studio's `currentLayout` and ExhibitOverview's `LAYOUT_INTENT[layout]` both
  project off it. The `LayoutType` union still carries all three members (Phase 2 did not narrow it —
  that was deferred/Phase-1 scope); the exhaustive `Record<LayoutType,…>` in ExhibitOverview stays
  total. No drift from ADR-0016 in my files.
- **`library-meta-reducers.ts`** is the idiom the m1 extraction should follow (pure reducer + thin
  `.svelte.ts` caller + colocated `.test.ts`). The keystone reducer belongs in that same family.
