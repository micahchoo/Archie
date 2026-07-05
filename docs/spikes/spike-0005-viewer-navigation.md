# Spike 0005 — Viewer in-exhibit navigation (SCALE-GALLERY Phase 4)

**Date:** 2026-07-05 · **Status:** SPIKE — design only, no code touched.
**Origin:** `docs/plans/SCALE-GALLERY-PLAN.md` Phase 4 (88–92) + decisions (23–25). Viewer-side (`apps/viewer`).
Decided already: filmstrip reachable from Reader AND NarrativeReader (collapsed by default in narrative);
position indicator ("Object 14 of 32"); richer grid landing + density toggle; NO audience search inside an exhibit.

## What already exists (extend, don't duplicate)

`ExhibitView.svelte` orchestrates the three layouts (`resolveLayout` :90 → single / grid / narrative) and OWNS
the cursor: `selectedObjectId` (:52,193) for grid/single readers, `indexObjectId` (:71) for an object opened
FROM the narrative index, `narrativeIndex` (:70) for the grid-behind-narrative overlay. It already publishes an
object-nav snapshot to `ViewerShell` (`onnav` :25) which renders a **top-bar carousel** when `navObject &&
objs.length > 1` (:325) — a LINEAR stepper. `SidebarObjectNav.svelte` (R4) is a second stepper in the reader
sidebar and **already renders a position indicator** — `{idx+1} / {siblings.length}` (:45), prev/next (:20-21).
The narrative already has a full-grid jump: `onindex` (:423) → `narrativeIndex` → `ObjectGrid` (:393-399,
`onselect` → `indexObjectId`). So Phase 4 is mostly **surfacing + unifying**, not new machinery.

## 1. Filmstrip — one shell-level surface, thumbnail jump, reuses existing cursors

**Mount at the `ExhibitView` shell**, above both readers — NOT inside `Reader.svelte` — so grid-reader and
narrative render ONE instance with identical behaviour, and it reads/writes the cursors ExhibitView already owns.
It fills the gap the two existing steppers leave: the carousel is linear (no random access) and `narrativeIndex`
is a heavy full-screen grid; a filmstrip is a light, always-glanceable **thumbnail strip** for survey + jump.

- **Data: none new.** `layout.objects` (id/label/source/tileSource) + `data.objects` (mediaType) + the baked
  thumbnails already in `PublishedExhibit` (what `ObjectGrid` + `MediaThumbnail.svelte` already render). The
  filmstrip reuses `MediaThumbnail`.
- **Gesture — a collapsible bottom thumbnail strip for BOTH modes** (photo-app filmstrip, not a bottom-sheet
  grid): a bottom-edge handle/tab toggles it. Grid-reader: expanded (or one-tap open); narrative: **collapsed by
  default** (authored path primary, plan :23). Recommend one consistent surface over per-mode variants.
- **Jump semantics reuse existing cursors, sidestepping the multi-section trap.** Grid-reader click →
  `selectedObjectId` (the `onstep` target :359). Narrative click → `indexObjectId` (open the object's OWN Reader,
  the existing "opened from the index" path :399). This dodges "an object owning multiple/zero sections": the
  filmstrip is an OBJECT index (like `narrativeIndex`), so a click opens that object's reader — it never has to
  pick a section. (Rejected: jump-the-spine-to-first-owning-section — ambiguous, couples object→section.)
- **Keyboard:** `ExhibitView.onWindowKey` (:340) only handles ⌘K / `/` (finder); `Reader`/`NarrativeReader`
  `onkey` (:206/:180) are Escape/local only — so ←/→ object-stepping is NET-NEW. Add it to `onWindowKey` (gated
  on not-typing / finder-closed), stepping `selectedObjectId` over the sibling order (grid/single). Narrative
  arrows stay unbound (authored scroll leads) — out of scope.

## 2. Position indicator — grid DONE, narrative is the §146 extension

- **Grid/single reader: already shipped** — `SidebarObjectNav` `.pos` (:45) + the carousel. Just **relabel** the
  copy to "Object 14 of 32" (plan wording) and optionally echo it in the filmstrip; do NOT add a duplicate.
- **Narrative: surface it.** `NarrativeReader` tracks `activeIndex` (:91) over `sections` but renders no
  persistent indicator (`onkey` is Escape-only :180). `.scratch/CONTEXT.md` §146 already prescribes "Section 3 of
  7" for deep-link ARRIVAL — **extend that into a persistent spine-header indicator** driven by the existing
  `activeIndex` (`Section {activeIndex+1} of {sections.length}`). No new state.

## 3. Grid landing density — a 2-step toggle, localStorage

`ObjectGrid` has NO density knob today (props: title/summary/objects/countOf/onselect/rights :17-24). Add a
`density` prop + a **segmented toggle (Comfortable / Compact)** — NOT a slider: it's an audience surface, discrete
steps are one-tap and the grid needs no fine control (the SLIDER is the Studio editing surface, spike-0003 §3).
Density drives the grid's min column width AND the `contain-intrinsic-size` estimate (:73) — **update both
together or the content-visibility virtualization janks** (same coupling as spike-0003 §3). **Persist in
`localStorage` (`archie:gridDensity`)** — a global per-device audience preference; NOT a URL param (not worth a
shareable-link slot) and NOT per-exhibit (the preference is cross-exhibit). Missing localStorage (SSR/private) →
default Comfortable.

## 4. Embed — NOT automatic; a follow-up, out of Phase 4

The `<archie-viewer>` custom element (`packages/archie-viewer`) is a SEPARATE, imperative `@render/mount`-based
implementation — `element.ts` + a lazily-imported `reader.ts` that mounts ONE object (`reader.ts:1,53`), with its
own gallery/grid path. It does NOT render the Svelte `ExhibitView`/`Reader`/`NarrativeReader`, so it inherits
**none** of the filmstrip / position / density work automatically. Phase 4 targets `apps/viewer` only. Embed
parity is a deliberate follow-up port (new imperative code over the embed's own grid) — flag it, don't scope it in.

## 5. Implementation sketch & tests

**Touched:** new `Filmstrip.svelte` (~60 LOC presentational: `objects`, `thumbFor`, `currentId`, `collapsed`,
`onjump`; reuses `MediaThumbnail`); `ExhibitView.svelte` (~30: mount it both modes, wire `onjump`→cursor,
collapsed-default per mode, ←/→ in `onWindowKey`); `NarrativeReader.svelte` (~5: the §146 "Section X of Y");
`ObjectGrid.svelte` (~25: density prop + segmented toggle + CSS var + localStorage); `SidebarObjectNav` (~1:
relabel). ~120 LOC, `apps/viewer` only.

**Headlessly testable (pure):** the sibling step/position math (prev/next/index — already pure in
`SidebarObjectNav` :43-45; extract to a helper if shared), the narrative `activeIndex → "N of M"` derivation, the
jump-target resolver (grid→`selectedObjectId` / narrative→`indexObjectId`), density localStorage read+default.
**Browser-only (manual, as the viewer already is):** filmstrip thumbnail render/scroll, the collapse gesture,
keyboard focus routing, the density content-visibility re-layout.

**Riskiest assumption:** that a horizontal thumbnail filmstrip is the right jump surface vs. simply making the
existing full-grid overlay (`narrativeIndex` → `ObjectGrid`) reachable from BOTH readers. If dogfood finds the
filmstrip redundant with the grid, the fallback is ONE shared grid-overlay jump surface triggered from both
readers (reuse `ObjectGrid`, no new component) — a smaller build that leans entirely on existing parts.
