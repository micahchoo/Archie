# PROBE — Annotorious annotation-layer DOM (Archie-a6fb re-probe)

**Date:** 2026-07-19
**Method:** live-browser, read-only. Studio's Vite dev server run standalone (`pnpm --filter
@archie/studio exec vite --port 5199 --strictPort`, no front-door proxy — the annotation canvas
doesn't depend on the viewer/proxy topology) so as not to collide with a concurrent session
holding the default ports (5173/5174/4321 were all BUSY at probe start). Driven with Playwright
(`chromium`, from the repo root so `import 'playwright'` resolves) against
`http://localhost:5199/studio/#/voynich-rosettes/o/o9` — "The Rosettes" seed exhibit, object
`f85v-86r` ("Cosmological — the Rosettes foldout"), which carries 5 real notes across 4 readings.
Dev server killed and all scratch `.mjs` probe scripts deleted at the end of the run; only this
ledger was left behind.

## What was probed

`packages/render-svelte/src/Canvas.svelte` is the shared mount component (used by both Studio and
the Viewer's Reader — same `@render/mount` surface). Two things there assume Annotorious renders
per-annotation DOM nodes matching `.a9s-annotation[data-id]`:

- **Q-5 a11y labels** (`labelMarkers()`, line 116): `el.querySelectorAll(".a9s-annotation[data-id]")`
  post-pass, stamping `role="img"` / `aria-label` / `tabindex="-1"` onto whatever it finds.
- **Zoom-band CSS** (style block, lines 206–217): `:global(.a9s-annotationlayer .a9s-annotation)`
  rules for the drop-shadow/opacity weight modulation by `data-archie-zoom`.

The viewer's `Reader.svelte:326` arrival-pulse (`main.arrival :global(.a9s-annotationlayer
.a9s-annotation) { animation: arrival-breathe … }`) targets the identical selector against the
same shared Canvas component — not independently browser-probed this session (out of scope per
the brief's "secondary, skip if time-consuming"), but architecturally it is the same rendering
pipeline, so the studio finding below applies to it directly, not by extrapolation across
different code.

## DOM evidence

With the object open, tiles loaded, and two real annotation shapes visibly rendered on the canvas
(a green outline box and a smaller box, screenshot `/tmp/archie-a6fb-settled2.png` — not preserved
past this session, described here for the record):

```
canvasWrapCount: 1
layer: <svg class="a9s-annotationlayer">, 1 element (svg.a9s-annotationlayer FOUND)
  layer.children: 1 — <g class="svelte-g4ws1v" transform="translate(...) scale(...) rotate(0)"></g>
  layer.innerHTML: literally just that one empty <g> tag, 133–148 chars, NO nested content
glCanvasExists: true — canvas.a9s-gl-canvas FOUND (1 match)
anyCanvasCount: 3 (OSD tile canvas, a9s-gl-canvas, one more — locator minimap)
annoNodeCount (.a9s-annotation under the wrap): 0
annoWithDataIdCount (.a9s-annotation[data-id]): 0
docHasA9sAnnotationAnywhere (whole document): 0
docHasAnnotationLayerAnywhere: 1 (the one empty svg)
ariaLabelSample (.a9s-annotation[data-id], whole doc): [] — 0 matches, so 0 labels ever get stamped
```

This held at every state tested, not just one snapshot:

| State | `data-archie-zoom` | `.a9s-annotation` count |
|---|---|---|
| Baseline (exhibit just opened, fit view) | `far` | 0 |
| Zoomed in ~15x (mouse wheel) | `near` | 0 |
| Zoomed back out to fit | `far` | 0 |
| An annotation actively **selected** (clicked its note card, canvas auto-zoomed to 104x) | `far`* | 0 |

*`zoomHostValue` read `far` in the post-select probe — the selection zoom (104x, driven by
`zoomOnSelect`) happens faster than the band recompute settles in that snapshot; not the point of
this row, which is that `.a9s-annotation` stayed at 0 through a full select cycle including the
one state (an actively edited/selected shape) most likely to force Annotorious into an SVG
fallback. It didn't.

`getComputedStyle` on `.a9s-annotation` was never reachable — `document.querySelector('.a9s-annotation')`
returned `null` at every checkpoint, so there is no element to read a computed `filter`/`opacity`
from. The CSS rules parse and apply (no console errors, no warnings) but have a **zero-length
match set** for their entire lifetime in this render path.

The `[data-archie-zoom]` **mechanism itself works** — confirmed on `<div class="archie-canvas">`,
flipping `far` ↔ `near` correctly on real zoom changes. It's not the attribute-stamping that's
broken; it's that the CSS rules built on top of it (and the JS selector built on top of the
sibling contract) both target a class that Annotorious never attaches to a DOM node in this
version/config.

Console: zero errors, zero warnings, across the whole session (`errs` array stayed empty). This
isn't failing loudly — it's failing silently, exactly the shape the a11y code's own comment (line
101: "if the DOM/data-id contract ever changes, labels just don't apply") anticipated.

## Verdict

**World (b) confirmed, with a caveat that narrows the ticket rather than reopening it.**

1. **The zoom-band and arrival-pulse CSS is INERT**, confirmed directly (studio) and by identical
   selector/shared-component argument (viewer) — `.a9s-annotation` never exists in the live DOM in
   this Annotorious 3 configuration. The 2026-06-11 finding was NOT stale; it still holds today.
   Marks render to `canvas.a9s-gl-canvas` (WebGL/PixiJS, confirmed present) with zero corresponding
   SVG per-shape nodes — `svg.a9s-annotationlayer` exists but its single child is an empty
   coordinate-transform `<g>`, not a per-annotation tree.

2. **The Q-5 a11y labels are ALSO inert** — `labelMarkers()`'s `querySelectorAll(".a9s-annotation[data-id]")`
   matches 0 nodes, so the `role="img"`/`aria-label`/`tabindex` stamping never fires on canvas
   markers. This is real, but it is **not a new silent bug** in the sense the brief worried about:
   the code's own comment (Canvas.svelte:99–102) already documents this as a "best-effort" layer
   and explicitly states the primary a11y contract — keyboard access via the note-card/section-beat
   index, not the canvas markers — is unaffected if the DOM contract doesn't hold. That comment is
   accurate; this probe just confirms the DOM contract in fact never holds, so the marker-label
   code is currently a no-op in its entirety, not occasionally-flaky.

## Recommendation

- **Archie-a6fb should proceed largely as originally scoped** — the zoom-band/arrival-pulse CSS is
  confirmed dead code targeting a selector Annotorious 3 never populates. Don't shrink or close it
  on the theory that the Q-5 merges changed the rendering path; they didn't touch rendering, only
  added a best-effort DOM post-pass that itself never finds anything to touch.
- **Fork a small, separate follow-up** (not urgent, not a11y-regression-severity since the index
  keyboard path is intact) to either (a) delete `labelMarkers()` and its `.a9s-annotation[data-id]`
  contract as confirmed-dead code, or (b) find the actual mechanism Annotorious 3 WebGL exposes for
  per-shape accessible names (if any) and wire the labels through that instead. Recommend (a) unless
  someone specifically wants marker-level (not just index-level) screen-reader labels — the
  comment's own reasoning for why this was made best-effort still applies.
- For the CSS itself: since real per-shape DOM nodes don't exist, any future "weight the mark by
  zoom" effect has to be implemented inside the WebGL/PixiJS rendering (wherever `@render/mount`
  configures the Annotorious style function), not via a CSS selector on the SVG layer. That's the
  actual fix shape for the zoom-band/arrival-pulse intent, if it's still wanted — worth noting in
  a6fb's scope so it isn't filed as "restore the CSS" but as "reimplement the intent through the
  style callback."
