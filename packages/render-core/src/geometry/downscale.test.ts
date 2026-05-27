import { describe, it, expect } from "vitest";
import { fitWithin, exceedsCap } from "./downscale.js";

// fitWithin / exceedsCap — the pure dimension math for import downscale (LARGE-MEDIA-MEMORY-CEILING #4 /
// CONTEXT §80: a bundled display master is a single responsive image ~6000–8000px; giant images go to
// external IIIF). Downscale-only, aspect-preserving, integer px. The canvas re-encode that consumes this
// is browser-side (apps/studio/src/bake.ts) — these tests pin the math headlessly.

describe("fitWithin — downscale-only aspect-preserving fit", () => {
  it("is a no-op when the longer edge is under the cap", () => {
    expect(fitWithin(4000, 3000, 6000)).toEqual({ width: 4000, height: 3000 });
  });

  it("is a no-op exactly at the cap (boundary)", () => {
    expect(fitWithin(6000, 4500, 6000)).toEqual({ width: 6000, height: 4500 });
  });

  it("never upscales a small image", () => {
    expect(fitWithin(800, 600, 6000)).toEqual({ width: 800, height: 600 });
  });

  it("caps a landscape image's longer (width) edge to maxDim", () => {
    // 8000×6000 over a 6000 cap → width 6000, height scaled by 0.75 → 4500
    expect(fitWithin(8000, 6000, 6000)).toEqual({ width: 6000, height: 4500 });
  });

  it("caps a portrait image's longer (height) edge to maxDim", () => {
    expect(fitWithin(6000, 8000, 6000)).toEqual({ width: 4500, height: 6000 });
  });

  it("caps a square image to maxDim × maxDim", () => {
    expect(fitWithin(9000, 9000, 6000)).toEqual({ width: 6000, height: 6000 });
  });

  it("caps a 40 MP phone photo (7296×5472) — the motivating case", () => {
    // long edge 7296 > 6000 → scale 6000/7296 ≈ 0.8224; 5472 × 0.8224 ≈ 4500
    const out = fitWithin(7296, 5472, 6000);
    expect(out.width).toBe(6000);
    expect(out.height).toBe(4500);
  });

  it("preserves aspect ratio within a 1px rounding tolerance", () => {
    const [w, h] = [7777, 3333];
    const out = fitWithin(w, h, 6000);
    expect(Math.max(out.width, out.height)).toBe(6000);
    expect(Math.abs(out.width / out.height - w / h)).toBeLessThan(0.01);
  });

  it("rounds to whole pixels", () => {
    const out = fitWithin(7001, 5001, 6000);
    expect(Number.isInteger(out.width)).toBe(true);
    expect(Number.isInteger(out.height)).toBe(true);
  });

  it("never produces a zero dimension (clamps to ≥1)", () => {
    const out = fitWithin(100000, 1, 6000); // extreme aspect → height would round to 0
    expect(out.width).toBe(6000);
    expect(out.height).toBeGreaterThanOrEqual(1);
  });

  it("is safe on a degenerate zero dimension (no divide-by-zero)", () => {
    expect(fitWithin(0, 0, 6000)).toEqual({ width: 0, height: 0 });
  });
});

describe("exceedsCap — whether an image is worth re-encoding to downscale", () => {
  it("is false when both edges are within the cap", () => {
    expect(exceedsCap(6000, 4500, 6000)).toBe(false);
    expect(exceedsCap(4000, 3000, 6000)).toBe(false);
  });
  it("is true when the longer edge exceeds the cap", () => {
    expect(exceedsCap(6001, 100, 6000)).toBe(true);
    expect(exceedsCap(100, 8000, 6000)).toBe(true);
  });
});
