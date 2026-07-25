---
scope: "packages/render-mount/src/**"
tags: [openseadragon, hazard, pointer-events]
priority: high
source: hand-written
---

# `viewer.addOverlay` does not place your element — OSD wraps it in a div that eats clicks

OpenSeadragon 5.0.1 does **not** insert the element you hand `addOverlay({element})`. It creates a
plain `<div>` around it (`openseadragon.js:19044`, `Overlay.elementWrapper`) and sizes **that** to the
overlay's box. The div gets no styling of its own, so it sits at the default `pointer-events: auto` —
an **opaque rectangle over its whole box**, above whatever it was drawn on top of.

This silently defeats any pointer-events discipline written on the element itself.

## What it actually broke (V68, fixed 2026-07-25, Archie-64ef)

Both DOM overlay layers were written correctly and both were defeated:

- `read-overlay.ts` sets the per-region `<svg>` to `none` and only the geometry to `all`, so the image
  stays draggable between regions. Each wrapper re-covered its whole box, so one region's wrapper
  shielded its neighbour's geometry.
- `frame-overlay.ts` sets its border rects to `pointer-events: stroke` **specifically** so the frame's
  interior stays free for pan/zoom. Its wrapper is sized to the WHOLE object, so it blanketed the
  entire image — including every region overlay underneath.

The symptom is a click that does **nothing at all**: not the overlay's handler, and not OSD's own
click-to-zoom either (the wrapper is not OSD's canvas, so the gesture never reaches the tracker).
Measured: the region's bbox was byte-identical after one click and after two, zoom factor 1.000.

**The diagnostic signature:** `shadowRoot.elementFromPoint(cx, cy)` over a region returns a bare
unnamed `DIV`. If you see that, a wrapper is shielding the geometry.

## Two halves, and each fails alone

Proven by disabling one at a time against the built bundle:

1. **Neutralise the wrapper** — `neutraliseOverlayWrapper(element)` (`overlay-wrapper.ts`), called
   immediately after every `addOverlay`. Without it, the geometry never receives `pointerdown` at all.
2. **Stop the pointer sequence on the geometry** — `pointerdown`/`mousedown` → `stopPropagation()`.
   OSD binds a `MouseTracker` to the canvas/container and takes **pointer capture** on `pointerdown`;
   once captured, the rest of the sequence is retargeted and the browser never dispatches `click` on
   your element. Stopping it on a descendant means OSD's ancestor listener never sees it, never
   captures, and `click` fires normally. Pan/zoom elsewhere is unaffected — this only fires on a
   region's own pixels.

Half 1 alone: click still swallowed. Half 2 alone: click still swallowed. Both: works.

## Also give every overlay element an `id`

OSD names the wrapper `overlay-wrapper-<element.id>`, and falls back to the bare literal
`overlay-wrapper` when the element has none (the `else` at `:19051`). Without ids, **N overlays share
one id** — invalid HTML and unaddressable. Current ids: `archie-region-<n>` (per region, ordinal —
annotation ids are full URLs here) and `archie-object-frame`.

`clear()` must also remove the wrapper if `removeOverlay` threw: `element.remove()` only detaches
*your* element and would leave an empty div behind on every `setAnnotations`.

## Why the gate is `recipes/smoke.mjs`, not a unit test

This bug class is **pure hit-testing**, and every cheap way of testing it reports success:

| how you poke it | result with the bug present |
| --- | --- |
| keyboard Enter on the focused element | **works** (no hit test) |
| `el.dispatchEvent(new MouseEvent("click"))` | **works** (no hit test) |
| real driven `page.mouse.click()` at the same point | **fails** |

jsdom has no layout, so it cannot hit-test at all. Only a driven pointer sequence against the BUILT
bundle in a real browser can catch it — which is what `embed-smoke` now asserts (three checks:
wrappers are `none`, `elementFromPoint` returns the geometry rather than a `div`, and a real click
opens the note). Proven red-green. Don't replace those with a synthetic-click test; it would pass
against the broken code.
