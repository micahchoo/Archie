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
  it("emits OSD's NATIVE DZI descriptor (the { Image } form, so OSD uses correct edge/overlap geometry)", () => {
    const s = dziOsdSource(d);
    expect(s.Image.xmlns).toBe("http://schemas.microsoft.com/deepzoom/2008");
    expect(s.Image.Size).toEqual({ Width: "8000", Height: "6000" });
    expect(s.Image.TileSize).toBe("254");
    expect(s.Image.Overlap).toBe("1");
  });

  it("Url + Format produce the same tile scheme the slicer writes ({Url}{level}/{col}_{row}.{ext})", () => {
    const s = dziOsdSource(d);
    expect(s.Image.Url).toBe("voynich-f1r_files/"); // trailing slash; OSD appends level/col_row.format
    expect(s.Image.Format).toBe("jpg"); // extension, not MIME
    expect(dziOsdSource({ ...d, format: "image/png" }).Image.Format).toBe("png");
  });

  it("normalises a trailing slash on filesPath to a single one", () => {
    expect(dziOsdSource({ ...d, filesPath: "x_files/" }).Image.Url).toBe("x_files/");
  });
});
