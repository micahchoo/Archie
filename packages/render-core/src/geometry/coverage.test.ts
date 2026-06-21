import { describe, it, expect } from "vitest";
import { WHOLE_OBJECT_THRESHOLD, spatialCoverage, temporalCoverage, isWholeObject, isWholeObjectFor } from "./coverage.js";
import type { W3CSelector } from "../wadm/types.js";

// Coverage = how much of the whole media a single mark spans (7e1f). Drives the canvas-wide
// coverage border when a mark "is" the object (≥ WHOLE_OBJECT_THRESHOLD or authored override).
const rect = (value: string): W3CSelector => ({ type: "FragmentSelector", value });
const poly = (value: string): W3CSelector => ({ type: "SvgSelector", value });

describe("spatialCoverage", () => {
  it("xywh=pixel: bbox area ÷ (w·h)", () => {
    // 50×50 over a 100×100 canvas = 2500/10000 = 0.25
    expect(spatialCoverage(rect("xywh=pixel:0,0,50,50"), 100, 100)).toBeCloseTo(0.25);
  });

  it("bare xywh= (no unit prefix) treated as pixel", () => {
    expect(spatialCoverage(rect("xywh=0,0,50,50"), 100, 100)).toBeCloseTo(0.25);
  });

  it("percent units: canvas-dims-independent fraction (w/100)·(h/100)", () => {
    // 50%×40% = 0.5·0.4 = 0.2, regardless of canvas pixel dims.
    expect(spatialCoverage(rect("xywh=percent:0,0,50,40"), 1000, 2000)).toBeCloseTo(0.2);
    // Same selector, different canvas dims → same coverage.
    expect(spatialCoverage(rect("xywh=percent:0,0,50,40"), 10, 10)).toBeCloseTo(0.2);
  });

  it("polygon: bounding-box area (not polygon area)", () => {
    // Triangle bbox = 0,0 → 100,100 over a 100×100 canvas = full bbox = 1.
    expect(spatialCoverage(poly('<svg><polygon points="0,0 100,0 0,100" /></svg>'), 100, 100)).toBeCloseTo(1);
  });

  it("selector exceeding canvas clamps to 1", () => {
    expect(spatialCoverage(rect("xywh=pixel:0,0,500,500"), 100, 100)).toBe(1);
    expect(spatialCoverage(rect("xywh=percent:0,0,200,200"), 100, 100)).toBe(1);
  });

  it("partial mid-range case (between 0 and threshold)", () => {
    // 80×80 over 100×100 = 0.64 < 0.75 threshold.
    expect(spatialCoverage(rect("xywh=pixel:0,0,80,80"), 100, 100)).toBeCloseTo(0.64);
  });

  it("unparseable selector → 0", () => {
    expect(spatialCoverage(rect("t=0,5"), 100, 100)).toBe(0); // time-only, no box
    expect(spatialCoverage(poly("<svg></svg>"), 100, 100)).toBe(0); // no polygon points
  });

  it("zero or negative canvas dims → 0 (no divide-by-zero)", () => {
    expect(spatialCoverage(rect("xywh=pixel:0,0,50,50"), 0, 100)).toBe(0);
    expect(spatialCoverage(rect("xywh=pixel:0,0,50,50"), 100, 0)).toBe(0);
    expect(spatialCoverage(rect("xywh=pixel:0,0,50,50"), -100, 100)).toBe(0);
  });
});

describe("temporalCoverage", () => {
  it("(end−start) ÷ duration, clamped [0,1]", () => {
    expect(temporalCoverage(0, 30, 120)).toBeCloseTo(0.25);
  });

  it("AV point marker (end undefined) → 0", () => {
    expect(temporalCoverage(5, undefined, 120)).toBe(0);
  });

  it("end > duration clamps to 1", () => {
    expect(temporalCoverage(0, 200, 120)).toBe(1);
  });

  it("zero or negative duration → 0", () => {
    expect(temporalCoverage(0, 30, 0)).toBe(0);
    expect(temporalCoverage(0, 30, -10)).toBe(0);
  });

  it("partial mid-range case", () => {
    expect(temporalCoverage(10, 40, 60)).toBeCloseTo(0.5);
  });
});

describe("isWholeObject", () => {
  it("WHOLE_OBJECT_THRESHOLD is 0.75", () => {
    expect(WHOLE_OBJECT_THRESHOLD).toBe(0.75);
  });

  it("coverage ≥ threshold → true (0.75 exactly counts)", () => {
    expect(isWholeObject(0.75)).toBe(true);
    expect(isWholeObject(0.9)).toBe(true);
  });

  it("coverage < threshold → false", () => {
    expect(isWholeObject(0.74)).toBe(false);
    expect(isWholeObject(0)).toBe(false);
  });

  it("override === true forces ON regardless of coverage", () => {
    expect(isWholeObject(0, true)).toBe(true);
  });

  it("there is NO force-OFF: override false/undefined falls back to coverage", () => {
    expect(isWholeObject(0.9, false)).toBe(true); // false does not force off
    expect(isWholeObject(0.9, undefined)).toBe(true);
    expect(isWholeObject(0.1, false)).toBe(false);
  });
});

describe("isWholeObjectFor (selector-aware — ADR-0018)", () => {
  it("NO selector (bare-IRI target) → true, regardless of canvas dims / override", () => {
    // The keystone bug fix: a whole-object Note has no selector and IS the whole object.
    expect(isWholeObjectFor(null, 100, 100)).toBe(true);
    expect(isWholeObjectFor(null, 0, 0)).toBe(true); // dims irrelevant when there's no geometry
    expect(isWholeObjectFor(null, 100, 100, false)).toBe(true);
  });

  it("a small region selector → false (no override)", () => {
    // 10×10 over 100×100 = 0.01 < 0.75
    expect(isWholeObjectFor(rect("xywh=pixel:0,0,10,10"), 100, 100)).toBe(false);
  });

  it("a region ≥ threshold → true via coverage", () => {
    // 80×80 over 100×100 = 0.64 < 0.75 → false; 90×90 = 0.81 ≥ 0.75 → true
    expect(isWholeObjectFor(rect("xywh=pixel:0,0,80,80"), 100, 100)).toBe(false);
    expect(isWholeObjectFor(rect("xywh=pixel:0,0,90,90"), 100, 100)).toBe(true);
  });

  it("region-override forces a small region ON", () => {
    expect(isWholeObjectFor(rect("xywh=pixel:0,0,10,10"), 100, 100, true)).toBe(true);
  });
});
