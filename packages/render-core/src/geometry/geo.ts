// Pure spherical Web-Mercator (EPSG:3857) ↔ image-pixel affine for an XYZ basemap mounted as a bounded
// OSD pixel raster (geo-annotation extension; DESIGN.md steel thread). This is the ONLY new math the
// extension adds — used solely at the author-input and read-out edges; everything downstream operates on
// the image-pixel coordinates unchanged.
//
// The basemap's full-resolution extent is a `tileSize·2^maxZoom` px square (the slippy-map world at its
// deepest zoom). A lng/lat maps to a pixel in that square by the standard slippy-map projection, so an
// annotation persisted as an ordinary image-pixel selector stays anchored to geography across zoom/pan
// FOR FREE (annotorious already re-anchors pixel coords on every OSD viewport event — that IS the
// coordinate-sync atlasdraw needed MapLibre for, already shipped here in pixel space).

import type { TileSourceDescriptor } from "../iiif/resolve.js";

export interface LngLat {
  lng: number;
  lat: number;
}
export interface PixelPoint {
  x: number;
  y: number;
}

/** Geographic bounds of a Map's extent — `[west, south, east, north]` (ADR-0015). */
export type LngLatBounds = [west: number, south: number, east: number, north: number];

/** A rectangle in image-pixel space. */
export interface PixelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The Web-Mercator latitude limit — beyond ±this the projection diverges (the square map clips here). */
export const MERCATOR_MAX_LAT = 85.05112878;

type Extentish = Pick<TileSourceDescriptor, "tileSize" | "maxZoom">;

/** Full-resolution pixel edge of the basemap (the slippy world size at `maxZoom`). */
export function mercatorExtent(d: Extentish): number {
  return (d.tileSize ?? 256) * 2 ** d.maxZoom;
}

const clampLat = (lat: number): number => Math.max(-MERCATOR_MAX_LAT, Math.min(MERCATOR_MAX_LAT, lat));

/** lng/lat → image pixel (top-left origin) on the full-extent basemap. */
export function lngLatToPixel(ll: LngLat, d: Extentish): PixelPoint {
  const S = mercatorExtent(d);
  const lat = clampLat(ll.lat);
  const siny = Math.sin((lat * Math.PI) / 180);
  const x = ((ll.lng + 180) / 360) * S;
  const y = (0.5 - Math.log((1 + siny) / (1 - siny)) / (4 * Math.PI)) * S;
  return { x, y };
}

/** image pixel → lng/lat (the inverse of lngLatToPixel). */
export function pixelToLngLat(p: PixelPoint, d: Extentish): LngLat {
  const S = mercatorExtent(d);
  const lng = (p.x / S) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * p.y) / S;
  const lat = (180 / Math.PI) * Math.atan(Math.sinh(n));
  return { lng, lat };
}

// ---- Bounded extent (ADR-0015) ----
// "Bounded" is realized as a RECTANGLE over the bounds-independent world-pixel space, NOT a remapped tile
// pyramid: the projection + tile-URL math stay the verified whole-world code (R8 dissolves), and a stored
// coordinate's pixel is independent of how the extent is framed — re-framing (Q8) never moves it.

type BoundedDescriptor = Extentish & { bounds?: LngLatBounds };

/**
 * The Map extent's rectangle in full-resolution WORLD-pixel space — the region OSD frames the viewport to,
 * and the bridge to region-local pixels (subtract x/y). Absent bounds = the whole world (`0,0,S,S`).
 */
export function regionPixelRect(d: BoundedDescriptor): PixelRect {
  const S = mercatorExtent(d);
  if (!d.bounds) return { x: 0, y: 0, w: S, h: S };
  const [west, south, east, north] = d.bounds;
  const tl = lngLatToPixel({ lng: west, lat: north }, d); // NW corner = top-left
  const br = lngLatToPixel({ lng: east, lat: south }, d); // SE corner = bottom-right
  return { x: tl.x, y: tl.y, w: br.x - tl.x, h: br.y - tl.y };
}

/** Is a point inside the extent? (Q8 off-frame check — "N notes fall outside the framed region".)
 *  v1 ignores antimeridian-crossing bounds (west > east); flagged for Phase 2. */
export function geoInBounds(ll: LngLat, bounds: LngLatBounds): boolean {
  const [west, south, east, north] = bounds;
  return ll.lng >= west && ll.lng <= east && ll.lat >= south && ll.lat <= north;
}

/** Inclusive world XYZ tile indices covering the extent at slippy zoom `z` — the offline-bake coverage
 *  (ADR-0015 / DESIGN.md Phase 5) and the basis for any bounded tile source. Pure: reuses the projection
 *  AT zoom z (lngLatToPixel only reads tileSize+maxZoom), clamped to the valid tile grid `[0, 2^z − 1]`. */
export function tileRangeForBounds(
  d: { tileSize?: number; bounds: LngLatBounds },
  z: number,
): { minX: number; minY: number; maxX: number; maxY: number } {
  const ts = d.tileSize ?? 256;
  const at = { tileSize: ts, maxZoom: z }; // project into the zoom-z world-pixel grid
  const [west, south, east, north] = d.bounds;
  const tl = lngLatToPixel({ lng: west, lat: north }, at);
  const br = lngLatToPixel({ lng: east, lat: south }, at);
  const last = 2 ** z - 1;
  const clamp = (n: number): number => Math.max(0, Math.min(last, n));
  return {
    minX: clamp(Math.floor(tl.x / ts)),
    minY: clamp(Math.floor(tl.y / ts)),
    maxX: clamp(Math.floor((br.x - 1e-6) / ts)), // −ε so an exact right/bottom edge doesn't spill a tile
    maxY: clamp(Math.floor((br.y - 1e-6) / ts)),
  };
}

/** Format a lng/lat for a UI readout, e.g. `51.5074°, -0.1276°` (lat first, the geographic convention). */
export function formatLngLat(ll: LngLat, dp = 4): string {
  return `${ll.lat.toFixed(dp)}°, ${ll.lng.toFixed(dp)}°`;
}
