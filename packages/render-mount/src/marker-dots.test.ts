import { describe, it, expect } from "vitest";
import { dotsVisibleForBand, rectCenter, imageToNavigatorPixel } from "./marker-dots.js";

describe("dotsVisibleForBand — the band→visibility contract", () => {
  it("shows the dot layer ONLY at far (fit-width)", () => {
    expect(dotsVisibleForBand("far")).toBe(true);
  });
  it("hides it at mid and near (real marks carry the signal)", () => {
    expect(dotsVisibleForBand("mid")).toBe(false);
    expect(dotsVisibleForBand("near")).toBe(false);
  });
});

describe("rectCenter", () => {
  it("returns the midpoint of the on-screen rect", () => {
    expect(rectCenter({ left: 10, top: 20, right: 30, bottom: 60 })).toEqual({ x: 20, y: 40 });
  });
});

describe("imageToNavigatorPixel — letterbox fit of image space into the navigator", () => {
  it("maps the image centre to the navigator's drawn-image centre (square image, wide nav → horizontal letterbox)", () => {
    // 100×100 image into a 200×100 nav: scale 1, drawn image 100 wide centred → offX 50.
    const p = imageToNavigatorPixel({ x: 50, y: 50 }, { w: 100, h: 100 }, { w: 200, h: 100 });
    expect(p).toEqual({ x: 100, y: 50 });
  });
  it("maps the image origin to the top-left of the drawn (letterboxed) image, not the element", () => {
    const p = imageToNavigatorPixel({ x: 0, y: 0 }, { w: 100, h: 100 }, { w: 200, h: 100 });
    expect(p).toEqual({ x: 50, y: 0 }); // offX 50 from horizontal letterbox, offY 0
  });
  it("scales proportionally when the nav matches the image aspect (no letterbox)", () => {
    const p = imageToNavigatorPixel({ x: 400, y: 300 }, { w: 800, h: 600 }, { w: 80, h: 60 });
    expect(p).toEqual({ x: 40, y: 30 });
  });
  it("letterboxes vertically for a tall nav over a wide image", () => {
    // 200×100 image into 100×100 nav: scale 0.5, drawn 50 tall centred → offY 25.
    const p = imageToNavigatorPixel({ x: 0, y: 0 }, { w: 200, h: 100 }, { w: 100, h: 100 });
    expect(p).toEqual({ x: 0, y: 25 });
  });
  it("returns null for degenerate sizes (first-paint race) rather than NaN", () => {
    expect(imageToNavigatorPixel({ x: 1, y: 1 }, { w: 0, h: 100 }, { w: 100, h: 100 })).toBeNull();
    expect(imageToNavigatorPixel({ x: 1, y: 1 }, { w: 100, h: 100 }, { w: 100, h: 0 })).toBeNull();
  });
});
