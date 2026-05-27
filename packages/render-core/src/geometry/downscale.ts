// Pure dimension math for import downscale (LARGE-MEDIA-MEMORY-CEILING #4 / CONTEXT §80). A bundled
// display master is a single responsive image ~6000–8000px; giant images are linked via external IIIF
// instead of bundled. So on import we cap the master's longer edge — this computes the target dims; the
// actual canvas re-encode that downscales the pixels is browser-side (apps/studio/src/bake.ts).

/** The default cap for a bundled display master's longer edge (CONTEXT §80 lower bound — the value that
 *  bites on a 40 MP phone photo; larger originals belong in external IIIF, not the bundle). */
export const MAX_MASTER_DIM = 6000;

/** The largest {width,height} fitting within a `maxDim` box on the LONGER edge, preserving aspect ratio.
 *  Downscale-ONLY: returns the input unchanged when already within the cap (never upscales). Rounds to
 *  whole pixels and clamps each edge to ≥1 so an extreme aspect ratio can't round to a zero dimension. */
export function fitWithin(width: number, height: number, maxDim: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxDim || longest === 0) return { width, height };
  const scale = maxDim / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** True when an image of these dims exceeds the cap on its longer edge (→ worth re-encoding to downscale). */
export function exceedsCap(width: number, height: number, maxDim: number): boolean {
  return Math.max(width, height) > maxDim;
}
