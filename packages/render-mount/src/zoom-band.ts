// Zoom bands (worklist 1.1 — scale-aware marks). The canvas exposes WHERE the reader is on the
// zoom axis as a coarse band, so CSS can weight markers by distance: at fit-width a mark is a few
// pixels and needs presence (far); inside a mark its outline should recede (near). Pure function —
// the thresholds are the tested contract; the mount stamps the band on the container dataset.

export type ZoomBand = "far" | "mid" | "near";

/** Band for a zoom ratio (current zoom / home zoom). ≤1.25 = far (around fit-width), ≤4 = mid,
 *  beyond = near (inside-a-mark territory). */
export function zoomBand(ratio: number): ZoomBand {
  if (!Number.isFinite(ratio) || ratio <= 1.25) return "far";
  return ratio <= 4 ? "mid" : "near";
}
