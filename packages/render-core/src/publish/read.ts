// THE DOMINO (ADR-0010 debt paid down): one source-parameterized reader for the published exhibit
// tree. site.ts (preview, fs), portable.ts (fs + blob rewrite), and the viewer's HTTP reader were
// three byte-identical copies of this traversal. They now adapt over `readExhibitTree`, varying on
// exactly two axes: the byte SOURCE (JsonSource — fs-walk vs HTTP fetch) and an optional fs-coupled
// note TRANSFORM (identity vs blob-rewrite). Behavior-preserving: the read sequence is unchanged.

import { objectsFromManifest, canvasIdMap, sectionsFromManifest, annotationsFromManifest } from "../iiif/manifest.js";
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
  const canvasIdByObject = canvasIdMap(manifest);
  const sections = sectionsFromManifest(manifest);
  const readings = (await src.getOptional<Reading[]>(`${slug}/readings.json`)) ?? [];

  // PERF: prefer the annotation items publishLibrary already embedded INLINE in this (just-downloaded)
  // manifest over re-fetching the standalone `annotations.json` sidecars — those fetches are pure
  // redundancy for the same bytes (presentation.ts IIIFCanvas inline note). On the hosted HTTP path
  // this collapses the whole per-object wave into the single manifest fetch; the sidecar fetch survives
  // only as a per-object fallback for a manifest that left a bare reference (external/legacy). Objects
  // and the remaining (fallback) reads are still fanned out — independent, keyed by object id — instead
  // of a per-object (and nested per-reading) waterfall. Safe under the portable transform: its only
  // shared mutable state is the `blobUrls` sink, consumed solely by revoke() — order-independent — so
  // concurrent mints need no ordering guarantee (was "mint order preserved"; it never had to be).
  const inline = annotationsFromManifest(manifest);
  const annotationsByObject: Record<string, W3CAnnotation[]> = {};
  const readingAnnotationsByObject: Record<string, Record<string, W3CAnnotation[]>> = {};
  const [objects] = await Promise.all([
    transform ? Promise.all(objects0.map((o) => transform.object(o))) : Promise.resolve(objects0),
    Promise.all(
      objects0.map(async (obj) => {
        const baseItems = inline.byObject[obj.id] ?? (await src.get<{ items?: W3CAnnotation[] }>(`${slug}/canvas/${obj.id}/annotations.json`)).items ?? [];
        annotationsByObject[obj.id] = transform ? await Promise.all(baseItems.map((n) => transform.note(n))) : baseItems;
        if (readings.length > 0) {
          const inlinePer = inline.readingByObject[obj.id] ?? {};
          const perReading: Record<string, W3CAnnotation[]> = {};
          await Promise.all(
            readings.map(async (r) => {
              const items =
                inlinePer[r.id] ?? ((await src.getOptional<{ items?: W3CAnnotation[] }>(`${slug}/canvas/${obj.id}/annotations-${r.id}.json`))?.items ?? []);
              perReading[r.id] = transform ? await Promise.all(items.map((n) => transform.note(n))) : items;
            }),
          );
          readingAnnotationsByObject[obj.id] = perReading;
        }
      }),
    ),
  ]);

  const title = manifest.label?.none?.[0] ?? slug;
  const summary = (manifest as { summary?: { none?: string[] } }).summary?.none?.[0];
  return { slug, title, objects, annotationsByObject, readings, readingAnnotationsByObject, sections, canvasIdByObject, ...rightsFromIIIF(manifest), ...(summary !== undefined ? { summary } : {}) };
}
