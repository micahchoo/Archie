# ADR-0011: Annotation creation is gesture-initiated; no persistent draw-tool mode

## Status

Accepted (2026-05-29). Supersedes the "3-Action Routing" and "Header (Tools)" clauses of
`.interface-design/system.md` (the persistent Select | Rect | Polygon palette). Builds on
ADR-0006 (edit-at-locus) and ADR-0005 (narrative section model). Decided via `/grill-with-docs`
(seeds `Archie-6d65`).

## Context

The Studio header carried a persistent tool palette — **Select | Rect | Polygon** — backed by
two independent rune states (`App.svelte` `mode: "select" | "draw"` and `tool: "rectangle" |
"polygon"`), with `R`/`P`/`V` keyboard shortcuts (`App.svelte:867-869`) mutating them directly.
This is an **adopted pattern from anvil** (a sticky modal toolbar): the user picks a tool, the
canvas stays in that mode until they pick another. It carries a standing cost — a mode the user
can forget they are in (draw when they meant to select, select when they meant to draw), header
real estate, and a second source of truth (`mode` + `tool`) that every creation surface must
respect. ADR-0006 already moved editing *to the locus* and made *add* a "draw → type at the
marker" gesture, which made the sticky select-vs-draw distinction mostly vestigial: you select by
clicking a mark (always), and you only ever need to draw at the moment you are creating.

## Decision

**Creation is gesture-initiated. There is no persistent draw-tool mode.**

1. **Selection is ambient — always on.** Clicking a mark selects/inspects it. There is no
   "select tool" to choose; it is the resting state of the canvas.

2. **Drawing is armed only by an explicit CREATE act.** A "New note" affordance (the notes pane
   is the entry, ADR-0006 locus model) starts a universal **choose-shape → draw** gesture: pick
   the shape (rect / polygon), draw the region, the note is created at that locus, and the canvas
   returns to ambient selection. The gesture **disarms itself** on completion — it is never sticky.

3. **The gesture is universal across CREATE acts.** Two create acts use the *same* primitive,
   differing only in what they produce:
   - **Note creation** → a note at the drawn locus.
   - **Narrative camera framing** (ADR-0005) → a section camera at the drawn region.
   Framing is therefore **not an exception** — same choose-shape → draw gesture, different product.

4. **The header tool palette and the `mode`/`tool` state are removed.** `R`/`P`/`V` shortcuts die
   with the palette.

## Consequences

- **Removes a forgettable mode** and a second source of truth; the canvas has one resting state
  (select) and one transient gesture (draw-to-create).
- **AV creation is a *different* gesture and is unaffected** (`AvEditor.svelte`: waveform-drag for
  audio, frame-box + timeline for video — ADR-0006). The choose-shape → draw / rect-polygon model
  is **image-only**; AV keeps its own creation surface. "Universal gesture" means universal across
  the *image/spatial* create acts (note + framing), not across media types.
- **Reshape of an existing mark must survive palette removal.** Reshape depends on Annotorious
  select-mode edit handles (`mount.ts setDrawingEnabled(false)`). With selection now ambient, the
  surface sits in `setDrawingEnabled(false)` by default, so edit handles are available whenever a
  mark is selected — verify at build time.
- The choose-shape → draw gesture during framing locks the canvas to draw transiently (today
  `framingSectionId !== null` already disables the palette buttons, `App.svelte:1218-1226`); that
  transient lock stays, just without a palette to disable.
- `.interface-design/system.md` "3-Action Routing" (Annotate = sticky draw mode) and "Header
  (Tools)" are superseded on this point and are annotated as such.

## Alternatives considered

- **Keep the sticky palette** (do nothing) — rejected: it is the forgettable-mode cost above, and
  ADR-0006 already made it vestigial by moving add to draw-at-locus.
- **A "draw" toggle without explicit shape choice** (single rect-only quick-draw, polygon behind a
  modifier) — rejected: polygon is a first-class region shape for this audience (irregular folios,
  marginalia); hiding it behind a modifier trades a forgettable mode for a hidden capability.
- **Per-surface bespoke creation gestures** (note draws one way, framing another) — rejected: two
  gestures to learn for the same physical act (draw a region), and two code paths to keep in sync.
  One universal choose-shape → draw primitive, differing only in product, is the simpler contract.
