// DZI descriptor + pyramid math (Q-9). The pyramid cases are PROMOTED from the verified feasibility
// spike (docs/spikes/dzi-math.test.ts); the descriptor/URL/tileRect cases are new for the production
// builders. All headless — pure geometry/string assembly, no browser.
import { describe, it, expect } from "vitest";
import { dziPyramid, dziDescriptorXml, dziTileSource, tilePath, tileUrl, tileRect, tileExt } from "./dzi.js";

describe("dziPyramid — promoted from the verified spike", () => {
  it("8000x6000 @ tileSize 254 — level count and tile geometry", () => {
    const p = dziPyramid(8000, 6000, 254, 1);
    // maxLevel = ceil(log2(8000)) = 13
    expect(p.maxLevel).toBe(Math.ceil(Math.log2(8000)));
    expect(p.maxLevel).toBe(13);
    expect(p.levels.length).toBe(14); // 0..maxLevel inclusive

    const top = p.levels[p.maxLevel]!;
    expect(top.scaledW).toBe(8000);
    expect(top.scaledH).toBe(6000);
    expect(top.cols).toBe(Math.ceil(8000 / 254));
    expect(top.rows).toBe(Math.ceil(6000 / 254));
    expect(top.cols).toBe(32);
    expect(top.rows).toBe(24);
    expect(top.tiles).toBe(32 * 24); // 768 tiles at full res

    expect(p.levels[0]!.tiles).toBe(1); // sub-256px scaled image -> a single tile

    const sum = p.levels.reduce((a, l) => a + l.tiles, 0);
    expect(p.totalTiles).toBe(sum);
    expect(p.totalTiles).toBe(1033); // computed + verified in the spike
  });

  it("square power-of-two: 4096x4096 has maxLevel 12 and 13 levels", () => {
    const p = dziPyramid(4096, 4096, 254, 1);
    expect(p.maxLevel).toBe(12); // log2(4096) = 12 exactly
    expect(p.levels.length).toBe(13);
    expect(p.levels[0]!.tiles).toBe(1);
  });

  it("rejects non-positive dimensions", () => {
    expect(() => dziPyramid(0, 100)).toThrow();
    expect(() => dziPyramid(100, -5)).toThrow();
  });

  it("defaults tileSize=254, overlap=1 (Deep Zoom defaults)", () => {
    const p = dziPyramid(8000, 6000);
    expect(p.tileSize).toBe(254);
    expect(p.overlap).toBe(1);
  });
});

describe("tileExt — MIME -> tile file extension", () => {
  it("normalises jpeg to jpg, passes png/webp through", () => {
    expect(tileExt("image/jpeg")).toBe("jpg");
    expect(tileExt("image/png")).toBe("png");
    expect(tileExt("image/webp")).toBe("webp");
  });
});

describe("tilePath / tileUrl — the `{level}/{col}_{row}.{ext}` pyramid scheme", () => {
  it("builds the relative tile path", () => {
    expect(tilePath(13, 31, 23, "image/jpeg")).toBe("13/31_23.jpg");
    expect(tilePath(0, 0, 0, "image/png")).toBe("0/0_0.png");
  });
  it("joins a base path and strips a trailing slash", () => {
    expect(tileUrl("assets-tiles/o1_files", 13, 5, 2, "image/jpeg")).toBe("assets-tiles/o1_files/13/5_2.jpg");
    expect(tileUrl("assets-tiles/o1_files/", 0, 0, 0, "image/png")).toBe("assets-tiles/o1_files/0/0_0.png");
  });
});

describe("tileRect — slice box with Deep Zoom overlap", () => {
  const p = dziPyramid(8000, 6000, 254, 1);
  const top = p.levels[p.maxLevel]!;

  it("the top-left tile has NO leading overlap, only trailing", () => {
    const r = tileRect(top, 0, 0, p.tileSize, p.overlap);
    expect(r.sx).toBe(0);
    expect(r.sy).toBe(0);
    // tileSize + trailing overlap (a neighbour exists to the right/below)
    expect(r.sw).toBe(254 + 1);
    expect(r.sh).toBe(254 + 1);
  });

  it("an interior tile is fattened by overlap on all four sides", () => {
    const r = tileRect(top, 5, 5, p.tileSize, p.overlap);
    expect(r.sx).toBe(5 * 254 - 1);
    expect(r.sy).toBe(5 * 254 - 1);
    expect(r.sw).toBe(254 + 2); // overlap on both interior sides
    expect(r.sh).toBe(254 + 2);
  });

  it("the bottom-right tile is clamped at the level boundary (no trailing overlap, no overflow)", () => {
    const r = tileRect(top, top.cols - 1, top.rows - 1, p.tileSize, p.overlap);
    expect(r.sx + r.sw).toBe(top.scaledW); // never exceeds the surface
    expect(r.sy + r.sh).toBe(top.scaledH);
  });
});

describe("dziDescriptorXml — the `.dzi` descriptor OSD reads", () => {
  it("emits the Deep Zoom XML with TileSize/Overlap/Format and Size", () => {
    const p = dziPyramid(8000, 6000, 254, 1);
    const xml = dziDescriptorXml(p, "image/jpeg");
    expect(xml).toContain('TileSize="254"');
    expect(xml).toContain('Overlap="1"');
    expect(xml).toContain('Format="jpg"');
    expect(xml).toContain('<Size Width="8000" Height="6000"/>');
    expect(xml).toContain("http://schemas.microsoft.com/deepzoom/2008");
  });
});

describe("dziTileSource — the carried model descriptor", () => {
  it("builds the DziTileSource stored on AObject.tileSource", () => {
    const p = dziPyramid(8000, 6000, 254, 1);
    const ts = dziTileSource(p, "image/jpeg", "assets-tiles/o1_files/");
    expect(ts).toEqual({
      kind: "dzi",
      width: 8000,
      height: 6000,
      tileSize: 254,
      overlap: 1,
      format: "image/jpeg",
      filesPath: "assets-tiles/o1_files", // trailing slash stripped
    });
  });
});
