import { describe, it, expect } from "vitest";
import { dziOsdSource } from "./dzi.js";
import type { DziTileSource } from "@render/core";

const d: DziTileSource = {
  kind: "dzi",
  width: 8000,
  height: 6000,
  tileSize: 254,
  overlap: 1,
  format: "image/jpeg",
  filesPath: "voynich-f1r_files",
};

describe("dziOsdSource", () => {
  it("maps a dzi descriptor to the OSD custom-tile-source config", () => {
    const c = dziOsdSource(d);
    expect(c.width).toBe(8000);
    expect(c.height).toBe(6000);
    expect(c.tileSize).toBe(254);
    expect(c.tileOverlap).toBe(1); // OSD's spelling of DZI Overlap
  });

  it("builds the DZI level/col/row tile url via render-core's owned scheme", () => {
    // jpeg → jpg ext; {filesPath}/{level}/{col}_{row}.{ext}
    expect(dziOsdSource(d).getTileUrl(13, 2, 3)).toBe("voynich-f1r_files/13/2_3.jpg");
    expect(dziOsdSource({ ...d, format: "image/png" }).getTileUrl(0, 0, 0)).toBe("voynich-f1r_files/0/0_0.png");
  });

  it("tolerates a trailing slash on filesPath", () => {
    expect(dziOsdSource({ ...d, filesPath: "x_files/" }).getTileUrl(5, 1, 0)).toBe("x_files/5/1_0.jpg");
  });
});
