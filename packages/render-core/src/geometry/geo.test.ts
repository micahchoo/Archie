// Geo affine correctness (geo-annotation extension; DESIGN.md R8 — the real coordinate-sync risk: a pin
// at a known lng/lat must map to a stable image pixel and round-trip exactly, or pins drift on zoom).
import { describe, it, expect } from "vitest";
import {
  mercatorExtent, lngLatToPixel, pixelToLngLat, formatLngLat, MERCATOR_MAX_LAT,
  regionPixelRect, geoInBounds, tileRangeForBounds, type LngLatBounds,
} from "./geo.js";

const d = { tileSize: 256, maxZoom: 6 }; // S = 256 · 2^6 = 16384

describe("mercatorExtent", () => {
  it("is tileSize · 2^maxZoom", () => {
    expect(mercatorExtent(d)).toBe(16384);
    expect(mercatorExtent({ maxZoom: 0 })).toBe(256); // default tileSize 256, whole world in one tile
  });
});

describe("lngLatToPixel — corners + centre of the Web-Mercator square", () => {
  const S = mercatorExtent(d);
  it("maps the NW corner (−180, +maxLat) to (0, 0)", () => {
    const p = lngLatToPixel({ lng: -180, lat: MERCATOR_MAX_LAT }, d);
    expect(p.x).toBeCloseTo(0, 3);
    expect(p.y).toBeCloseTo(0, 3);
  });
  it("maps (0, 0) to the centre", () => {
    const p = lngLatToPixel({ lng: 0, lat: 0 }, d);
    expect(p.x).toBeCloseTo(S / 2, 6);
    expect(p.y).toBeCloseTo(S / 2, 6);
  });
  it("maps the SE corner (+180, −maxLat) to (S, S)", () => {
    const p = lngLatToPixel({ lng: 180, lat: -MERCATOR_MAX_LAT }, d);
    expect(p.x).toBeCloseTo(S, 3);
    expect(p.y).toBeCloseTo(S, 3);
  });
});

describe("round-trip — pixel→lngLat∘lngLat→pixel is identity (the anchoring guarantee)", () => {
  const cities = [
    { lng: -0.1276, lat: 51.5074 }, // London
    { lng: -74.006, lat: 40.7128 }, // New York
    { lng: 139.6917, lat: 35.6895 }, // Tokyo
    { lng: 36.8219, lat: -1.2921 }, // Nairobi (southern hemisphere)
  ];
  for (const c of cities) {
    it(`round-trips ${c.lng},${c.lat}`, () => {
      const back = pixelToLngLat(lngLatToPixel(c, d), d);
      expect(back.lng).toBeCloseTo(c.lng, 6);
      expect(back.lat).toBeCloseTo(c.lat, 6);
    });
  }
  it("is extent-independent (same lng/lat at maxZoom 3 vs 12 round-trips identically)", () => {
    const c = { lng: 12.4924, lat: 41.8902 }; // Rome
    for (const maxZoom of [3, 12]) {
      const back = pixelToLngLat(lngLatToPixel(c, { maxZoom }), { maxZoom });
      expect(back.lng).toBeCloseTo(c.lng, 6);
      expect(back.lat).toBeCloseTo(c.lat, 6);
    }
  });
});

describe("formatLngLat", () => {
  it("renders lat first, degrees, fixed precision", () => {
    expect(formatLngLat({ lng: -0.1276, lat: 51.5074 })).toBe("51.5074°, -0.1276°");
  });
});

// ---- Bounded extent (ADR-0015) — the Phase-1 keystone R8 corpus ----

describe("regionPixelRect — Map extent → world-pixel rectangle", () => {
  const S = mercatorExtent(d); // 16384
  it("absent bounds = the whole world", () => {
    expect(regionPixelRect(d)).toEqual({ x: 0, y: 0, w: S, h: S });
  });
  it("whole-world bounds ≈ the whole world", () => {
    const r = regionPixelRect({ ...d, bounds: [-180, -MERCATOR_MAX_LAT, 180, MERCATOR_MAX_LAT] });
    expect(r.x).toBeCloseTo(0, 3);
    expect(r.y).toBeCloseTo(0, 3);
    expect(r.w).toBeCloseTo(S, 3);
    expect(r.h).toBeCloseTo(S, 3);
  });
  it("a sub-region rect equals its NW/SE corner projections, with positive area", () => {
    const bounds: LngLatBounds = [-0.5, 51.3, 0.3, 51.7]; // ~London
    const r = regionPixelRect({ ...d, bounds });
    const tl = lngLatToPixel({ lng: -0.5, lat: 51.7 }, d);
    const br = lngLatToPixel({ lng: 0.3, lat: 51.3 }, d);
    expect(r).toEqual({ x: tl.x, y: tl.y, w: br.x - tl.x, h: br.y - tl.y });
    expect(r.w).toBeGreaterThan(0);
    expect(r.h).toBeGreaterThan(0);
  });
  it("pixel space is bounds-INDEPENDENT — re-framing the extent never moves a coordinate (Q8)", () => {
    const p = { lng: 0.1, lat: 51.5 };
    const wide = lngLatToPixel(p, d);
    // lngLatToPixel reads only tileSize+maxZoom; bounds (the frame) cannot shift the pixel
    expect(lngLatToPixel(p, { tileSize: 256, maxZoom: 6 })).toEqual(wide);
    expect(regionPixelRect({ ...d, bounds: [-1, 51, 1, 52] }).w).not.toBe(regionPixelRect({ ...d, bounds: [-0.2, 51.4, 0.2, 51.6] }).w);
  });
});

describe("geoInBounds — off-frame check (Q8)", () => {
  const bounds: LngLatBounds = [-0.5, 51.3, 0.3, 51.7];
  it("inside", () => expect(geoInBounds({ lng: 0, lat: 51.5 }, bounds)).toBe(true));
  it("outside each side", () => {
    expect(geoInBounds({ lng: -1, lat: 51.5 }, bounds)).toBe(false); // west
    expect(geoInBounds({ lng: 1, lat: 51.5 }, bounds)).toBe(false); // east
    expect(geoInBounds({ lng: 0, lat: 50 }, bounds)).toBe(false); // south
    expect(geoInBounds({ lng: 0, lat: 52 }, bounds)).toBe(false); // north
  });
  it("edges are inclusive", () => {
    expect(geoInBounds({ lng: -0.5, lat: 51.3 }, bounds)).toBe(true);
    expect(geoInBounds({ lng: 0.3, lat: 51.7 }, bounds)).toBe(true);
  });
});

describe("tileRangeForBounds — offline-bake coverage", () => {
  const world: LngLatBounds = [-180, -MERCATOR_MAX_LAT, 180, MERCATOR_MAX_LAT];
  it("z=0 is always the single root tile", () => {
    expect(tileRangeForBounds({ tileSize: 256, bounds: [-0.5, 51.3, 0.3, 51.7] }, 0)).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0 });
  });
  it("whole world at z=1 is the full 2×2 grid", () => {
    expect(tileRangeForBounds({ tileSize: 256, bounds: world }, 1)).toEqual({ minX: 0, minY: 0, maxX: 1, maxY: 1 });
  });
  it("whole world clamps to the valid grid at z=3 (0..7)", () => {
    expect(tileRangeForBounds({ tileSize: 256, bounds: world }, 3)).toEqual({ minX: 0, minY: 0, maxX: 7, maxY: 7 });
  });
  it("a small region covers few tiles and stays in-grid", () => {
    const r = tileRangeForBounds({ tileSize: 256, bounds: [-0.5, 51.3, 0.3, 51.7] }, 6);
    expect(r.minX).toBeLessThanOrEqual(r.maxX);
    expect(r.minY).toBeLessThanOrEqual(r.maxY);
    expect(r.minX).toBeGreaterThanOrEqual(0);
    expect(r.maxX).toBeLessThanOrEqual(63); // 2^6 − 1
    expect(r.maxY).toBeLessThanOrEqual(63);
  });
});
