// OSD's injected overlay wrapper — the shared hazard both DOM overlay layers hit (V68).
//
// `viewer.addOverlay({element})` does NOT place `element` in the DOM. OpenSeadragon 5.0.1 creates a
// plain `<div>` around it (openseadragon.js:19044, `Overlay.elementWrapper`) and sizes THAT to the
// overlay's box. The div carries no styling of its own, which means it sits at the default
// `pointer-events: auto` — an opaque rectangle over its whole box, above whatever the overlay was
// drawn on top of.
//
// That silently defeats the pointer-events discipline both overlay layers were written with:
//
//   - read-overlay.ts sets the <svg> to `none` and only the region geometry to `all`, so the image
//     stays draggable between regions. The wrapper re-covers everything, and with overlapping
//     regions one region's wrapper shields its neighbour's geometry.
//   - frame-overlay.ts sets its border rects to `pointer-events: stroke` SPECIFICALLY so the frame's
//     interior stays free for pan/zoom. Its wrapper is sized to the whole object, so it blankets the
//     entire image — including every region overlay underneath it.
//
// The symptom is a click that does nothing at all: not the overlay's handler, and not OSD's own
// click-to-zoom either, because the wrapper is not OSD's canvas. `elementFromPoint` over the region
// returns a bare unnamed DIV — the signature to look for if this ever regresses.
//
// Fix: put the wrapper back out of the hit path and let the overlay's own declared pointer-events
// decide. Call this immediately after every `addOverlay`.

/**
 * Take OSD's injected wrapper `<div>` out of the hit path, so the overlay element's own
 * `pointer-events` declarations mean what they say.
 *
 * Give `element` an `id` BEFORE adding the overlay: OSD names the wrapper after it
 * (`overlay-wrapper-<id>`), and without one every wrapper gets the bare literal `overlay-wrapper`
 * (the `else` branch at openseadragon.js:19051) — N overlays sharing one id, none addressable.
 */
export function neutraliseOverlayWrapper(element: Element | null | undefined): void {
  const wrapper = element?.parentElement;
  if (wrapper?.id.startsWith("overlay-wrapper")) wrapper.style.pointerEvents = "none";
}

/** True when `el` is an OSD overlay wrapper — used to clean one up without guessing at the DOM shape. */
export function isOverlayWrapper(el: Element | null | undefined): el is HTMLElement {
  return !!el && el instanceof HTMLElement && el.id.startsWith("overlay-wrapper");
}
