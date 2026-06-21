// Coverage — how much of the whole media a single mark spans (7e1f). When a mark "is" the object
// (coverage ≥ WHOLE_OBJECT_THRESHOLD, or an authored override), the viewer frames the WHOLE canvas
// with a coverage border instead of double-drawing the mark's own overlay rect. Pure: value in,
// value out — no DOM. Reuses the donor geometry (parseMediaFragment for the unit discriminator,
// selectorBBox for polygons). Sits beside selector.ts / mediafragment.ts.

import type { W3CSelector } from "../wadm/types.js";
import { selectorBBox } from "./selector.js";
import { parseMediaFragment } from "./mediafragment.js";

/** A mark covering ≥ 75% of the media reads as "the whole object" — the coverage-border trigger. */
export const WHOLE_OBJECT_THRESHOLD = 0.75;

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

/**
 * Fraction of the media a spatial mark covers, clamped [0,1]. Bbox area ÷ (canvasW·canvasH) for
 * pixel/bare/polygon selectors; for `percent` units the fraction is canvas-dims-INDEPENDENT
 * ((w/100)·(h/100)) since percent is already relative to the frame. 0 if the selector is
 * unparseable (no spatial box) or canvas dims ≤ 0.
 */
export function spatialCoverage(selector: W3CSelector, canvasWidth: number, canvasHeight: number): number {
  // Percent fragments are frame-relative — no canvas division. Only FragmentSelector carries a unit.
  if (selector.type === "FragmentSelector") {
    const frag = parseMediaFragment(selector.value);
    if (!frag.box) return 0;
    if (frag.unit === "percent") {
      return clamp01((frag.box.w / 100) * (frag.box.h / 100));
    }
    if (canvasWidth <= 0 || canvasHeight <= 0) return 0;
    return clamp01((frag.box.w * frag.box.h) / (canvasWidth * canvasHeight));
  }
  // Polygon (SvgSelector): use the bounding box, measured against canvas pixels.
  if (canvasWidth <= 0 || canvasHeight <= 0) return 0;
  const box = selectorBBox(selector);
  if (!box) return 0;
  return clamp01((box.w * box.h) / (canvasWidth * canvasHeight));
}

/**
 * Fraction of the media duration an AV mark covers, clamped [0,1]. `(end−start) ÷ duration`.
 * A point marker (`end` undefined) has no duration ⇒ 0. `end > duration` clamps to 1. 0 if
 * duration ≤ 0.
 */
export function temporalCoverage(start: number, end: number | undefined, duration: number): number {
  if (end === undefined) return 0;
  if (duration <= 0) return 0;
  return clamp01((end - start) / duration);
}

/**
 * Does this mark "frame the whole object"? `override === true` forces ON (authored
 * `archie:wholeObject`); there is NO force-OFF — a false/absent override falls back to the coverage
 * threshold (≥ WHOLE_OBJECT_THRESHOLD).
 */
export function isWholeObject(coverage: number, override?: boolean): boolean {
  if (override === true) return true;
  return coverage >= WHOLE_OBJECT_THRESHOLD;
}

/**
 * The selector-aware whole-object decision (ADR-0018) — the single predicate the viewer should call.
 * A bare-IRI target has NO spatial selector (`selector === null`), which IS the whole object by
 * construction → `true`, no coverage computed. This fixes the seam where a bare-IRI Object/Exhibit
 * note rendered invisible (the coverage of a null selector was 0, so {@link isWholeObject} returned
 * false). When a selector IS present it falls back to {@link isWholeObject} exactly — the authored
 * `override` (region-override, `archie:wholeObject`) or the ≥ {@link WHOLE_OBJECT_THRESHOLD} heuristic.
 */
export function isWholeObjectFor(
  selector: W3CSelector | null,
  canvasWidth: number,
  canvasHeight: number,
  override?: boolean,
): boolean {
  if (selector === null) return true;
  return isWholeObject(spatialCoverage(selector, canvasWidth, canvasHeight), override);
}
