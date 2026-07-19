// Scale cue (Archie-93fd): the locator (worklist 1.1, showNavigator) answers WHERE the viewport
// sits within the image; nothing answered HOW FAR IN. This is the pure half of that answer — the
// mount already derives "current zoom / home zoom" for zoomBand (zoom-band.ts, mount.ts
// updateZoomBand); MountSurface.getZoomRatio exposes that SAME ratio so a consumer can label it. 1×
// is OSD's home zoom, i.e. fit-to-viewport — the same baseline zoomBand treats as "far" (§zoom-band.ts).
//
// Kept a standalone pure function (not baked into a component or duplicated per app) so the studio
// editor chrome and the viewer reader chrome format the SAME number the SAME way — "identical
// meaning across both surfaces" is a text-equality property this function alone is responsible for.

/** "3.2×" style zoom-magnitude label. Rounds to one decimal, then drops a false-precision trailing
 *  ".0" so the common whole-number readings (home = "1×", exactly double = "2×") read clean. A
 *  non-finite or non-positive ratio — the same first-paint `getHomeZoom` race zoom-band.test.ts pins
 *  zoomBand degrading from — reads as "1×", the fit baseline, never a blank or "NaN×" label. */
export function formatZoomRatio(ratio: number): string {
  const safe = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
  const rounded = Math.round(safe * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${text}×`;
}
