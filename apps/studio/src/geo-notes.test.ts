import { describe, it, expect } from "vitest";
import { geoLabelOf, geoForTarget, selectorValue } from "./geo-notes.js";
import { geoBasemap } from "./seed-data.js";
import { lngLatToPixel, type AnnotationRecord, type W3CTarget } from "@render/core";

// geo-notes.ts — the pure geo selector math lifted out of App.svelte. The load-bearing property is the
// pixel↔lng/lat round-trip over a region: a note drawn at a city's pixel reports that city's lng/lat.

const rectTarget = (x: number, y: number, w: number, h: number): W3CTarget => ({
  type: "SpecificResource", source: "https://archie.demo/geo-map/canvas/m1",
  selector: { type: "FragmentSelector", conformsTo: "http://www.w3.org/TR/media-frags/", value: `xywh=pixel:${x},${y},${w},${h}` },
});
const rec = (target: W3CTarget, geo?: AnnotationRecord["geo"]): AnnotationRecord =>
  ({ logicalId: "n1", rev: "r1", lastEditor: "anon", target, ...(geo ? { geo } : {}) } as unknown as AnnotationRecord);

describe("geo-notes", () => {
  it("returns null off a Map (no tileSource)", () => {
    expect(geoLabelOf(rec(rectTarget(0, 0, 10, 10)), undefined)).toBeNull();
    expect(geoForTarget(rectTarget(0, 0, 10, 10), undefined)).toBeUndefined();
  });

  it("geoLabelOf recovers a city's lng/lat from its pixel-selector centre (round-trip)", () => {
    const london = { lng: -0.1276, lat: 51.5074 };
    const W = 140;
    const p = lngLatToPixel(london, geoBasemap);
    const x = Math.round(p.x - W / 2), y = Math.round(p.y - W / 2);
    const label = geoLabelOf(rec(rectTarget(x, y, W, W)), geoBasemap);
    expect(label).not.toBeNull();
    // formatLngLat renders "lat°N/S, lng°E/W" — assert the magnitudes are in the right neighbourhood.
    expect(label).toMatch(/51\.[0-9]/);
    expect(label).toMatch(/0\.[0-9]/);
  });

  it("geoLabelOf prefers stored geo-truth (bbox) over the pixel selector", () => {
    const r = rec(rectTarget(0, 0, 10, 10), { type: "bbox", west: 10, south: 20, east: 30, north: 40 });
    // centre of the bbox = lng 20, lat 30
    const label = geoLabelOf(r, geoBasemap);
    expect(label).toMatch(/30/);
    expect(label).toMatch(/20/);
  });

  it("geoForTarget turns a drawn box into a bbox anchor (NW/SE corners)", () => {
    const anchor = geoForTarget(rectTarget(100, 100, 200, 200), geoBasemap);
    expect(anchor?.type).toBe("bbox");
    if (anchor?.type === "bbox") {
      // West < East and South < North (a well-formed bounding box, north-up tiles).
      expect(anchor.west).toBeLessThan(anchor.east);
      expect(anchor.south).toBeLessThan(anchor.north);
    }
  });

  it("selectorValue extracts the fragment value, '' when absent", () => {
    expect(selectorValue(rec(rectTarget(1, 2, 3, 4)))).toBe("xywh=pixel:1,2,3,4");
    expect(selectorValue(rec({ type: "SpecificResource", source: "x" } as W3CTarget))).toBe("");
  });
});
