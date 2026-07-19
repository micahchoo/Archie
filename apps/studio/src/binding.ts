// Browser glue for invention #3 (three-persistence-configs-as-one-"Project", CONTEXT). Capability
// detection + the folder picker + zip download + recents I/O. The PURE model (shapes, recents algebra,
// tolerant parse) lives in @render/core fs/binding.ts and is headless-tested. App.svelte composes these
// with its own library-building (publishLibrary/loadLibrary/libraryToZip) — this module stays free of
// App's internals so the capability seam is isolated. Browser-verified (FSA / localStorage / download).

import { parseRecents, serializeRecents, ZipStreamFilesystem, type Binding, type RecentProject, type ZipFilesystem, type Filesystem } from "@render/core";
import { isTauri, saveTauriFile } from "./tauri-fs.js";

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

/** Download zip bytes as a file — the non-Chromium "Save = download .archie.zip" (the Word-doc-2003 model). */
export function downloadZip(bytes: Uint8Array, filename: string): void {
  const name = filename.endsWith(".archie.zip") ? filename : `${filename}.archie.zip`;
  const url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: "application/zip" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Defer revoke so the download has committed (immediate revoke cancels it in some browsers).
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
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
 * EAGER save of a fully-built library zip to disk — the fallback for when write-through streaming is
 * unavailable: Tauri desktop (native Save dialog → plugin-fs) and non-Chromium browsers (anchor
 * download; the honest floor — no streaming download sink without a service worker). The Chromium
 * streaming path does NOT come here: it publishes into a `ZipStreamFilesystem` via
 * `openStreamingZipSave`, so the tree never materializes. `fs.toZip()` here builds the whole archive
 * as a 2nd full copy in memory, so callers gate it first with a size estimate (`zipSizeOk`) and the
 * tree itself carries an early-abort ceiling (`ZipFilesystem` `maxUncompressedBytes`).
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

/** Streaming save is available where a Chromium `showSaveFilePicker` handle exists AND we're not in
 *  the Tauri webview (desktop has no picker — it saves eager via `saveTauriFile`). When true, the
 *  publish flow writes the whole tree straight to disk in bounded memory (SCALE requirement #1);
 *  when false it falls back to `saveZipToDisk` (eager, size-guarded). */
export function supportsStreamingZipSave(): boolean {
  return !isTauri() && supportsFileStreamSave();
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

/**
 * Open a `showSaveFilePicker` handle and wrap its writable stream in a `ZipStreamFilesystem`, so a
 * publish pass can write the whole tree straight to disk without ever holding the media in memory
 * (SCALE LARGE-MEDIA-MEMORY-CEILING A — the ~10 GB of masters/thumbs/tiles streams to disk and
 * releases). `null` = the user dismissed the picker. Only call when `supportsStreamingZipSave()`.
 */
export async function openStreamingZipSave(filename: string): Promise<StreamingZipTarget | null> {
  const name = filename.endsWith(".archie.zip") ? filename : `${filename}.archie.zip`;
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

/** Load the recent-projects list from localStorage (tolerant; [] if disabled/empty/corrupt). */
export function loadRecents(): RecentProject[] {
  try { return parseRecents(localStorage.getItem(RECENTS_KEY)); }
  catch { return []; }
}

/** Persist the recent-projects list. No-op if storage is disabled (private mode). */
export function saveRecents(list: RecentProject[]): void {
  try { localStorage.setItem(RECENTS_KEY, serializeRecents(list)); }
  catch { /* storage unavailable */ }
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
 *  next write (a user gesture). Returns unbound if nothing was stored or the record is malformed. */
export function loadLastBinding(): Binding {
  try {
    const raw = localStorage.getItem(BINDING_KEY);
    if (!raw) return { kind: "unbound" };
    const b = JSON.parse(raw) as Binding;
    if (b && (b.kind === "folder" || b.kind === "file") && typeof b.name === "string") {
      return { kind: b.kind, name: b.name, ...(typeof b.handleKey === "string" ? { handleKey: b.handleKey } : {}) };
    }
  } catch { /* fall through */ }
  return { kind: "unbound" };
}

/** Persist (or clear, when unbound) the active binding descriptor. */
export function saveLastBinding(b: Binding): void {
  try {
    if (b.kind === "unbound") localStorage.removeItem(BINDING_KEY);
    else localStorage.setItem(BINDING_KEY, JSON.stringify(b));
  } catch { /* storage unavailable */ }
}
