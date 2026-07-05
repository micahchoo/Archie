# Spike 0003 — Studio overview toolkit interaction (SCALE-GALLERY Phase 2)

**Date:** 2026-07-05 · **Status:** SPIKE — design only, no code touched.
**Origin:** `docs/plans/SCALE-GALLERY-PLAN.md` Phase 2 (lines 71–78) + decisions (18–22). Designed against the
CURRENT committed `apps/studio/src/ExhibitOverview.svelte` (Phase 1.2/1.3 in flight by another agent — read-only here).

## 1. Selection model — App-owned, driven by a pure reducer

**State lives in App**, not `ExhibitOverview`, for three reasons: (a) bulk delete rides App's removal path
(`deleteObjectNotesAndMeta` `App.svelte:272` → `bnd.markObjectRemoved` `:281`); (b) the deferred
bulk-move-between-exhibits (plan :19) is a library-scope op — selection must be reachable above one exhibit;
(c) keyboard select-all/clear/delete dispatch from App's global handler (`onGlobalKey :1154`, `<svelte:window
onkeydown> :1292`), which can't reach component-local state. So: `let selection = $state<Set<string>>` +
`anchor` in App; `ExhibitOverview` receives `selection` + emits pointer intents. `OBJECTS` (`:108`, the
canonical ordered array via `currentExhibit.objects`) is the ordering authority for shift-range.

Selection math is a **pure reducer** `overview-selection.ts` (cf. `library-meta-reducers.ts`,
`narrativeCueReducer`) — headlessly testable, no DOM: `applyClick(sel, id, {meta,shift}, orderedIds)` (plain →
replace-with-{id}; meta/ctrl → toggle; shift → range from `anchor` to `id` over `orderedIds`), `selectAll`,
`clear`, plus `moveBlock` (see §1b). `ExhibitOverview` emits `onselect(id, mods)` / `onmarquee(ids)` /
`onclear`; App runs the reducer. Single click on a plate STILL opens (`:247`) — selection is via
ctrl/shift-click + marquee, so the primary gesture is unbroken (see §2 for the select-mode nuance).

**1b — multi-drag reorder.** Generalize the single-item `commitReorder(beforeId)` (`:146-153`) + `commitToStart`
(`:156-162`) into one pure `moveBlock(orderedIds, movingIds, before)`: `moving = orderedIds.filter(∈sel)`
(preserves relative order), `rest = orderedIds.filter(∉sel)`, insert `moving` at `before` (START→0,
END/null→rest.length, else `rest.indexOf(before)`). This **subsumes** the existing first-position edge-case
(`:154-155` — dragged item first → `indexOf(self)` = −1 → wrong append): `moving` is filtered out of `rest`
and START/END are explicit sentinels, so the −1 path can't occur. Dragging any selected plate moves the whole
selection; a non-selected drag falls back to a 1-element block. Emits the existing `onreorder(ids)` (`:352` →
`reorderObjects` `:508`) — **no new App reorder path**.

## 2. Marquee-vs-pan — a persistent select-mode toggle (recommended)

Canvas background-drag currently PANS (`onBgPointerDown :113`), which is invention #1's core identity. Recommend
a **persistent select-mode toggle in the toolbar** (matches the plan's "one persistent toolbar", no hidden
menus, :72): OFF = today (click opens, bg-drag pans, ctrl/shift-click still selects as a power path); ON =
plates show a checkbox corner, bg-drag draws a **marquee**, single-click toggles selection (double-click opens),
pan demotes to the zoom cluster (`:286`) / space-drag. **List mode gets marquee for free** (no pan to fight) —
select affordance always live there. Esc exits select-mode (§5).

- Rejected — *shift-drag marquee, no toggle*: undiscoverable and fights the on-canvas "drag to pan" legend
  (`:280-282`); a hidden modifier violates the toolbar decision.
- Rejected — *click-selects-always (Finder-style)*: inverts the plate's open gesture (`:247`), a large
  relearn for the single most-used action.
- Rejected — *marquee in list-mode only for round 1*: leaves the canvas (the flagship view) without survey-select.

## 3. Toolbar — search / sort / density, view-only, honored by BOTH modes

One toolbar row under `<header>` (`:168`). Filter/sort/density are **view-only $state local to `ExhibitOverview`**
(like `mode :85`) — they never touch the canonical array. Compute `displayObjects = $derived` (filter by title
substring → sort) ONCE; both `{#each}` blocks (canvas `:238`, list `:304`) render `displayObjects`.

- **Search:** case-insensitive substring over `o.label`. Filter only; order within the filtered set stays canonical.
- **Sort (a VIEW, never a reorder — plan :21):** `reading order` (default; canonical `OBJECTS` order),
  `name` (label), `recently-annotated`. **Recency source:** `AnnotationRecord.modifiedAt` (`wadm/types.ts:224`).
  App builds `lastAnnotatedOf(objId)` the same way as `noteCountByCanvas` (`App.svelte:824-829`: iterate
  `allNotes` → group by `srcOf(target)` = canvas id → keep MAX `modifiedAt`), passed as a prop like `noteCountOf`
  (`:829`). Exhibit-scoped, which is exactly the overview's scope (session holds one exhibit's log).
- **Density:** drives a CSS var `--plate-w` (canvas `.plate width:13rem :381` → ~9–16rem) and `--row-h`
  (list `.list li :433` → ~2.5–4rem). **Coupling to flag:** Phase 1.3 virtualization copies
  `content-visibility:auto; contain-intrinsic-size` from `ObjectGrid.svelte:73` onto list rows — density MUST
  also feed `contain-intrinsic-size` or the scroll estimate drifts and janks.
- **Drag-reorder while sorted/filtered:** reorder is meaningless outside canonical order (a drop index in a
  filtered/sorted view ≠ canonical index). **Disable** drag when `sort ≠ reading || search ≠ ""`: gate the
  `draggable` attr (`:243, :308`) on a `reorderable` derived, dim the grip, swap the legend (`:280, :297`) for
  "Clear search & sort to reorder." Feasible — all state is local to the component.

## 4. Bulk delete — one persist + one mirror (verified)

The Phase 1.1 dirty-set already coalesces: `dRemovedObj` is an ARRAY and `dEx` a Set (spike-0002), and one
`publishLibrary` prunes N `removedObjects` + rewrites the exhibit manifest ONCE. So bulk delete must do all
marks + ONE persist + ONE mirror, NOT N `deleteObjectNotesAndMeta` calls (each awaits `lib.removeObject` →
`onAfterPersist` → a mirror trigger; the guard coalesces to ~1–2 but don't rely on it). Add: `library-meta`
bulk `removeObjects(slug, ids[])` (+ pure `removeObjectsIn`, cf. `removeObjectIn :45`) → single persist → single
`onDirty`; App `bulkRemove(ids)` tombstones each object's notes + `markObjectRemoved(slug, id, assetName)` per id
(so orphan cleanup is complete), then the one bulk reducer call. **No binding-store change** — the dirty-set
already supports it (spike-0002 test "prunes an orphaned object's tree files" × N).

## 5. Keyboard — the registry, NOT LibraryHome's `onshortcuts`

Correction: `LibraryHome.onshortcuts` (`LibraryHome.svelte:87`) is a HELP-MENU callback (opens the cheat-sheet),
not a key-dispatch seam. The real convention is `shortcuts.ts` (`SHORTCUTS` registry + `matches(e, keys)` +
`typingInField`) dispatched in `onGlobalKey` (`App.svelte:1154`). Add, gated on `view === "overview" &&
!typingInField`: **⌘A** select-all (`preventDefault` — else it selects page text), **⌫/Delete** →
`bulkRemove(selection)` when non-empty (reuse `matches(e,"⌫") :1179`). **Esc**: add "clear selection" as a new
rung in the existing dismiss-ladder (`:1167-1176`) BEFORE `overview → library` (`:1174`) — Esc clears a
selection first, then exits select-mode, then backs out. Register the three in `SHORTCUTS` under a new
`"Organizing"` group (`SHORTCUT_GROUPS`) so the `?` cheat-sheet auto-renders them (it reads the registry).

## 6. Implementation sketch & tests

**Touched:** new `overview-selection.ts` (~60 LOC pure: click/range/all/clear + `moveBlock`); `App.svelte`
(~50: `selection`/`anchor` $state, `lastAnnotatedOf` derived, `bulkRemove`, 3 key dispatches, pass selection +
callbacks); `library-meta.svelte.ts` (~10: `removeObjects` + `onDirty`) & `library-meta-reducers.ts` (~8:
`removeObjectsIn`); `ExhibitOverview.svelte` (~120 + styles: toolbar, checkbox chrome, marquee rect, `moveBlock`
wiring, `displayObjects`, density vars, disable-drag affordance); `shortcuts.ts` (~5). **binding-store: none.**
~4–5 files core logic, ~250 LOC + styles.

**Headlessly testable (the load-bearing logic):** `overview-selection.ts` — replace/toggle/shift-range over an
ordered array, select-all, clear; `moveBlock` — relative-order preservation, START/END/mid, drop-onto-selected
guard, the first-position edge. `removeObjectsIn` — removes N, preserves order. `removeObjects` rune test —
one persist, one `onDirty` (cf. `library-meta.svelte.test.ts`). Bulk-coalesce already covered by spike-0002's
binding-store suite. **Browser-only (flag for manual/Playwright, as the overview already is — `:7`):** marquee
hit-test geometry (needs DOM rects; but the resulting `onmarquee(ids)` → reducer IS unit-testable), pan-vs-marquee
pointer routing, density CSS, HTML5 DnD.

**Riskiest assumption:** that keeping single-click = open (not select) and routing survey-select through a
select-mode toggle + modifier-clicks feels "photo-app-grade" enough (plan :15) without click-selects-by-default.
If dogfood says the toggle is friction, the fallback is select-mode making click=select in-canvas — already the
design's ON-state, so no rework, just a default flip.
