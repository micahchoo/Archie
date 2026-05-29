// THE DOMINO (ADR-0010 debt paid down): one source-parameterized reader for the published exhibit
// tree. site.ts (preview, fs), portable.ts (fs + blob rewrite), and the viewer's HTTP reader were
// three byte-identical copies of this traversal. They now adapt over `readExhibitTree`, varying on
// exactly two axes: the byte SOURCE (JsonSource — fs-walk vs HTTP fetch) and an optional fs-coupled
// note TRANSFORM (identity vs blob-rewrite). Behavior-preserving: the read sequence is unchanged.

import { objectsFromManifest, canvasIdMap, sectionsFromManifest } from "../iiif/manifest.js";
import { rightsFromIIIF } from "../iiif/rights.js";
import type { IIIFManifest } from "../iiif/presentation.js";
import type { Filesystem } from "../fs/seam.js";
import type { AObject, Reading } from "../model/model.js";
import type { W3CAnnotation } from "../wadm/types.js";
import type { PortableExhibit } from "./portable.js";

/** The narrow read-only byte seam both real sources satisfy — fs-walk over an opened Filesystem, or
 *  HTTP `fetch` over `${BASE}/published`. Tree-relative paths (`"voynich/manifest.json"`). NOT a
 *  Filesystem backend: no write/listing/directory semantics HTTP can't honour. */
export interface JsonSource {
  /** Read + parse JSON; throws on a missing/unreadable file (manifest, base page). */
  get<T>(path: string): Promise<T>;
  /** Read + parse JSON; `null` on absence (readings.json / per-reading pages on a base-only exhibit). */
  getOptional<T>(path: string): Promise<T | null>;
}

/** An fs-coupled rewrite hook applied per object/note (e.g. portable's blob-URL minting, which reads
 *  asset bytes outside the JsonSource). Identity when omitted. NOT pure `(notes)→(notes)`. */
export interface NoteTransform {
  object(o: AObject): Promise<AObject>;
  note(n: W3CAnnotation): Promise<W3CAnnotation>;
}

/** A JsonSource that walks an opened `Filesystem` (Memory/Zip/FSA). Folds the per-reader `readJson`
 *  copies (site/portable). */
export function fsJsonSource(fs: Filesystem): JsonSource {
  const read = async <T>(path: string): Promise<T> => {
    const parts = path.split("/");
    let dir = await fs.root();
    for (let i = 0; i < parts.length - 1; i++) dir = await dir.getDirectory(parts[i]!);
    const file = await dir.getFile(parts[parts.length - 1]!);
    return JSON.parse(new TextDecoder().decode(await file.readable())) as T;
  };
  return {
    get: read,
    getOptional: async <T>(path: string): Promise<T | null> => {
      try {
        return await read<T>(path);
      } catch {
        return null;
      }
    },
  };
}

/**
 * Read ONE published exhibit tree from `src`. The shared traversal: manifest → objects → canvas IRIs →
 * sections → readings registry → per-object base page + per-reading pages → exhibit rights. An optional
 * `transform` rewrites objects/notes (portable's blob URLs); identity otherwise.
 */
export async function readExhibitTree(src: JsonSource, slug: string, transform?: NoteTransform): Promise<PortableExhibit> {
  const manifest = await src.get<IIIFManifest>(`${slug}/manifest.json`);
  const objects0 = objectsFromManifest(manifest);
  // Objects first (portable mints blob URLs in object order, then per-object note order — preserved).
  const objects = transform ? await Promise.all(objects0.map((o) => transform.object(o))) : objects0;
  const canvasIdByObject = canvasIdMap(manifest);
  const sections = sectionsFromManifest(manifest);
  const readings = (await src.getOptional<Reading[]>(`${slug}/readings.json`)) ?? [];

  const annotationsByObject: Record<string, W3CAnnotation[]> = {};
  const readingAnnotationsByObject: Record<string, Record<string, W3CAnnotation[]>> = {};
  for (const obj of objects0) {
    const base = await src.get<{ items?: W3CAnnotation[] }>(`${slug}/canvas/${obj.id}/annotations.json`);
    const baseItems = base.items ?? [];
    annotationsByObject[obj.id] = transform ? await Promise.all(baseItems.map((n) => transform.note(n))) : baseItems;
    if (readings.length > 0) {
      const perReading: Record<string, W3CAnnotation[]> = {};
      for (const r of readings) {
        const page = await src.getOptional<{ items?: W3CAnnotation[] }>(`${slug}/canvas/${obj.id}/annotations-${r.id}.json`);
        const items = page?.items ?? [];
        perReading[r.id] = transform ? await Promise.all(items.map((n) => transform.note(n))) : items;
      }
      readingAnnotationsByObject[obj.id] = perReading;
    }
  }

  const title = manifest.label?.none?.[0] ?? slug;
  const summary = (manifest as { summary?: { none?: string[] } }).summary?.none?.[0];
  return { slug, title, objects, annotationsByObject, readings, readingAnnotationsByObject, sections, canvasIdByObject, ...rightsFromIIIF(manifest), ...(summary !== undefined ? { summary } : {}) };
}
