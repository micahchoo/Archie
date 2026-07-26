// Tauri desktop glue — the platform binding for the TauriFilesystem backend (the headless core +
// node-bridge conformance live in @render/core fs/tauri.ts). Mirrors the headless-core / app-glue
// split that src/binding.ts documents for the browser (FSA/zip/localStorage). This is the ONLY
// place @tauri-apps/* is touched.
//
// The @tauri-apps/* imports are LITERAL dynamic imports: Vite bundles each as its own lazy chunk,
// so they are resolvable inside the webview at runtime BUT are never fetched on the web (isTauri()
// is false there, so the import() never runs). That keeps the desktop deps off the browser's hot
// path while still letting the packaged app load them from the bundle.

import { TauriFilesystem, ZipStreamFilesystem, type TauriFsBridge, type TauriDirEntry } from "@render/core";
import { readNativeFolderFiles, type NativeFolderResult } from "./folder-native.js";
import type { StreamingZipTarget } from "./binding.js"; // type-only — erased, no runtime cycle

/** True when running inside the Tauri webview. v2 always injects __TAURI_INTERNALS__. */
export function isTauri(): boolean {
  return typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);
}

/** Build the TauriFsBridge over @tauri-apps/plugin-fs — the 1:1 adapter the conformance test stands in for. */
export async function tauriFsBridge(): Promise<TauriFsBridge> {
  const fs = await import("@tauri-apps/plugin-fs");
  // convertFileSrc is captured here (the bridge build is async) so the SYNC resolveUrl below can call it.
  const { convertFileSrc } = await import("@tauri-apps/api/core");
  return {
    readFile: (path) => fs.readFile(path),
    writeFile: (path, data) => fs.writeFile(path, data),
    // Streaming write handle for the large-asset path (TauriFile.writable given a Blob). Same
    // create+truncate open() the streaming-zip sink uses; FileHandle.write is POSIX (returns bytes
    // written), so render-core's writeAllToHandle loops it. See .claude/rules/tauri-fs-seam.md.
    async open(path) {
      const fh = await fs.open(path, { write: true, create: true, truncate: true });
      return { write: (data) => fh.write(data), close: () => fh.close() };
    },
    rename: (oldPath, newPath) => fs.rename(oldPath, newPath),
    mkdir: (path) => fs.mkdir(path, { recursive: true }),
    async readDir(path): Promise<TauriDirEntry[]> {
      return (await fs.readDir(path)).map((e) => ({ name: e.name, isDirectory: e.isDirectory }));
    },
    remove: (path) => fs.remove(path, { recursive: true }),
    exists: (path) => fs.exists(path),
    // stat WITHOUT reading — backs FsFile.size() + the stat-sized lazy getFile() (Archie-623e cap 2).
    stat: async (path) => ({ size: (await fs.stat(path)).size }),
    // convertFileSrc → an asset:// URL the webview streams from disk with native byte-range seeking
    // (Archie-623e cap 3 — Phase-4 AV). Sync, per convertFileSrc; the assetProtocol scope + CSP already
    // permit it (.claude/rules/tauri-csp.md), so this spends the unused capability with no CSP change.
    resolveUrl: (path) => convertFileSrc(path),
  };
}

/** Default library root inside the OS app-data dir (the desktop analogue of OPFS-only "this browser"). */
export async function defaultLibraryRoot(): Promise<string> {
  const { appDataDir, join } = await import("@tauri-apps/api/path");
  return join(await appDataDir(), "library");
}

/** Prompt for a folder to bind a Project to — the desktop analogue of src/binding.ts `pickFolder()`. */
export async function pickTauriFolder(): Promise<string | null> {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const picked = await open({ directory: true, multiple: false });
  return typeof picked === "string" ? picked : null;
}

/**
 * Pick a folder of MEDIA and read it into the `File[]` the create dialog's folder path consumes
 * (Archie-ce7a). The desktop replacement for `<input type="file" webkitdirectory>`, which WebKitGTK
 * degrades to a single-file picker — see folder-native.ts for the full why and for the memory bound.
 *
 * Lives here rather than in the dialog because this module is the ONLY place `@tauri-apps/*` is
 * touched (see the file header); folder-native.ts stays platform-free and unit-testable, and this is
 * the three-line composition that binds it to the real bridge. Returns null when the user cancels —
 * distinct from a folder that yielded no importable media, which is `files: []`.
 *
 * Path joining is a plain "/" join, not `@tauri-apps/api/path`'s async `join`: the walker needs a
 * synchronous joiner, and forward slashes are accepted by the Rust std path handling behind
 * plugin-fs on every platform Archie targets.
 */
export async function pickAndReadTauriFolder(): Promise<NativeFolderResult | null> {
  const rootPath = await pickTauriFolder();
  if (rootPath === null) return null;
  return readNativeFolderFiles(rootPath, await tauriFsBridge());
}

/**
 * The desktop Filesystem for a given root folder. App.svelte (via folder-backend) selects this over
 * the browser backends when `isTauri()` — one native backend replaces the FSA-vs-zip capability dance.
 */
export async function makeTauriFilesystem(rootPath: string): Promise<TauriFilesystem> {
  return new TauriFilesystem(await tauriFsBridge(), rootPath);
}

/**
 * Native "Save As" for a generated file (the .archie.zip export). The desktop replacement for the
 * browser blob-`<a download>`, which a webview has no handler for. Returns the chosen path, or null
 * if the user cancelled.
 */
/**
 * Fetch a remote URL through Tauri's NATIVE http (no webview CORS / cross-origin-redirect rules)
 * and hand back a same-origin blob: URL. For remote media (e.g. an archive.org MP3 that 302-redirects
 * to a mirror host) the webview's own fetch fails with "Load failed"; the native fetch follows the
 * redirect and returns the bytes. Caller owns revoking the returned object URL.
 */
export async function fetchRemoteAsBlobUrl(url: string): Promise<string> {
  const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
  const resp = await tauriFetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const buf = await resp.arrayBuffer();
  const type = resp.headers.get("content-type") || "application/octet-stream";
  return URL.createObjectURL(new Blob([buf], { type }));
}

/**
 * Fetch + parse a remote JSON document through Tauri's NATIVE http — the JSON sibling of
 * fetchRemoteAsBlobUrl for a IIIF `info.json`. OSD's own info.json load is a webview XHR, which a
 * CORS-restricted / cross-origin-redirecting IIIF host blocks (the surface then open-fails); the native
 * fetch bypasses webview CORS, and the parsed object is handed to OSD as a data tile source so the
 * surface opens without a second webview fetch. Returned as `unknown` — the caller (the @render/mount
 * native-fetch seam) passes it straight to OpenSeadragon, which classifies it via determineType.
 *
 * NB: this can't route through fetchRemoteAsBlobUrl + `fetch(blobUrl)` — the CSP's `connect-src` allows
 * `https:` but NOT `blob:`, so a webview fetch of a blob: URL is refused (see .claude/rules/tauri-csp.md).
 * A native fetch that returns the parsed value directly sidesteps that entirely.
 */
export async function fetchRemoteJson(url: string): Promise<unknown> {
  const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
  const resp = await tauriFetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

export async function saveTauriFile(suggestedName: string, bytes: Uint8Array): Promise<string | null> {
  const { save } = await import("@tauri-apps/plugin-dialog");
  const path = await save({
    defaultPath: suggestedName,
    filters: [{ name: "Archie library", extensions: ["zip"] }],
  });
  if (!path) return null;
  const { writeFile } = await import("@tauri-apps/plugin-fs");
  await writeFile(path, bytes);
  return path;
}

/** The slice of a plugin-fs `FileHandle` the streaming zip sink needs (injectable for tests —
 *  the real handle comes from `fs.open`, which vitest can't reach). */
export interface TauriFileHandleLike {
  write(data: Uint8Array): Promise<number>;
  close(): Promise<void>;
}

/** Drain ONE chunk fully into a plugin-fs handle. `FileHandle.write` follows the POSIX contract —
 *  it may commit FEWER bytes than given and returns how many — so a single bare call can silently
 *  truncate the archive; loop until the chunk is fully committed. */
export async function writeAllToTauriHandle(fh: TauriFileHandleLike, chunk: Uint8Array): Promise<void> {
  let off = 0;
  while (off < chunk.byteLength) {
    const n = await fh.write(off === 0 ? chunk : chunk.subarray(off));
    if (n <= 0) throw new Error(`plugin-fs write made no progress at byte ${off}/${chunk.byteLength}`);
    off += n;
  }
}

/**
 * Desktop streaming `.archie.zip` save — the Tauri analogue of the browser `openStreamingZipSave`
 * (SCALE #1): native Save dialog → plugin-fs `open()` → each published file streams through the
 * fflate zip into the handle and is released, so a full-media export runs in bounded memory instead
 * of tripping the eager path's 1 GiB assembly ceiling. `null` = the user cancelled the dialog.
 *
 * Deliberately streams STRAIGHT to the picked path (no temp-then-rename, unlike TauriFilesystem's
 * durable-state writes — see .claude/rules/tauri-fs-seam.md): the dialog's runtime scope grant
 * covers exactly the picked path, so a sibling `.tmp` may be OUTSIDE the static fs scope
 * (`$HOME/**`/`$APPDATA/**`) when the user saves elsewhere, and the export artifact is not app
 * state — on failure `abort()` removes the partial file and the error surfaces, same posture as
 * the eager `saveTauriFile` (truncate-then-write) this replaces on the streaming path.
 */
export async function openTauriStreamingZipSave(suggestedName: string): Promise<StreamingZipTarget | null> {
  const { save } = await import("@tauri-apps/plugin-dialog");
  const path = await save({
    defaultPath: suggestedName,
    filters: [{ name: "Archie library", extensions: ["zip"] }],
  });
  if (!path) return null;
  const fsp = await import("@tauri-apps/plugin-fs");
  const fh = await fsp.open(path, { write: true, create: true, truncate: true });
  const fs = new ZipStreamFilesystem({
    write: (chunk) => writeAllToTauriHandle(fh, chunk),
    close: () => fh.close(),
  });
  return {
    fs,
    name: path.split("/").pop() || suggestedName,
    finish: () => fs.finish(), // drains queued entries + central directory, then closes the handle
    // The primary publish failure surfaces to the caller; cleanup failing is a SEPARATE secondary
    // failure (a stuck partial file) — log rather than mask the primary (tend Issue 4 posture).
    abort: async () => {
      try { await fh.close(); } catch { /* already closed by a failed sink close — fine */ }
      try { await fsp.remove(path); } catch (e) { console.warn("openTauriStreamingZipSave: couldn't remove the partial export", e); }
    },
  };
}
