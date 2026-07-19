// Marginalia direction C — clustering + density gate (Archie-dff3). Headless, no DOM.
import { describe, it, expect } from "vitest";
import {
  clusterMarginalia,
  marginaliaDensity,
  heatOpacity,
  CLUSTER_DENSITY_MIN,
  CLUSTER_THRESHOLD_PX,
  type ClusterInput,
} from "./marginalia-clusters.js";

const item = (id: string, anchorY: number): ClusterInput => ({ id, anchorY });

describe("clusterMarginalia", () => {
  it("keeps distant notes in their own single-member clusters", () => {
    const cs = clusterMarginalia([item("a", 0), item("b", 200), item("c", 400)], 44);
    expect(cs.map((c) => c.ids)).toEqual([["a"], ["b"], ["c"]]);
    expect(cs.every((c) => c.ids.length === 1)).toBe(true);
  });

  it("merges notes whose anchors are within the threshold into one counted cluster", () => {
    // The headline overlap case: two anchors 6px apart merge; a third far below stays separate.
    const cs = clusterMarginalia([item("n3", 300), item("n4", 306), item("n5", 500)], 44);
    expect(cs.map((c) => c.ids)).toEqual([["n3", "n4"], ["n5"]]);
    expect(cs[0]!.anchorY).toBe(303); // centroid = mean of members
    expect(cs[0]!.top).toBe(300);
    expect(cs[0]!.bottom).toBe(306);
  });

  it("chains single-linkage: a~b and b~c close merges a,b,c even though a and c exceed threshold", () => {
    const cs = clusterMarginalia([item("a", 0), item("b", 40), item("c", 80)], 44);
    expect(cs).toHaveLength(1);
    expect(cs[0]!.ids).toEqual(["a", "b", "c"]);
    expect(cs[0]!.top).toBe(0);
    expect(cs[0]!.bottom).toBe(80);
  });

  it("splits exactly at the threshold boundary (gap == threshold merges, gap > threshold splits)", () => {
    expect(clusterMarginalia([item("a", 0), item("b", 44)], 44).map((c) => c.ids)).toEqual([["a", "b"]]);
    expect(clusterMarginalia([item("a", 0), item("b", 45)], 44).map((c) => c.ids)).toEqual([["a"], ["b"]]);
  });

  it("sorts by anchor regardless of input order and gives a stable, top-first cluster id", () => {
    const cs = clusterMarginalia([item("b", 306), item("a", 300)], 44);
    expect(cs[0]!.ids).toEqual(["a", "b"]);
    expect(cs[0]!.id).toBe("c:a");
  });

  it("drops notes with a non-finite anchor (off-screen / unresolvable region)", () => {
    const cs = clusterMarginalia([item("a", 100), item("off", NaN), item("b", 110)], 44);
    expect(cs).toHaveLength(1);
    expect(cs[0]!.ids).toEqual(["a", "b"]);
  });

  it("returns [] for no placeable notes and never throws", () => {
    expect(clusterMarginalia([], 44)).toEqual([]);
    expect(clusterMarginalia([item("x", NaN), item("y", Infinity)], 44)).toEqual([]);
  });

  it("defaults the threshold to CLUSTER_THRESHOLD_PX", () => {
    const gapUnder = clusterMarginalia([item("a", 0), item("b", CLUSTER_THRESHOLD_PX - 1)]);
    const gapOver = clusterMarginalia([item("a", 0), item("b", CLUSTER_THRESHOLD_PX + 1)]);
    expect(gapUnder).toHaveLength(1);
    expect(gapOver).toHaveLength(2);
  });
});

describe("marginaliaDensity", () => {
  it("is sparse below CLUSTER_DENSITY_MIN and dense at or above it", () => {
    expect(marginaliaDensity(0)).toBe("sparse");
    expect(marginaliaDensity(2)).toBe("sparse"); // the explicit "no cluster chrome for 2 notes" case
    expect(marginaliaDensity(CLUSTER_DENSITY_MIN - 1)).toBe("sparse");
    expect(marginaliaDensity(CLUSTER_DENSITY_MIN)).toBe("dense");
    expect(marginaliaDensity(20)).toBe("dense");
  });

  it("honors a caller-supplied minimum", () => {
    expect(marginaliaDensity(5, 8)).toBe("sparse");
    expect(marginaliaDensity(8, 8)).toBe("dense");
  });
});

describe("heatOpacity", () => {
  it("ramps with count and caps at 0.6 so the band never becomes a solid bar", () => {
    expect(heatOpacity(1)).toBeCloseTo(0.3);
    expect(heatOpacity(2)).toBeCloseTo(0.46);
    expect(heatOpacity(3)).toBeCloseTo(0.6); // 0.14 + 0.48 = 0.62 → clamped
    expect(heatOpacity(50)).toBe(0.6);
  });
});
