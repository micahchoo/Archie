// OSD tile-source for a baked Deep Zoom (DZI) pyramid (Q-9). A `dzi` TileSourceDescriptor classifies a
// surface whose pixels live as a pre-sliced tile pyramid (emitted by the OffscreenCanvas slicer, or by
// desktop-Rust/IIIF — Q-10).
//
// IMPORTANT (tile-height fix): we hand OSD its NATIVE DZI descriptor shape (`{ Image: { … } }`), NOT a
// generic `{ width, height, tileSize, tileOverlap, getTileUrl }` config. With a generic source OSD applies
// its generic edge/overlap math, which mis-sizes the variable-height bottom-row / right-column tiles (the
// Deep Zoom overlap convention shortens edge tiles). The `{ Image }` shape makes OSD construct a real
// DziTileSource so the overlap + edge geometry matches exactly how the slicer cut the tiles. OSD builds
// each tile url as `{Url}{level}/{col}_{row}.{Format}` — the same scheme render-core's `tileUrl` emits.
import type { DziTileSource } from "@render/core";

// Tile extension from a tile MIME (image/jpeg → jpg, image/png → png). INLINED rather than imported
// from @render/core: a stale dev-server barrel dropped the cross-package `tileExt` export and the
// uncaught import error blanked the whole studio canvas (createMount → dzi.ts). A read-side module
// this small stays self-contained — same one-line logic as render-core's tileExt.
function tileExt(format: string): string {
  const sub = (format.split("/").pop() ?? "jpeg").toLowerCase();
  return sub === "jpeg" ? "jpg" : sub;
}

/** The OSD-native Deep Zoom descriptor object (the `{ Image }` form OSD recognises as DZI and parses with
 *  its DziTileSource — correct overlap + edge-tile sizing). Numeric fields are strings, per the DZI schema. */
export interface OsdDziImage {
  Image: {
    xmlns: string;
    /** Tile base; OSD appends `{level}/{col}_{row}.{Format}`. Trailing slash required. */
    Url: string;
    /** Tile extension (NOT MIME): jpg/png/webp. */
    Format: string;
    Overlap: string;
    TileSize: string;
    Size: { Width: string; Height: string };
  };
}

/** Build OSD's native DZI descriptor from a `dzi` model descriptor. `Url` = `{filesPath}/`; OSD then
 *  requests `{filesPath}/{level}/{col}_{row}.{ext}` — matching render-core's `tileUrl`/`tilePath`. */
export function dziOsdSource(d: DziTileSource): OsdDziImage {
  return {
    Image: {
      xmlns: "http://schemas.microsoft.com/deepzoom/2008",
      Url: `${d.filesPath.replace(/\/$/, "")}/`,
      Format: tileExt(d.format),
      Overlap: String(d.overlap),
      TileSize: String(d.tileSize),
      Size: { Width: String(d.width), Height: String(d.height) },
    },
  };
}
