import { describe, it, expect } from "vitest";
import { orientationTransform, normalizeDimensions, isOrientationNoop } from "./orientation.js";

// EXIF orientation -> transform mapping (CONTEXT EXIF display-master; orphan gate §39). PURE —
// the pixel push is browser/canvas (deferred); this mapping + dimension math is the testable
// half, matching test/fixtures/exif/manifest.json. Includes 5 & 7 (transpose/transverse) — the
// axis-swapping orientations "nobody tests".

describe("orientationTransform — the 8 EXIF orientations", () => {
  const expected: Record<number, { flipX: boolean; flipY: boolean; rotate: 0 | 90 | 180 | 270; swapsAxes: boolean }> = {
    1: { flipX: false, flipY: false, rotate: 0, swapsAxes: false },
    2: { flipX: true, flipY: false, rotate: 0, swapsAxes: false },
    3: { flipX: false, flipY: false, rotate: 180, swapsAxes: false },
    4: { flipX: false, flipY: true, rotate: 0, swapsAxes: false },
    5: { flipX: true, flipY: false, rotate: 90, swapsAxes: true }, // transpose
    6: { flipX: false, flipY: false, rotate: 90, swapsAxes: true },
    7: { flipX: true, flipY: false, rotate: 270, swapsAxes: true }, // transverse
    8: { flipX: false, flipY: false, rotate: 270, swapsAxes: true },
  };
  for (const [o, t] of Object.entries(expected)) {
    it(`orientation ${o} -> ${JSON.stringify(t)}`, () => {
      expect(orientationTransform(Number(o))).toEqual(t);
    });
  }
  it("treats an unknown/absent orientation as 1 (no-op)", () => {
    expect(orientationTransform(0)).toEqual(expected[1]);
    expect(orientationTransform(99)).toEqual(expected[1]);
  });
});

describe("normalizeDimensions — axis-swapping orientations transpose w/h", () => {
  it("keeps dimensions for non-swapping orientations (1-4)", () => {
    expect(normalizeDimensions(400, 200, 1)).toEqual({ width: 400, height: 200 });
    expect(normalizeDimensions(400, 200, 3)).toEqual({ width: 400, height: 200 });
  });
  it("swaps w/h for axis-swapping orientations (5-8) — the stored 2x4 normalizes to 4x2", () => {
    expect(normalizeDimensions(200, 400, 6)).toEqual({ width: 400, height: 200 });
    expect(normalizeDimensions(200, 400, 5)).toEqual({ width: 400, height: 200 });
    expect(normalizeDimensions(200, 400, 7)).toEqual({ width: 400, height: 200 });
    expect(normalizeDimensions(200, 400, 8)).toEqual({ width: 400, height: 200 });
  });
});

describe("isOrientationNoop", () => {
  it("is true only for orientation 1 (and absent/unknown)", () => {
    expect(isOrientationNoop(1)).toBe(true);
    expect(isOrientationNoop(0)).toBe(true);
    expect(isOrientationNoop(6)).toBe(false);
    expect(isOrientationNoop(2)).toBe(false);
  });
});
