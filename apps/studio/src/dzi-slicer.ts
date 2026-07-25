// OffscreenCanvas Deep Zoom (DZI) slicer (Q-9, Q-11). AUTHOR-SIDE / bake-time ONLY — lives in the
// studio bundle, NEVER on the viewer's load path (Q-11 cap: the viewer only READS tileSource via
// render-mount's dziOsdSource). Produces a tile pyramid + a DziTileSource descriptor from a decoded
// image, reusing render-core's OWNED DZI math + url scheme so the WRITE side (here) and the READ side
// stay in lockstep — one source of truth for the level/col/row/ext grammar.
//
// SPLIT BY VERIFIABILITY (honest gate posture, Q-11):
//  - dziTilePlan(): PURE geometry — which tiles to emit, their crop rects + paths. Unit-tested headlessly.
//  - sliceToDzi():  OffscreenCanvas drawImage + convertToBlob — BROWSER-VERIFICATION-PENDING. The actual
//    pixel encode + OSD rendering the output need a real browser/worker; the headless suite does NOT
//    exercise it. Run in a Worker for large sources (~180–200MB transient peak, per the feasibility spike).
import {
  dziPyramid, tileRect, tilePath, dziTileSource,
  DZI_TILE_SIZE, DZI_OVERLAP, mapLimit,
  type DziTileSource,
} from "@render/core";

/** How many tile encodes may be in flight at once (see sliceToDzi's ENCODE SCHEDULING note).
 *  48 measured as the plateau — see ledgers/PERF-image-pipeline-2026-07-24.md. */
export const DZI_ENCODE_CONCURRENCY = 48;

export interface TilePlanEntry {
  /** Pyramid-relative tile path: `{level}/{col}_{row}.{ext}`. */
  path: string;
  level: number;
  /** Full scaled dimensions of this level — render the source into this once, then crop its tiles. */
  scaledW: number;
  scaledH: number;
  /** Crop rect of this tile WITHIN the scaled level (overlap included). */
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/** PURE: enumerate every tile a (width × height) source produces — level, scaled-level size, crop rect,
 *  and pyramid path. The encoder consumes this; the headless test asserts it matches the pyramid. */
export function dziTilePlan(
  width: number,
  height: number,
  format: string,
  tileSize = DZI_TILE_SIZE,
  overlap = DZI_OVERLAP,
): TilePlanEntry[] {
  const pyr = dziPyramid(width, height, tileSize, overlap);
  const plan: TilePlanEntry[] = [];
  for (const lvl of pyr.levels) {
    for (let col = 0; col < lvl.cols; col++) {
      for (let row = 0; row < lvl.rows; row++) {
        const r = tileRect(lvl, col, row, tileSize, overlap);
        plan.push({ path: tilePath(lvl.level, col, row, format), level: lvl.level, scaledW: lvl.scaledW, scaledH: lvl.scaledH, ...r });
      }
    }
  }
  return plan;
}

export interface SlicedDzi {
  descriptor: DziTileSource;
  /** tile path (`{level}/{col}_{row}.{ext}`) → encoded bytes. */
  tiles: Map<string, Blob>;
}

/** BROWSER-VERIFICATION-PENDING: slice a decoded image into a DZI pyramid via OffscreenCanvas. One
 *  downscale per level (drawImage into a level canvas), then crop each tile and convertToBlob. Returns
 *  the tiles keyed by their pyramid path plus the DziTileSource descriptor to stamp on the AObject.
 *  NOT exercised by the headless test suite — enable in the bake flow only after browser verification.
 *
 *  ENCODE SCHEDULING (measured 2026-07-24, ledgers/PERF-image-pipeline-2026-07-24.md): this loop used to
 *  `await` each tile's convertToBlob before building the next one. Chromium encodes off-thread, so that
 *  serialized the whole pyramid on encode round-trip latency and left the CPU idle — 17.3 s for one
 *  8000x6000 (1033 tiles). Overlapping the encodes is ~19x faster for a change of a few lines.
 *
 *  It is bounded, not a bare Promise.all over the level: a tile canvas stays alive until its encode
 *  resolves, so an unbounded level would hold every tile of the top level at once (768 x 254px canvases
 *  ~= 198 MB for that same image, on top of the ~180-200 MB transient this file already costs). mapLimit
 *  caps live tile canvases at DZI_ENCODE_CONCURRENCY by construction — the crop allocation happens INSIDE
 *  the pooled callback. Pixel output is unchanged: identical canvases, identical draw calls, only the
 *  await scheduling differs. Insertion order is preserved (mapLimit returns in input order), so the tile
 *  Map still iterates deterministically. */
export async function sliceToDzi(
  bitmap: ImageBitmap,
  filesPath: string,
  format = "image/jpeg",
  tileSize = DZI_TILE_SIZE,
  overlap = DZI_OVERLAP,
  quality = 0.82,
  encodeConcurrency = DZI_ENCODE_CONCURRENCY,
): Promise<SlicedDzi> {
  const { width, height } = bitmap;
  const descriptor = dziTileSource({ width, height, tileSize, overlap }, format, filesPath);
  const tiles = new Map<string, Blob>();
  const pyr = dziPyramid(width, height, tileSize, overlap);
  for (const lvl of pyr.levels) {
    // Render the full source scaled to this level ONCE, then crop tiles out of it (bounds the peak memory).
    const levelCanvas = new OffscreenCanvas(lvl.scaledW, lvl.scaledH);
    const lctx = levelCanvas.getContext("2d");
    if (!lctx) throw new Error("dzi-slicer: no 2d context for the level canvas");
    lctx.drawImage(bitmap, 0, 0, lvl.scaledW, lvl.scaledH);

    const coords: { col: number; row: number }[] = [];
    for (let col = 0; col < lvl.cols; col++) {
      for (let row = 0; row < lvl.rows; row++) coords.push({ col, row });
    }
    const encoded = await mapLimit(coords, encodeConcurrency, async ({ col, row }) => {
      const r = tileRect(lvl, col, row, tileSize, overlap);
      const tileCanvas = new OffscreenCanvas(r.sw, r.sh);
      const tctx = tileCanvas.getContext("2d");
      if (!tctx) throw new Error("dzi-slicer: no 2d context for the tile canvas");
      tctx.drawImage(levelCanvas, r.sx, r.sy, r.sw, r.sh, 0, 0, r.sw, r.sh);
      const blob = await tileCanvas.convertToBlob({ type: format, quality });
      return [tilePath(lvl.level, col, row, format), blob] as const;
    });
    for (const [path, blob] of encoded) tiles.set(path, blob);
  }
  return { descriptor, tiles };
}
