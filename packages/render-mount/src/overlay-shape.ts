// The PURE selector → overlay-geometry descriptor, shared by every overlay layer that draws a
// region (read-overlay.ts's per-annotation shapes, selection-halo.ts's ring). Lifted out of
// read-overlay.ts so the halo can reuse the vocabulary gate without importing a RENDERER — the
// two overlay renderers stay deliberately decoupled from each other (see read-overlay.ts's header
// and frame-overlay.ts's duplicated `*ViewerLike`), but they may share pure geometry.
//
// read-overlay.ts re-exports `overlayShapeFor` / `OverlayShape`, so its existing importers
// (index.ts, read-overlay-geometry.test.ts) are unaffected by the move.

import {
  parseFragmentXYWH,
  parsePolygonPoints,
  isV1Shape,
  type Box,
  type Point,
  type W3CSelector,
} from "@render/core";

/** The geometry-only descriptor an SVG overlay layer draws (NO DOM). */
export type OverlayShape =
  | { kind: "rect"; box: Box }
  | { kind: "polygon"; points: Point[] };

/**
 * Pure selector → overlay-geometry descriptor. Applies the v1-shape vocab gate ITSELF (rect+polygon
 * only — `isV1Shape`, selector.ts:124) and returns null for anything else, for a degenerate polygon
 * (NaN/empty), or for an unparseable rect. The SVG layers never have to re-check the vocabulary.
 */
export function overlayShapeFor(selector: W3CSelector): OverlayShape | null {
  if (!isV1Shape(selector)) return null; // ellipse/path/circle/line → not v1 → skip
  if (selector.type === "FragmentSelector") {
    const box = parseFragmentXYWH(selector.value);
    return box ? { kind: "rect", box } : null;
  }
  // SvgSelector → polygon (isV1Shape already restricted to Polygon among SVG shapes).
  const points = parsePolygonPoints(selector.value);
  return points ? { kind: "polygon", points } : null;
}
