// MediaThumbnail plate decision (lib/media-thumb.ts). The regression pinned here: publish-time tile
// baking (render-core publish/site.ts tileObject/tileRemote) stamps a `dzi` tileSource onto ordinary
// IMAGE objects, and the plate used to key the Map motif on bare `tileSource` presence — so a tiled
// photo rendered the graticule+pin "Map" plate and its raster thumbnail was ignored. The map motif
// belongs to `kind: "xyz"` (a slippy basemap) ONLY; a `dzi` is "a baked, finite pyramid of a single
// source image, not a world projection" (iiif/resolve.ts).
import { describe, it, expect } from "vitest";
import type { DziTileSource, XyzTileSource } from "@render/core";
import { thumbKind, thumbSrc } from "./media-thumb.js";

const dzi: DziTileSource = {
  kind: "dzi",
  width: 8000,
  height: 6000,
  tileSize: 254,
  overlap: 1,
  format: "image/jpeg",
  filesPath: "/exhibit/obj1_files",
};

const xyz: XyzTileSource = {
  kind: "xyz",
  template: "https://tile.example.org/{z}/{x}/{y}.png",
  maxZoom: 6,
};

describe("thumbKind", () => {
  it("keeps a DZI-tiled photo on the image path (the tiled-photo-as-Map regression)", () => {
    expect(thumbKind({ tileSource: dzi, mediaType: "image" })).toBe("image");
    // Baked objects may carry no explicit mediaType — the image default must hold too.
    expect(thumbKind({ tileSource: dzi })).toBe("image");
  });

  it("keeps the Map motif for a genuine xyz (geo) basemap", () => {
    expect(thumbKind({ tileSource: xyz })).toBe("map");
    // Even with a defaulted/explicit mediaType alongside — the descriptor classifies the surface.
    expect(thumbKind({ tileSource: xyz, mediaType: "image" })).toBe("map");
  });

  it("falls back to mediaType (default image) when there is no tileSource", () => {
    expect(thumbKind({ mediaType: "video" })).toBe("video");
    expect(thumbKind({ mediaType: "sound" })).toBe("sound");
    expect(thumbKind({})).toBe("image");
  });
});

describe("thumbSrc", () => {
  it("prefers the baked thumbnail when one exists", () => {
    expect(thumbSrc({ thumbnail: "/exhibit/assets-thumb/obj1", tileSource: dzi, source: "/assets/obj1" })).toBe(
      "/exhibit/assets-thumb/obj1",
    );
  });

  it("derives a DZI's level-0 single tile when there is no baked thumbnail", () => {
    expect(thumbSrc({ tileSource: dzi, source: "https://iiif.example.org/img" })).toBe(
      "/exhibit/obj1_files/0/0_0.jpg",
    );
  });

  it("classifies the raw source string for untiled objects (IIIF base → sized JPEG)", () => {
    expect(thumbSrc({ source: "https://iiif.example.org/img" }, 480)).toBe(
      "https://iiif.example.org/img/full/480,/0/default.jpg",
    );
    expect(thumbSrc({ source: "https://example.org/photo.jpg" })).toBe("https://example.org/photo.jpg");
  });
});
