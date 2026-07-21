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
import { NotAnArchieLibraryError, type ArchieMarker } from "./marker.js";
import { SCHEMA_VERSION } from "../migrate/migrate.js";

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

// FailedReadError (absent-vs-failed, Issue 23): the ONE definition lives layer-zero in ../errors.ts
// (fs/http.ts throws it too; fs/ must not import from publish/) — re-exported here because this
// reader is its documented surface.
import { FailedReadError } from "../errors.js";
export { FailedReadError };
// Absent-vs-failed classification — ONE definition, in the seam layer (Archie-623e Phase 2 lifted it
// there so asset-store.ts can share it once it re-points off raw OPFS DOMExceptions onto the seam).
import { isNotFound } from "../fs/seam.js";

/** A JsonSource that walks an opened `Filesystem` (Memory/Zip/FSA). Folds the per-reader `readJson`
 *  copies (site/portable). `getOptional` distinguishes absent (missing file → null) from failed (a
 *  present-but-torn file, or a read fault → throws `FailedReadError`) — Issue 23's absent-vs-failed rule. */
export function fsJsonSource(fs: Filesystem): JsonSource {
  const readBytes = async (path: string): Promise<ArrayBuffer> => {
    const parts = path.split("/");
    let dir = await fs.root();
    for (let i = 0; i < parts.length - 1; i++) dir = await dir.getDirectory(parts[i]!);
    const file = await dir.getFile(parts[parts.length - 1]!);
    return file.readable();
  };
  const read = async <T>(path: string): Promise<T> =>
    JSON.parse(new TextDecoder().decode(await readBytes(path))) as T;
  return {
    get: read,
    getOptional: async <T>(path: string): Promise<T | null> => {
      let bytes: ArrayBuffer;
      try {
        bytes = await readBytes(path);
      } catch (e) {
        if (isNotFound(e)) return null; // absent → null
        if (e instanceof FailedReadError) throw e; // already classified by the backend (e.g. HTTP) — keep its path/status
        throw new FailedReadError(path, e); // a read fault that is NOT "missing" → failed
      }
      try {
        return JSON.parse(new TextDecoder().decode(bytes)) as T;
      } catch (e) {
        throw new FailedReadError(path, e); // present-but-torn JSON → failed, NOT silently absent
      }
    },
  };
}

/**
 * ADR-0020 marker gate over an HTTP-shaped published TREE (a `JsonSource`) — the read-side twin of
 * `validateArchieMarker` (which takes an opened `Filesystem` for the zip path). ONE implementation, so the
 * embed's tree open (`load.ts`) and the hosted apps/viewer (`published.ts`) apply the SAME policy instead
 * of two hand-rolled copies of the marker check. (The zip seam in `open.ts` stays separate by design — see
 * `.claude/rules/untrusted-archive-open-seam.md`; this is ADR-0020's deliberately-separate tree validator.)
 *
 * **LENIENT-ON-ABSENT, present-must-be-current** (ADR-0020):
 *   • `archie.json` PRESENT → MUST be a current-schema Archie marker (`format === "archie-library"` and
 *     `version === SCHEMA_VERSION`); a forged/foreign/wrong-version marker is rejected cleanly.
 *   • `archie.json` ABSENT (404) → accept and return `null`; the caller reads `exhibits.json` next, whose
 *     parse IS the structural acceptance signal (some static hosts strip dotted files, so a tree need not
 *     ship a marker).
 *   • A FAILED read of the marker (5xx / torn) is a transient hiccup on a SANITY gate (ADR-0020: "the marker
 *     is a sanity gate, not the security boundary") — log and proceed lenient rather than hard-block a
 *     possibly-fine library on a marker fetch failure.
 *
 * Returns the parsed marker (or `null` when absent) so a caller can reuse it — e.g. read its `generation`
 * (STALENESS) — without a second fetch.
 */
export async function assertArchieTreeMarker(src: JsonSource): Promise<Partial<ArchieMarker> | null> {
  let marker: Partial<ArchieMarker> | null;
  try {
    marker = await src.getOptional<Partial<ArchieMarker>>("archie.json");
  } catch (e) {
    if (e instanceof FailedReadError) {
      console.warn("assertArchieTreeMarker: archie.json couldn't be read (transient) — skipping the version gate", e);
      return null;
    }
    throw e;
  }
  if (marker) {
    if (marker.format !== "archie-library") {
      throw new NotAnArchieLibraryError(
        "This file isn't an Archie library. Choose a published Archie tree or .archie.zip.",
      );
    }
    if (marker.version !== SCHEMA_VERSION) {
      throw new NotAnArchieLibraryError(
        `This library was made with a different version of Archie (schema v${String(marker.version)}, this viewer reads v${SCHEMA_VERSION}). Re-publish it from a current Archie.`,
      );
    }
  }
  return marker; // null = absent (lenient); a present marker is now validated
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

  // Issue 23: an OPTIONAL authored layer that FAILED to load (5xx / torn JSON — a `FailedReadError`, not a
  // genuine 404-absent) must NOT be silently rendered as "no data". Each optional read is a plain
  // `await src.getOptional` wrapped in try/catch; a `FailedReadError` flips `incomplete` and degrades THAT
  // one layer to empty (the exhibit still renders, flagged partial), replacing the two prior wrong behaviors
  // — silent-swallow (readings/per-reading) or abort-the-whole-exhibit (the base sidecar's `src.get`). A
  // genuine absence stays `null` → empty, no flag. `onOptionalFail` is intentionally SYNCHRONOUS (no extra
  // await/microtask) so the read's timing is unchanged; a non-read error (a real bug) still propagates.
  let incomplete = false;
  const onOptionalFail = (path: string, e: unknown): void => {
    if (!(e instanceof FailedReadError)) throw e;
    incomplete = true;
    console.warn(`readExhibitTree(${slug}): an authored layer failed to load — rendering partial (${path})`, e);
  };

  let readings: Reading[] = [];
  try {
    readings = (await src.getOptional<Reading[]>(`${slug}/readings.json`)) ?? [];
  } catch (e) {
    onOptionalFail(`${slug}/readings.json`, e);
  }

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
        // Base sidecar fallback: was `src.get` (a 404 aborted the WHOLE exhibit — Issue 23). Now optional:
        // an absent sidecar → this object simply has no base notes; a FAILED read → partial flag, not abort.
        let baseItems = inline.byObject[obj.id];
        if (baseItems === undefined) {
          const p = `${slug}/canvas/${obj.id}/annotations.json`;
          try {
            baseItems = (await src.getOptional<{ items?: W3CAnnotation[] }>(p))?.items ?? [];
          } catch (e) {
            onOptionalFail(p, e);
            baseItems = [];
          }
        }
        annotationsByObject[obj.id] = transform ? await Promise.all(baseItems.map((n) => transform.note(n))) : baseItems;
        if (readings.length > 0) {
          const inlinePer = inline.readingByObject[obj.id] ?? {};
          const perReading: Record<string, W3CAnnotation[]> = {};
          await Promise.all(
            readings.map(async (r) => {
              let items = inlinePer[r.id];
              if (items === undefined) {
                const p = `${slug}/canvas/${obj.id}/annotations-${r.id}.json`;
                try {
                  items = (await src.getOptional<{ items?: W3CAnnotation[] }>(p))?.items ?? [];
                } catch (e) {
                  onOptionalFail(p, e);
                  items = [];
                }
              }
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
  return { slug, title, objects, annotationsByObject, readings, readingAnnotationsByObject, sections, canvasIdByObject, ...rightsFromIIIF(manifest), ...(summary !== undefined ? { summary } : {}), ...(incomplete ? { incomplete: true } : {}) };
}
