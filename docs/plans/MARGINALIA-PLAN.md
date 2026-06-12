# Marginalia plan (worklist 2.1 + 2.2 + 0.3-cut-3 — one coordinated build)

*2026-06-11. Plan only — written after the Phase 0/1 foundations landed (see
IMPROVEMENT-WORKLIST.md status ledger). Execute with `executing-plans`; each cut has its own
review gate. Pairs with seeds **Archie-6a16** (view-state store) — the same seam.*

## What it is

Notes stop being an independently-ordered list and become **marginalia**: each card in the right
column positions itself against the **vertical position of its region in the current viewport**,
reflowing on pan/zoom, with a hairline leader to its mark on hover. Editing happens **in the card
at its locus** (finishes ADR-0006); the sidebar stops being three tools fighting over 352px.

## Grounding facts (verified this session)

- `MountSurface.markerScreenRect(id)` already computes one marker's screen rect from PUBLIC APIs
  (`mount.ts` — annotations + core `selectorBBox` + OSD `imageToViewerElementCoordinates`).
- `onViewportChange(cb)` already streams every pan/zoom frame (used today to re-anchor the popover).
- The log is the only writer (0.2) and `App.svelte` is decomposed enough (0.3 cuts 1–2) that the
  remaining view-state (`selected/editing/creating/currentObjectId`) is a clean extraction.
- `notes`/`annotations` deriveds in App.svelte are already per-object, reading-filtered.

## Cuts (each ≤5 files, each gated)

### Cut A — mount: batched rect stream
`markerScreenRects(ids): Record<id, Rect|null>` (one pass over `getAnnotations()`, same math as
the singular method) + throttle helper. Gate: render-mount unit tests on the pure parts; manual
rect parity check against `markerScreenRect`.

### Cut B — the layout solver (pure, the heart)
`layoutMarginalia(items: {id, anchorY, height}[], opts: {viewportH, gap, minY?}): {id, top}[]` —
sort by anchorY, resolve collisions by pushing down then relaxing up (1-D interval placement),
off-viewport items pinned to top/bottom gutters with overflow counts ("3 more above"). Lives in
render-core (geometry-adjacent, framework-free). Gate: dense headless tests — overlap chains,
ties, all-off-screen, single item, zero-height viewport.

### Cut C — view-state store (Archie-6a16)
`editor-state.svelte.ts`: `selected/editing/creating/framingSectionId/currentObjectId/readingFilter`
+ their transition rules (the editing-follows-selected effect, switchObject resets). App.svelte and
the new margin component both project from it. Gate: studio tests still green; App.svelte shrinks
again (~150 lines).

### Cut D — Studio MarginNotes component
Replaces the `<ul>` list in the editor aside. Subscribes: rect stream (A) → anchors → solver (B)
→ absolute-positioned cards in the column. Hairline leader = one SVG line in the aside gutter on
card/mark hover. Card click = select (existing path). **Degrade**: container under 200px tall or
>40 notes → today's plain list (the solver result is unused, nothing breaks). Gate: browser-verify
+ the 0.4(c) suite once it exists (Archie-c9ac).

### Cut E — edit at the locus (2.2)
The WADM form snippet (already declared once, ADR-0006) renders INSIDE the focused margin card
instead of the detached popover; the popover remains for AV. Sidebar = pure index. Gate:
browser-verify the write loop (draw → card opens focused → type → autosave indicator).

### Cut F — Viewer variant
Read-only MarginNotes in Reader's aside (cards = previews, click = select+zoom). Same solver, no
editor. Gate: browser-verify with the voynich template.

## Risks / decisions to surface

- **Reflow cost**: solver runs per viewport frame — keep it O(n log n), throttle to rAF; bail to
  static list beyond the degrade threshold.
- **Q5 adjacency**: none — marginalia doesn't touch reading exclusivity. The readings rail (2.3)
  DOES and needs its own decision record before build.
- **Popover retirement** changes ADR-0006's "anchors to the marker" wording — amend the ADR in
  cut E, don't silently drift.
