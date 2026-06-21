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
  DZI_TILE_SIZE, DZI_OVERLAP,
  type DziTileSource,
} from "@render/core";

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
 *  NOT exercised by the headless test suite — enable in the bake flow only after browser verification. */
export async function sliceToDzi(
  bitmap: ImageBitmap,
  filesPath: string,
  format = "image/jpeg",
  tileSize = DZI_TILE_SIZE,
  overlap = DZI_OVERLAP,
  quality = 0.82,
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
    for (let col = 0; col < lvl.cols; col++) {
      for (let row = 0; row < lvl.rows; row++) {
        const r = tileRect(lvl, col, row, tileSize, overlap);
        const tileCanvas = new OffscreenCanvas(r.sw, r.sh);
        const tctx = tileCanvas.getContext("2d");
        if (!tctx) throw new Error("dzi-slicer: no 2d context for the tile canvas");
        tctx.drawImage(levelCanvas, r.sx, r.sy, r.sw, r.sh, 0, 0, r.sw, r.sh);
        tiles.set(tilePath(lvl.level, col, row, format), await tileCanvas.convertToBlob({ type: format, quality }));
      }
    }
  }
  return { descriptor, tiles };
}
