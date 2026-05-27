// toCollection — Library -> IIIF Presentation 3 Collection (CONTEXT §Language: Library = Collection).
// Each Exhibit becomes a Manifest reference, in Library order, with the cover as a thumbnail.

import type { Library } from "../model/model.js";
import { IIIF_PRESENTATION_CONTEXT, langMap, type IIIFCollection, type IIIFCollectionItem } from "./presentation.js";
import { rightsProps } from "./rights.js";

export interface CollectionOptions {
  baseUrl?: string;
}

export function toCollection(library: Library, opts: CollectionOptions = {}): IIIFCollection {
  const baseUrl = opts.baseUrl ?? "";
  const items: IIIFCollectionItem[] = library.exhibits.map((e) => ({
    id: `${baseUrl}${e.slug}/manifest.json`,
    type: "Manifest",
    label: langMap(e.title),
    ...(e.cover !== undefined ? { thumbnail: [{ id: e.cover, type: "Image" as const }] } : {}),
  }));
  return {
    "@context": IIIF_PRESENTATION_CONTEXT,
    id: `${baseUrl}collection.json`,
    type: "Collection",
    label: langMap(library.title ?? "Library"),
    ...(library.summary !== undefined ? { summary: langMap(library.summary) } : {}),
    ...rightsProps(library),
    items,
  };
}
