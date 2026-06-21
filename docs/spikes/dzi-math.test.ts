// SPIKE SCRATCH test — verifies the DZI pyramid math headlessly (Q-9/Q-10).
import { describe, it, expect } from "vitest";
import { dziPyramid } from "./dzi-math";

describe("dziPyramid", () => {
  it("8000x6000 @ tileSize 254 — level count and tile geometry", () => {
    const p = dziPyramid(8000, 6000, 254, 1);

    // maxLevel = ceil(log2(maxDim)) = ceil(log2(8000)) = ceil(12.96..) = 13
    expect(p.maxLevel).toBe(Math.ceil(Math.log2(8000)));
    expect(p.maxLevel).toBe(13);
    // levels run 0..maxLevel inclusive
    expect(p.levels.length).toBe(14);

    // top level (full res) dims == source
    const top = p.levels[p.maxLevel];
    expect(top.scaledW).toBe(8000);
    expect(top.scaledH).toBe(6000);
    // 8000/254 -> 32 cols, 6000/254 -> 24 rows
    expect(top.cols).toBe(Math.ceil(8000 / 254));
    expect(top.rows).toBe(Math.ceil(6000 / 254));
    expect(top.cols).toBe(32);
    expect(top.rows).toBe(24);
    expect(top.tiles).toBe(32 * 24); // 768 tiles at full res

    // level 0 is a single tile (sub-256px scaled image)
    expect(p.levels[0].tiles).toBe(1);

    // sanity: total tiles is the sum of per-level tiles
    const sum = p.levels.reduce((a, l) => a + l.tiles, 0);
    expect(p.totalTiles).toBe(sum);
    // for 8000x6000 @ tileSize 254 the full pyramid is 1033 tiles (computed, verified here)
    expect(p.totalTiles).toBe(1033);
  });

  it("square power-of-two: 4096x4096 has maxLevel 12 and 13 levels", () => {
    const p = dziPyramid(4096, 4096, 254, 1);
    expect(p.maxLevel).toBe(12); // log2(4096) = 12 exactly
    expect(p.levels.length).toBe(13);
    expect(p.levels[0].tiles).toBe(1);
  });

  it("rejects non-positive dimensions", () => {
    expect(() => dziPyramid(0, 100)).toThrow();
  });
});
