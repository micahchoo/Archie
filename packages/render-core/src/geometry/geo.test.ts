// Geo affine correctness (geo-annotation extension; DESIGN.md R8 — the real coordinate-sync risk: a pin
// at a known lng/lat must map to a stable image pixel and round-trip exactly, or pins drift on zoom).
import { describe, it, expect } from "vitest";
import { mercatorExtent, lngLatToPixel, pixelToLngLat, formatLngLat, MERCATOR_MAX_LAT } from "./geo.js";

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
