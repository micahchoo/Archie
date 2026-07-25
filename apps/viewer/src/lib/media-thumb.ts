// The MediaThumbnail plate decision, extracted pure so the node-env vitest can pin it (the viewer has
// no DOM harness — see narrative-escape.test.ts's HARNESS GAP note).
//
// The map motif keys on the object BEING a map, not on `tileSource` presence. The discriminator is the
// TileSourceDescriptor union in @render/core iiif/resolve.ts: `kind: "xyz"` is a slippy-map basemap (the
// geo extension — genuinely a map), while `kind: "dzi"` is "a baked, finite pyramid of a single source
// image, not a world projection" (resolve.ts's own contrast) that publish-time tile baking
// (publish/site.ts tileObject / tileRemote) stamps onto ordinary IMAGE-medium objects. Keying on bare
// presence made every tiled photo render the graticule+pin Map plate and ignore its raster thumbnail.
import { thumbnailCandidates, type AObject, type MediaType } from "@render/core";

export type ThumbKind = MediaType | "map";

/** Which designed plate an object gets: map ⟺ an xyz (geo) tileSource; otherwise its mediaType. */
export function thumbKind(object: Pick<AObject, "tileSource" | "mediaType">): ThumbKind {
  if (object.tileSource?.kind === "xyz") return "map";
  return object.mediaType ?? "image";
}

/**
 * The ordered `<img src>` candidates for an image-kind plate — the shared render-core chain
 * (thumbnail-mitigations gap 2): baked thumbnail first, then the derived forms (a DZI's level-0 tile;
 * a IIIF service's sized JPEG → level-0 static full → raw source when the extensionless default may
 * have misclassified a plain image). The plate steps down one candidate per `<img onerror>` and shows
 * the honest "couldn't load" card only past the end.
 */
export function thumbSrcChain(object: Pick<AObject, "thumbnail" | "tileSource" | "source">, width = 480): string[] {
  return thumbnailCandidates(object, width);
}

/**
 * A poster image for a VIDEO object, or null if none was baked.
 *
 * Exists because `<video preload="metadata">` is not a byte guarantee. Measured on the built viewer
 * (scripts/perf/readerrun.mjs): one video card pulled **1648 KB for a file advertised as 1 MB**,
 * making video 82% of the page's arrival bytes on `/sampler` — against 148 KB of JS. The cost is per
 * card, so a twenty-video exhibit pays it twenty times before the reader clicks anything.
 *
 * Only an AUTHORED/baked thumbnail counts. `thumbnailCandidates` also derives image-ish URLs from
 * `source` and `tileSource`, which for a video object would point `<img>` at the .mp4 itself — a
 * guaranteed broken image AND the very download this avoids. `source` is in the parameter type only
 * to document that it is deliberately IGNORED. A video with no baked poster gets the
 * designed plate + ▶ badge instead, which is already what the audio and error branches render.
 */
export function videoPosterSrc(object: Pick<AObject, "thumbnail" | "source">): string | null {
  return object.thumbnail ?? null;
}

/**
 * The single best renderable `<img src>` (the chain's head) — for call sites with no error-driven
 * stepping (the plate itself uses thumbSrcChain).
 */
export function thumbSrc(object: Pick<AObject, "thumbnail" | "tileSource" | "source">, width = 480): string {
  return thumbSrcChain(object, width)[0]!;
}
