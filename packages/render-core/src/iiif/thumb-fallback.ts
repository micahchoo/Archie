// The grid-thumbnail CANDIDATE CHAIN (docs/thumbnail-mitigations.md gap 2). A remote/IIIF object is
// never baked, so the grids derive a thumbnail at render time — and the blind sized upsize
// (`{base}/full/{w},/0/default.jpg`) 404s on IIIF level-0 hosts (static tiles) and on non-IIIF
// extensionless URLs that resolveTileSource classifies as a service by default. Instead of probing
// (og-image.ts's HEAD idiom — right for build-time unfurls, an extra request per plate at render
// time), the grids render a real `<img>` which already fires `onerror`: this module derives the
// ORDERED list of URLs to try, and the consumer steps down the chain on each error — zero extra
// requests on the happy path, no async derive. ONE definition (ADR-0013 anti-drift): apps/viewer's
// MediaThumbnail (via lib/media-thumb.ts) and the <archie-viewer> embed (element.ts objectCoverHtml /
// #wireCoverFallbacks) both consume THIS chain; a new grid surface must too, never a hand-rolled copy.
import { resolveTileSource, thumbnailUrl, type TileSourceDescriptor } from "./resolve.js";

/** The object fields the chain derives from — structural (a `Pick` of AObject) so this stays below
 *  model.ts in the layer graph (model.ts already imports resolve.ts for TileSourceDescriptor). */
export interface ThumbnailSource {
  /** A baked display thumbnail, when one exists (local imports; remote/IIIF objects carry none). */
  thumbnail?: string | undefined;
  /** Explicit tile-source hint (xyz basemap / baked dzi pyramid) — classified ahead of `source`. */
  tileSource?: TileSourceDescriptor | undefined;
  /** The raw source string (image URL / IIIF base / info.json). */
  source: string;
}

/**
 * The ordered thumbnail candidates for an object's grid plate. The consumer renders candidates[0]
 * and advances one step per `<img onerror>`; past the end it shows its own placeholder/motif (the
 * honest "couldn't load" card / label-text cover — NEVER a broken-image icon).
 *
 * Order:
 *   1. the baked `thumbnail` (already renderable; a dead baked URL still degrades onward);
 *   2. non-IIIF sources (plain raster / blob: / data: / xyz tile / dzi level-0 tile) have exactly one
 *      derived form — `thumbnailUrl`'s answer — so the chain ends there;
 *   3. a IIIF service: the sized `{base}/full/{width},/0/default.jpg` (level 1/2), then the static
 *      `{base}/full/full/0/default.jpg` a level-0 host pre-generates;
 *   4. when the source only classified as IIIF by the extensionless DEFAULT (not an explicit
 *      `info.json`), it may be a misclassified plain image — the raw source is the last candidate.
 */
export function thumbnailCandidates(object: ThumbnailSource, width = 480): string[] {
  const out: string[] = [];
  const push = (url: string): void => {
    if (!out.includes(url)) out.push(url);
  };
  if (object.thumbnail) push(object.thumbnail);

  const src = object.tileSource ?? object.source;
  const t = resolveTileSource(src);
  if (t.kind !== "iiif") {
    // image / xyz / dzi: thumbnailUrl already yields the one renderable form.
    push(thumbnailUrl(src, width));
    return out;
  }

  const base = t.infoUrl.replace(/\/info\.json(\?.*)?$/i, "").replace(/\/$/, "");
  push(`${base}/full/${width},/0/default.jpg`);
  push(`${base}/full/full/0/default.jpg`);
  // Explicit `…/info.json` is genuinely IIIF — the raw-source rung applies only to the
  // extensionless-string default classification (and info.json itself is not an <img> source).
  if (typeof src === "string" && !/\/info\.json(\?.*)?$/i.test(src)) push(src);
  return out;
}
