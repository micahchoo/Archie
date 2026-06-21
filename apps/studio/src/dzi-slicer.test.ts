import { describe, it, expect } from "vitest";
import { dziTilePlan } from "./dzi-slicer.js";
import { dziPyramid } from "@render/core";

// The PURE geometry of the slicer is testable headlessly; the OffscreenCanvas encode (sliceToDzi) is
// browser-verification-pending and deliberately NOT exercised here.
describe("dziTilePlan", () => {
  it("enumerates exactly the pyramid's tiles for an 8000×6000 source", () => {
    const plan = dziTilePlan(8000, 6000, "image/jpeg");
    const pyr = dziPyramid(8000, 6000);
    expect(pyr.totalTiles).toBe(1033); // the feasibility-spike number
    expect(plan.length).toBe(pyr.totalTiles);
  });

  it("emits one plan entry per (level, col, row) with the {level}/{col}_{row}.{ext} path", () => {
    const plan = dziTilePlan(512, 400, "image/png", 254, 1);
    expect(plan.length).toBe(dziPyramid(512, 400, 254, 1).totalTiles);
    for (const t of plan) {
      expect(t.path).toMatch(/^\d+\/\d+_\d+\.png$/);
    }
  });

  it("keeps every tile's crop rect inside its scaled level and non-empty", () => {
    for (const t of dziTilePlan(3000, 2000, "image/jpeg")) {
      expect(t.sw).toBeGreaterThan(0);
      expect(t.sh).toBeGreaterThan(0);
      expect(t.sx + t.sw).toBeLessThanOrEqual(t.scaledW);
      expect(t.sy + t.sh).toBeLessThanOrEqual(t.scaledH);
    }
  });
});
