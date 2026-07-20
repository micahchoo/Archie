// MediaThumbnail plate decision (lib/media-thumb.ts). The regression pinned here: publish-time tile
// baking (render-core publish/site.ts tileObject/tileRemote) stamps a `dzi` tileSource onto ordinary
// IMAGE objects, and the plate used to key the Map motif on bare `tileSource` presence — so a tiled
// photo rendered the graticule+pin "Map" plate and its raster thumbnail was ignored. The map motif
// belongs to `kind: "xyz"` (a slippy basemap) ONLY; a `dzi` is "a baked, finite pyramid of a single
// source image, not a world projection" (iiif/resolve.ts).
import { describe, it, expect } from "vitest";
import type { DziTileSource, XyzTileSource } from "@render/core";
import { thumbKind, thumbSrc, thumbSrcChain } from "./media-thumb.js";

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

// The candidate CHAIN the plate steps through on <img onerror> (thumbnail-mitigations gap 2): the
// sized IIIF derive 404s on level-0 (static-tile) hosts and on non-IIIF extensionless URLs that
// classify as a service — the chain must reach a renderable URL before the honest fallback. Full
// derivation coverage lives with the shared helper (render-core iiif/thumb-fallback.test.ts); these
// pin the plate-facing wrapper's contract.
describe("thumbSrcChain", () => {
  it("chains a bare IIIF base: sized → level-0 static full → raw source (possible misclassified image)", () => {
    expect(thumbSrcChain({ source: "https://iiif.example.org/img" }, 480)).toEqual([
      "https://iiif.example.org/img/full/480,/0/default.jpg",
      "https://iiif.example.org/img/full/full/0/default.jpg",
      "https://iiif.example.org/img",
    ]);
  });

  it("keeps an explicit info.json source IIIF-only (no raw-source rung — info.json is not an <img>)", () => {
    expect(thumbSrcChain({ source: "https://iiif.example.org/img/info.json" }, 480)).toEqual([
      "https://iiif.example.org/img/full/480,/0/default.jpg",
      "https://iiif.example.org/img/full/full/0/default.jpg",
    ]);
  });

  it("leads with the baked thumbnail, keeping the derived rungs behind it", () => {
    const chain = thumbSrcChain({ thumbnail: "/ex/assets-thumb/o1", source: "https://iiif.example.org/img" });
    expect(chain[0]).toBe("/ex/assets-thumb/o1");
    expect(chain).toHaveLength(4);
  });

  it("a plain raster / a DZI tile has a single candidate (nothing IIIF-shaped to fall back through)", () => {
    expect(thumbSrcChain({ source: "https://example.org/photo.jpg" })).toEqual(["https://example.org/photo.jpg"]);
    expect(thumbSrcChain({ tileSource: dzi, source: "https://example.org/big.jpg" })).toEqual([
      "/exhibit/obj1_files/0/0_0.jpg",
    ]);
  });

  it("thumbSrc is the chain's head (single-src call sites stay consistent with the plate)", () => {
    const o = { source: "https://iiif.example.org/img" };
    expect(thumbSrc(o)).toBe(thumbSrcChain(o)[0]);
  });
});
