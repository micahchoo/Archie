// IndexedDB persistence for picked FileSystemHandles so a folder-bound Project survives a reload
// (Chromium can structured-clone handles into IndexedDB; permission must be RE-GRANTED via a user
// gesture on return — queryPermission/requestPermission below). Dependency-free raw IndexedDB: anvil
// uses the `idb` wrapper, we keep the studio app dep-light. Donor: anvil storage/backends/handles-db.ts
// (the seam comment in @render/core fs/seam.ts names anvil as the storage donor). Browser-only — no
// headless test (happy-dom has neither FSA nor a real IndexedDB); typechecked here, browser-verified.

const DB_NAME = "archie-handles-db";
const DB_VERSION = 1;
const STORE = "handles";

const hasIDB = (): boolean => typeof indexedDB !== "undefined";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const r = fn(db.transaction(STORE, mode).objectStore(STORE));
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  } finally {
    db.close();
  }
}

/** Persist a picked handle under `key` (the binding's handleKey). No-op if IndexedDB is unavailable. */
export async function putHandle(key: string, handle: FileSystemHandle): Promise<void> {
  if (!hasIDB()) return;
  try { await tx("readwrite", (s) => s.put(handle, key)); } catch { /* unsupported / private mode */ }
}

/** Retrieve a previously-picked directory handle. Null if absent or IndexedDB unavailable. */
export async function getHandle(key: string): Promise<FileSystemDirectoryHandle | null> {
  if (!hasIDB()) return null;
  try {
    const h = await tx<FileSystemHandle | undefined>("readonly", (s) => s.get(key));
    return (h as FileSystemDirectoryHandle | undefined) ?? null;
  } catch { return null; }
}

/** Forget a stored handle (e.g. the user "Close project" or removes a lost binding). */
export async function deleteHandle(key: string): Promise<void> {
  if (!hasIDB()) return;
  try { await tx("readwrite", (s) => s.delete(key)); } catch { /* ignore */ }
}

export type PermState = "granted" | "denied" | "prompt";

type WithPermission = FileSystemHandle & {
  queryPermission?(o: { mode: string }): Promise<PermState>;
  requestPermission?(o: { mode: string }): Promise<PermState>;
};

/** Current permission for a stored handle WITHOUT prompting (safe on load). "denied" if unsupported. */
export async function queryPermission(handle: FileSystemHandle, mode: "read" | "readwrite" = "readwrite"): Promise<PermState> {
  try { return (await (handle as WithPermission).queryPermission?.({ mode })) ?? "denied"; }
  catch { return "denied"; }
}

/** Re-request permission for a stored handle — MUST be called from a user gesture. "denied" if refused. */
export async function requestPermission(handle: FileSystemHandle, mode: "read" | "readwrite" = "readwrite"): Promise<PermState> {
  try { return (await (handle as WithPermission).requestPermission?.({ mode })) ?? "denied"; }
  catch { return "denied"; }
}
