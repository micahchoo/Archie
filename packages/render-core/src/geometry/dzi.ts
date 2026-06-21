// Deep Zoom Image (DZI) descriptor + pyramid math (Phase B tiling; Q-9). PROMOTED verbatim from the
// verified feasibility spike (docs/spikes/dzi-math.ts + its test) — the geometry was unit-tested headlessly
// in the spike and is re-tested here as production code. This module is PURE math/string assembly: it
// decides how many tiles/levels a source produces, at what scaled dimensions, the `.dzi` XML descriptor,
// and the tile URL/path scheme. NO pixel encode lives here (that is the browser worker — dzi-slicer.worker).
//
// DZI format recap (what OSD reads natively):
//   - <name>.dzi  XML descriptor: TileSize, Overlap, Format, Size(Width,Height)
//   - <name>_files/<level>/<col>_<row>.<fmt>  tile pyramid
//   - Levels run 0..maxLevel. maxLevel is the full-resolution level. Level L has the image scaled so its
//     longer edge = maxDim / 2^(maxLevel - L). Level 0 is a single ~1px tile.
//   - maxLevel = ceil(log2(maxDim))  where maxDim = max(width, height).

import type { DziTileSource } from "../iiif/resolve.js";

/** The Deep Zoom / OpenSeadragon default tile edge (254 + 1px overlap on interior edges => 256 effective). */
export const DZI_TILE_SIZE = 254;
/** The Deep Zoom default per-edge overlap. */
export const DZI_OVERLAP = 1;

export interface DziLevel {
  level: number;
  cols: number;
  rows: number;
  scaledW: number;
  scaledH: number;
  tiles: number;
}

export interface DziPyramid {
  width: number;
  height: number;
  tileSize: number;
  overlap: number;
  maxLevel: number;
  levels: DziLevel[];
  totalTiles: number;
}

/** Compute the full DZI pyramid geometry for a source of (width, height).
 *  tileSize default 254, overlap default 1 — the OpenSeadragon/Deep Zoom defaults
 *  (254 + 1px overlap on each interior edge => 256px effective tile). */
export function dziPyramid(
  width: number,
  height: number,
  tileSize = DZI_TILE_SIZE,
  overlap = DZI_OVERLAP,
): DziPyramid {
  if (width <= 0 || height <= 0) throw new Error("dziPyramid: dimensions must be positive");

  const maxDim = Math.max(width, height);
  // maxLevel is the highest level index (full resolution). A 1px image => log2(1)=0 => maxLevel 0.
  const maxLevel = Math.ceil(Math.log2(maxDim));

  const levels: DziLevel[] = [];
  let totalTiles = 0;

  for (let level = 0; level <= maxLevel; level++) {
    // scale so the LONGER edge halves each step down from maxLevel.
    const scale = Math.pow(2, maxLevel - level);
    const scaledW = Math.ceil(width / scale);
    const scaledH = Math.ceil(height / scale);
    // tiles per axis: ceil(dim / tileSize). overlap does NOT change the tile COUNT
    // (it only fattens each tile's pixel extent), so it's not in the grid division.
    const cols = Math.ceil(scaledW / tileSize);
    const rows = Math.ceil(scaledH / tileSize);
    const tiles = cols * rows;
    totalTiles += tiles;
    levels.push({ level, cols, rows, scaledW, scaledH, tiles });
  }

  return { width, height, tileSize, overlap, maxLevel, levels, totalTiles };
}

/** The pixel rectangle (sx, sy, sw, sh) to slice for tile (col, row) out of a level's scaled surface. The
 *  overlap fattens each tile by `overlap` px on every interior edge (clamped at the level boundary), so
 *  adjacent tiles share a seam OSD blends — the canonical Deep Zoom tile box. */
export function tileRect(
  lvl: Pick<DziLevel, "cols" | "rows" | "scaledW" | "scaledH">,
  col: number,
  row: number,
  tileSize: number,
  overlap: number,
): { sx: number; sy: number; sw: number; sh: number } {
  // Base (overlap-free) tile origin and extent within the scaled level.
  const baseX = col * tileSize;
  const baseY = row * tileSize;
  // Extend by overlap on each side that has a neighbour (not the outer edges).
  const x0 = Math.max(0, baseX - (col > 0 ? overlap : 0));
  const y0 = Math.max(0, baseY - (row > 0 ? overlap : 0));
  const x1 = Math.min(lvl.scaledW, baseX + tileSize + (col < lvl.cols - 1 ? overlap : 0));
  const y1 = Math.min(lvl.scaledH, baseY + tileSize + (row < lvl.rows - 1 ? overlap : 0));
  return { sx: x0, sy: y0, sw: x1 - x0, sh: y1 - y0 };
}

/** File extension for a tile MIME (`image/jpeg` → `jpg`, `image/png` → `png`, `image/webp` → `webp`). */
export function tileExt(format: string): string {
  const sub = format.split("/").pop() ?? "jpeg";
  return sub === "jpeg" ? "jpg" : sub;
}

/** The tile's path within the pyramid: `{level}/{col}_{row}.{ext}` (relative to the `_files` directory). */
export function tilePath(level: number, col: number, row: number, format: string): string {
  return `${level}/${col}_${row}.${tileExt(format)}`;
}

/** Build a tile's full URL by joining a `_files` base path with the tile's pyramid path. */
export function tileUrl(filesPath: string, level: number, col: number, row: number, format: string): string {
  return `${filesPath.replace(/\/$/, "")}/${tilePath(level, col, row, format)}`;
}

/** Build the `.dzi` XML descriptor string OSD reads natively. Mirrors the Deep Zoom schema:
 *  `<Image TileSize Overlap Format xmlns><Size Width Height/></Image>`. */
export function dziDescriptorXml(p: Pick<DziPyramid, "width" | "height" | "tileSize" | "overlap">, format: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<Image xmlns="http://schemas.microsoft.com/deepzoom/2008"` +
    ` TileSize="${p.tileSize}" Overlap="${p.overlap}" Format="${tileExt(format)}">` +
    `<Size Width="${p.width}" Height="${p.height}"/>` +
    `</Image>`
  );
}

/** Build the carried `DziTileSource` model descriptor for a baked pyramid (the value stored on
 *  `AObject.tileSource`). `filesPath` is the base of the emitted `_files` directory. */
export function dziTileSource(p: Pick<DziPyramid, "width" | "height" | "tileSize" | "overlap">, format: string, filesPath: string): DziTileSource {
  return {
    kind: "dzi",
    width: p.width,
    height: p.height,
    tileSize: p.tileSize,
    overlap: p.overlap,
    format,
    filesPath: filesPath.replace(/\/$/, ""),
  };
}
