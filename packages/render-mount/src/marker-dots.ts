// Marker dots (Archie-c1d9) — the pure geometry behind two LOD reading aids over the WebGL mark
// layer (which has no per-shape DOM to restyle into a pin — probe 2026-07-19):
//
//  1. Far-band dots: at fit-width a region outline is a near-invisible few-pixel box, so the canvas
//     paints a small dot per annotation as a LOCATION signal, hidden in mid/near where the real
//     shape carries it. `dotsVisibleForBand` owns the band→visibility contract; `rectCenter` places
//     the dot at the marker's on-screen centre (from MountSurface.markerScreenRects).
//  2. Navigator note-dots: tiny dots inside the OSD navigator marking where notes live on the whole
//     image. The navigator shows the WHOLE image aspect-fit (letterboxed, centred), so a note at
//     image (x,y) maps to `imageToNavigatorPixel`. Pure image+nav sizes in, nav-element px out.
//
// Kept framework-free and DOM-free so the band→visibility and image→navigator mappings are unit-
// tested here (the mount/Canvas wiring that feeds them is browser-verified).

import type { ZoomBand } from "./zoom-band.js";

/** An on-screen marker rect (viewer-element / viewport px) — the shape MountSurface.markerScreenRect(s) returns. */
export interface ScreenRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** A note to plot in the navigator (id to resolve its image-space centre, colour = its Reading hue). */
export interface NavigatorDot {
  id: string;
  colour: string;
}

/** The far-band dot layer shows ONLY at `far` (fit-width, marks are tiny → need a location signal);
 *  at `mid`/`near` the real shapes carry the signal, so the dots hide. The ONE band→visibility rule. */
export function dotsVisibleForBand(band: ZoomBand): boolean {
  return band === "far";
}

/** Centre of a marker's on-screen rect — where its far-band dot sits. */
export function rectCenter(r: ScreenRect): { x: number; y: number } {
  return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 };
}

/**
 * Map an IMAGE-space point into a navigator element's pixel box. The OSD navigator renders the whole
 * image aspect-preserved and centred, so this is a letterbox fit: one scale (the smaller of the two
 * axis ratios) plus a centring offset on the slack axis. Returns null for a degenerate image/nav size
 * (a first-paint race before the navigator or the tiled image has laid out) so the caller skips the dot
 * rather than placing it at NaN.
 */
export function imageToNavigatorPixel(
  pt: { x: number; y: number },
  image: { w: number; h: number },
  nav: { w: number; h: number },
): { x: number; y: number } | null {
  if (!(image.w > 0) || !(image.h > 0) || !(nav.w > 0) || !(nav.h > 0)) return null;
  const scale = Math.min(nav.w / image.w, nav.h / image.h);
  const offX = (nav.w - image.w * scale) / 2;
  const offY = (nav.h - image.h * scale) / 2;
  return { x: offX + pt.x * scale, y: offY + pt.y * scale };
}
