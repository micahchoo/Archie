// The Library-binding store (worklist 0.3 cut 1 out of App.svelte — the POLISH-Q10 series).
// Owns invention #3's STATE MACHINE (CONTEXT three-configs persistence): where this Library's
// canonical bytes live (unbound OPFS / Chromium FSA folder / .archie.zip file), the dirty/busy/
// error chrome state, recents, handle re-acquisition, and the Save/Open/Close/autosave flows.
// The disk PRIMITIVES stay injected (writeToFolder / downloadProjectZip / replaceProjectFrom are
// publish-side concerns — cut 2 moves them to a publish module; the binding store won't change).
// A `.svelte.ts` rune module (cf. library-meta.svelte.ts): the $state container is never
// reassigned, so getters stay live across the module boundary.
import { loadLibrary, FsaFilesystem, recentFromBinding, addRecent, removeRecent, bindingLabel, type Binding, type RecentProject } from "@render/core";
import { supportsFolderPicker, pickFolder, loadRecents, saveRecents, loadLastBinding, saveLastBinding } from "./binding.js";
import { putHandle, getHandle, deleteHandle, requestPermission } from "./handles-db.js";
import { enqueueSave } from "./save-queue.svelte.js";

export type LoadedLibrary = Awaited<ReturnType<typeof loadLibrary>>;

export interface BindingDeps {
  /** Flush the CURRENT exhibit's edits to OPFS (App's save()) so a whole-library write is current. */
  flushExhibit: () => Promise<void>;
  /** Write the whole published tree into a bound folder (the git / GH-Pages on-ramp). */
  writeToFolder: (handle: FileSystemDirectoryHandle) => Promise<void>;
  /** Download the library as .archie.zip (size-guarded). False = the user declined/cancelled. */
  downloadProjectZip: () => Promise<boolean>;
  /** Replace the OPFS project from a loaded library (the shared open-zip/open-folder body). */
  replaceProjectFrom: (loaded: LoadedLibrary) => Promise<void>;
  /** The zip-binding display name to establish on a fresh non-Chromium Save As. */
  zipName: () => string;
}

export function createBindingStore(deps: BindingDeps) {
  const canFolder = supportsFolderPicker();
  const s = $state<{
    binding: Binding;
    recents: RecentProject[];
    dirty: boolean; // unsaved-to-disk at the Library scale (distinct from per-exhibit edit dirty)
    busy: boolean; // a Save/Open is in flight (guards overlap + disables chrome)
    error: string | null; // a bound location couldn't be used (lost-binding / failed-save recovery)
  }>({ binding: { kind: "unbound" }, recents: [], dirty: false, busy: false, error: null });

  let folderHandle: FileSystemDirectoryHandle | null = null; // cached so autosave doesn't re-hit IndexedDB
  let autosaving = false;

  function rememberBinding() {
    saveLastBinding(s.binding);
    const rec = recentFromBinding(s.binding, Date.now());
    if (rec) { s.recents = addRecent(s.recents, rec); saveRecents(s.recents); }
  }
  /** Re-acquire a folder binding's handle + permission (needs a user gesture). Null + error if lost. */
  async function reacquireFolder(): Promise<FileSystemDirectoryHandle | null> {
    if (s.binding.kind !== "folder") return null;
    const handle = folderHandle ?? (s.binding.handleKey ? await getHandle(s.binding.handleKey) : null);
    if (!handle) { s.error = `Couldn't find "${s.binding.name}". Save as a new library to keep working.`; return null; }
    if ((await requestPermission(handle)) !== "granted") { s.error = `Access to "${s.binding.name}" was declined. Grant it, or save as a new library.`; return null; }
    folderHandle = handle;
    return handle;
  }

  return {
    // — reactive chrome state (live getters) —
    get binding(): Binding { return s.binding; },
    get recents(): RecentProject[] { return s.recents; },
    get dirty(): boolean { return s.dirty; },
    get busy(): boolean { return s.busy; },
    get error(): string | null { return s.error; },
    get place(): string { return bindingLabel(s.binding); },
    get canFolder(): boolean { return canFolder; },

    /** Boot: restore recents + the active-binding DESCRIPTOR (continuity chip). Boot counts as
     *  in-sync — the next edit marks unsaved (we never auto-reload from disk without a gesture). */
    boot() {
      s.recents = loadRecents();
      s.binding = loadLastBinding();
      s.dirty = false;
    },
    /** Mark the Library unsaved-to-disk (only meaningful once bound). */
    touch() { if (s.binding.kind !== "unbound") s.dirty = true; },
    dismissError() { s.error = null; },
    /** An opened .archie.zip is now this Library's canonical file (the open-zip path). */
    bindToFile(name: string) {
      s.binding = { kind: "file", name };
      s.error = null;
      s.dirty = false;
      rememberBinding();
    },

    /** Save to the bound location; if unbound, establish a binding (Save As). ⌘S / the Save button. */
    async saveProject() {
      if (s.busy) return;
      s.busy = true; s.error = null;
      try {
        await deps.flushExhibit(); // flush the current exhibit's edits so the published tree is current
        if (s.binding.kind === "unbound") {
          if (canFolder) {
            const handle = await pickFolder();
            if (!handle) return;
            folderHandle = handle;
            s.binding = { kind: "folder", name: handle.name, handleKey: crypto.randomUUID() };
            await putHandle(s.binding.handleKey!, handle);
            await deps.writeToFolder(handle);
          } else {
            s.binding = { kind: "file", name: deps.zipName() };
            if (!(await deps.downloadProjectZip())) return; // declined the large-library zip → stay unsaved
          }
        } else if (s.binding.kind === "folder") {
          const handle = await reacquireFolder();
          if (!handle) return;
          await deps.writeToFolder(handle);
        } else {
          if (!(await deps.downloadProjectZip())) return; // declined the large-library zip → stay unsaved
        }
        s.dirty = false;
        rememberBinding();
      } catch (err) {
        // Worklist 0.1: a failed ⌘S/Save must be loud — the recovery card renders this.
        console.error("Save failed:", err);
        s.error = "Couldn't save your library. Try again, or save it as a new copy to be safe.";
      } finally { s.busy = false; }
    },

    /** Open a folder as the project (Chromium): pick → loadLibrary ← FsaFilesystem → replace OPFS project. */
    async openProjectFolder() {
      if (s.busy) return;
      const handle = await pickFolder();
      if (!handle) return;
      s.busy = true; s.error = null;
      try {
        let loaded: LoadedLibrary;
        try { loaded = await loadLibrary(new FsaFilesystem(handle)); }
        catch { window.alert("That folder isn't an Archie library."); return; }
        if (loaded.library.exhibits.length === 0) { window.alert("That folder has no exhibits."); return; }
        if (!window.confirm("Open this folder as your library? Your current library will be replaced.")) return;
        await deps.replaceProjectFrom(loaded);
        folderHandle = handle;
        s.binding = { kind: "folder", name: handle.name, handleKey: crypto.randomUUID() };
        await putHandle(s.binding.handleKey!, handle);
        s.dirty = false; rememberBinding();
      } finally { s.busy = false; }
    },

    /** Re-open a remembered project. Folder + reopenable → re-acquire its stored handle; else the caller
     *  falls back to the picker (browser security forbids silent file re-open — recents are hints). */
    async openRecent(r: RecentProject, fallbackToPicker: () => void) {
      if (s.busy) return;
      if (!(r.kind === "folder" && r.reopenable)) { fallbackToPicker(); return; }
      s.busy = true; s.error = null;
      try {
        const handle = await getHandle(r.id);
        if (!handle || (await requestPermission(handle)) !== "granted") {
          s.error = `Couldn't reopen "${r.name}" — grant access again to reconnect it.`; return;
        }
        let loaded: LoadedLibrary;
        try { loaded = await loadLibrary(new FsaFilesystem(handle)); }
        catch { s.error = `"${r.name}" is no longer an Archie library.`; return; }
        if (!window.confirm(`Open "${r.name}"? Your current library will be replaced.`)) return;
        await deps.replaceProjectFrom(loaded);
        folderHandle = handle;
        s.binding = { kind: "folder", name: handle.name, handleKey: r.id };
        s.dirty = false; rememberBinding();
      } finally { s.busy = false; }
    },

    forgetRecent(r: RecentProject) {
      s.recents = removeRecent(s.recents, r.id);
      saveRecents(s.recents);
      if (r.kind === "folder") void deleteHandle(r.id);
    },

    /** Detach from disk → back to this-browser-only. Keeps the OPFS working copy (Close ≠ delete). */
    closeProject() {
      if (s.binding.kind === "folder" && s.binding.handleKey) void deleteHandle(s.binding.handleKey);
      folderHandle = null;
      s.binding = { kind: "unbound" };
      s.error = null; s.dirty = false;
      saveLastBinding(s.binding);
    },

    /** Folder autosave-in-place: mirror the tree to the bound folder after an OPFS save(). Fire-and-
     *  forget, guarded against overlap; a permission miss stays quiet (expected without a gesture);
     *  a WRITE failure lands in saveStatus via the queue (worklist 0.1), never swallowed. */
    async autosaveToFolder() {
      if (s.binding.kind !== "folder" || autosaving) return;
      autosaving = true;
      try {
        const handle = folderHandle ?? (s.binding.handleKey ? await getHandle(s.binding.handleKey) : null);
        if (handle && (await requestPermission(handle)) === "granted") {
          folderHandle = handle;
          if (await enqueueSave("folder-mirror", "Folder autosave", () => deps.writeToFolder(handle)))
            s.dirty = false;
        }
      } catch { /* permission not yet granted — keep dirty; explicit Save will ask */ }
      finally { autosaving = false; }
    },
  };
}
export type BindingStore = ReturnType<typeof createBindingStore>;
