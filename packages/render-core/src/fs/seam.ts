// The Filesystem seam (ADR-0003 storage row / Q-5 source-before-projection; spike-0001
// module 3, CLEAN-LIFT from anvil storage/backends/types.ts).
//
// This is the SOURCE interface; its backends are the thin projections. Per the
// source-before-projection rule the seam is declared FIRST (Phase 0) and the three
// backends are built behind it in Phase 2:
//   - FsaFilesystem      — Chromium folder (the git / GH-Pages on-ramp; autosave in place)
//   - DownloadFilesystem — non-Chromium (OPFS working copy + zip IS the canonical file)
//   - (OPFS ephemeral)   — Playground working store
// The user-facing model is ONLY Playground vs Project; capability never leaks to the user.
//
// Names are Fs-prefixed to avoid shadowing the DOM `File` / `Directory` globals.

export interface Filesystem {
  root(): Promise<FsDirectory>;
}

export interface FsDirectory {
  getDirectory(name: string, opts?: { create?: boolean }): Promise<FsDirectory>;
  getFile(name: string, opts?: { create?: boolean }): Promise<FsFile>;
  remove(name: string): Promise<void>;
  /**
   * Immediate children. CONTRACT: a directory is observable here once it has CONTENT — empty
   * directories are NOT guaranteed to persist or appear (zip-style backends keep dirs implicit
   * as path prefixes). Don't rely on empty-dir round-trips; the conformance suite pins this.
   */
  entries(): AsyncIterable<{ name: string; kind: "file" | "directory" }>;
}

export interface FsFile {
  readable(): Promise<ArrayBuffer>;
  writable(): Promise<FsWritable>;
  /**
   * A `File` handle mirroring FSA's `FileSystemFileHandle.getFile()`. CONTRACT (sharpened Archie-623e
   * Phase-2 seam extension): this NEVER pre-materializes the file's bytes into the JS heap — the read
   * is deferred until the returned File's content is consumed. FSA/OPFS give this for free (a live
   * disk-backed File); the Tauri backend reworks its old readFile()-whole implementation to a
   * stat-sized lazy File (fs/tauri.ts). The large-media publish path (readAssetBlob) depends on this.
   *
   * READ the returned File via `arrayBuffer()` / `stream()` / `text()` (or the seam's `readable()`).
   * Do NOT hand it to `URL.createObjectURL` / `FileSystemWritableFileStream.write` / `slice()`: a lazy
   * backend's File has no materialized byte storage, so those (which read the internal byte sequence,
   * not the JS methods) see nothing. For a blob: URL, read `readable()` and build a real Blob (see
   * asset-store.ts `readAssetUrl`); for native AV playback use `resolveUrl?.()` instead.
   */
  getFile(): Promise<File>;
  /**
   * Byte size WITHOUT reading the content (a stat) — Archie-623e capability (2). The pre-zip size
   * estimate (LARGE-MEDIA-MEMORY-CEILING) and `asset-store.ts` `assetSize` use this so metadata never
   * pulls a multi-GB asset into heap. Every backend implements it; a read-only backend with no cheap
   * probe (HTTP) may pay a read to answer.
   */
  size(): Promise<number>;
  /**
   * OPTIONAL — a backend-native URL a webview element can load DIRECTLY, bypassing a blob: URL.
   * Archie-623e capability (3): ONLY the Tauri backend implements it (`convertFileSrc` → an
   * `asset://…` URL the webview streams from disk with native byte-range seeking, so multi-GB AV
   * plays without reading into heap). Every other backend leaves it undefined; callers MUST fall back
   * to a blob: URL (`readable()`) when `file.resolveUrl` is absent or resolves to `undefined`.
   */
  resolveUrl?(): Promise<string | undefined>;
}

export interface FsWritable {
  write(data: string | Blob | ArrayBuffer): Promise<void>;
  close(): Promise<void>;
}
