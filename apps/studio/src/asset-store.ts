// Imported-asset blob I/O — extracted from store.ts (Archie-cf93) so the asset-blob cluster (binary
// masters/originals/thumbnails + the audio peak cache) is its own module. Behavior unchanged for callers;
// store.ts re-exports every name below so existing importers need no change.
//
// Imported files persist at {PROJECT}/exhibits/{slug}/assets/{name}; an object stores source
// "/assets/{name}" and resolves to a blob: URL at load time (see asset-urls.svelte.ts).
//
// RESIDENT SEAM (Archie-623e Phase 2): this module now talks to the RESIDENT working store through the
// `Filesystem` seam (resident-store.ts `residentProjectDir`) — the native folder on desktop, OPFS on web —
// instead of raw `navigator.storage.getDirectory()` handles. ONE code path, no `isTauri()` fork here: the
// seam's lazy `getFile()` / `size()` / `readable()` serve both backends. The extension the flip needed
// (lazy getFile that never pre-materializes, a stat-only size, an optional resolveUrl) lives in the seam,
// not in a branch here (the Phase-2 design decision).
//
// Web behaviour note: the image blob-URL readers below now materialize the bytes (readable() → a real
// in-memory Blob) rather than the pre-flip zero-copy `opfsFile.slice()` — the desktop backend can't back a
// lazy blob: URL over a native path, so one code path materializes on both. Images are display-once and
// revoked after (Phase-4: "tens of MB materialized once is fine"); the publish/size/original readers stay
// lazy (getFile()/size()) so a multi-GB asset is never pulled into heap.
import { isNotFound, type FsDirectory, type FsFile } from "@render/core";
import { residentProjectDir } from "./resident-store.js";

/** The source prefix marking an object as an imported asset (vs an external URL). */
export const ASSET_PREFIX = "/assets/";
/** Is this object source an imported asset? (One definition — App + publish flows share it.) */
export const isAsset = (src: string | undefined): boolean => !!src && src.startsWith(ASSET_PREFIX);

/** The exhibit's `{sub}` asset dir through the resident seam. `create` threads the whole chain (project →
 *  exhibits → slug → sub). With create:false a missing segment throws the seam's canonical `no such …`,
 *  which callers classify absent-vs-failed via `isNotFound`. Null only where there is no store at all. */
async function assetsDir(slug: string, create: boolean, sub = "assets"): Promise<FsDirectory | null> {
  const project = await residentProjectDir(create);
  if (!project) return null;
  const exhibits = await project.getDirectory("exhibits", { create });
  const ex = await exhibits.getDirectory(slug, { create });
  return ex.getDirectory(sub, { create });
}

async function writeInto(dir: FsDirectory | null, name: string, file: Blob): Promise<void> {
  if (!dir) return;
  const fh = await dir.getFile(name, { create: true });
  const w = await fh.writable();
  await w.write(file); // Blob → the streaming write path on Tauri; createWritable on OPFS
  await w.close();
}

/** Store an imported image (the DISPLAY MASTER) in the exhibit's assets dir. No-op if unsupported. */
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

/** Read an asset's cached waveform peaks. Null when absent, corrupt, failed, or unsupported (→ decode) —
 *  a peaks CACHE is self-healing, so even a real read failure just re-decodes. */
export async function readPeaks(slug: string, name: string): Promise<PeakCache | null> {
  const h = await openAssetFileForDisplay(slug, `${name}.json`, "assets-peaks");
  if (!h) return null;
  try {
    const c = JSON.parse(new TextDecoder().decode(await h.readable())) as PeakCache;
    if (c?.v === 1 && typeof c.duration === "number" && Array.isArray(c.peaks) && c.peaks.length > 0) return c;
  } catch { /* corrupt sidecar → fall through and re-decode */ }
  return null;
}

/** Persist an asset's waveform peaks (written once, after the first decode). No-op if unsupported. */
export async function savePeaks(slug: string, name: string, cache: PeakCache): Promise<void> {
  await writeInto(await assetsDir(slug, true, "assets-peaks"), `${name}.json`, new Blob([JSON.stringify(cache)], { type: "application/json" }));
}

// Neither OPFS nor the native folder persist a file's MIME type — reads come back typeless. Images sniff
// fine, but `<video>`/`<audio>` (and WaveSurfer) can refuse a typeless blob: URL, so restore the type from
// the extension when building a blob: URL.
const EXT_MIME: Record<string, string> = {
  mp4: "video/mp4", m4v: "video/mp4", webm: "video/webm", mov: "video/quicktime", ogv: "video/ogg",
  mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", m4a: "audio/mp4", aac: "audio/aac", flac: "audio/flac",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", avif: "image/avif",
};
function mimeFromName(name: string): string {
  return EXT_MIME[name.toLowerCase().split(".").pop() ?? ""] ?? "";
}

/** A real store read failure (quota, permission, wrong-kind entry, backend corruption) — NOT "absent".
 *  Kept distinct so no caller converts an outage into "nothing stored" (the corrupt≠empty rule,
 *  .claude/rules/render-core-data-integrity.md §2): the publish readers let this propagate so a failed
 *  read fails the publish loudly instead of silently shipping without the asset/thumbnail. */
export class AssetReadFailedError extends Error {
  override name = "AssetReadFailedError";
  constructor(slug: string, path: string, cause: unknown) {
    super(`Failed to read stored asset "${path}" (exhibit "${slug}"): ${cause instanceof Error ? cause.message : String(cause)}`, { cause });
  }
}

/** Resolve a stored asset (in the given `sub` dir) to its seam handle — a LAZY File, NOT read into the JS
 *  heap. The shared navigation both the blob-URL and raw-blob readers below use. Null ONLY when genuinely
 *  absent (no dir chain / no file / no store — the seam's canonical `no such …`, classified by isNotFound);
 *  any other error throws AssetReadFailedError (absent-vs-failed, render-core-data-integrity §2). */
async function openAssetFile(slug: string, name: string, sub: string): Promise<FsFile | null> {
  try {
    const dir = await assetsDir(slug, false, sub);
    if (!dir) return null;
    return await dir.getFile(name); // seam handle — throws the canonical `no such file:` if absent
  } catch (e) {
    if (isNotFound(e)) return null; // not stored (a non-asset source, no baked derivative, or never imported)
    throw new AssetReadFailedError(slug, `${sub}/${name}`, e);
  }
}

/** The DISPLAY-path tolerance policy: a real read failure degrades to the caller's placeholder/fallback
 *  (a grid plate is not worth crashing a render wave) but leaves a loud console trace — deliberately
 *  unlike the publish readers (readAssetBlob/readThumbBytes), which propagate AssetReadFailedError. */
async function openAssetFileForDisplay(slug: string, name: string, sub: string): Promise<FsFile | null> {
  try {
    return await openAssetFile(slug, name, sub);
  } catch (e) {
    console.error(e);
    return null;
  }
}

/** Read a stored asset's bytes into a fresh blob: URL, restoring the MIME the extension implies (the store
 *  drops a file's type → `<video>`/`<audio>`/WaveSurfer can refuse a typeless blob: URL). Materializes the
 *  bytes once (see the module note); caller revokes the URL. */
async function blobUrlFrom(h: FsFile, name: string): Promise<string> {
  const bytes = await h.readable();
  const type = mimeFromName(name);
  return URL.createObjectURL(type ? new Blob([bytes], { type }) : new Blob([bytes]));
}

/** Byte size of a stored asset — METADATA ONLY (a stat; never reads the bytes). 0 if absent or unreadable.
 *  Used by the pre-zip size estimate (LARGE-MEDIA-MEMORY-CEILING #1). */
export async function assetSize(slug: string, name: string): Promise<number> {
  try {
    const h = await openAssetFile(slug, name, "assets");
    return h ? await h.size() : 0;
  } catch {
    return 0; // tolerant: the estimate is advisory, not a hard read
  }
}

/** Resolve a stored asset to a fresh blob: URL (caller must revokeObjectURL). Null if absent — or on a
 *  real read failure (display path: logged, degraded to the caller's fallback). */
export async function readAssetUrl(slug: string, name: string): Promise<string | null> {
  const h = await openAssetFileForDisplay(slug, name, "assets");
  return h ? blobUrlFrom(h, name) : null;
}

/** Resolve a stored asset to its seam File — a LAZY File, NOT read into the JS heap (the publish getAsset
 *  reader, LARGE-MEDIA-MEMORY-CEILING #5). Returning the File (not an ArrayBuffer) lets a streaming target
 *  (FSA folder createWritable / Tauri streaming write / zip sink) consume it without the whole asset
 *  materializing here. Null ONLY if absent; a real read failure propagates AssetReadFailedError (fail the
 *  publish, don't ship a hole). */
export async function readAssetBlob(slug: string, name: string): Promise<Blob | null> {
  const h = await openAssetFile(slug, name, "assets");
  return h ? h.getFile() : null; // the seam File — lazy; not read into memory here
}

/** Read a preserved ORIGINAL's bytes (from `assets-original/`) for opt-in citation publish. Null if absent. */
export async function readOriginalBytes(slug: string, name: string): Promise<ArrayBuffer | null> {
  try {
    const h = await openAssetFile(slug, name, "assets-original");
    return h ? await h.readable() : null;
  } catch {
    return null;
  }
}

/** Resolve a stored baked thumbnail (`assets-thumb/`) to its seam File — lazy, mirroring readAssetBlob (the
 *  publish getThumbnail reader). Null ONLY if absent (publishLibrary then drops the thumbnail ref); a real
 *  read failure propagates AssetReadFailedError so the publish fails loudly instead of silently shipping a
 *  tree without its thumbnails. */
export async function readThumbBytes(slug: string, name: string): Promise<Blob | null> {
  const h = await openAssetFile(slug, name, "assets-thumb");
  return h ? h.getFile() : null;
}

/** Resolve a stored baked thumbnail to a fresh blob: URL (caller revokes) — the small gallery/overview
 *  derivative, so the Studio overview/rail paint shrunk plates instead of decoding full-res masters.
 *  Null when no thumbnail was baked (pre-existing import, or an image already small enough) — or on a
 *  real read failure (display path: logged, degraded to the master fallback). */
export async function readThumbUrl(slug: string, name: string): Promise<string | null> {
  const h = await openAssetFileForDisplay(slug, name, "assets-thumb"); // no baked thumbnail → caller falls back to the master blob
  return h ? blobUrlFrom(h, name) : null;
}
