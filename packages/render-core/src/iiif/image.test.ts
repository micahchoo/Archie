import { describe, it, expect } from "vitest";
import { iiifServiceBase, iiifRegionUrl, iiifThumbUrl } from "./image.js";

// IIIF Image API 3.0 region URLs — the free crop path for IIIF-backed objects (ADR-0018).
const SVC = "https://collections.library.yale.edu/iiif/2/1234567";

describe("iiifServiceBase", () => {
  it("strips /info.json and trailing slashes", () => {
    expect(iiifServiceBase(`${SVC}/info.json`)).toBe(SVC);
    expect(iiifServiceBase(`${SVC}/`)).toBe(SVC);
    expect(iiifServiceBase(SVC)).toBe(SVC);
  });
});

describe("iiifRegionUrl", () => {
  it("builds a region request from a pixel media fragment", () => {
    expect(iiifRegionUrl(SVC, "xywh=pixel:100,200,300,400")).toBe(`${SVC}/100,200,300,400/!512,512/0/default.jpg`);
  });
  it("accepts a bare xywh= and a raw x,y,w,h", () => {
    expect(iiifRegionUrl(SVC, "xywh=10,20,30,40")).toBe(`${SVC}/10,20,30,40/!512,512/0/default.jpg`);
    expect(iiifRegionUrl(SVC, "10,20,30,40")).toBe(`${SVC}/10,20,30,40/!512,512/0/default.jpg`);
  });
  it("rounds fractional pixels (Image API region is integer)", () => {
    expect(iiifRegionUrl(SVC, "xywh=pixel:10.6,20.2,30.5,40.9")).toBe(`${SVC}/11,20,31,41/!512,512/0/default.jpg`);
  });
  it("honours a custom size and the info.json base", () => {
    expect(iiifRegionUrl(`${SVC}/info.json`, "xywh=0,0,50,50", "200,")).toBe(`${SVC}/0,0,50,50/200,/0/default.jpg`);
  });
  it("returns null for an unparseable or degenerate region", () => {
    expect(iiifRegionUrl(SVC, "t=0,5")).toBeNull(); // time fragment, not a box
    expect(iiifRegionUrl(SVC, "xywh=0,0,0,40")).toBeNull(); // zero width
    expect(iiifRegionUrl(SVC, "xywh=0,0,0.4,10")).toBeNull(); // sub-pixel width ROUNDS to 0 → still degenerate
  });
});

describe("iiifThumbUrl", () => {
  it("requests the full region at a confined size", () => {
    expect(iiifThumbUrl(SVC)).toBe(`${SVC}/full/!400,400/0/default.jpg`);
  });
});
