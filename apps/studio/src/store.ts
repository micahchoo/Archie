// Studio working store (UX-Q1/Q2): the author's working copy persists to OPFS so work survives a
// reload. OPFS's root is a FileSystemDirectoryHandle, so the already-built FsaFilesystem wraps it
// directly — no new backend. Browser-only (OPFS) — verified in the browser, not headless.
//
// Layout (multi-exhibit, 2026-05-25):
//   {PROJECT}/library.json                       — authored structure (exhibit list + objects)
//   {PROJECT}/annotations/                       — the "sample" exhibit's annotations (LEGACY path,
//                                                   kept so pre-multi-exhibit work isn't orphaned)
//   {PROJECT}/exhibits/{slug}/annotations/       — every OTHER exhibit's annotations
import { FsaFilesystem, type FsDirectory, type OrientationTransform, type MediaType, type Section } from "@render/core";

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

export interface ObjectMeta {
  id: string;
  source: string;
  label: string;
  width?: number;
  height?: number;
  /** Media kind — "image" (default, OSD) vs "sound"/"video" (the temporal AvEditor). */
  mediaType?: MediaType;
  /** Seconds — for sound/video objects. */
  duration?: number;
  provenance?: ObjectProvenance;
}
/** A persisted exhibit (authored structure). */
export interface ExhibitMeta {
  id: string;
  slug: string;
  title: string;
  layout?: "single" | "grid" | "narrative";
  /** RESERVED (§43 reading-MODE axis) — v1.1 pacing variant (slideshow/scrollytelling). Unused in v1. */
  mode?: string;
  objects: ObjectMeta[];
  /** Ordered narrative sections (the authored spine; IIIF Ranges at publish). Present for narrative exhibits. */
  sections?: Section[];
  /** Bundled defaults only: bump when the seeded notes change so the reconcile reseeds (P0 fixture iteration). */
  seedVersion?: number;
}
/** The authored library structure persisted at `{PROJECT}/library.json`. */
export interface LibraryMeta {
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

/** Resolve a stored asset to a fresh blob: URL (caller must revokeObjectURL). Null if absent. */
export async function readAssetUrl(slug: string, name: string): Promise<string | null> {
  try {
    const dir = await assetsDir(slug, false);
    if (!dir) return null;
    const fh = await dir.getFileHandle(name);
    return URL.createObjectURL(await fh.getFile());
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

/** Read a stored asset's bytes (for publishing into the site tree). Null if absent. */
export async function readAssetBytes(slug: string, name: string): Promise<ArrayBuffer | null> {
  try {
    const dir = await assetsDir(slug, false);
    if (!dir) return null;
    const fh = await dir.getFileHandle(name);
    return await (await fh.getFile()).arrayBuffer();
  } catch {
    return null;
  }
}

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
