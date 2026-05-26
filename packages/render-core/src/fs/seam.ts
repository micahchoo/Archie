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
  /** Mirrors FSA's FileSystemFileHandle.getFile() so callers can read name/size/lastModified. */
  getFile(): Promise<File>;
}

export interface FsWritable {
  write(data: string | Blob | ArrayBuffer): Promise<void>;
  close(): Promise<void>;
}
