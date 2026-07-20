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

// ---------------------------------------------------------------------------
// Screen-space modulations (Archie-a6fb) — layered ON TOP of readingMarkerStyle.
//
// The zoom-band weighting and arrival pulse used to be CSS on `.a9s-annotation`,
// but Annotorious 3 renders marks to a WebGL canvas with NO per-shape SVG node
// (probe 2026-07-19), so that CSS matched zero elements for a month. Both are
// reimplemented here as PURE post-modulations of the base style spec — the apps
// feed the base `readingMarkerStyle` output through these and hand the result to
// the same DrawingStyleExpression (setStyle) channel, so they COMPOSE with the
// comparing/solo/highlight regime instead of a competing style pass.
// ---------------------------------------------------------------------------

/** Coarse zoom band (mirrors @render/mount's zoomBand thresholds — the mount owns the ratio→band
 *  contract; this file owns band→style). far ≈ fit-width, near = inside-a-mark territory. */
export type ZoomBand = "far" | "mid" | "near";

/** Weight a mark by how far the reader has zoomed IN. At fit-width (`far`) a mark is a few pixels
 *  and needs PRESENCE — heavier stroke. Inside a mark (`near`) the outline should RECEDE off the
 *  pixels (echoes the retired `opacity: 0.45` CSS). `mid` is the authored resting weight. Post-
 *  modulation, so it stacks on comparing/solo/highlight without re-deriving colour or emphasis. */
export function withZoomBand(spec: MarkerStyleSpec, band: ZoomBand): MarkerStyleSpec {
  if (band === "far") {
    return { ...spec, strokeWidth: spec.strokeWidth * 1.5 };
  }
  if (band === "near") {
    return { ...spec, strokeOpacity: clamp01(spec.strokeOpacity * 0.5), fillOpacity: clamp01(spec.fillOpacity * 0.5) };
  }
  return spec;
}

/** Default arrival-pulse duration (ms) — the sweep from full emphasis back to the resting weight. */
export const ARRIVAL_PULSE_MS = 1400;

/** Arrival-pulse decay envelope: intensity 1 at arrival, easing out to 0 by `durationMs`. Quadratic
 *  ease-out (`(1−t)²`) so the emphasis is strongest at the moment of landing and fades quickly —
 *  a reveal, not a throb. Pure; the app drives it per-rAF frame off a start timestamp. */
export function arrivalPulseIntensity(elapsedMs: number, durationMs: number = ARRIVAL_PULSE_MS): number {
  if (!(durationMs > 0)) return 0;
  const t = clamp01(elapsedMs / durationMs);
  const e = 1 - t;
  return e * e;
}

/** Emphasize a mark by the arrival-pulse `intensity` (0 = resting, 1 = peak): lerp the resting spec
 *  toward a brighter, heavier peak so every mark momentarily announces itself on arrival, then
 *  settles back as intensity decays. Post-modulation — composes with the reading-colour style. */
export function withArrivalPulse(spec: MarkerStyleSpec, intensity: number): MarkerStyleSpec {
  const k = clamp01(intensity);
  if (k === 0) return spec;
  const lerp = (from: number, to: number): number => from + (to - from) * k;
  return {
    ...spec,
    strokeWidth: lerp(spec.strokeWidth, spec.strokeWidth * 2),
    strokeOpacity: clamp01(lerp(spec.strokeOpacity, 1)),
    fillOpacity: clamp01(lerp(spec.fillOpacity, Math.max(spec.fillOpacity, 0.3))),
  };
}

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
