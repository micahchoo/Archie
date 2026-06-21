// IIIF resolution (ADR-0004 / Q-4). Pure classification of an Object's image source into a
// tile-source descriptor. v1: a plain image URL -> OSD type:'image' single responsive JPEG;
// an external IIIF info.json -> consume the institutional image server. NO in-browser libvips
// tiling (ADR-0004 — do not re-litigate). The OSD tile-source object is built in @render/mount.

/**
 * An XYZ / slippy-map basemap descriptor (geo-annotation extension; DESIGN.md). A map is mounted as a
 * BOUNDED OSD pixel raster — not a second rendering surface (NO MapLibre). The full-resolution extent is
 * a `tileSize·2^maxZoom` square (Web-Mercator world); @render/mount builds the custom OSD TileSource from
 * this, and @render/core/geometry/geo maps lng/lat ↔ pixel in that square. Carried on `AObject.tileSource`
 * as the explicit classification hint (a bare `{z}/{x}/{y}` template has no extension and would otherwise
 * mis-type as a plain image — DESIGN.md R1). v1 = whole-world Web-Mercator; regional `bounds` is Phase 2.
 */
export interface XyzTileSource {
  kind: "xyz";
  /** URL template with `{z}/{x}/{y}` placeholders, e.g. `https://tile.openstreetmap.org/{z}/{x}/{y}.png`. */
  template: string;
  /** Tile edge in px (default 256). */
  tileSize?: number;
  /** Deepest slippy zoom available — sets the full-resolution pixel extent (`tileSize·2^maxZoom`). */
  maxZoom: number;
  /** Shallowest slippy zoom (default 0 = whole world in one tile). */
  minZoom?: number;
  /** The Map extent (ADR-0015) — `[west, south, east, north]`, the bounded region the viewer frames to and
   *  the unit that makes a basemap offline-bakeable. ABSENT = whole world (the spike default). Pixels stay
   *  WORLD pixels (a function of tileSize+maxZoom, not bounds), so re-framing never moves a stored coordinate. */
  bounds?: [west: number, south: number, east: number, north: number];
  /** Attribution the surface MUST display (e.g. "© OpenStreetMap contributors"). */
  attribution?: string;
}

/**
 * A pre-generated Deep Zoom Image (DZI) tile pyramid descriptor (Phase B tiling; Q-8/Q-9). When an
 * import is too large to bundle as one responsive master (`exceedsCap`), the author-side slicer
 * (apps/studio/src/dzi-slicer.worker.ts) bakes a `.dzi`-shaped tile pyramid and records THIS on the
 * object. The viewer hands it to OSD, which renders DZI natively (a tiny config — no viewer-side
 * generation). The geometry/`.dzi` XML/tile-URL math lives in geometry/dzi.ts; this is the carried
 * descriptor only. Distinct from `XyzTileSource` (a live slippy basemap) — a DZI is a baked, finite
 * pyramid of a single source image, not a world projection.
 */
export interface DziTileSource {
  kind: "dzi";
  /** Full-resolution source width in px (the `Size/@Width` of the `.dzi`). */
  width: number;
  /** Full-resolution source height in px (the `Size/@Height` of the `.dzi`). */
  height: number;
  /** Tile edge in px (the Deep Zoom default is 254 → 256 effective with overlap 1). */
  tileSize: number;
  /** Per-edge pixel overlap baked into each interior tile (Deep Zoom default 1). */
  overlap: number;
  /** Tile image MIME (e.g. "image/jpeg") — also the `.dzi` `Format` (extension derived from it). */
  format: string;
  /** Base path to the tile pyramid directory (the DZI `_files` folder, no trailing slash). A tile is
   *  `{filesPath}/{level}/{col}_{row}.{ext}`. Published relative within the exhibit tree; a blob:/absolute
   *  base also works (the viewer fills the same template). */
  filesPath: string;
}

/** A structured tile-source hint an author supplies / a bake emits for a non-string source. A live slippy
 *  basemap (`xyz`) or a baked Deep Zoom pyramid (`dzi`) — both carried on `AObject.tileSource`. */
export type TileSourceDescriptor = XyzTileSource | DziTileSource;

export type TileSource =
  | { kind: "image"; url: string }
  | { kind: "iiif"; infoUrl: string }
  | XyzTileSource
  | DziTileSource;

const IMAGE_EXT_RE = /\.(jpe?g|png|webp|avif|gif|tiff?|svg)(\?.*)?$/i;

/** Fill an XYZ `{z}/{x}/{y}` template (the one place the slippy-tile URL grammar lives). */
export function fillXyzTemplate(template: string, z: number, x: number, y: number): string {
  return template
    .replace(/\{z\}/g, String(z))
    .replace(/\{x\}/g, String(x))
    .replace(/\{y\}/g, String(y));
}

/**
 * Classify an image source string. `info.json` (or a path ending in one) → external IIIF.
 * A known raster file extension → single-image source. Anything else is treated as a IIIF
 * image-service base and normalised to its `info.json`.
 */
export function resolveTileSource(source: string | TileSourceDescriptor): TileSource {
  // A structured descriptor (an xyz map) is already classified — pass it through. Only a bare string
  // needs the extension/IIIF sniffing below (DESIGN.md R1: a {z}/{x}/{y} template must be classified by
  // the explicit hint, never inferred from the string).
  if (typeof source !== "string") return source;
  // blob: / data: URLs carry the image bytes directly (e.g. an OPFS-imported file resolved to an
  // object URL) — they are NEVER a IIIF service base and have no extension to match, so classify
  // them as a direct image up front (else they'd get a bogus `/info.json` appended).
  if (/^(blob:|data:)/i.test(source)) return { kind: "image", url: source };
  // A disallowed scheme (javascript:/file:/vbscript:/…) must NEVER be normalised to a IIIF service base
  // and fetched as info.json. Degrade it to a (non-fetched) image url — OSD won't execute it or fetch it
  // as a service, so a pasted malicious source can't trigger a request (security S6).
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(source)?.[1]?.toLowerCase();
  if (scheme && scheme !== "http" && scheme !== "https") return { kind: "image", url: source };
  if (/\/info\.json(\?.*)?$/i.test(source)) return { kind: "iiif", infoUrl: source };
  if (IMAGE_EXT_RE.test(source)) return { kind: "image", url: source };
  const base = source.replace(/\/$/, "");
  return { kind: "iiif", infoUrl: `${base}/info.json` };
}

/**
 * A RENDERABLE thumbnail URL for an Object's source. A bare IIIF image-service base (e.g.
 * `https://…/iiif/2/{id}`) is NOT itself an image — fetching it returns info.json / an HTTP 500, so a
 * rail/grid `<img src>` on the bare base shows nothing (the broken-thumbnail bug). When the source
 * classifies as a IIIF service, derive a sized JPEG via the Image API: `{base}/full/{width},/0/default.jpg`.
 * A plain image file / blob: / data: URL is already renderable and passes through unchanged. The OSD
 * deep-zoom path still consumes the bare base (it needs info.json) — this is ONLY for thumbnails.
 */
export function thumbnailUrl(source: string | TileSourceDescriptor, width = 240): string {
  const t = resolveTileSource(source);
  // A map's thumbnail is its shallowest single world tile (z=minZoom, 0, 0) — one fetch, no pyramid.
  if (t.kind === "xyz") return fillXyzTemplate(t.template, t.minZoom ?? 0, 0, 0);
  // A DZI's thumbnail is its level-0 single tile (`{filesPath}/0/0_0.{ext}`) — the top of the pyramid,
  // a sub-tileSize scaled image, one fetch. Prefer the baked `thumbnail` on the object where one exists
  // (the grid path), but a bare descriptor still resolves to its smallest tile here.
  if (t.kind === "dzi") {
    const ext = t.format.split("/").pop() ?? "jpeg";
    return `${t.filesPath.replace(/\/$/, "")}/0/0_0.${ext === "jpeg" ? "jpg" : ext}`;
  }
  if (t.kind === "iiif") {
    // resolveTileSource gives us the info.json URL; the service base is that minus the trailing
    // /info.json. Derive from the RESOLVED infoUrl (source may be a descriptor here, not a string).
    const base = t.infoUrl.replace(/\/info\.json(\?.*)?$/i, "").replace(/\/$/, "");
    return `${base}/full/${width},/0/default.jpg`;
  }
  return t.url;
}

/** Recognise a pasted IIIF Image API `info.json` object (v2 or v3). */
export function isIiifImageInfo(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const ctx = (value as { "@context"?: unknown })["@context"];
  const ctxStr = Array.isArray(ctx) ? ctx.join(" ") : typeof ctx === "string" ? ctx : "";
  return /iiif\.io\/api\/image\/[23]/.test(ctxStr);
}
