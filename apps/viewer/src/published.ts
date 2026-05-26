// Read an exhibit from the published static tree over HTTP — the REAL deployed-consumer path.
// `scripts/gen-published.mts` (vite-node) writes the tree to public/published/; here we FETCH it:
// {slug}/manifest.json gives the objects (+ title via IIIF label); each {slug}/canvas/{objId}/
// annotations.json gives that object's published notes. No in-app publish — this is exactly what a
// third party hitting the GH-Pages site does. (Swap the base for the deployed origin and it's live.)
import { objectsFromManifest, sectionsFromManifest, type AObject, type IIIFManifest, type Section, type W3CAnnotation } from "@render/core";

const PUBLISHED = "/published";

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${PUBLISHED}/${path}`);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

export interface PublishedExhibit {
  slug: string;
  title: string;
  summary?: string;
  objects: AObject[];
  /** Published notes per object id (the per-canvas heads-page items). */
  annotationsByObject: Record<string, W3CAnnotation[]>;
  /** Narrative spine recovered from the manifest's Ranges (empty for non-narrative exhibits). */
  sections: Section[];
}

export async function loadPublishedExhibit(slug: string): Promise<PublishedExhibit> {
  const manifest = await fetchJson<IIIFManifest>(`${slug}/manifest.json`);
  const objects = objectsFromManifest(manifest);

  const annotationsByObject: Record<string, W3CAnnotation[]> = {};
  for (const obj of objects) {
    const page = await fetchJson<{ items?: W3CAnnotation[] }>(`${slug}/canvas/${obj.id}/annotations.json`);
    annotationsByObject[obj.id] = page.items ?? [];
  }

  const title = manifest.label?.none?.[0] ?? slug;
  const summary = (manifest as { summary?: { none?: string[] } }).summary?.none?.[0];
  const sections = sectionsFromManifest(manifest); // round-trip the narrative spine from the published Ranges
  return { slug, title, objects, annotationsByObject, sections, ...(summary !== undefined ? { summary } : {}) };
}
