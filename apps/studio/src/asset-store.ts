// Imported-asset blob I/O — extracted from store.ts (Archie-cf93) so the asset-blob cluster (binary
// masters/originals/thumbnails + the audio peak cache, all raw OPFS handles, NOT the JSON-oriented
// Filesystem seam) is its own module instead of one concern among four store.ts used to mix. Behavior
// unchanged; store.ts re-exports every name below so existing importers need no change.
//
// Imported files persist at {PROJECT}/exhibits/{slug}/assets/{name}; an object stores
// source "/assets/{name}" and resolves to a blob: URL at load time (see asset-urls.svelte.ts).
//
// Backend-agnostic note (Phase-3 Archie-623e, native canonical desktop store): this module still talks
// to `navigator.storage.getDirectory()` directly rather than through a Filesystem handle it's given —
// that mirrors store.ts's existing OPFS-only asset layer (see the comment above ASSET_PREFIX in the
// pre-split store.ts) and is NOT a new assumption introduced by this split. A future backend swap
// replaces `assetsDir`'s root-open, not the public functions' signatures.

// PROJECT is duplicated from store.ts (a one-line literal) rather than imported, so this module has no
// import edge back to store.ts — store.ts imports FROM here for its re-export, so the reverse edge
// would be circular.
const PROJECT = "archie-demo-project";

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
