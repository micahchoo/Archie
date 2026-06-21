// Folder-binding platform backend — a folder-bound Project behind the Filesystem seam, across the
// two desktop capabilities: Chromium File System Access (browser) and Tauri native fs (desktop).
// Each picker returns a FolderBinding (the seam `fs` + a display name + an opaque reopen key), so
// the binding store and publish flows speak ONE currency (Filesystem) regardless of platform.
//
// The browser (FSA) path is byte-for-byte the prior behavior — uuid handle-key + the IndexedDB
// handle store + a permission gesture on reopen. Tauri is an ADDED branch, gated by isTauri()
// (false in any browser), whose reopen key is just the absolute path (no IndexedDB, no gesture).
// Mirrors the headless-core / app-glue split documented in binding.ts.

import { FsaFilesystem, type Filesystem } from "@render/core";
import { supportsFolderPicker, pickFolder } from "./binding.js";
import { putHandle, getHandle, deleteHandle, requestPermission } from "./handles-db.js";
import { isTauri, pickTauriFolder, makeTauriFilesystem } from "./tauri-fs.js";

/** A folder-bound Project resolved to the Filesystem seam plus its reopen descriptor. */
export interface FolderBinding {
  /** The seam — loadLibrary / publishLibrary consume this, platform-agnostic. */
  fs: Filesystem;
  /** Display name: the folder's basename (CONTEXT principle #5 — the place shows, not the mechanism). */
  name: string;
  /** Reopen key: a uuid into the FSA handle store (browser) or the absolute path (Tauri). */
  key: string;
}

/** basename of a "/"-separated path. */
function baseName(path: string): string {
  const parts = path.replace(/\/+$/, "").split("/");
  return parts[parts.length - 1] || path;
}

/** Does this platform offer a writable folder sink? Tauri always; else Chromium-class FSA. */
export function folderSinkSupported(): boolean {
  return isTauri() || supportsFolderPicker();
}

/** Prompt for a folder and resolve it to a FolderBinding. Null = cancelled / unsupported. */
export async function pickFolderBinding(): Promise<FolderBinding | null> {
  if (isTauri()) {
    const path = await pickTauriFolder();
    if (!path) return null;
    return { fs: await makeTauriFilesystem(path), name: baseName(path), key: path };
  }
  const handle = await pickFolder();
  if (!handle) return null;
  const key = crypto.randomUUID();
  await putHandle(key, handle); // browser: remember the handle for cross-session reopen
  return { fs: new FsaFilesystem(handle), name: handle.name, key };
}

/** Re-open a remembered folder by its key. Null = lost / access declined (browser security). */
export async function reopenFolderBinding(key: string, name: string): Promise<FolderBinding | null> {
  if (isTauri()) {
    // The key IS the path; native fs needs no permission gesture (capability scope covers $HOME).
    return { fs: await makeTauriFilesystem(key), name, key };
  }
  const handle = await getHandle(key);
  if (!handle || (await requestPermission(handle)) !== "granted") return null;
  return { fs: new FsaFilesystem(handle), name: handle.name, key };
}

/** Drop a remembered folder's stored handle (browser only; Tauri keeps nothing to forget). */
export async function forgetFolderBinding(key: string): Promise<void> {
  if (!isTauri()) await deleteHandle(key);
}
