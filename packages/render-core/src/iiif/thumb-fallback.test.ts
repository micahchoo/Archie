// thumbnailCandidates — the ordered grid-thumbnail fallback chain (thumbnail-mitigations gap 2).
// The class of failure pinned here: a IIIF level-0 host (static tiles) 404s the blind sized upsize
// `{base}/full/{w},/0/default.jpg`, and an extensionless non-IIIF URL classifies as a service and
// 404s everything IIIF-shaped — the chain must degrade sized → static-full → (raw source when the
// classification was the extensionless default) so the consumer's <img onerror> stepping lands on a
// renderable URL before falling to the placeholder.
import { describe, it, expect } from "vitest";
import { thumbnailCandidates } from "./thumb-fallback.js";
import type { DziTileSource, XyzTileSource } from "./resolve.js";

describe("thumbnailCandidates — IIIF sources", () => {
  it("a bare IIIF service base chains sized → static full → raw source (the extensionless default may be misclassified)", () => {
    expect(thumbnailCandidates({ source: "https://iiif.example.org/img" }, 480)).toEqual([
      "https://iiif.example.org/img/full/480,/0/default.jpg",
      "https://iiif.example.org/img/full/full/0/default.jpg",
      "https://iiif.example.org/img",
    ]);
  });

  it("an explicit info.json source chains sized → static full ONLY (genuinely IIIF; info.json is not an <img>)", () => {
    expect(thumbnailCandidates({ source: "https://iiif.example.org/img/info.json" }, 480)).toEqual([
      "https://iiif.example.org/img/full/480,/0/default.jpg",
      "https://iiif.example.org/img/full/full/0/default.jpg",
    ]);
  });

  it("a baked thumbnail leads the chain, with the derived candidates behind it (a dead baked URL still degrades)", () => {
    expect(thumbnailCandidates({ thumbnail: "/ex/assets-thumb/o1", source: "https://iiif.example.org/img/info.json" }, 480)).toEqual([
      "/ex/assets-thumb/o1",
      "https://iiif.example.org/img/full/480,/0/default.jpg",
      "https://iiif.example.org/img/full/full/0/default.jpg",
    ]);
  });

  it("honors the width parameter in the sized rung", () => {
    expect(thumbnailCandidates({ source: "https://iiif.example.org/img" }, 240)[0]).toBe(
      "https://iiif.example.org/img/full/240,/0/default.jpg",
    );
  });

  it("defaults width to 480", () => {
    expect(thumbnailCandidates({ source: "https://iiif.example.org/img" })[0]).toBe(
      "https://iiif.example.org/img/full/480,/0/default.jpg",
    );
  });
});

describe("thumbnailCandidates — non-IIIF sources have exactly one derived form", () => {
  it("a plain raster URL is its own single candidate", () => {
    expect(thumbnailCandidates({ source: "https://example.org/photo.jpg" })).toEqual([
      "https://example.org/photo.jpg",
    ]);
  });

  it("blob:/data: URLs pass through as the single candidate (never IIIF-normalised)", () => {
    expect(thumbnailCandidates({ source: "blob:abc" })).toEqual(["blob:abc"]);
  });

  it("a dzi tileSource yields its level-0 tile, nothing else", () => {
    const dzi: DziTileSource = {
      kind: "dzi", width: 8000, height: 6000, tileSize: 254, overlap: 1,
      format: "image/jpeg", filesPath: "/ex/obj1_files",
    };
    expect(thumbnailCandidates({ tileSource: dzi, source: "https://iiif.example.org/img" })).toEqual([
      "/ex/obj1_files/0/0_0.jpg",
    ]);
  });

  it("an xyz basemap yields its shallowest world tile, nothing else", () => {
    const xyz: XyzTileSource = { kind: "xyz", template: "https://tile.example/{z}/{x}/{y}.png", maxZoom: 6 };
    expect(thumbnailCandidates({ tileSource: xyz, source: "xyz" })).toEqual([
      "https://tile.example/0/0/0.png",
    ]);
  });
});

describe("thumbnailCandidates — dedupe", () => {
  it("a baked thumbnail equal to the derived candidate appears once", () => {
    expect(thumbnailCandidates({ thumbnail: "https://example.org/photo.jpg", source: "https://example.org/photo.jpg" })).toEqual([
      "https://example.org/photo.jpg",
    ]);
  });
});
