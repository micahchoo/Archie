// Read an exhibit from the published static tree over HTTP — the REAL deployed-consumer path.
// `scripts/gen-published.mts` (vite-node) writes the tree to public/published/; here we FETCH it:
// {slug}/manifest.json gives the objects (+ title via IIIF label); each {slug}/canvas/{objId}/
// annotations.json gives that object's published notes. No in-app publish — this is exactly what a
// third party hitting the GH-Pages site does. (Swap the base for the deployed origin and it's live.)
import { objectsFromManifest, canvasIdMap, sectionsFromManifest, rightsFromIIIF, type AObject, type ExhibitsJson, type IIIFManifest, type Reading, type RightsFields, type Section, type W3CAnnotation } from "@render/core";

const PUBLISHED = `${import.meta.env.BASE_URL}published`;

/** The Library Gallery source — `exhibits.json` (CONTEXT §Gallery). What the shell lists. */
export async function loadGallery(): Promise<ExhibitsJson> {
  return fetchJson<ExhibitsJson>("exhibits.json");
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${PUBLISHED}/${path}`);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** Fetch a file that may not exist (e.g. readings.json on a base-only exhibit) → null on 404. */
async function fetchJsonOptional<T>(path: string): Promise<T | null> {
  const res = await fetch(`${PUBLISHED}/${path}`);
  if (!res.ok) return null;
  return (await res.json()) as T;
}

export interface PublishedExhibit extends RightsFields {
  slug: string;
  title: string;
  summary?: string;
  objects: AObject[];
  /** BASE notes per object id (the no-reading heads-page items; always visible — Q16). */
  annotationsByObject: Record<string, W3CAnnotation[]>;
  /** The exhibit's Readings registry (ADR-0007), empty for a base-only exhibit. Drives the legend. */
  readings: Reading[];
  /** Per object id → per reading id → that reading's notes (the per-reading AnnotationPages). */
  readingAnnotationsByObject: Record<string, Record<string, W3CAnnotation[]>>;
  /** Narrative spine recovered from the manifest's Ranges (empty for non-narrative exhibits). */
  sections: Section[];
  /** Object id → full canvas IRI from the manifest (the published source of truth; SNAG fix). */
  canvasIdByObject: Record<string, string>;
}

export async function loadPublishedExhibit(slug: string): Promise<PublishedExhibit> {
  const manifest = await fetchJson<IIIFManifest>(`${slug}/manifest.json`);
  const objects = objectsFromManifest(manifest);

  // The Readings registry (ADR-0007) — absent on a base-only exhibit.
  const readings = (await fetchJsonOptional<Reading[]>(`${slug}/readings.json`)) ?? [];

  const annotationsByObject: Record<string, W3CAnnotation[]> = {};
  const readingAnnotationsByObject: Record<string, Record<string, W3CAnnotation[]>> = {};
  for (const obj of objects) {
    const base = await fetchJson<{ items?: W3CAnnotation[] }>(`${slug}/canvas/${obj.id}/annotations.json`);
    annotationsByObject[obj.id] = base.items ?? [];
    if (readings.length > 0) {
      readingAnnotationsByObject[obj.id] = {};
      for (const r of readings) {
        const page = await fetchJsonOptional<{ items?: W3CAnnotation[] }>(`${slug}/canvas/${obj.id}/annotations-${r.id}.json`);
        readingAnnotationsByObject[obj.id][r.id] = page?.items ?? [];
      }
    }
  }

  const title = manifest.label?.none?.[0] ?? slug;
  const summary = (manifest as { summary?: { none?: string[] } }).summary?.none?.[0];
  const sections = sectionsFromManifest(manifest); // round-trip the narrative spine from the published Ranges
  const canvasIdByObject = canvasIdMap(manifest); // canvas IRIs as baked at publish (not a fixed BASE)
  return { slug, title, objects, annotationsByObject, readings, readingAnnotationsByObject, sections, canvasIdByObject, ...rightsFromIIIF(manifest), ...(summary !== undefined ? { summary } : {}) };
}
