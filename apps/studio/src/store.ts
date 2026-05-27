// Studio working store (UX-Q1/Q2): the author's working copy persists to OPFS so work survives a
// reload. OPFS's root is a FileSystemDirectoryHandle, so the already-built FsaFilesystem wraps it
// directly — no new backend. Browser-only (OPFS) — verified in the browser, not headless.
//
// Layout (multi-exhibit, 2026-05-25):
//   {PROJECT}/library.json                       — authored structure (exhibit list + objects)
//   {PROJECT}/annotations/                       — the "sample" exhibit's annotations (LEGACY path,
//                                                   kept so pre-multi-exhibit work isn't orphaned)
//   {PROJECT}/exhibits/{slug}/annotations/       — every OTHER exhibit's annotations
import { FsaFilesystem, type FsDirectory, type OrientationTransform, type MediaType, type Section, type Reading, type RightsFields } from "@render/core";

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

/** A persisted object within an exhibit (the authored structure, not its annotations). */
/** EXIF display-master provenance (CONTEXT §89.1): the original is preserved, this records the
 *  transform that produced the upright master `source` points at. Absent for non-baked imports. */
export interface ObjectProvenance {
  /** EXIF Orientation (2..8) read from the original. */
  exifOrientation: number;
  /** The geometric transform baked into the display master. */
  transform: OrientationTransform;
  /** The preserved-original file name in the exhibit's `assets-original/` dir. */
  originalName: string;
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
  layout?: "single" | "grid" | "narrative";
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

// --- imported-image assets (binary; raw OPFS handles, NOT the JSON-oriented Filesystem seam) ---
// Imported files persist at {PROJECT}/exhibits/{slug}/assets/{name}; an object stores
// source "/assets/{name}" and resolves to a blob: URL at load time (see App.svelte assetUrls).
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
  try {
    const dir = await assetsDir(slug, false);
    if (!dir) return null;
    const fh = await dir.getFileHandle(name);
    const f = await fh.getFile();
    const mime = f.type || mimeFromName(name); // OPFS drops the type → restore it for AV playback
    return URL.createObjectURL(f.type ? f : mime ? f.slice(0, f.size, mime) : f);
  } catch {
    return null; // not stored (e.g. a non-asset source, or OPFS unsupported)
  }
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

/** Resolve a stored asset to its OPFS File — a LAZY Blob, NOT read into the JS heap (the publish
 *  getAsset reader, LARGE-MEDIA-MEMORY-CEILING #5). Returning the File (not an ArrayBuffer) lets the
 *  FSA folder backend stream it straight to disk via `createWritable().write(blob)` so even one huge
 *  asset never fully materializes; the zip/memory backends still read it (they need the bytes). Null if absent. */
export async function readAssetBlob(slug: string, name: string): Promise<Blob | null> {
  try {
    const dir = await assetsDir(slug, false);
    if (!dir) return null;
    return await (await dir.getFileHandle(name)).getFile(); // the OPFS File — lazy; not read into memory here
  } catch {
    return null;
  }
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
