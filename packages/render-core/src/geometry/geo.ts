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

/** Format a lng/lat for a UI readout, e.g. `51.5074°, -0.1276°` (lat first, the geographic convention). */
export function formatLngLat(ll: LngLat, dp = 4): string {
  return `${ll.lat.toFixed(dp)}°, ${ll.lng.toFixed(dp)}°`;
}
