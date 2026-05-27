import { describe, it, expect } from "vitest";
import { resolveTileSource, isIiifImageInfo, thumbnailUrl } from "./resolve.js";

// IIIF resolution (spike-0001 core module; ADR-0004 / Q-4). v1: a plain image URL renders
// via OSD type:'image' (single responsive JPEG); an external IIIF info.json is the escape
// hatch for genuinely giant institutional images. NO wasm-vips (ADR-0004). Pure classification
// here; the OSD tile-source object is built in @render/mount (Phase 1).

describe("resolveTileSource (ADR-0004 / Q-4)", () => {
  it("classifies a plain image URL as a single-JPEG source", () => {
    expect(resolveTileSource("https://ex.org/objects/painting.jpg")).toEqual({ kind: "image", url: "https://ex.org/objects/painting.jpg" });
  });
  it("classifies a .svg as an image source (single-image, e.g. the demo sample)", () => {
    expect(resolveTileSource("/sample.svg")).toEqual({ kind: "image", url: "/sample.svg" });
  });
  it("classifies an info.json URL as an external IIIF source (the giant-image escape hatch)", () => {
    expect(resolveTileSource("https://stacks.example/iiif/abc/info.json")).toEqual({ kind: "iiif", infoUrl: "https://stacks.example/iiif/abc/info.json" });
  });
  it("treats a IIIF image service base (no trailing file) as iiif", () => {
    expect(resolveTileSource("https://stacks.example/iiif/2/abc")).toEqual({ kind: "iiif", infoUrl: "https://stacks.example/iiif/2/abc/info.json" });
  });
  it("classifies a blob: URL (extensionless OPFS-imported file) as a direct image, NOT iiif", () => {
    // Regression: a blob URL has no extension, so the fallthrough used to append /info.json and
    // OSD failed with a Security Error fetching blob:.../info.json (P2-7 import bug).
    expect(resolveTileSource("blob:http://localhost:5173/bc6dd387-6843-482b")).toEqual({ kind: "image", url: "blob:http://localhost:5173/bc6dd387-6843-482b" });
  });
  it("classifies a data: URL as a direct image", () => {
    expect(resolveTileSource("data:image/png;base64,iVBORw0K")).toEqual({ kind: "image", url: "data:image/png;base64,iVBORw0K" });
  });
});

describe("thumbnailUrl — a RENDERABLE derivative for rails/grids (the broken-thumbnail fix)", () => {
  it("derives a sized IIIF JPEG from a bare image-service base (NOT the bare base, which is info.json/500)", () => {
    expect(thumbnailUrl("https://collections.library.yale.edu/iiif/2/1006076")).toBe("https://collections.library.yale.edu/iiif/2/1006076/full/240,/0/default.jpg");
  });
  it("honours an explicit width", () => {
    expect(thumbnailUrl("https://stacks.example/iiif/2/abc", 480)).toBe("https://stacks.example/iiif/2/abc/full/480,/0/default.jpg");
  });
  it("derives from a service base given as its info.json URL", () => {
    expect(thumbnailUrl("https://stacks.example/iiif/2/abc/info.json")).toBe("https://stacks.example/iiif/2/abc/full/240,/0/default.jpg");
  });
  it("passes a plain image file through unchanged (already renderable)", () => {
    expect(thumbnailUrl("https://ex.org/objects/painting.jpg")).toBe("https://ex.org/objects/painting.jpg");
  });
  it("passes blob:/data: URLs through unchanged", () => {
    expect(thumbnailUrl("blob:http://localhost/abc")).toBe("blob:http://localhost/abc");
    expect(thumbnailUrl("data:image/png;base64,iVBORw0K")).toBe("data:image/png;base64,iVBORw0K");
  });
});

describe("isIiifImageInfo — recognise a pasted info.json", () => {
  it("accepts a valid IIIF Image API info object", () => {
    expect(isIiifImageInfo({ "@context": "http://iiif.io/api/image/3/context.json", protocol: "http://iiif.io/api/image", width: 8000, height: 6000 })).toBe(true);
    expect(isIiifImageInfo({ "@context": "http://iiif.io/api/image/2/context.json", width: 1, height: 1 })).toBe(true);
  });
  it("rejects non-info objects", () => {
    expect(isIiifImageInfo({ type: "Manifest" })).toBe(false);
    expect(isIiifImageInfo(null)).toBe(false);
    expect(isIiifImageInfo("nope")).toBe(false);
  });
});

describe("resolveTileSource — scheme hardening (security S6)", () => {
  it("does NOT turn a javascript: source into a fetched IIIF info.json", () => {
    // A disallowed scheme must degrade to a (non-fetched) image url — never get /info.json appended + fetched.
    expect(resolveTileSource("javascript:alert(1)")).toEqual({ kind: "image", url: "javascript:alert(1)" });
  });
  it("does NOT turn a file: source into a IIIF service base", () => {
    expect(resolveTileSource("file:///etc/passwd")).toEqual({ kind: "image", url: "file:///etc/passwd" });
  });
  it("still normalises an http(s) service base to info.json", () => {
    expect(resolveTileSource("https://stacks.example/iiif/2/abc")).toEqual({ kind: "iiif", infoUrl: "https://stacks.example/iiif/2/abc/info.json" });
  });
});
