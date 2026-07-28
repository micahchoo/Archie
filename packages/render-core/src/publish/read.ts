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
import { TREE_MIGRATIONS, treeMigrationsSince, migrateTreeDoc, migrationGapMessage } from "../migrate/tree.js";

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
 * Decorate a `JsonSource` so every document it hands back is brought forward from `from` to the current
 * `SCHEMA_VERSION` (Archie-69f9). This is where tree migration actually happens: the tree on disk is
 * never rewritten — it may be a static host the reader cannot write to at all — so an older library
 * opens by being migrated in memory, per read.
 *
 * `from >= SCHEMA_VERSION` (the common case, and the only case today) returns `src` UNCHANGED, so the
 * normal path pays literally nothing: no wrapper, no per-read branch. A caller must have already
 * established that the gap is coverable — `assertArchieTreeMarker` / `validateArchieMarker` refuse
 * otherwise — hence the throw here rather than a silent identity: reaching this with an uncoverable gap
 * means a gate was bypassed, and that is a bug, not a library problem.
 */
export function migratingJsonSource(src: JsonSource, from: number, migrations = TREE_MIGRATIONS, target: number = SCHEMA_VERSION): JsonSource {
  if (from >= target) return src;
  const resolved = treeMigrationsSince(from, target, migrations);
  if (!resolved.ok) {
    throw new Error(
      `migratingJsonSource: no migration path from v${from} to v${target} (${resolved.gap.reason}) — ` +
        "the marker gate should have refused this tree before it got here",
    );
  }
  const chain = resolved.migrations;
  if (chain.length === 0) return src;
  return {
    get: async <T>(path: string): Promise<T> => migrateTreeDoc(await src.get<T>(path), path, chain) as T,
    getOptional: async <T>(path: string): Promise<T | null> => {
      const doc = await src.getOptional<T>(path);
      // An ABSENT document stays absent — a migration must never invent one. Issue 23's
      // absent-vs-failed distinction is upstream of this and survives it untouched.
      return doc === null ? null : (migrateTreeDoc(doc, path, chain) as T);
    },
  };
}

/**
 * The one call a reader makes instead of `fsJsonSource(fs)` when the tree may be OLDER than this
 * reader (Archie-69f9): read the marker's version, then decorate. Deliberately a helper rather than a
 * `from: number` threaded through `openArchieLibrary` → caller → source, because that parameter would
 * have to cross three packages and every call site would have to be right about it; here the tree
 * carries its own version and one function reads it.
 *
 * Cheap: one extra `archie.json` read, and only ever on the open path. Absent or malformed marker →
 * `SCHEMA_VERSION`, i.e. no migration — matching the gates' lenient-on-absent rule (a pre-marker tree
 * predates versioning, so there is no version to migrate FROM, and guessing v0 would run it through a
 * chain written for trees that actually declared v0).
 */
export async function migratedFsJsonSource(fs: Filesystem, migrations = TREE_MIGRATIONS): Promise<JsonSource> {
  const src = fsJsonSource(fs);
  const marker = await src.getOptional<Partial<ArchieMarker>>("archie.json").catch(() => null);
  const from = typeof marker?.version === "number" && Number.isFinite(marker.version) ? marker.version : SCHEMA_VERSION;
  if (from >= SCHEMA_VERSION) return src;
  // An UNCOVERABLE gap here is a real library the reader cannot open, NOT a bypassed gate — because
  // several readers on this seam legitimately run ungated: `loadPortableGallery` and
  // `readPublishedExhibit` are called on a tree whose marker was checked elsewhere (openArchieLibrary)
  // or, for Studio's own preview, never needed checking. So raise the SAME friendly error the gate
  // would have raised, not `migratingJsonSource`'s internal invariant throw.
  //
  // (Found by the wiring test rather than by reading the code: routing an ungated reader through the
  // gate-adjacent primitive surfaced "the marker gate should have refused this tree before it got
  // here" — a sentence about our own bug — where a reader deserves "re-publish it from a current
  // Archie". The two layers need different failure modes and now have them.)
  const resolved = treeMigrationsSince(from, SCHEMA_VERSION, migrations);
  if (!resolved.ok) throw new NotAnArchieLibraryError(migrationGapMessage(from, resolved.gap));
  return migratingJsonSource(src, from, migrations);
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
 * (STALENESS) — without a second fetch. **A caller that got a marker with `version < SCHEMA_VERSION`
 * MUST read through `migratingJsonSource(src, marker.version)`** (Archie-69f9); this gate accepting an
 * older tree is a promise that the migrations exist, not that the raw documents are readable as-is.
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
    if (typeof marker.version !== "number" || !Number.isFinite(marker.version)) {
      throw new NotAnArchieLibraryError(
        "This library's version marker is malformed. Re-publish it from a current Archie.",
      );
    }
    if (marker.version > SCHEMA_VERSION) {
      // NEWER tree, older reader — the only direction ADR-0020:53 sanctions as a refusal, and nothing
      // the author can do to the FILE helps. Advice must be about the READER.
      throw new NotAnArchieLibraryError(
        `This library was made with a newer version of Archie (schema v${marker.version}, this viewer reads v${SCHEMA_VERSION}). Update Archie to open it.`,
      );
    }
    if (marker.version < SCHEMA_VERSION) {
      // OLDER tree — accepted iff the registry can actually carry it forward (Archie-69f9). The caller
      // wraps its source with `migratingJsonSource(src, marker.version)`. Refusing on a GAP rather than
      // best-efforting is tldraw's rule (`StoreSchema.mjs:108`, "Incompatible schema?") and the reason
      // accepting an old version is safe at all: coverage is total or it is a refusal.
      const resolved = treeMigrationsSince(marker.version, SCHEMA_VERSION);
      if (!resolved.ok) {
        throw new NotAnArchieLibraryError(migrationGapMessage(marker.version, resolved.gap));
      }
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
