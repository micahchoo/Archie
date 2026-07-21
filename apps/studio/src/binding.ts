// Browser glue for invention #3 (three-persistence-configs-as-one-"Project", CONTEXT). Capability
// detection + the folder picker + zip download + recents I/O. The PURE model (shapes, recents algebra,
// tolerant parse) lives in @render/core fs/binding.ts and is headless-tested. App.svelte composes these
// with its own library-building (publishLibrary/loadLibrary/libraryToZip) — this module stays free of
// App's internals so the capability seam is isolated. Browser-verified (FSA / localStorage / download).

import { parseRecents, serializeRecents, ZipStreamFilesystem, type Binding, type RecentProject, type ZipFilesystem, type Filesystem } from "@render/core";
import { isTauri, saveTauriFile, openTauriStreamingZipSave } from "./tauri-fs.js";
import { safeGet, safeSet, safeRemove, readJson, writeJson } from "./persisted.js";

const RECENTS_KEY = "archie.recentProjects.v1";
const BINDING_KEY = "archie.activeBinding.v1";

/** Chromium-class browsers expose a writable directory picker; Firefox/Safari do not (→ zip-as-file).
 *  This is the ONLY place capability is read — the user never sees it (CONTEXT principle #5). */
export function supportsFolderPicker(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

type DirPicker = { showDirectoryPicker(o?: { mode?: string }): Promise<FileSystemDirectoryHandle> };

/** Prompt for a folder to bind a Project to (readwrite). Null if cancelled or unsupported. */
export async function pickFolder(): Promise<FileSystemDirectoryHandle | null> {
  if (!supportsFolderPicker()) return null;
  try { return await (window as unknown as DirPicker).showDirectoryPicker({ mode: "readwrite" }); }
  catch { return null; /* user dismissed the picker */ }
}

/** Hand a Blob to the browser's download pipeline (anchor click), deferring the object-URL revoke so
 *  the download has committed first (immediate revoke cancels it in some browsers). A blob URL is a
 *  REFERENCE — for a disk-backed File (OPFS staging) the browser streams from disk, no memory copy. */
function triggerBlobDownload(blob: Blob, name: string, revokeAfterMs: number): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), revokeAfterMs);
}

/** Download zip bytes as a file — the non-Chromium "Save = download .archie.zip" (the Word-doc-2003 model). */
export function downloadZip(bytes: Uint8Array, filename: string): void {
  const name = filename.endsWith(".archie.zip") ? filename : `${filename}.archie.zip`;
  triggerBlobDownload(new Blob([bytes as unknown as BlobPart], { type: "application/zip" }), name, 60_000);
}

/** Chromium-class browsers expose `showSaveFilePicker` → a writable file STREAM. This is where the
 *  streaming-zip save (LARGE-MEDIA-MEMORY-CEILING A.1) goes, so a big library's archive never fully
 *  materializes in memory. Distinct from `supportsFolderPicker` (which binds a whole project folder). */
export function supportsFileStreamSave(): boolean {
  return typeof window !== "undefined" && "showSaveFilePicker" in window;
}

type SavePicker = {
  showSaveFilePicker(o?: {
    suggestedName?: string;
    types?: { description?: string; accept: Record<string, string[]> }[];
  }): Promise<FileSystemFileHandle>;
};

/** What a save actually did, so the UI can report it honestly (streamed-to-disk vs eager download). */
export type ZipSaveResult =
  | { kind: "streamed"; name: string }
  | { kind: "downloaded"; name: string }
  | { kind: "cancelled" };

/**
 * EAGER save of a fully-built library zip to disk — the floor for when write-through streaming is
 * unavailable, which since the OPFS-staged and Tauri sinks landed means only a browser with neither
 * `showSaveFilePicker` nor OPFS `createWritable` (older Safari-class). Tauri/Chromium/Firefox all
 * stream via `openStreamingZipSave` instead, so the tree never materializes there. `fs.toZip()` here
 * builds the whole archive as a 2nd full copy in memory, so callers gate it first with a size
 * estimate (`zipSizeOk`) and the tree itself carries an early-abort ceiling (`ZipFilesystem`
 * `maxUncompressedBytes`). (The isTauri branch is kept as a defensive fallback for direct callers,
 * though the publish flow no longer routes desktop saves here.)
 */
export async function saveZipToDisk(fs: ZipFilesystem, filename: string): Promise<ZipSaveResult> {
  const name = filename.endsWith(".archie.zip") ? filename : `${filename}.archie.zip`;
  if (isTauri()) {
    // Desktop: a native Save dialog → plugin-fs write. The webview has no blob-download handler, so
    // the browser anchor-download path below silently no-ops there — this is the real save sink.
    const path = await saveTauriFile(name, fs.toZip());
    if (!path) return { kind: "cancelled" };
    return { kind: "streamed", name: path.split("/").pop() || name };
  }
  downloadZip(fs.toZip(), name);
  return { kind: "downloaded", name };
}

/** Firefox/Safari-class fallback capability: no save picker, but OPFS `createWritable` exists — the
 *  zip can be STAGED in OPFS (streamed to browser-managed disk in bounded memory), then handed to the
 *  download pipeline as a disk-backed File. Guarded per-feature: node/older Safari fail a probe. */
export function supportsOpfsStagedZipSave(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.storage?.getDirectory === "function" &&
    typeof FileSystemFileHandle !== "undefined" &&
    "createWritable" in FileSystemFileHandle.prototype &&
    typeof document !== "undefined"
  );
}

/** Streaming save is available on ALL THREE first-class platforms now — Chromium (`showSaveFilePicker`
 *  → write-through to the picked file), Tauri desktop (native dialog → plugin-fs handle), and
 *  Firefox/Safari (OPFS staging → disk-backed download). When true, the publish flow writes the whole
 *  tree in bounded memory with NO size ceiling (SCALE requirement #1); when false (a browser with
 *  neither a picker nor OPFS `createWritable`) it falls back to `saveZipToDisk` (eager, size-guarded,
 *  1 GiB ceiling — the honest floor). */
export function supportsStreamingZipSave(): boolean {
  if (isTauri()) return true; // desktop streams via plugin-fs (openTauriStreamingZipSave)
  return supportsFileStreamSave() || supportsOpfsStagedZipSave();
}

/** A save picker opened as a write-through streaming zip target (see `openStreamingZipSave`). */
export interface StreamingZipTarget {
  /** Publish the library INTO this — every file streams to disk on close; media never accumulates. */
  fs: Filesystem;
  /** The chosen filename (`handle.name`). */
  name: string;
  /** Flush queued entries, write the central directory, close the disk handle. Call after publishing. */
  finish(): Promise<void>;
  /** Discard the partial file (on a publish failure). Never throws. */
  abort(): Promise<void>;
}

// ——— OPFS staging (the Firefox/Safari streaming sink) ———————————————————————————————————————————

/** OPFS staging dir for in-flight zip exports. A SIBLING of the project store dir at the OPFS root
 *  (store.ts's "archie-demo-project") — never inside it, so store sweeps/reads can't collide. */
const EXPORT_TMP_DIR = "archie-export-tmp";
/** How long after the anchor click the staged file + its object URL live: long enough for the
 *  browser to finish copying a multi-GB file into the user's download location, short enough that
 *  the staging copy doesn't squat on quota. The sweep catches anything this timer never reached
 *  (tab closed mid-window). */
const STAGED_CLEANUP_MS = 5 * 60_000;
/** Sweep staged files older than this at the next export — only ever leftovers from a crashed or
 *  closed session (a live export's file is younger, and its own timer deletes it). */
const STAGED_SWEEP_AGE_MS = 10 * 60_000;

/** The minimal OPFS surface the staged save touches — structural slices of the real handle types, so
 *  tests can inject an in-memory fake (the same reason ZipSink exists render-core-side). */
export interface StagedDirLike {
  keys(): AsyncIterableIterator<string>;
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<{
    createWritable(): Promise<{ write(c: Uint8Array): void | Promise<void>; close(): void | Promise<void>; abort?(): void | Promise<void> }>;
    getFile(): Promise<File>;
  }>;
  removeEntry(name: string): Promise<void>;
}
/** The staged save's environment seam (production defaults; injectable for tests). */
export interface StagedSaveEnv {
  /** The staging directory (production: `{OPFS root}/archie-export-tmp`). */
  dir(): Promise<StagedDirLike>;
  /** Hand the finished disk-backed File to the download pipeline (production: anchor click). */
  deliver(file: File, name: string): void;
  /** Schedule the post-download cleanup (production: setTimeout at STAGED_CLEANUP_MS). */
  later(fn: () => void): void;
}

const realStagedEnv: StagedSaveEnv = {
  async dir() {
    const root = await navigator.storage.getDirectory();
    // keys() lives in the DOM iterable lib; the structural type keeps us honest about what we touch.
    return (await root.getDirectoryHandle(EXPORT_TMP_DIR, { create: true })) as unknown as StagedDirLike;
  },
  deliver: (file, name) => triggerBlobDownload(file, name, STAGED_CLEANUP_MS),
  later: (fn) => void setTimeout(fn, STAGED_CLEANUP_MS),
};

/** Best-effort: drop staged exports a crashed/closed session left behind. Never blocks the save. */
async function sweepStaleStaged(dir: StagedDirLike): Promise<void> {
  try {
    const names: string[] = [];
    for await (const n of dir.keys()) names.push(n);
    for (const n of names) {
      try {
        const f = await (await dir.getFileHandle(n)).getFile();
        if (Date.now() - f.lastModified > STAGED_SWEEP_AGE_MS) await dir.removeEntry(n);
      } catch { /* vanished mid-sweep / not a file — skip */ }
    }
  } catch { /* sweep is advisory */ }
}

/**
 * The no-picker streaming save (Firefox/Safari): stream the archive into an OPFS staging file in
 * bounded memory (media released as it goes — same ZipStreamFilesystem contract as the picker path),
 * then hand the DISK-BACKED File to the download pipeline. `URL.createObjectURL` on that File is a
 * reference, not a copy — the browser streams it from disk into the user's Downloads, so the archive
 * never materializes in memory at any point. The staging copy is deleted after `STAGED_CLEANUP_MS`
 * (and stale ones swept on the next export). Unlike the picker path there is nothing to dismiss, so
 * this never returns null — the browser's own download UI is the user-facing surface.
 */
export async function openOpfsStagedZipSave(filename: string, env: StagedSaveEnv = realStagedEnv): Promise<StreamingZipTarget> {
  const name = filename.endsWith(".archie.zip") ? filename : `${filename}.archie.zip`;
  const dir = await env.dir();
  await sweepStaleStaged(dir);
  const tmpName = `${Date.now().toString(36)}-${name}`; // unique per export; sweep-aged by mtime
  const handle = await dir.getFileHandle(tmpName, { create: true });
  const writable = await handle.createWritable();
  const fs = new ZipStreamFilesystem({
    write: (chunk) => writable.write(chunk),
    close: () => writable.close(),
  });
  const discard = async () => {
    try { await dir.removeEntry(tmpName); } catch (e) { console.warn("openOpfsStagedZipSave: couldn't remove the staged export", e); }
  };
  return {
    fs,
    name,
    finish: async () => {
      await fs.finish(); // drains + central directory + closes the OPFS writable (commits the staged file)
      env.deliver(await handle.getFile(), name);
      env.later(() => void discard()); // delete the staging copy once the download has committed
    },
    // The primary publish failure surfaces to the caller; cleanup failing is a SEPARATE secondary
    // failure — log rather than mask the primary (tend Issue 4 posture, matching the picker path).
    abort: async () => {
      try { await writable.abort?.(); } catch { /* already closed by a failed sink close — fine */ }
      await discard();
    },
  };
}

/**
 * Open a streaming `.archie.zip` save target on whatever this platform provides — the capability
 * dance mirrors `supportsStreamingZipSave` and stays invisible to the user (CONTEXT principle #5):
 *  - Tauri desktop → native Save dialog + plugin-fs handle (tauri-fs.ts);
 *  - Chromium → `showSaveFilePicker` → write-through to the picked file;
 *  - Firefox/Safari → OPFS staging → disk-backed download (`openOpfsStagedZipSave`).
 * Every branch publishes into a `ZipStreamFilesystem`, so the whole tree streams in bounded memory
 * (SCALE LARGE-MEDIA-MEMORY-CEILING A — the ~10 GB of masters/thumbs/tiles never accumulates).
 * `null` = the user dismissed the dialog (picker/Tauri only). Only call when `supportsStreamingZipSave()`.
 */
export async function openStreamingZipSave(filename: string): Promise<StreamingZipTarget | null> {
  const name = filename.endsWith(".archie.zip") ? filename : `${filename}.archie.zip`;
  if (isTauri()) return openTauriStreamingZipSave(name);
  if (!supportsFileStreamSave()) return openOpfsStagedZipSave(name);
  let handle: FileSystemFileHandle;
  try {
    handle = await (window as unknown as SavePicker).showSaveFilePicker({
      suggestedName: name,
      types: [{ description: "Archie library", accept: { "application/zip": [".archie.zip"] } }],
    });
  } catch {
    return null; // user dismissed the picker
  }
  const writable = await handle.createWritable();
  const fs = new ZipStreamFilesystem({
    // fflate's zip stream always hands back a freshly-allocated (never SharedArrayBuffer-backed)
    // Uint8Array; FileSystemWritableFileStream.write's type is narrower than Uint8Array's default
    // generic (which allows ArrayBufferLike, i.e. SharedArrayBuffer too).
    write: (chunk) => writable.write(chunk as Uint8Array<ArrayBuffer>),
    close: () => writable.close(),
  });
  return {
    fs,
    name: handle.name ?? name,
    finish: () => fs.finish(),
    // The primary publish failure surfaces to the caller; abort() failing is a SEPARATE secondary
    // failure (a stuck partial file) — log rather than mask the primary (tend Issue 4 posture).
    abort: () => writable.abort().catch((abortErr) => console.warn("openStreamingZipSave: couldn't discard the partial file", abortErr)),
  };
}

/** A filesystem-safe `.archie.zip` filename derived from a project/library title. */
export function zipNameFor(title: string): string {
  const base = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "library";
  return `${base}.archie.zip`;
}

/** Load the recent-projects list from localStorage (tolerant; [] if disabled/empty/corrupt).
 *  `parseRecents` itself is the tolerant-parse (it takes the raw string, not JSON.parse output), so this
 *  uses the persisted.ts CORE (safeGet) rather than the JSON helpers — the outer try/catch stays as a
 *  defensive wrapper in case `parseRecents` itself ever throws, mirroring the original behavior. */
export function loadRecents(): RecentProject[] {
  try { return parseRecents(safeGet(RECENTS_KEY)); }
  catch { return []; }
}

/** Persist the recent-projects list. No-op if storage is disabled (private mode). */
export function saveRecents(list: RecentProject[]): void {
  try { safeSet(RECENTS_KEY, serializeRecents(list)); }
  catch { /* storage unavailable, or serializeRecents itself threw */ }
}

/**
 * Reconcile recents across tabs (ISSUES.md Issue 22 / ledgers/TABS.md). localStorage is origin-shared,
 * but each tab keeps its OWN in-memory recents snapshot and OVERWRITES the whole key on save — so a
 * recent added in tab B is silently dropped the next time tab A saves from its boot-time snapshot
 * (last-writer-wins, lost update). The `storage` event fires in EVERY OTHER tab when the key changes;
 * adopting the written list the instant it lands keeps each tab's snapshot fresh, so it never saves over
 * another tab's addition. Adopt-on-event is removal-safe too (a tab that removed an entry writes the
 * shorter list; other tabs adopt it), unlike a union-merge which would resurrect a just-forgotten entry.
 * No-op without `window` (node/SSR). Returns an unsubscribe.
 */
export function subscribeRecents(onChange: (list: RecentProject[]) => void): () => void {
  if (typeof window === "undefined" || typeof window.addEventListener !== "function") return () => {};
  const handler = (e: StorageEvent) => {
    if (e.key !== null && e.key !== RECENTS_KEY) return; // ignore unrelated keys; key===null = storage.clear()
    onChange(loadRecents()); // re-read + tolerant-parse the current shared list (never trust e.newValue raw)
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}

/** Restore the active binding DESCRIPTOR across reloads so the UI shows continuity ("bound to X").
 *  The folder handle itself lives in IndexedDB (handleKey); permission is re-granted lazily on the
 *  next write (a user gesture). Returns unbound if nothing was stored or the record is malformed.
 *  `readJson` (no validator — trust-the-parse) collapses absent/denied/malformed-JSON to null exactly
 *  like the original's `!raw` check + catch-all; the shape check + field-picking reshape below is
 *  unchanged. */
export function loadLastBinding(): Binding {
  const b = readJson<Binding>(BINDING_KEY);
  if (b && (b.kind === "folder" || b.kind === "file") && typeof b.name === "string") {
    return { kind: b.kind, name: b.name, ...(typeof b.handleKey === "string" ? { handleKey: b.handleKey } : {}) };
  }
  return { kind: "unbound" };
}

/** Persist (or clear, when unbound) the active binding descriptor. */
export function saveLastBinding(b: Binding): void {
  if (b.kind === "unbound") safeRemove(BINDING_KEY);
  else writeJson(BINDING_KEY, b);
}
