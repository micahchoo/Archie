// Studio working store (UX-Q1/Q2): the author's working copy persists to OPFS so work survives a
// reload. OPFS's root is a FileSystemDirectoryHandle, so the already-built FsaFilesystem wraps it
// directly — no new backend. Browser-only (OPFS) — verified in the browser, not headless.
//
// Layout (multi-exhibit, 2026-05-25):
//   {PROJECT}/library.json                       — authored structure (exhibit list + objects)
//   {PROJECT}/annotations/                       — the "sample" exhibit's annotations (LEGACY path,
//                                                   kept so pre-multi-exhibit work isn't orphaned)
//   {PROJECT}/exhibits/{slug}/annotations/       — every OTHER exhibit's annotations
// The persisted working-store SHAPES live in core now (Q-3 archie-persistence: the Viewer's live
// source reads the same format via loadWorkingLibrary). Re-exported under their original Studio
// names so import sites stay stable; this module remains the WRITER of the layout.
import {
  FsaFilesystem,
  migrateLibraryObjectIds,
  ID_SCHEME_MARKER_FILE,
  PRE_MIGRATION_DIR,
  type Filesystem,
  type FsDirectory,
  type MigrateIdsResult,
  type WorkingObjectProvenance as ObjectProvenance,
  type WorkingObjectMeta as ObjectMeta,
  type WorkingExhibitMeta as ExhibitMeta,
  type WorkingLibraryMeta as LibraryMeta,
} from "@render/core";
export type { ObjectProvenance, ObjectMeta, ExhibitMeta, LibraryMeta };

const PROJECT = "archie-demo-project";
const SAMPLE_SLUG = "sample";

/** The stable identity of Studio's single OPFS working library — the fixed path all tabs of this origin
 *  share. Used as the cross-tab single-writer lock name (ISSUES.md Issue 22 / ledgers/TABS.md). */
export const WORKING_STORE_ID = PROJECT;

/** The OPFS root as a Filesystem, or null where OPFS is unavailable (non-browser/headless). The
 *  object-id migration engine needs the ROOT fs (it opens `{WORKING_PROJECT}` itself), not the
 *  project dir — WORKING_PROJECT and this module's PROJECT are the same fixed name. */
async function openRootFs(): Promise<Filesystem | null> {
  const storage = (navigator as Navigator & { storage?: { getDirectory?: () => Promise<FileSystemDirectoryHandle> } }).storage;
  if (!storage?.getDirectory) return null;
  return new FsaFilesystem(await storage.getDirectory());
}

async function openProjectDir(): Promise<FsDirectory | null> {
  const fs = await openRootFs();
  if (!fs) return null;
  return (await fs.root()).getDirectory(PROJECT, { create: true });
}

/**
 * ADR-0026 object-id migration at the resident-store boundary (Archie-8439 — trigger 1 studio-open,
 * reused by trigger 2 archive-adoption). Runs the render-core engine over the OPFS working store: a
 * legacy (scheme-1) store is rewritten IN PLACE to the composed global scheme behind its
 * snapshot-then-marker protocol; a store already on the current scheme is a no-op pass-through.
 *
 * Returns the engine's report, or null iff there is no OPFS at all (nothing to migrate). The engine
 * NEVER throws for a corrupt page (it skips-and-reports); a thrown error here is a genuine fs failure
 * and is left to PROPAGATE — a half-migrated store must not boot a session, and a torn run leaves the
 * marker absent (reads as legacy) so the next boot re-runs it idempotently.
 *
 * `fs` defaults to the OPFS root; it is injectable ONLY so the studio-open trigger can be tested over a
 * MemoryFilesystem (there is no OPFS in the headless test env). Production always uses the default.
 */
export async function migrateResidentStoreIds(fs?: Filesystem): Promise<MigrateIdsResult | null> {
  const rootFs = fs ?? (await openRootFs());
  if (!rootFs) return null;
  const result = await migrateLibraryObjectIds(rootFs);
  if (result.migrated) {
    const r = result.rewrites;
    console.info(
      `[migrate] object-ids scheme ${result.fromScheme}→${result.toScheme}: ` +
        `${r.libraryObjects} objects, ${r.annotationTargets} targets, ${r.bodyLinks} links, ` +
        `${r.librarySectionObjectIds + r.sectionObjectIds} sections, ${r.pendingNotes} pending` +
        `${result.snapshotCreated ? " (pre-migration/ snapshot written)" : ""}.`,
    );
  }
  if (result.corrupt.length > 0) {
    console.warn(`[migrate] object-ids: ${result.corrupt.length} unreadable page(s) skipped + left intact:`, result.corrupt);
  }
  return result;
}

/**
 * Clear the resident store's id-scheme marker AND its pre-migration snapshot — the destructive
 * "open zip / replace project" adoption boundary (Archie-8439 trigger 2). A full replace overwrites
 * the project with an INCOMING library whose object ids may be legacy, but leaves the OUTGOING
 * library's `id-scheme.json` marker and `pre-migration/` snapshot behind. Left in place, the stale
 * scheme-2 marker would make the migration engine pass-through the freshly-written legacy content
 * (the exact scheme-coexistence this ticket forbids), and the snapshot would preserve the DISCARDED
 * library instead of the adopted one. Removing both makes the store read as legacy again, so the
 * migrateResidentStoreIds that follows re-snapshots + rewrites the incoming library cleanly. The
 * discarded library's snapshot is moot — a destructive replace throws that library away entirely.
 * Best-effort: absent entries are fine (a fresh / never-migrated store has neither).
 */
export async function resetIdSchemeState(): Promise<void> {
  const project = await openProjectDir();
  if (!project) return;
  await project.remove(ID_SCHEME_MARKER_FILE).catch(() => {});
  await project.remove(PRE_MIGRATION_DIR).catch(() => {});
}

/**
 * The OPFS annotations directory for one exhibit (creating if needed). The "sample" exhibit keeps
 * the LEGACY `{PROJECT}/annotations/` location so annotations authored before the multi-exhibit
 * refactor are not orphaned; every other exhibit lives under `exhibits/{slug}/annotations/`.
 * Null if OPFS is unsupported.
 */
export async function openExhibitAnnotationsDir(slug: string): Promise<FsDirectory | null> {
  const project = await openProjectDir();
  if (!project) return null;
  if (slug === SAMPLE_SLUG) return project.getDirectory("annotations", { create: true });
  const exhibits = await project.getDirectory("exhibits", { create: true });
  const ex = await exhibits.getDirectory(slug, { create: true });
  return ex.getDirectory("annotations", { create: true });
}

/**
 * The OPFS STRUCTURE directory for one exhibit (creating if needed) — the section rev-log's home
 * (spine/structure-persist.ts writes `history/` inside it), a SIBLING of the annotations dir so the
 * two logs live side by side per exhibit. Same legacy-location rule as openExhibitAnnotationsDir:
 * "sample" keeps the project root, every other exhibit lives under `exhibits/{slug}/`. Only the
 * archie.structureRevlog flag's ON path calls this (structure-session.svelte.ts) — with the flag
 * off the directory is never created. Null if OPFS is unsupported.
 */
export async function openExhibitStructureDir(slug: string): Promise<FsDirectory | null> {
  const project = await openProjectDir();
  if (!project) return null;
  if (slug === SAMPLE_SLUG) return project.getDirectory("structure", { create: true });
  const exhibits = await project.getDirectory("exhibits", { create: true });
  const ex = await exhibits.getDirectory(slug, { create: true });
  return ex.getDirectory("structure", { create: true });
}

/**
 * The READ-ONLY sibling of openExhibitStructureDir: open an exhibit's structure dir only if it
 * already exists — NEVER creating it (or any parent). Null when absent or OPFS is unsupported.
 * The publish/export leg (Archie-aef4) probes with this, flag-independent: emission is driven by
 * log EXISTENCE, and an exhibit that never authored under archie.structureRevlog must not grow an
 * empty structure/ dir just because the library was published.
 */
export async function openExhibitStructureDirIfExists(slug: string): Promise<FsDirectory | null> {
  const project = await openProjectDir();
  if (!project) return null;
  try {
    if (slug === SAMPLE_SLUG) return await project.getDirectory("structure");
    const exhibits = await project.getDirectory("exhibits");
    const ex = await exhibits.getDirectory(slug);
    return await ex.getDirectory("structure");
  } catch {
    return null; // some segment absent — this exhibit has no persisted structure log
  }
}

/**
 * A corrupt authored sidecar reads as "absent" (JSON.parse throws → the loader returns empty), which
 * would then let the next save overwrite it and destroy the authored structure for good. Before an
 * overwrite, if the existing file is present but unparseable, copy it aside to `{name}.corrupt` so the
 * unreadable-but-maybe-recoverable bytes survive. No-op when the file is absent or parses cleanly.
 */
async function snapshotIfUnparseable(dir: FsDirectory, name: string): Promise<void> {
  let bytes: ArrayBuffer;
  try {
    bytes = await (await dir.getFile(name)).readable();
  } catch {
    return; // absent — nothing to protect
  }
  try {
    JSON.parse(new TextDecoder().decode(bytes));
    return; // parses — a normal overwrite is safe
  } catch {
    const backup = await dir.getFile(`${name}.corrupt`, { create: true });
    const w = await backup.writable();
    await w.write(bytes);
    await w.close();
    console.warn(`[store] ${name} was present but unparseable; preserved a copy as ${name}.corrupt before overwriting.`);
  }
}

/** Read the authored library structure. Null if OPFS unsupported or nothing authored yet. */
export async function loadLibraryMeta(): Promise<LibraryMeta | null> {
  const project = await openProjectDir();
  if (!project) return null;
  let bytes: ArrayBuffer;
  try {
    bytes = await (await project.getFile("library.json")).readable();
  } catch {
    return null; // absent — first run
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as LibraryMeta;
  } catch {
    // Present but corrupt: do NOT silently treat as empty-and-clobber — the next save snapshots it
    // aside (snapshotIfUnparseable) so authored structure is never destroyed without a trace.
    console.warn("[store] library.json is present but unparseable; treating the session as empty until it is replaced (a .corrupt copy is kept on the next save).");
    return null;
  }
}

/** Persist the authored library structure. No-op if OPFS unsupported. */
export async function saveLibraryMeta(meta: LibraryMeta): Promise<void> {
  const project = await openProjectDir();
  if (!project) return;
  await snapshotIfUnparseable(project, "library.json");
  const file = await project.getFile("library.json", { create: true });
  const w = await file.writable();
  await w.write(JSON.stringify(meta, null, 2));
  await w.close();
}

// --- pending notes (coordinate-free imports awaiting "Set area" placement; Archie-79c0 sub-cycle B) ---
// A CSV may carry note TEXT without pixel regions. Such notes can't enter the annotation log (it refuses
// degenerate geometry — session.ts), so they're staged in a project-level sidecar, keyed by exhibit slug,
// until the author draws each one's box in the editor. NOT authored structure (kept out of library.json /
// the published library) — purely editor scratch that survives a reload. One small JSON, whole-map I/O.

/** A note imported with text but no region yet. `id` keys it for tray selection/removal. */
export interface PendingNote {
  id: string;
  objectId: string;
  comment: string;
  tags: string[];
  reading?: string;
}

const PENDING_FILE = "pending-notes.json";

/** Read every exhibit's pending notes (slug → list). Empty map on first run / OPFS-unsupported. */
export async function loadPendingNotes(): Promise<Record<string, PendingNote[]>> {
  const project = await openProjectDir();
  if (!project) return {};
  let bytes: ArrayBuffer;
  try {
    bytes = await (await project.getFile(PENDING_FILE)).readable();
  } catch {
    return {}; // absent — no coordinate-free import has happened
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, PendingNote[]>;
  } catch {
    console.warn("[store] pending-notes.json is present but unparseable; treating as empty until it is replaced (a .corrupt copy is kept on the next save).");
    return {};
  }
}

/** Persist the pending-notes sidecar (slug → list). No-op if OPFS unsupported. */
export async function savePendingNotes(map: Record<string, PendingNote[]>): Promise<void> {
  const project = await openProjectDir();
  if (!project) return;
  await snapshotIfUnparseable(project, PENDING_FILE);
  const file = await project.getFile(PENDING_FILE, { create: true });
  const w = await file.writable();
  await w.write(JSON.stringify(map, null, 2));
  await w.close();
}

// --- imported-image assets (binary; raw OPFS handles, NOT the JSON-oriented Filesystem seam) ---
// Imported files persist at {PROJECT}/exhibits/{slug}/assets/{name}; an object stores
// source "/assets/{name}" and resolves to a blob: URL at load time (see asset-urls.svelte.ts).

/** The source prefix marking an object as an OPFS-imported asset (vs an external URL). */
export const ASSET_PREFIX = "/assets/";
/** Is this object source an imported OPFS asset? (One definition — App + publish flows share it.) */
export const isAsset = (src: string | undefined): boolean => !!src && src.startsWith(ASSET_PREFIX);
type OpfsRoot = { getDirectory?: () => Promise<FileSystemDirectoryHandle> };
async function assetsDir(slug: string, create: boolean, sub = "assets"): Promise<FileSystemDirectoryHandle | null> {
  const storage = (navigator as Navigator & { storage?: OpfsRoot }).storage;
  if (!storage?.getDirectory) return null;
  const root = await storage.getDirectory();
  const project = await root.getDirectoryHandle(PROJECT, { create });
  const exhibits = await project.getDirectoryHandle("exhibits", { create });
  const ex = await exhibits.getDirectoryHandle(slug, { create });
  return ex.getDirectoryHandle(sub, { create });
}

async function writeInto(dir: FileSystemDirectoryHandle | null, name: string, file: Blob): Promise<void> {
  if (!dir) return;
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(file);
  await w.close();
}

/** Store an imported image (the DISPLAY MASTER) in the exhibit's OPFS assets dir. No-op if unsupported. */
export async function saveAssetFile(slug: string, name: string, file: Blob): Promise<void> {
  await writeInto(await assetsDir(slug, true), name, file);
}

/** Preserve the UNTOUCHED original beside the master (CONTEXT §89.1 provenance), in `assets-original/`.
 *  Not published unless "include source for citation" is opted in (follow-up). No-op if unsupported. */
export async function saveOriginalFile(slug: string, name: string, file: Blob): Promise<void> {
  await writeInto(await assetsDir(slug, true, "assets-original"), name, file);
}

/** Store a BAKED THUMBNAIL beside the master in `assets-thumb/` — a small gallery/overview derivative so
 *  the viewer's grid loads a shrunk plate, not the full-resolution master (the multi-object load win).
 *  Same name as the master. Published via publishLibrary's getThumbnail. No-op if unsupported. */
export async function saveThumbFile(slug: string, name: string, file: Blob): Promise<void> {
  await writeInto(await assetsDir(slug, true, "assets-thumb"), name, file);
}

// --- audio waveform peak cache (Studio-only; NOT published — the viewer uses a native <audio>) ---
// WaveSurfer must fetch + WebAudio-decode the WHOLE file to draw the waveform, and it re-decodes on
// every open. Decoding ONCE and caching the peaks lets every later open render the waveform INSTANTLY
// (peaks + duration handed to WaveSurfer.create → no fetch, no decode; the <audio> still streams for
// playback). Stored as a JSON sidecar `{name}.json` in `assets-peaks/`, keyed by the asset's name.

/** A decoded waveform's peaks + duration — all WaveSurfer needs to render without touching the audio. */
export interface PeakCache {
  v: 1;
  /** Audio duration in seconds (WaveSurfer's `duration` option). */
  duration: number;
  /** Per-channel peak arrays (WaveSurfer's `peaks` option / `exportPeaks()` output). */
  peaks: number[][];
}

/** Read an asset's cached waveform peaks. Null when absent, corrupt, failed, or OPFS is unsupported
 *  (→ decode) — a peaks CACHE is self-healing, so even a real read failure just re-decodes. */
export async function readPeaks(slug: string, name: string): Promise<PeakCache | null> {
  const f = await readAssetFileForDisplay(slug, `${name}.json`, "assets-peaks");
  if (!f) return null;
  try {
    const c = JSON.parse(await f.text()) as PeakCache;
    if (c?.v === 1 && typeof c.duration === "number" && Array.isArray(c.peaks) && c.peaks.length > 0) return c;
  } catch { /* corrupt sidecar → fall through and re-decode */ }
  return null;
}

/** Persist an asset's waveform peaks (written once, after the first decode). No-op if unsupported. */
export async function savePeaks(slug: string, name: string, cache: PeakCache): Promise<void> {
  await writeInto(await assetsDir(slug, true, "assets-peaks"), `${name}.json`, new Blob([JSON.stringify(cache)], { type: "application/json" }));
}

// OPFS does NOT persist a file's MIME type — `getFile()` returns `type: ""`. Images sniff fine, but
// `<video>`/`<audio>` (and WaveSurfer) can refuse a typeless blob: URL, so restore the type from the
// extension on read. Zero-copy via `slice(…, type)` (no in-memory duplication of large media).
const EXT_MIME: Record<string, string> = {
  mp4: "video/mp4", m4v: "video/mp4", webm: "video/webm", mov: "video/quicktime", ogv: "video/ogg",
  mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", m4a: "audio/mp4", aac: "audio/aac", flac: "audio/flac",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", avif: "image/avif",
};
function mimeFromName(name: string): string {
  return EXT_MIME[name.toLowerCase().split(".").pop() ?? ""] ?? "";
}

/** A real OPFS read failure (quota, permission, wrong-kind entry, backend corruption) — NOT "absent".
 *  Kept distinct so no caller converts an outage into "nothing stored" (the corrupt≠empty rule,
 *  .claude/rules/render-core-data-integrity.md §2): the publish readers let this propagate so a failed
 *  read fails the publish loudly instead of silently shipping without the asset/thumbnail. */
export class AssetReadFailedError extends Error {
  override name = "AssetReadFailedError";
  constructor(slug: string, path: string, cause: unknown) {
    super(`Failed to read stored asset "${path}" (exhibit "${slug}"): ${cause instanceof Error ? cause.message : String(cause)}`, { cause });
  }
}

/** Resolve a stored asset (in the given `sub` dir) to its OPFS File — a LAZY Blob, NOT read into the
 *  JS heap. The shared path-resolution both the blob-URL and raw-blob readers below use. Null ONLY when
 *  genuinely absent (no dir chain / no file / OPFS unsupported — NotFoundError is how `assetsDir` with
 *  create:false reports a missing chain); any other error throws AssetReadFailedError. */
async function readAssetFile(slug: string, name: string, sub: string): Promise<File | null> {
  try {
    const dir = await assetsDir(slug, false, sub);
    if (!dir) return null;
    return await (await dir.getFileHandle(name)).getFile();
  } catch (e) {
    if (e instanceof DOMException && e.name === "NotFoundError") {
      return null; // not stored (a non-asset source, no baked derivative, or never imported)
    }
    throw new AssetReadFailedError(slug, `${sub}/${name}`, e);
  }
}

/** The DISPLAY-path tolerance policy: a real read failure degrades to the caller's placeholder/fallback
 *  (a grid plate is not worth crashing a render wave) but leaves a loud console trace — deliberately
 *  unlike the publish readers (readAssetBlob/readThumbBytes), which propagate AssetReadFailedError. */
async function readAssetFileForDisplay(slug: string, name: string, sub: string): Promise<File | null> {
  try {
    return await readAssetFile(slug, name, sub);
  } catch (e) {
    console.error(e);
    return null;
  }
}

/** Wrap an OPFS File in a fresh blob: URL, restoring the MIME the extension implies (OPFS drops a
 *  file's type → `<video>`/`<audio>`/WaveSurfer can refuse a typeless blob: URL). Zero-copy via
 *  `slice(…, type)` so large media is never duplicated in memory. Caller revokes the URL. */
function fileToObjectUrl(f: File, name: string): string {
  const mime = f.type || mimeFromName(name);
  return URL.createObjectURL(f.type ? f : mime ? f.slice(0, f.size, mime) : f);
}

/** Byte size of a stored asset — METADATA ONLY (File.size needs no arrayBuffer read). 0 if absent.
 *  Used by the pre-zip size estimate (LARGE-MEDIA-MEMORY-CEILING #1) — never reads the bytes. */
export async function assetSize(slug: string, name: string): Promise<number> {
  try {
    const dir = await assetsDir(slug, false);
    if (!dir) return 0;
    return (await (await dir.getFileHandle(name)).getFile()).size;
  } catch {
    return 0;
  }
}

/** Resolve a stored asset to a fresh blob: URL (caller must revokeObjectURL). Null if absent — or on a
 *  real read failure (display path: logged, degraded to the caller's fallback). */
export async function readAssetUrl(slug: string, name: string): Promise<string | null> {
  const f = await readAssetFileForDisplay(slug, name, "assets");
  return f ? fileToObjectUrl(f, name) : null;
}

/**
 * Remove an exhibit's annotations dir so it reseeds from code on next open. Used when a bundled
 * default exhibit's definition changed (e.g. a fixture was re-imported) and its stale persisted
 * notes must be discarded. No-op if nothing is stored.
 */
export async function clearExhibitAnnotations(slug: string): Promise<void> {
  const storage = (navigator as Navigator & { storage?: OpfsRoot }).storage;
  if (!storage?.getDirectory) return;
  try {
    const root = await storage.getDirectory();
    const project = await root.getDirectoryHandle(PROJECT, { create: false });
    if (slug === SAMPLE_SLUG) { await project.removeEntry("annotations", { recursive: true }); return; }
    const exhibits = await project.getDirectoryHandle("exhibits", { create: false });
    const ex = await exhibits.getDirectoryHandle(slug, { create: false });
    await ex.removeEntry("annotations", { recursive: true });
  } catch {
    // nothing stored for this exhibit — fine
  }
}

/**
 * Remove an exhibit's structure/ dir (the section rev-log's home — openExhibitStructureDir) on
 * exhibit delete, the structure sibling of clearExhibitAnnotations above (Archie-2a9a, deliverable
 * 2). Deliberately FLAG-INDEPENDENT: the dir may exist from a previous archie.structureRevlog
 * session even when the flag is now off, and exhibit ids are deterministic (`ex-${slug}`), so a
 * lingering log would be inherited wholesale by the next exhibit created under the same slug.
 * No-op if nothing is stored (absent dir / no OPFS).
 */
export async function clearExhibitStructure(slug: string): Promise<void> {
  const storage = (navigator as Navigator & { storage?: OpfsRoot }).storage;
  if (!storage?.getDirectory) return;
  try {
    const root = await storage.getDirectory();
    const project = await root.getDirectoryHandle(PROJECT, { create: false });
    if (slug === SAMPLE_SLUG) { await project.removeEntry("structure", { recursive: true }); return; }
    const exhibits = await project.getDirectoryHandle("exhibits", { create: false });
    const ex = await exhibits.getDirectoryHandle(slug, { create: false });
    await ex.removeEntry("structure", { recursive: true });
  } catch {
    // nothing stored for this exhibit — fine
  }
}

/**
 * Does an exhibit's OPFS annotations dir hold anything? Templates never save (the isTemplate gate
 * in save()), so stored annotations mean a USER worked here — the boot reconcile must not clear
 * them when a bundled-default slug is reclaimed (a sunset slug can spend time as a user exhibit).
 */
export async function exhibitHasAnnotations(slug: string): Promise<boolean> {
  const storage = (navigator as Navigator & { storage?: OpfsRoot }).storage;
  if (!storage?.getDirectory) return false;
  try {
    const root = await storage.getDirectory();
    const project = await root.getDirectoryHandle(PROJECT, { create: false });
    const ann = slug === SAMPLE_SLUG
      ? await project.getDirectoryHandle("annotations", { create: false })
      : await (await (await project.getDirectoryHandle("exhibits", { create: false }))
          .getDirectoryHandle(slug, { create: false }))
          .getDirectoryHandle("annotations", { create: false });
    for await (const _ of (ann as unknown as { keys(): AsyncIterableIterator<string> }).keys()) return true;
    return false;
  } catch {
    return false; // nothing stored for this exhibit
  }
}

/** Resolve a stored asset to its OPFS File — a LAZY Blob, NOT read into the JS heap (the publish
 *  getAsset reader, LARGE-MEDIA-MEMORY-CEILING #5). Returning the File (not an ArrayBuffer) lets the
 *  FSA folder backend stream it straight to disk via `createWritable().write(blob)` so even one huge
 *  asset never fully materializes; the zip/memory backends still read it (they need the bytes). Null ONLY
 *  if absent; a real read failure propagates AssetReadFailedError (fail the publish, don't ship a hole). */
export async function readAssetBlob(slug: string, name: string): Promise<Blob | null> {
  return readAssetFile(slug, name, "assets"); // the OPFS File — lazy; not read into memory here
}
// (readAssetBytes removed 2026-05-27 — A.3 routed publishing through the lazy `readAssetBlob`; it had no
//  other caller. `readOriginalBytes` below still reads eagerly for the GH-publish originals opt-in.)

/** Read a preserved ORIGINAL's bytes (from `assets-original/`) for opt-in citation publish. Null if absent. */
export async function readOriginalBytes(slug: string, name: string): Promise<ArrayBuffer | null> {
  try {
    const dir = await assetsDir(slug, false, "assets-original");
    if (!dir) return null;
    const fh = await dir.getFileHandle(name);
    return await (await fh.getFile()).arrayBuffer();
  } catch {
    return null;
  }
}

/** Resolve a stored baked thumbnail (`assets-thumb/`) to its OPFS File — lazy, mirroring readAssetBlob
 *  (the publish getThumbnail reader). Null ONLY if absent (publishLibrary then drops the thumbnail ref);
 *  a real read failure propagates AssetReadFailedError so the publish fails loudly instead of silently
 *  shipping a tree without its thumbnails. */
export async function readThumbBytes(slug: string, name: string): Promise<Blob | null> {
  return readAssetFile(slug, name, "assets-thumb");
}

/** Resolve a stored baked thumbnail to a fresh blob: URL (caller revokes) — the small gallery/overview
 *  derivative, so the Studio overview/rail paint shrunk plates instead of decoding full-res masters.
 *  Null when no thumbnail was baked (pre-existing import, or an image already small enough) — or on a
 *  real read failure (display path: logged, degraded to the master fallback). */
export async function readThumbUrl(slug: string, name: string): Promise<string | null> {
  const f = await readAssetFileForDisplay(slug, name, "assets-thumb"); // no baked thumbnail → caller falls back to the master blob
  return f ? fileToObjectUrl(f, name) : null;
}
