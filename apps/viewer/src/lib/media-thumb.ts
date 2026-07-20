// The MediaThumbnail plate decision, extracted pure so the node-env vitest can pin it (the viewer has
// no DOM harness — see narrative-escape.test.ts's HARNESS GAP note).
//
// The map motif keys on the object BEING a map, not on `tileSource` presence. The discriminator is the
// TileSourceDescriptor union in @render/core iiif/resolve.ts: `kind: "xyz"` is a slippy-map basemap (the
// geo extension — genuinely a map), while `kind: "dzi"` is "a baked, finite pyramid of a single source
// image, not a world projection" (resolve.ts's own contrast) that publish-time tile baking
// (publish/site.ts tileObject / tileRemote) stamps onto ordinary IMAGE-medium objects. Keying on bare
// presence made every tiled photo render the graticule+pin Map plate and ignore its raster thumbnail.
import { thumbnailUrl, type AObject, type MediaType } from "@render/core";

export type ThumbKind = MediaType | "map";

/** Which designed plate an object gets: map ⟺ an xyz (geo) tileSource; otherwise its mediaType. */
export function thumbKind(object: Pick<AObject, "tileSource" | "mediaType">): ThumbKind {
  if (object.tileSource?.kind === "xyz") return "map";
  return object.mediaType ?? "image";
}

/**
 * The renderable `<img src>` for an image-kind plate. Prefer the baked display thumbnail; else derive
 * via thumbnailUrl from the tileSource descriptor when one exists (a DZI resolves to its level-0 tile
 * `{filesPath}/0/0_0.{ext}` — resolve.ts documents exactly this grid-path preference), falling back to
 * classifying the raw source string.
 */
export function thumbSrc(object: Pick<AObject, "thumbnail" | "tileSource" | "source">, width = 480): string {
  return object.thumbnail ?? thumbnailUrl(object.tileSource ?? object.source, width);
}
