// SPIKE SCRATCH — Phase B tiling feasibility (Q-9/Q-10). NOT production code.
// Pure DZI (Deep Zoom Image) descriptor/pyramid math, isolated so it can be unit-tested
// headlessly without a browser. The encode path (OffscreenCanvas drawImage + convertToBlob)
// is NOT here — that needs a real browser/worker; this file is only the geometry that
// decides how many tiles/levels a source produces and at what scaled dimensions.
//
// DZI format recap (what OSD reads natively):
//   - <name>.dzi  XML descriptor: TileSize, Overlap, Format, Size(Width,Height)
//   - <name>_files/<level>/<col>_<row>.<fmt>  tile pyramid
//   - Levels run 0..maxLevel. maxLevel is the full-resolution level. Level L has the image
//     scaled so its longer edge = maxDim / 2^(maxLevel - L). Level 0 is a single 1px-ish tile.
//   - maxLevel = ceil(log2(maxDim))  where maxDim = max(width, height).

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
  tileSize = 254,
  overlap = 1,
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
