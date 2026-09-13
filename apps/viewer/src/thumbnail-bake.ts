import sharp from "sharp";
import type { Library } from "@render/core";

const THUMBNAIL_EDGE = 640;
const CURATED_THUMBNAIL_EXHIBITS = new Set(["screenshots"]);

type AssetLookup = (slug: string, name: string) => Promise<ArrayBuffer | null>;

export interface PreparedThumbnails {
  library: Library;
  getThumbnail: AssetLookup;
  count: number;
  bytes: number;
}

/** Encode the small, same-extension PNG used by the published gallery and exhibit overview. */
export async function bakePngThumbnail(source: ArrayBuffer): Promise<ArrayBuffer> {
  const output = await sharp(Buffer.from(source))
    .resize({ width: THUMBNAIL_EDGE, height: THUMBNAIL_EDGE, fit: "inside", withoutEnlargement: true })
    .png({ palette: true, quality: 90, compressionLevel: 9, effort: 10 })
    .toBuffer();
  return Uint8Array.from(output).buffer;
}

/**
 * Add missing thumbnails to curated, locally owned raster exhibits before publication.
 *
 * The source archive and full-size published assets remain untouched. Failed encodes remain
 * thumbnail-less, which lets publishLibrary preserve its existing full-source fallback without
 * emitting a reference to bytes that do not exist.
 */
export async function prepareCuratedThumbnails(library: Library, getAsset: AssetLookup): Promise<PreparedThumbnails> {
  const thumbnails = new Map<string, ArrayBuffer>();
  let bytes = 0;

  const exhibits = await Promise.all(library.exhibits.map(async (exhibit) => {
    if (!CURATED_THUMBNAIL_EXHIBITS.has(exhibit.slug)) return exhibit;

    const objects = await Promise.all(exhibit.objects.map(async (object) => {
      if (object.thumbnail || (object.mediaType ?? "image") !== "image") return object;
      const match = /^\/assets\/([^/]+\.png)$/i.exec(object.source);
      if (!match?.[1]) return object;

      const name = match[1];
      const source = await getAsset(exhibit.slug, name);
      if (!source) return object;

      try {
        const thumbnail = await bakePngThumbnail(source);
        thumbnails.set(`${exhibit.slug}\0${name}`, thumbnail);
        bytes += thumbnail.byteLength;
        return { ...object, thumbnail: `/assets-thumb/${name}` };
      } catch {
        return object;
      }
    }));
    return { ...exhibit, objects };
  }));

  return {
    library: { ...library, exhibits },
    getThumbnail: async (slug, name) => thumbnails.get(`${slug}\0${name}`) ?? null,
    count: thumbnails.size,
    bytes,
  };
}
