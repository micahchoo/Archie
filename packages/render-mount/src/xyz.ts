// Custom OpenSeadragon TileSource for an XYZ / slippy basemap (geo-annotation extension; DESIGN.md T1).
//
// A slippy map at zoom z is a (tileSize·2^z) px square of (2^z)² tiles. Presenting the DEEPEST zoom as the
// full-resolution image makes OSD level L coincide with slippy z L: with width = height = tileSize·2^maxZoom,
// at OSD level L the image is scaled to tileSize·2^L px — exactly the slippy map at z=L, with 2^L tiles per
// side. So getTileUrl(L, x, y) fills the {z}/{x}/{y} template with z=L and OSD renders the basemap as a
// BOUNDED pixel raster — no second rendering surface, no MapLibre (DESIGN.md: borrow the coordinate-sync
// IDEA, not the machinery). The canonical "OSM in OpenSeadragon" recipe.

import { fillXyzTemplate, mercatorExtent, type XyzTileSource } from "@render/core";

/** A plain OSD custom-tilesource config object (OSD wraps this into a TileSource when handed to it). */
export interface OsdXyzConfig {
  height: number;
  width: number;
  tileSize: number;
  minLevel: number;
  maxLevel: number;
  getTileUrl: (level: number, x: number, y: number) => string;
}

/** Build the OSD custom-tilesource config for a slippy basemap descriptor. */
export function xyzTileSource(d: XyzTileSource): OsdXyzConfig {
  const tileSize = d.tileSize ?? 256;
  const extent = mercatorExtent(d); // tileSize · 2^maxZoom — the full-resolution world square
  return {
    height: extent,
    width: extent,
    tileSize,
    minLevel: d.minZoom ?? 0,
    maxLevel: d.maxZoom,
    getTileUrl: (level: number, x: number, y: number) => fillXyzTemplate(d.template, level, x, y),
  };
}
