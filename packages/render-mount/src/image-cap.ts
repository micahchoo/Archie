// Viewer-side image-decode dimension cap (EMBED strategy 5.5). MIRROR of the author-side
// MAX_MASTER_DIM=6000 (render-core/geometry/downscale.ts): on IMPORT the author caps a bundled
// display master's longer edge so the bundle never carries a giant bitmap. But a hand-edited
// `.archie.zip` can smuggle a NON-TILED image whose DECLARED dims exceed that cap — and a non-tiled
// OSD `{ type:"image" }` source decodes the WHOLE bitmap into webview memory at once (no pyramid).
// This guard rejects such a source at the mount image-source seam before OSD opens it.
//
// Tiled sources (DZI / IIIF / XYZ) are pyramids — OSD only decodes the visible tiles — so a large
// declared extent is fine there and is NEVER capped. Unknown dims (0) are not blocked: degrade-upward
// (ADR-0021) — we only reject on a POSITIVE declaration that overshoots, never on missing info.

import { MAX_MASTER_DIM, exceedsCap } from "@render/core";

/** The viewer decode cap — anchored to the author-side master cap, not a divergent magic number. */
export const MAX_DECODE_DIM = MAX_MASTER_DIM;

export interface DeclaredImageSource {
  /** True for a pyramid source (DZI / IIIF / XYZ) — per-tile decode, so it is NEVER capped. */
  tiled: boolean;
  /** Declared source width in pixels (0 = unknown). */
  width: number;
  /** Declared source height in pixels (0 = unknown). */
  height: number;
}

export type ImageGuardResult =
  | { ok: true }
  | { ok: false; declared: { width: number; height: number }; cap: number };

/**
 * Decide whether a declared image source is safe to decode. A non-tiled source whose longer edge
 * exceeds MAX_DECODE_DIM is rejected (the caller degrades to an error/placeholder rather than
 * decoding a memory-bomb bitmap); everything else — tiled sources, in-cap dims, unknown dims — passes.
 * Pure; the mount seam wires the declared dims (from OSD's source / the descriptor) into it.
 */
export function guardImageDimensions(src: DeclaredImageSource): ImageGuardResult {
  if (src.tiled) return { ok: true };
  if (src.width <= 0 || src.height <= 0) return { ok: true };
  if (exceedsCap(src.width, src.height, MAX_DECODE_DIM)) {
    return { ok: false, declared: { width: src.width, height: src.height }, cap: MAX_DECODE_DIM };
  }
  return { ok: true };
}
