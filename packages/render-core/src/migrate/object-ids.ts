// Object-id migration engine (Archie-8c10) — the five-class, in-place, fs-seam rewrite that carries a
// library from the legacy exhibit-LOCAL object-id scheme (`o1`, `o2`, …; ADR-0001 drift, id-reuse bug —
// see object-id.ts) to the library-GLOBAL composed scheme (`<exhibitId>.<ordinal>`). Platform-free: it
// runs on any Filesystem backend (OPFS/FSA/Tauri/zip/memory), rewrites the library IN PLACE keeping the
// FULL history — every version, every tombstone — and the DAG shape (rev/parent/version/logicalId) exactly.
//
// EXACTLY FIVE classes of id-bearing data carry an object id; nothing else is touched (assets/thumbnails
// are name-keyed and never move):
//   1. object metas          — library.json `exhibits[].objects[].id`
//   2. annotation targets    — the canvas-IRI tail `…/canvas/<objId>` on every page (heads.json + history/*)
//   3. in-body `archie:` refs — `[text](archie:<slug>/#/o/<objId>)` inside note/annotation bodies
//   4. section object refs   — `SectionRecord.objectId` through the structure history log
//   5. pending-notes sidecar — `pending-notes.json` `{slug: [{ objectId }]}`
//
// DETERMINISTIC mapping (object-id.ts, the ONLY detector/composer): a legacy id `id` under exhibit `E`
// becomes `composeLegacyObjectId(E, id)`; a non-legacy id (already composed, or a ULID) passes through
// UNTOUCHED (`isLegacyObjectId` is the sole gate). This is what makes the whole engine idempotent —
// re-running over already-composed ids is a no-op per field.
//
// SAFETY protocol (render-core-data-integrity rule 1 — content first, marker LAST):
//   • SNAPSHOT FIRST: the pre-rewrite id-bearing tree is copied verbatim into `pre-migration/` before a
//     single byte is rewritten (kept until the USER deletes it — never by this engine). Assets are
//     excluded (never rewritten). If `pre-migration/` already exists (an interrupted prior attempt), it
//     is KEPT — the FIRST snapshot wins, never clobbered by a re-run.
//   • REWRITE the five classes in place.
//   • MARKER LAST: `id-scheme.json` (`{ idScheme: 2 }`) is the sole COMMIT POINT, written last. A torn
//     migration (crash before the marker) leaves the marker ABSENT, so the library reads as un-migrated
//     (legacy scheme) and the next run re-does it idempotently — already-rewritten composed ids pass
//     through, and the preserved snapshot is not re-taken.
//
// CORRUPT-TOLERANCE (rule 2 — corrupt ≠ absent): a page the tolerant readers would skip-and-report is
// skipped-and-reported HERE too — a JSON file that fails to parse is left byte-identical, recorded in
// `result.corrupt`, and the run CONTINUES. Corruption is never converted into silence (a rewritten-empty
// page) nor into a whole-run abort. The corrupt page also sits verbatim in the snapshot.
//
// SCOPE (Archie-8c10): the ENGINE only. The three trigger points (studio open, untrusted-archive open,
// merge ingestion) are Archie-8439 — this module wires NONE of them. `migrateLibraryObjectIds` /
// `readIdScheme` are exported from the @render/core barrel for 8439 to consume.

import { isLegacyObjectId, composeLegacyObjectId } from "../object-id.js";
import { remapArchieRefs, type LinkTarget } from "../link/link.js";
import { objIdFromCanvasId } from "../iiif/manifest.js";
import { WORKING_PROJECT } from "../publish/working.js";
import type { Filesystem, FsDirectory } from "../fs/seam.js";
import type { CarryDisposition } from "../model/carry.js";

/** The legacy exhibit-local object-id scheme — the state of a library with no `id-scheme.json` marker. */
export const LEGACY_ID_SCHEME = 1;
/** The library-global composed object-id scheme this engine migrates TO. */
export const CURRENT_ID_SCHEME = 2;
/** The commit-point marker file (written LAST): its `idScheme` field records the store's scheme. */
export const ID_SCHEME_MARKER_FILE = "id-scheme.json";
/** The verbatim pre-migration snapshot directory (kept until the user deletes it). */
export const PRE_MIGRATION_DIR = "pre-migration";
/** The snapshot's COMPLETION sentinel, written LAST inside `pre-migration/` — the copy's commit point.
 *  Directory existence alone is not proof of a complete multi-file copy (a crash mid-copy leaves a
 *  partial snapshot); the sentinel is. Present ⇒ a trustworthy snapshot to keep; absent ⇒ recopy. */
export const SNAPSHOT_SENTINEL_FILE = "snapshot-complete.json";

// The legacy "sample" exhibit keeps its annotations/structure at the PROJECT ROOT
// (`{project}/annotations`, `{project}/structure`) instead of `exhibits/{slug}/…` — a fixed layout fact
// mirrored from apps/studio/src/store.ts (the writer) and publish/working.ts (the reader), both of which
// hard-code the same private constant.
const SAMPLE_SLUG = "sample";
const HISTORY_DIR = "history";
const INDEX_FILE = "index.json";
const LIBRARY_FILE = "library.json";
const HEADS_FILE = "heads.json";
const PENDING_FILE = "pending-notes.json";
// Excluded from the snapshot: the snapshot dir itself (don't recurse into it), and the name-keyed asset
// trees (never rewritten — copying their bytes would just bloat the backup).
const SNAPSHOT_SKIP = new Set([PRE_MIGRATION_DIR, "assets", "assets-thumb", "assets-original"]);

const decode = (b: ArrayBuffer): string => new TextDecoder().decode(b);

export interface MigrateIdsOptions {
  /** Working-store root directory name. Default `WORKING_PROJECT`. */
  project?: string;
}

/** A JSON file the index/tree referenced but that could not be parsed — skipped and reported, never
 *  rewritten (corrupt ≠ absent, rule 2). The path is relative to the project root. */
export interface CorruptMigrationFile {
  path: string;
  reason: string;
}

/** Per-class count of id fields actually rewritten (legacy → composed). Zero across the board on a
 *  pass-through / already-composed re-run. */
export interface RewriteCounts {
  libraryObjects: number;
  /** Section `objectId`s rewritten in library.json (the DEFAULT structure home — rev-log flag OFF). */
  librarySectionObjectIds: number;
  annotationTargets: number;
  /** `archie:` object refs remapped in note bodies AND section prose (both cross-link mapped). */
  bodyLinks: number;
  /** Section `objectId`s rewritten in the flag-ON structure history log pages. */
  sectionObjectIds: number;
  pendingNotes: number;
}

export interface MigrateIdsResult {
  /** True iff this call performed the migration (scheme was legacy and a library existed); false for a
   *  pass-through (already on `CURRENT_ID_SCHEME`) or a no-store project (nothing to migrate). */
  migrated: boolean;
  fromScheme: number;
  toScheme: number;
  /** True iff this call created `pre-migration/`; false when it was already present (kept) or no migration ran. */
  snapshotCreated: boolean;
  rewrites: RewriteCounts;
  corrupt: CorruptMigrationFile[];
}

const zeroCounts = (): RewriteCounts => ({ libraryObjects: 0, librarySectionObjectIds: 0, annotationTargets: 0, bodyLinks: 0, sectionObjectIds: 0, pendingNotes: 0 });

async function writeJson(dir: FsDirectory, name: string, data: unknown): Promise<void> {
  const file = await dir.getFile(name, { create: true });
  const w = await file.writable();
  await w.write(JSON.stringify(data, null, 2));
  await w.close();
}

/** Read a project's object-id scheme from its marker. Absent OR unparseable ⇒ `LEGACY_ID_SCHEME` (a
 *  corrupt marker reads as un-migrated, so the idempotent engine simply re-runs). Exported for the
 *  Archie-8439 trigger points to gate on (`< CURRENT_ID_SCHEME` ⇒ run the engine). */
export async function readIdScheme(fs: Filesystem, opts: MigrateIdsOptions = {}): Promise<number> {
  try {
    const projectDir = await (await fs.root()).getDirectory(opts.project ?? WORKING_PROJECT);
    return await readSchemeFrom(projectDir);
  } catch {
    return LEGACY_ID_SCHEME; // no project dir at all
  }
}

async function readSchemeFrom(projectDir: FsDirectory): Promise<number> {
  try {
    const data = JSON.parse(decode(await (await projectDir.getFile(ID_SCHEME_MARKER_FILE)).readable())) as { idScheme?: unknown };
    return typeof data.idScheme === "number" ? data.idScheme : LEGACY_ID_SCHEME;
  } catch {
    return LEGACY_ID_SCHEME; // absent / unparseable
  }
}

/**
 * Migrate a working store's object ids from the legacy exhibit-local scheme to the composed global scheme,
 * IN PLACE across all five id-bearing classes, behind the snapshot-then-marker safety protocol. Idempotent:
 * a store already on `CURRENT_ID_SCHEME` is a pass-through (no snapshot, no rewrites); a torn prior run
 * re-completes without clobbering its snapshot. Returns a report of what changed. Never throws for a corrupt
 * page — it is skipped, reported, and left byte-identical.
 */
export async function migrateLibraryObjectIds(fs: Filesystem, opts: MigrateIdsOptions = {}): Promise<MigrateIdsResult> {
  const projectName = opts.project ?? WORKING_PROJECT;
  const passThrough = (fromScheme: number): MigrateIdsResult => ({
    migrated: false, fromScheme, toScheme: fromScheme, snapshotCreated: false, rewrites: zeroCounts(), corrupt: [],
  });

  let projectDir: FsDirectory;
  try {
    projectDir = await (await fs.root()).getDirectory(projectName);
  } catch {
    return passThrough(LEGACY_ID_SCHEME); // no working store here — nothing to migrate
  }

  // library.json is the source of truth for slug → exhibitId; an absent OR corrupt one means we cannot
  // build the exhibit-id map (and must not clobber), so we treat the store as nothing-to-migrate. (A
  // corrupt library.json would already read as an empty library everywhere else — the studio keeps a
  // `.corrupt` aside; we do not touch it here.)
  let libraryRaw: LibraryShape;
  try {
    libraryRaw = JSON.parse(decode(await (await projectDir.getFile(LIBRARY_FILE)).readable())) as LibraryShape;
  } catch {
    return passThrough(await readSchemeFrom(projectDir));
  }

  const fromScheme = await readSchemeFrom(projectDir);
  if (fromScheme >= CURRENT_ID_SCHEME) return passThrough(fromScheme);

  const exhibits = Array.isArray(libraryRaw.exhibits) ? libraryRaw.exhibits : [];
  const exhibitIdBySlug = new Map<string, string>();
  for (const ex of exhibits) {
    if (ex && typeof ex.slug === "string" && typeof ex.id === "string") exhibitIdBySlug.set(ex.slug, ex.id);
  }

  const counts = zeroCounts();
  const corrupt: CorruptMigrationFile[] = [];

  // The cross-link mapper (class 3): an in-body / in-prose `archie:` object ref names its TARGET exhibit
  // by SLUG, so its objectId is composed under THAT exhibit's id (not the enclosing exhibit's). A dangling
  // slug (target exhibit absent from library.json) is left unresolved — we cannot compose without its id.
  const mapCrossLink = (t: LinkTarget): LinkTarget => {
    if (t.objectId === undefined || !isLegacyObjectId(t.objectId)) return t;
    const exhibitId = exhibitIdBySlug.get(t.exhibitSlug);
    if (exhibitId === undefined) return t;
    counts.bodyLinks++;
    return { ...t, objectId: composeLegacyObjectId(exhibitId, t.objectId) };
  };

  // --- SNAPSHOT FIRST (kept if already present — first snapshot wins) --------------------------------
  const snapshotCreated = await ensureSnapshot(projectDir);

  // --- 1. object metas + sections-in-library.json (the DEFAULT structure home — the structure rev-log
  //        is flag-OFF by default, so sections live ONLY here unless the flag is on). Each section carries
  //        an `objectId` and `prose` (markdown that can embed `archie:` object refs); `start` (a media
  //        fragment) is left alone. -------------------------------------------------------------------
  let libraryChanged = false;
  for (const ex of exhibits) {
    if (!ex || typeof ex.id !== "string") continue;
    if (Array.isArray(ex.objects)) {
      for (const obj of ex.objects) {
        if (obj && typeof obj.id === "string" && isLegacyObjectId(obj.id)) {
          obj.id = composeLegacyObjectId(ex.id, obj.id);
          counts.libraryObjects++;
          libraryChanged = true;
        }
      }
    }
    if (Array.isArray(ex.sections)) {
      for (const sec of ex.sections) {
        if (!isObject(sec)) continue;
        if (typeof sec.objectId === "string" && isLegacyObjectId(sec.objectId)) {
          sec.objectId = composeLegacyObjectId(ex.id, sec.objectId);
          counts.librarySectionObjectIds++;
          libraryChanged = true;
        }
        if (typeof sec.prose === "string") {
          const next = remapArchieRefs(sec.prose, mapCrossLink); // increments counts.bodyLinks on a hit
          if (next !== sec.prose) {
            sec.prose = next;
            libraryChanged = true;
          }
        }
      }
    }
  }
  if (libraryChanged) await writeJson(projectDir, LIBRARY_FILE, libraryRaw);

  // --- 2 + 3 (annotations) & 4 (structure), per exhibit ---------------------------------------------
  for (const [slug, exhibitId] of exhibitIdBySlug) {
    const mapObjId = (id: string): string => (isLegacyObjectId(id) ? composeLegacyObjectId(exhibitId, id) : id);
    const annDir = await exhibitSubdir(projectDir, slug, "annotations");
    if (annDir) await rewriteAnnotationsDir(annDir, `exhibits/${slug}/annotations`, mapObjId, mapCrossLink, counts, corrupt);
    const structDir = await exhibitSubdir(projectDir, slug, "structure");
    if (structDir) await rewriteStructureDir(structDir, `exhibits/${slug}/structure`, exhibitId, mapCrossLink, counts, corrupt);
  }

  // --- 5. pending-notes sidecar ---------------------------------------------------------------------
  await rewritePendingNotes(projectDir, exhibitIdBySlug, counts, corrupt);

  // --- MARKER LAST (the commit point) ---------------------------------------------------------------
  await writeJson(projectDir, ID_SCHEME_MARKER_FILE, { idScheme: CURRENT_ID_SCHEME });

  return { migrated: true, fromScheme, toScheme: CURRENT_ID_SCHEME, snapshotCreated, rewrites: counts, corrupt };
}

// --- raw JSON shapes (structural — we touch only id fields, preserving every other byte incl. the DAG) --

interface LibraryShape {
  exhibits?: Array<{ id?: unknown; slug?: unknown; objects?: Array<{ id?: unknown }>; sections?: unknown[] } & Record<string, unknown>>;
}

/** The sole id-bearing field carried on a {@link LinkTarget} at the class-3 boundary. Rule-3 sentinel: a
 *  NEW object-id-bearing field on LinkTarget fails this compile until it is classified here AND handled in
 *  `mapCrossLink`. `objectId` is the migrated field; the rest pass through untouched (non-object refs and
 *  identifiers this migration does not rewrite). */
const _linkTargetIdCarry = {
  libraryId: "carry",
  exhibitSlug: "carry", // names the target exhibit — used to resolve, not rewritten
  noteLogicalId: "carry", // a ULID, not an object id
  objectId: "carry", // ← the class-3 field the migration remaps when legacy
  rangeId: "carry", // a section id, not an object id
  xywh: "carry",
} satisfies Record<keyof LinkTarget, CarryDisposition>;

/** Open `{project}/{sub}` for the sample exhibit, else `{project}/exhibits/{slug}/{sub}`. Null if the
 *  directory does not exist (this exhibit never authored that layer). */
async function exhibitSubdir(projectDir: FsDirectory, slug: string, sub: string): Promise<FsDirectory | null> {
  try {
    if (slug === SAMPLE_SLUG) return await projectDir.getDirectory(sub);
    return await (await (await projectDir.getDirectory("exhibits")).getDirectory(slug)).getDirectory(sub);
  } catch {
    return null;
  }
}

/**
 * Read → transform → write one JSON file, PER-FILE corrupt-tolerant. Absent ⇒ no-op. Unparseable ⇒ left
 * byte-identical + recorded in `corrupt` (never rewritten to silence). `transform` mutates the parsed
 * value and returns whether anything changed; the file is rewritten only when it did.
 */
async function rewriteJsonFile(
  dir: FsDirectory,
  name: string,
  path: string,
  transform: (data: unknown) => boolean,
  corrupt: CorruptMigrationFile[],
): Promise<void> {
  let raw: ArrayBuffer;
  try {
    raw = await (await dir.getFile(name)).readable();
  } catch {
    return; // absent
  }
  let data: unknown;
  try {
    data = JSON.parse(decode(raw));
  } catch (e) {
    corrupt.push({ path, reason: e instanceof Error ? e.message : String(e) });
    return; // corrupt ≠ absent: skip-and-report, leave the bytes as they are
  }
  if (transform(data)) await writeJson(dir, name, data);
}

/** Rewrite an exhibit's whole annotation store: the heads page + every history page. `index.json` (a
 *  logicalId→url map, no object ids) is left alone. */
async function rewriteAnnotationsDir(
  annDir: FsDirectory,
  path: string,
  mapObjId: (id: string) => string,
  mapCrossLink: (t: LinkTarget) => LinkTarget,
  counts: RewriteCounts,
  corrupt: CorruptMigrationFile[],
): Promise<void> {
  const transform = (data: unknown): boolean => transformAnnotationPage(data, mapObjId, mapCrossLink, counts);
  await rewriteJsonFile(annDir, HEADS_FILE, `${path}/${HEADS_FILE}`, transform, corrupt);
  let histDir: FsDirectory;
  try {
    histDir = await annDir.getDirectory(HISTORY_DIR);
  } catch {
    return;
  }
  for await (const e of histDir.entries()) {
    if (e.kind === "file" && e.name.endsWith(".json") && e.name !== INDEX_FILE) {
      await rewriteJsonFile(histDir, e.name, `${path}/${HISTORY_DIR}/${e.name}`, transform, corrupt);
    }
  }
}

/** Rewrite one annotation page's `items[]`: the canvas-IRI tail on every target (class 2) and the
 *  `archie:` object refs in every textual body (class 3). Non-page JSON is left unchanged. */
function transformAnnotationPage(
  data: unknown,
  mapObjId: (id: string) => string,
  mapCrossLink: (t: LinkTarget) => LinkTarget,
  counts: RewriteCounts,
): boolean {
  if (!isObject(data) || !Array.isArray((data as { items?: unknown }).items)) return false;
  let changed = false;
  for (const item of (data as { items: unknown[] }).items) {
    if (!isObject(item)) continue;
    const rec = item as Record<string, unknown>;
    if (rewriteTarget(rec, "target", mapObjId, counts)) changed = true;
    if (rewriteBody(rec, mapCrossLink, counts)) changed = true;
  }
  return changed;
}

/** Rewrite the canvas-IRI tail on a target that is a string, a `{ source }` object, or an array of either. */
function rewriteTarget(rec: Record<string, unknown>, key: string, mapObjId: (id: string) => string, counts: RewriteCounts): boolean {
  const t = rec[key];
  if (Array.isArray(t)) {
    let changed = false;
    t.forEach((v, i) => {
      const [next, hit] = mapTargetValue(v, mapObjId);
      if (hit) {
        t[i] = next;
        counts.annotationTargets++;
        changed = true;
      }
    });
    return changed;
  }
  const [next, hit] = mapTargetValue(t, mapObjId);
  if (hit) {
    rec[key] = next;
    counts.annotationTargets++;
    return true;
  }
  return false;
}

/** Map one target value's canvas tail. Returns `[nextValue, changed]`. A string target is the bare canvas
 *  IRI; a `W3CSpecificResource` carries it in `.source`. */
function mapTargetValue(v: unknown, mapObjId: (id: string) => string): [unknown, boolean] {
  if (typeof v === "string") {
    const next = mapCanvasIri(v, mapObjId);
    return [next, next !== v];
  }
  if (isObject(v) && typeof (v as { source?: unknown }).source === "string") {
    const src = (v as { source: string }).source;
    const next = mapCanvasIri(src, mapObjId);
    if (next !== src) return [{ ...(v as object), source: next }, true];
  }
  return [v, false];
}

/** Rewrite the trailing object-id segment of a canvas IRI `…/canvas/<objId>`. Not a canvas IRI, or a
 *  non-legacy tail, ⇒ returned unchanged. `objIdFromCanvasId` (the one derivation) extracts the tail. */
function mapCanvasIri(iri: string, mapObjId: (id: string) => string): string {
  if (!iri.includes("/canvas/")) return iri;
  const tail = objIdFromCanvasId(iri);
  const mapped = mapObjId(tail);
  return mapped === tail ? iri : iri.slice(0, iri.length - tail.length) + mapped;
}

/** Rewrite `archie:` object refs inside a record's body (single body or array; textual bodies only). */
function rewriteBody(rec: Record<string, unknown>, mapCrossLink: (t: LinkTarget) => LinkTarget, counts: RewriteCounts): boolean {
  const before = counts.bodyLinks;
  const body = rec.body;
  const bodies = Array.isArray(body) ? body : body === undefined ? [] : [body];
  for (const b of bodies) {
    if (isObject(b) && typeof (b as { value?: unknown }).value === "string") {
      const bb = b as { value: string };
      bb.value = remapArchieRefs(bb.value, mapCrossLink);
    }
  }
  return counts.bodyLinks !== before;
}

/** Rewrite an exhibit's structure history (flag-ON path): `items[].objectId` AND `items[].prose` archie:
 *  refs on every page. `index.json` is left alone. */
async function rewriteStructureDir(
  structDir: FsDirectory,
  path: string,
  exhibitId: string,
  mapCrossLink: (t: LinkTarget) => LinkTarget,
  counts: RewriteCounts,
  corrupt: CorruptMigrationFile[],
): Promise<void> {
  let histDir: FsDirectory;
  try {
    histDir = await structDir.getDirectory(HISTORY_DIR);
  } catch {
    return;
  }
  const transform = (data: unknown): boolean => transformStructurePage(data, exhibitId, mapCrossLink, counts);
  for await (const e of histDir.entries()) {
    if (e.kind === "file" && e.name.endsWith(".json") && e.name !== INDEX_FILE) {
      await rewriteJsonFile(histDir, e.name, `${path}/${HISTORY_DIR}/${e.name}`, transform, corrupt);
    }
  }
}

function transformStructurePage(data: unknown, exhibitId: string, mapCrossLink: (t: LinkTarget) => LinkTarget, counts: RewriteCounts): boolean {
  if (!isObject(data) || !Array.isArray((data as { items?: unknown }).items)) return false;
  let changed = false;
  for (const item of (data as { items: unknown[] }).items) {
    if (!isObject(item)) continue;
    const rec = item as Record<string, unknown>;
    if (typeof rec.objectId === "string" && isLegacyObjectId(rec.objectId)) {
      rec.objectId = composeLegacyObjectId(exhibitId, rec.objectId);
      counts.sectionObjectIds++;
      changed = true;
    }
    if (typeof rec.prose === "string") {
      const next = remapArchieRefs(rec.prose, mapCrossLink); // increments counts.bodyLinks on a hit
      if (next !== rec.prose) {
        rec.prose = next;
        changed = true;
      }
    }
  }
  return changed;
}

/** Rewrite `pending-notes.json` — `{ slug: [{ objectId }] }`. Each slug's notes compose under that slug's
 *  exhibit id; a note under an unknown slug is left unresolved (no exhibit id to compose with). `objectId`
 *  is the ONLY id-bearing field on a PendingNote (id/comment/tags/reading carry no object id); a pending
 *  note has no region yet, so there is no canvas-IRI target here to rewrite. */
async function rewritePendingNotes(
  projectDir: FsDirectory,
  exhibitIdBySlug: Map<string, string>,
  counts: RewriteCounts,
  corrupt: CorruptMigrationFile[],
): Promise<void> {
  const transform = (data: unknown): boolean => {
    if (!isObject(data)) return false;
    let changed = false;
    for (const [slug, list] of Object.entries(data as Record<string, unknown>)) {
      const exhibitId = exhibitIdBySlug.get(slug);
      if (exhibitId === undefined || !Array.isArray(list)) continue;
      for (const note of list) {
        if (isObject(note) && typeof (note as { objectId?: unknown }).objectId === "string") {
          const n = note as { objectId: string };
          if (isLegacyObjectId(n.objectId)) {
            n.objectId = composeLegacyObjectId(exhibitId, n.objectId);
            counts.pendingNotes++;
            changed = true;
          }
        }
      }
    }
    return changed;
  };
  await rewriteJsonFile(projectDir, PENDING_FILE, PENDING_FILE, transform, corrupt);
}

// --- snapshot (verbatim copy of the id-bearing tree; assets excluded, never re-taken) -----------------

/**
 * Copy the id-bearing tree into `pre-migration/` BEFORE any rewrite, under its OWN marker-last discipline.
 * Returns false (copies nothing) iff a COMPLETE snapshot already exists (dir + `snapshot-complete.json`) —
 * the first complete snapshot is kept, never clobbered by a re-run. A dir present WITHOUT the sentinel is a
 * TORN prior copy (a crash mid-copy): it is re-copied (overwriting the partial — the live tree is still
 * un-migrated at snapshot time, so recopying the current bytes is correct), and the sentinel is written
 * LAST as the copy's commit point. Directory existence alone is never the commit point of a multi-file copy.
 */
async function ensureSnapshot(projectDir: FsDirectory): Promise<boolean> {
  try {
    const existing = await projectDir.getDirectory(PRE_MIGRATION_DIR);
    await existing.getFile(SNAPSHOT_SENTINEL_FILE); // throws if the sentinel is absent (torn/partial)
    return false; // complete snapshot present — keep it
  } catch {
    // absent, or present-but-partial (no sentinel) — (re)take it below
  }
  const snapDir = await projectDir.getDirectory(PRE_MIGRATION_DIR, { create: true });
  await copyTree(projectDir, snapDir); // overwrites any partial copy; the full file set is a superset of a partial one
  await writeJson(snapDir, SNAPSHOT_SENTINEL_FILE, { complete: true }); // COMMIT POINT — written LAST
  return true;
}

/** Recursively copy every file under `src` into `dst`, verbatim (bytes preserved, incl. corrupt JSON),
 *  skipping the snapshot dir itself and the name-keyed asset trees. */
async function copyTree(src: FsDirectory, dst: FsDirectory): Promise<void> {
  for await (const entry of src.entries()) {
    if (SNAPSHOT_SKIP.has(entry.name)) continue;
    if (entry.kind === "file") {
      const bytes = await (await src.getFile(entry.name)).readable();
      const out = await dst.getFile(entry.name, { create: true });
      const w = await out.writable();
      await w.write(bytes);
      await w.close();
    } else {
      const childSrc = await src.getDirectory(entry.name);
      const childDst = await dst.getDirectory(entry.name, { create: true });
      await copyTree(childSrc, childDst);
    }
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}
