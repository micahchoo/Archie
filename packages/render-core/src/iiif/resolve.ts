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
  if (/\/info\.json(\?.*)?$/i.test(source)) return { kind: "iiif", infoUrl: source };
  if (IMAGE_EXT_RE.test(source)) return { kind: "image", url: source };
  const base = source.replace(/\/$/, "");
  return { kind: "iiif", infoUrl: `${base}/info.json` };
}

/** Recognise a pasted IIIF Image API `info.json` object (v2 or v3). */
export function isIiifImageInfo(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const ctx = (value as { "@context"?: unknown })["@context"];
  const ctxStr = Array.isArray(ctx) ? ctx.join(" ") : typeof ctx === "string" ? ctx : "";
  return /iiif\.io\/api\/image\/[23]/.test(ctxStr);
}
