// IIIF resolution (ADR-0004 / Q-4). Pure classification of an Object's image source into a
// tile-source descriptor. v1: a plain image URL -> OSD type:'image' single responsive JPEG;
// an external IIIF info.json -> consume the institutional image server. NO in-browser libvips
// tiling (ADR-0004 — do not re-litigate). The OSD tile-source object is built in @render/mount.

export type TileSource =
  | { kind: "image"; url: string }
  | { kind: "iiif"; infoUrl: string };

const IMAGE_EXT_RE = /\.(jpe?g|png|webp|avif|gif|tiff?|svg)(\?.*)?$/i;

/**
 * Classify an image source string. `info.json` (or a path ending in one) → external IIIF.
 * A known raster file extension → single-image source. Anything else is treated as a IIIF
 * image-service base and normalised to its `info.json`.
 */
export function resolveTileSource(source: string): TileSource {
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
export function thumbnailUrl(source: string, width = 240): string {
  const t = resolveTileSource(source);
  if (t.kind === "iiif") {
    // resolveTileSource gives us the info.json URL; the service base is that minus the trailing
    // /info.json (or the source itself if it already ended in a slash/base). Derive from the source.
    const base = source.replace(/\/info\.json(\?.*)?$/i, "").replace(/\/$/, "");
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
