// XYZ custom-tilesource builder (geo-annotation; DESIGN.md T1). The OSD level↔slippy-z mapping is the
// hard part: getTileUrl(L, x, y) must request slippy z=L, and the full extent must be tileSize·2^maxZoom
// so OSD level L renders the slippy map at z=L (else pins drift on zoom — R8).
import { describe, it, expect } from "vitest";
import { xyzTileSource } from "./xyz.js";

describe("xyzTileSource", () => {
  const cfg = xyzTileSource({ kind: "xyz", template: "https://tile.example/{z}/{x}/{y}.png", tileSize: 256, minZoom: 0, maxZoom: 6 });

  it("sets a square full-resolution extent of tileSize·2^maxZoom", () => {
    expect(cfg.width).toBe(16384);
    expect(cfg.height).toBe(16384);
    expect(cfg.tileSize).toBe(256);
  });

  it("maps OSD levels 0..maxZoom onto slippy zooms (level L == slippy z L)", () => {
    expect(cfg.minLevel).toBe(0);
    expect(cfg.maxLevel).toBe(6);
    expect(cfg.getTileUrl(0, 0, 0)).toBe("https://tile.example/0/0/0.png");
    expect(cfg.getTileUrl(3, 2, 5)).toBe("https://tile.example/3/2/5.png");
    expect(cfg.getTileUrl(6, 63, 63)).toBe("https://tile.example/6/63/63.png");
  });

  it("defaults tileSize to 256", () => {
    expect(xyzTileSource({ kind: "xyz", template: "t/{z}/{x}/{y}", maxZoom: 0 }).tileSize).toBe(256);
  });
});
