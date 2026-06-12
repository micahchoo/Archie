// Reading marker style — ONE source for the numbers Studio and Viewer both hand-rolled
// (0.18 fill / 0.95 stroke / 2px, × emphasis modifiers), now carrying the COMPARING regime
// (P-2 grill Q2 / archie-ux Q-2): with 2+ readings visible every mark drops to OUTLINE-ONLY —
// stroke colour keeps reading identity, no fill blend can lie about it; solo-on-hover restores
// one reading's fill. Pure: colour + emphasis + display state in, style numbers out.

import { emphasisModifiers } from "./published.js";
import type { Emphasis } from "../wadm/types.js";

/** Structurally compatible with @render/mount's MarkerStyle (core cannot import mount). */
export interface MarkerStyleSpec {
  fill: string;
  fillOpacity: number;
  stroke: string;
  strokeOpacity: number;
  strokeWidth: number;
}

export interface MarkerDisplayState {
  /** 2+ readings visible — the comparison optical regime (outline-only). */
  comparing?: boolean;
  /** This mark's reading is being soloed (rail-row hover) — its fill returns while others stay outlines. */
  soloed?: boolean;
  /** THIS note is hovered in a list (per-note solo) — its mark lights up: fill returns even while
   *  comparing, presence boosted (fill 0.32 / stroke 1.0 / width 3) so the eye finds it. */
  highlighted?: boolean;
}

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

export function readingMarkerStyle(colour: string, emphasis: Emphasis, state: MarkerDisplayState = {}): MarkerStyleSpec {
  const { opacityMul, strokeWidthMul } = emphasisModifiers(emphasis);
  if (state.highlighted === true) {
    // Per-note hover beats every regime: the pointed-at mark is momentarily the brightest thing.
    return { fill: colour, fillOpacity: clamp01(0.32 * opacityMul), stroke: colour, strokeOpacity: 1, strokeWidth: 3 * strokeWidthMul };
  }
  const outline = state.comparing === true && state.soloed !== true;
  return {
    fill: colour,
    fillOpacity: outline ? 0 : clamp01(0.18 * opacityMul),
    stroke: colour,
    strokeOpacity: clamp01(0.95 * opacityMul),
    strokeWidth: 2 * strokeWidthMul,
  };
}
