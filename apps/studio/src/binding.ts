// Browser glue for invention #3 (three-persistence-configs-as-one-"Project", CONTEXT). Capability
// detection + the folder picker + zip download + recents I/O. The PURE model (shapes, recents algebra,
// tolerant parse) lives in @render/core fs/binding.ts and is headless-tested. App.svelte composes these
// with its own library-building (publishLibrary/loadLibrary/libraryToZip) — this module stays free of
// App's internals so the capability seam is isolated. Browser-verified (FSA / localStorage / download).

import { parseRecents, serializeRecents, type Binding, type RecentProject, type ZipFilesystem } from "@render/core";

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
 * Save a published library to a `.archie.zip` on disk. On Chromium, STREAM it chunk-by-chunk through
 * a `showSaveFilePicker` file handle (`FileSystemWritableFileStream`) via `fs.streamZip`, so the
 * archive never fully materializes — the A.1 memory fix. Elsewhere, fall back to the eager
 * `fs.toZip()` + anchor download (the honest floor: non-Chromium has no streaming download sink
 * without a service worker). Returns what happened. Aborts the partial file if streaming throws.
 */
export async function saveZipToDisk(fs: ZipFilesystem, filename: string): Promise<ZipSaveResult> {
  const name = filename.endsWith(".archie.zip") ? filename : `${filename}.archie.zip`;
  if (supportsFileStreamSave()) {
    let handle: FileSystemFileHandle;
    try {
      handle = await (window as unknown as SavePicker).showSaveFilePicker({
        suggestedName: name,
        types: [{ description: "Archie library", accept: { "application/zip": [".archie.zip"] } }],
      });
    } catch {
      return { kind: "cancelled" }; // user dismissed the picker
    }
    const writable = await handle.createWritable();
    try {
      await fs.streamZip({
        write: (chunk) => writable.write(chunk as unknown as ArrayBufferView),
        close: () => writable.close(),
      });
    } catch (e) {
      await writable.abort().catch(() => {}); // discard the partial file
      throw e;
    }
    return { kind: "streamed", name: handle.name ?? name };
  }
  downloadZip(fs.toZip(), name);
  return { kind: "downloaded", name };
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
