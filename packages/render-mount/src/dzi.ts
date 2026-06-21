// OSD custom tile-source for a baked Deep Zoom (DZI) pyramid (Q-9). Mirrors xyz.ts: a `dzi`
// TileSourceDescriptor classifies a surface whose pixels live as a pre-sliced tile pyramid (emitted
// by the OffscreenCanvas slicer, or by desktop-Rust/IIIF — Q-10). OSD reads the DZI level/col/row
// scheme natively: given width/height/tileSize/tileOverlap + a getTileUrl, it computes the levels
// and requests tiles. The URL scheme is OWNED by render-core (`tileUrl`) so the slicer that WRITES
// the tiles and the viewer that READS them fill the same template — one source of truth.
import { tileUrl } from "@render/core";
import type { DziTileSource } from "@render/core";

/** The OSD custom-tile-source config object (the shape OSD's `tileSources` accepts for a non-DZI-URL
 *  pyramid). `tileOverlap` is OSD's spelling of the DZI `Overlap`. */
export interface OsdDziConfig {
  width: number;
  height: number;
  tileSize: number;
  tileOverlap: number;
  getTileUrl: (level: number, x: number, y: number) => string;
}

/** Build the OSD tile-source config from a `dzi` descriptor. getTileUrl defers to render-core's
 *  `tileUrl` so the level/col/row/ext grammar matches exactly what the slicer emitted. */
export function dziOsdSource(d: DziTileSource): OsdDziConfig {
  return {
    width: d.width,
    height: d.height,
    tileSize: d.tileSize,
    tileOverlap: d.overlap,
    getTileUrl: (level: number, x: number, y: number) => tileUrl(d.filesPath, level, x, y, d.format),
  };
}
