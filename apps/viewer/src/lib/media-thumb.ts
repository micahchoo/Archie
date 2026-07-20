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
 * The single best renderable `<img src>` (the chain's head) — for call sites with no error-driven
 * stepping (the plate itself uses thumbSrcChain).
 */
export function thumbSrc(object: Pick<AObject, "thumbnail" | "tileSource" | "source">, width = 480): string {
  return thumbSrcChain(object, width)[0]!;
}
