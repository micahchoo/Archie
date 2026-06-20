// Studio working store (UX-Q1/Q2): the author's working copy persists to OPFS so work survives a
// reload. OPFS's root is a FileSystemDirectoryHandle, so the already-built FsaFilesystem wraps it
// directly — no new backend. Browser-only (OPFS) — verified in the browser, not headless.
//
// Layout (multi-exhibit, 2026-05-25):
//   {PROJECT}/library.json                       — authored structure (exhibit list + objects)
//   {PROJECT}/annotations/                       — the "sample" exhibit's annotations (LEGACY path,
//                                                   kept so pre-multi-exhibit work isn't orphaned)
//   {PROJECT}/exhibits/{slug}/annotations/       — every OTHER exhibit's annotations
import { FsaFilesystem, type FsDirectory, type WorkingLibraryMeta, type LayoutType } from "@render/core";

// The persisted working-store SHAPES live in core now (Q-3 archie-persistence: the Viewer's live
// source reads the same format via loadWorkingLibrary). Re-exported under their original Studio
// names so import sites stay stable; this module remains the WRITER of the layout.
export type {
  WorkingObjectProvenance as ObjectProvenance,
  WorkingObjectMeta as ObjectMeta,
  WorkingExhibitMeta as ExhibitMeta,
  WorkingLibraryMeta as LibraryMeta,
} from "@render/core";

const PROJECT = "archie-demo-project";
const SAMPLE_SLUG = "sample";

async function openProjectDir(): Promise<FsDirectory | null> {
  const storage = (navigator as Navigator & { storage?: { getDirectory?: () => Promise<FileSystemDirectoryHandle> } }).storage;
  if (!storage?.getDirectory) return null;
  const opfsRoot = await storage.getDirectory();
  const root = await new FsaFilesystem(opfsRoot).root();
  return root.getDirectory(PROJECT, { create: true });
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

/** A persisted object. Carries `RightsFields` (per-object credit/license — the truest provenance level:
 *  each folio = its holding institution). Projects to the Canvas's IIIF rights. */
export interface ObjectMeta extends RightsFields {
  id: string;
  source: string;
  label: string;
  /** Optional description/caption — projects to the Canvas `summary`. */
  summary?: string;
  width?: number;
  height?: number;
  /** Media kind — "image" (default, OSD) vs "sound"/"video" (the temporal AvEditor). */
  mediaType?: MediaType;
  /** Seconds — for sound/video objects. */
  duration?: number;
  provenance?: ObjectProvenance;
}
/** A persisted exhibit (authored structure). Carries `RightsFields` (exhibit-level credit/license). */
export interface ExhibitMeta extends RightsFields {
  id: string;
  slug: string;
  title: string;
  /** Optional exhibit description — projects to the Manifest `summary` (the Gallery card + exhibit chrome). */
  summary?: string;
  /** @deprecated (ADR-0016) The leading surface is now DERIVED from content by render-core resolveLayout
   *  (sections → narrative, >1 object → grid, else single). Kept OPTIONAL for back-compat read-tolerance —
   *  legacy stored data is harmless and IGNORED; the Studio NEVER writes this field anymore. `LayoutType`
   *  imported from render-core so this stays the single source of truth (no duplicated string union). */
  layout?: LayoutType;
  /** RESERVED (§43 reading-MODE axis) — v1.1 pacing variant (slideshow/scrollytelling). Unused in v1. */
  mode?: string;
  objects: ObjectMeta[];
  /** Ordered narrative sections (the authored spine; IIIF Ranges at publish). Present for narrative exhibits. */
  sections?: Section[];
  /** The exhibit's curated Readings (interpretive passes; ADR-0007). A note references one by id (`record.reading`). */
  readings?: Reading[];
  /** Bundled defaults only: bump when the seeded notes change so the reconcile reseeds (P0 fixture iteration). */
  seedVersion?: number;
}
/** The authored library structure persisted at `{PROJECT}/library.json`. Carries the library-level
 *  identity (`title`/`summary`) + `RightsFields` (collection credit/license). `title`/`summary` were
 *  previously hardcoded in buildFullLibrary; now authorable so the Library has a home (rights grill Q6). */
export interface LibraryMeta extends RightsFields {
  title?: string;
  summary?: string;
  exhibits: ExhibitMeta[];
}

/** Read the authored library structure. Null if OPFS unsupported or nothing authored yet. */
export async function loadLibraryMeta(): Promise<LibraryMeta | null> {
  const project = await openProjectDir();
  if (!project) return null;
  try {
    const file = await project.getFile("library.json");
    return JSON.parse(new TextDecoder().decode(await file.readable())) as LibraryMeta;
  } catch {
    return null; // not yet written (first run)
  }
}

/** Persist the authored library structure. No-op if OPFS unsupported. */
export async function saveLibraryMeta(meta: LibraryMeta): Promise<void> {
  const project = await openProjectDir();
  if (!project) return;
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
  try {
    const file = await project.getFile(PENDING_FILE);
    return JSON.parse(new TextDecoder().decode(await file.readable())) as Record<string, PendingNote[]>;
  } catch {
    return {}; // not yet written (no coordinate-free import has happened)
  }
}

/** Persist the pending-notes sidecar (slug → list). No-op if OPFS unsupported. */
export async function savePendingNotes(map: Record<string, PendingNote[]>): Promise<void> {
  const project = await openProjectDir();
  if (!project) return;
  const file = await project.getFile(PENDING_FILE, { create: true });
  const w = await file.writable();
  await w.write(JSON.stringify(map, null, 2));
  await w.close();
}

// --- imported-image assets (binary; raw OPFS handles, NOT the JSON-oriented Filesystem seam) ---
// Imported files persist at {PROJECT}/exhibits/{slug}/assets/{name}; an object stores
// source "/assets/{name}" and resolves to a blob: URL at load time (see App.svelte assetUrls).

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

/** Resolve a stored asset (in the given `sub` dir) to its OPFS File — a LAZY Blob, NOT read into the
 *  JS heap. The shared path-resolution + tolerant read both the blob-URL and raw-blob readers below use:
 *  null when the dir/file is absent or OPFS is unsupported. */
async function readAssetFile(slug: string, name: string, sub: string): Promise<File | null> {
  try {
    const dir = await assetsDir(slug, false, sub);
    if (!dir) return null;
    return await (await dir.getFileHandle(name)).getFile();
  } catch {
    return null; // not stored (a non-asset source, no baked derivative, or OPFS unsupported)
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

/** Resolve a stored asset to a fresh blob: URL (caller must revokeObjectURL). Null if absent. */
export async function readAssetUrl(slug: string, name: string): Promise<string | null> {
  const f = await readAssetFile(slug, name, "assets");
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
 *  asset never fully materializes; the zip/memory backends still read it (they need the bytes). Null if absent. */
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
 *  (the publish getThumbnail reader). Null if absent (publishLibrary then drops the thumbnail ref). */
export async function readThumbBytes(slug: string, name: string): Promise<Blob | null> {
  return readAssetFile(slug, name, "assets-thumb");
}

/** Resolve a stored baked thumbnail to a fresh blob: URL (caller revokes) — the small gallery/overview
 *  derivative, so the Studio overview/rail paint shrunk plates instead of decoding full-res masters.
 *  Null when no thumbnail was baked (pre-existing import, or an image already small enough). */
export async function readThumbUrl(slug: string, name: string): Promise<string | null> {
  const f = await readAssetFile(slug, name, "assets-thumb"); // no baked thumbnail → caller falls back to the master blob
  return f ? fileToObjectUrl(f, name) : null;
}
