// The Library-binding store (worklist 0.3 cut 1 out of App.svelte — the POLISH-Q10 series).
// Owns invention #3's STATE MACHINE (CONTEXT three-configs persistence): where this Library's
// canonical bytes live (unbound OPFS / Chromium FSA folder / .archie.zip file), the dirty/busy/
// error chrome state, recents, handle re-acquisition, and the Save/Open/Close/autosave flows.
// The disk PRIMITIVES stay injected (writeToFolder / downloadProjectZip / replaceProjectFrom are
// publish-side concerns — cut 2 moves them to a publish module; the binding store won't change).
// A `.svelte.ts` rune module (cf. library-meta.svelte.ts): the $state container is never
// reassigned, so getters stay live across the module boundary.
import { loadLibrary, recentFromBinding, addRecent, removeRecent, bindingLabel, type Filesystem, type Binding, type RecentProject } from "@render/core";
import { loadRecents, saveRecents, loadLastBinding, saveLastBinding } from "./binding.js";
import { folderSinkSupported, pickFolderBinding, reopenFolderBinding, forgetFolderBinding } from "./folder-backend.js";
import { enqueueSave } from "./save-queue.svelte.js";
import { readMirrorToken, writeMirrorToken, newMirrorToken } from "./mirror-stamp.js";
import type { FolderWritePlan } from "./publish-flows.svelte.js";

export type LoadedLibrary = Awaited<ReturnType<typeof loadLibrary>>;

/** One object pending orphan cleanup (spike-0002). */
type RemovedObject = { slug: string; objId: string; assetName?: string };
/** A cleared snapshot of the incremental dirty-set — passed to the mirror, restored on failure. */
interface DirtSnapshot { exhibits: Set<string>; reassets: Set<string>; removedExhibits: string[]; removedObjects: RemovedObject[]; library: boolean; }

export interface BindingDeps {
  /** Flush the CURRENT exhibit's edits to OPFS (App's save()) so a whole-library write is current. */
  flushExhibit: () => Promise<void>;
  /** Write the published tree into the bound folder's Filesystem (FSA or Tauri — the seam). `plan`
   *  (spike-0002) carries the incremental scope + orphan removals; omitted (or removals-only) = full
   *  publish. Removals apply to full writes too, so a resync / Save still prunes. */
  writeToFolder: (fs: Filesystem, plan?: FolderWritePlan) => Promise<void>;
  /** Download the library as .archie.zip (size-guarded). False = the user declined/cancelled. */
  downloadProjectZip: () => Promise<boolean>;
  /** Replace the OPFS project from a loaded library (the shared open-zip/open-folder body). */
  replaceProjectFrom: (loaded: LoadedLibrary) => Promise<void>;
  /** The zip-binding display name to establish on a fresh non-Chromium Save As. */
  zipName: () => string;
}

export function createBindingStore(deps: BindingDeps) {
  const canFolder = folderSinkSupported();
  const s = $state<{
    binding: Binding;
    recents: RecentProject[];
    dirty: boolean; // unsaved-to-disk at the Library scale (distinct from per-exhibit edit dirty)
    busy: boolean; // a Save/Open is in flight (guards overlap + disables chrome)
    error: string | null; // a bound location couldn't be used (lost-binding / failed-save recovery)
    externalChange: boolean; // the bound folder was written by something other than Archie (Issue 25 row c)
  }>({ binding: { kind: "unbound" }, recents: [], dirty: false, busy: false, error: null, externalChange: false });

  let folderFs: Filesystem | null = null; // cached so autosave doesn't re-acquire each tick
  let autosaving = false;
  // Folder-mirror generation stamp (Issue 25 row c, ledgers/MIRROR.md): the opaque token Archie last
  // wrote into the bound folder. Before an INCREMENTAL mirror, the on-disk token is compared to this —
  // a definite mismatch means an external writer (or a second Archie window) touched the folder, so the
  // mirror stops instead of blind-overwriting. null = no baseline yet (fresh session / just rebound).
  let lastMirrorToken: string | null = null;

  /** Issue 25 row (d): a WRITE failure means the cached handle may be dead (folder moved/deleted/perm
   *  revoked). Drop the cache so the next attempt RE-ACQUIRES instead of hitting the same dead handle,
   *  and surface the one recovery that works — reopen the folder. (A permission-not-yet-granted miss is
   *  handled separately/quietly; this fires only after an actual write rejection.) */
  function invalidateFolderOnWriteFailure(): void {
    folderFs = null;
    if (s.binding.kind === "folder") {
      s.error = `Couldn't save to "${s.binding.name ?? "the folder"}". If you moved, renamed, or lost access to it, reopen the folder (Open → choose it again) to reconnect — your work is safe in this browser.`;
    }
  }

  // Issue 25 row (c): the recovery copy when the bound folder was written by something other than Archie.
  const EXTERNAL_CHANGE_MSG =
    "This folder was changed outside Archie since your last save (another program, a sync tool, or a second Archie window). To avoid mixing versions, Archie paused folder autosave. Save to overwrite the folder with your current library, or reopen the folder to load its version — your work is safe in this browser either way.";

  /** Re-stamp the folder with a fresh generation token after a SUCCESSFUL write, recording it as the
   *  baseline the next incremental mirror checks. An Archie write reclaims the folder, so this also
   *  clears any prior external-change block. */
  async function stampMirror(fs: Filesystem): Promise<void> {
    const token = newMirrorToken();
    await writeMirrorToken(fs, token);
    lastMirrorToken = token;
    if (s.externalChange) {
      s.externalChange = false;
      if (s.error === EXTERNAL_CHANGE_MSG) s.error = null;
    }
  }
  // Incremental folder-mirror state (spike-0002). folderResynced: a FULL publish has landed for this
  // binding session, so the on-disk tree is complete and the incremental recover-from-manifest path is
  // safe; the first autosave of a session forces a full resync. The dirty-set below is accumulated by the
  // studio mutation seams (mark* methods) and drained by autosaveToFolder — cleared on a successful write,
  // retained on failure so the same scope retries. Non-reactive: the mirror doesn't drive UI.
  let folderResynced = false;
  let dEx = new Set<string>(); // exhibit slugs needing a JSON/HTML rewrite
  let dAssets = new Set<string>(); // subset of dEx also needing the asset/tile byte passes rerun
  let dRemovedEx: string[] = []; // exhibit slugs to delete from the tree
  let dRemovedObj: RemovedObject[] = []; // objects to prune
  let dLibrary = false; // library-global metadata changed — rewrite the always-cheap global projections
  function resetDirt() { dEx = new Set(); dAssets = new Set(); dRemovedEx = []; dRemovedObj = []; dLibrary = false; }
  function dirtEmpty(): boolean { return dEx.size === 0 && dAssets.size === 0 && dRemovedEx.length === 0 && dRemovedObj.length === 0 && !dLibrary; }
  /** Snapshot the WHOLE dirty-set (writes + removals + the library bit) and clear the LIVE sets, so edits
   *  during the in-flight write accrue fresh. Restored verbatim on a failed write (never drop a save). */
  function takeDirt(): DirtSnapshot {
    const snap = { exhibits: dEx, reassets: dAssets, removedExhibits: dRemovedEx, removedObjects: dRemovedObj, library: dLibrary };
    resetDirt();
    return snap;
  }
  function restoreDirt(snap: DirtSnapshot) {
    for (const x of snap.exhibits) dEx.add(x);
    for (const x of snap.reassets) dAssets.add(x);
    dRemovedEx.unshift(...snap.removedExhibits);
    dRemovedObj.unshift(...snap.removedObjects);
    if (snap.library) dLibrary = true;
  }

  function rememberBinding() {
    saveLastBinding(s.binding);
    const rec = recentFromBinding(s.binding, Date.now());
    if (rec) { s.recents = addRecent(s.recents, rec); saveRecents(s.recents); }
  }
  /** Re-acquire the folder binding's Filesystem (FSA needs a permission gesture; Tauri is direct).
   *  Null + error if lost / declined. */
  async function reacquireFolder(): Promise<Filesystem | null> {
    if (s.binding.kind !== "folder") return null;
    if (folderFs) return folderFs;
    const reb = s.binding.handleKey ? await reopenFolderBinding(s.binding.handleKey, s.binding.name ?? "") : null;
    if (!reb) { s.error = `Couldn't reach "${s.binding.name}". Grant access again, or save as a new library.`; return null; }
    folderFs = reb.fs;
    return folderFs;
  }

  /** Folder autosave-in-place (spike-0002 incremental): mirror the accumulated dirty-set to the bound
   *  folder after an OPFS save(). Fire-and-forget, guarded against overlap; a permission miss stays quiet
   *  (expected without a gesture); a WRITE failure lands in saveStatus via the queue (worklist 0.1). The
   *  first mirror of a session forces a full resync, then only dirty files are rewritten. */
  async function mirrorToFolder(): Promise<void> {
    // `s.busy` guard: an explicit Save/Open/replace is in flight — it owns the write (or is about to reset
    // the binding for a resync), so an autosave must not race it or mirror to a folder mid-swap.
    if (s.binding.kind !== "folder" || autosaving || s.busy) return;
    autosaving = true;
    let progressed = false; // a write actually landed → safe to drain any dirt that accrued mid-flight
    try {
      const fs = folderFs ?? (s.binding.handleKey ? (await reopenFolderBinding(s.binding.handleKey, s.binding.name ?? ""))?.fs ?? null : null);
      if (!fs) return;
      folderFs = fs;
      if (!folderResynced) {
        // First mirror of the session → FULL resync: incremental recovery reads the existing manifest,
        // so the tree must be complete first. A full write flushes all pending write-dirt, but it still
        // must PRUNE pending removals (a full republish overwrites but never deletes) — pass them along.
        const snap = takeDirt();
        if (await enqueueSave("folder-mirror", "Folder autosave", () => deps.writeToFolder(fs, { removedExhibits: snap.removedExhibits, removedObjects: snap.removedObjects }))) {
          folderResynced = true; s.dirty = false; progressed = true;
          await stampMirror(fs); // establish the generation baseline for later incremental checks
        } else { restoreDirt(snap); invalidateFolderOnWriteFailure(); }
        return;
      }
      if (dirtEmpty()) return; // a redundant trigger — the tree is already current
      // Issue 25 row (c): before overwriting only the dirty files (and TRUSTING the rest of the on-disk
      // tree), verify the folder is still the one Archie last wrote. A definite token mismatch means an
      // external writer / a second Archie window touched it — stop and warn instead of mixing versions.
      if (lastMirrorToken !== null) {
        const onDisk = await readMirrorToken(fs);
        if (onDisk !== null && onDisk !== lastMirrorToken) {
          s.externalChange = true;
          s.error = EXTERNAL_CHANGE_MSG;
          return; // dirt retained; the user resolves via Save (mine wins) or reopen (theirs wins)
        }
      }
      const snap = takeDirt();
      const plan: FolderWritePlan = { incremental: { exhibits: snap.exhibits, reassets: snap.reassets }, removedExhibits: snap.removedExhibits, removedObjects: snap.removedObjects };
      if (await enqueueSave("folder-mirror", "Folder autosave", () => deps.writeToFolder(fs, plan))) {
        s.dirty = false; progressed = true;
        await stampMirror(fs); // re-stamp: this write is now the latest generation
      } else { restoreDirt(snap); invalidateFolderOnWriteFailure(); } // failed → retry the SAME scope next trigger (never drop a save), but drop the maybe-dead handle
    } catch { /* not yet reacquirable (FSA permission needs a gesture) — keep dirty; explicit Save asks */ }
    finally {
      autosaving = false;
      // Dirt accrued while the write was in flight turned its own triggers into no-ops (the guard);
      // drain it now, but ONLY after a successful write (never hot-loop on a persistent failure).
      if (progressed && !dirtEmpty() && s.binding.kind === "folder") void mirrorToFolder();
    }
  }

  /** A FULL folder write for the explicit-Save / Save-As paths — rewrites the whole tree AND prunes pending
   *  removals. Takes the dirty-set snapshot BEFORE the write so edits that accrue DURING the in-flight write
   *  (s.busy guards the mirror, not the mark* seams) stay live for the next autosave; on success the taken
   *  snapshot is simply discarded (already written), on failure it is restored so ⌘S can retry. Mirrors
   *  mirrorToFolder's take/restore contract. Throws on write failure (saveProject's catch surfaces it). */
  async function fullFolderWrite(fs: Filesystem): Promise<void> {
    const snap = takeDirt();
    try {
      await deps.writeToFolder(fs, { removedExhibits: snap.removedExhibits, removedObjects: snap.removedObjects });
    } catch (e) {
      restoreDirt(snap); // Save failed → keep the dirt (incl. removals) for a retry
      folderFs = null; // Issue 25 row (d): drop the maybe-dead handle so the retry RE-ACQUIRES (saveProject's catch surfaces the error)
      throw e;
    }
    folderResynced = true; // the tree is complete; mid-flight accruals (post-snapshot) remain for the next mirror
    await stampMirror(fs); // an explicit full write reclaims the folder + clears any external-change block
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
    /** The bound folder was written by something other than Archie since the last save (Issue 25 row c);
     *  folder autosave is paused until the user Saves (mine wins) or reopens (theirs wins). */
    get externalChange(): boolean { return s.externalChange; },

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
      folderFs = null;
      folderResynced = false; resetDirt(); // leaving any folder binding — drop its stale mirror state
      lastMirrorToken = null; s.externalChange = false; // new binding — no generation baseline yet
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
            const fb = await pickFolderBinding();
            if (!fb) return;
            folderFs = fb.fs;
            s.binding = { kind: "folder", name: fb.name, handleKey: fb.key };
            await fullFolderWrite(fb.fs); // full tree + pruned removals; preserves mid-flight dirt
          } else {
            s.binding = { kind: "file", name: deps.zipName() };
            if (!(await deps.downloadProjectZip())) return; // declined the large-library zip → stay unsaved
          }
        } else if (s.binding.kind === "folder") {
          const fs = await reacquireFolder();
          if (!fs) return;
          await fullFolderWrite(fs); // full tree + pruned removals; preserves mid-flight dirt
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

    /** Open a folder as the project: pick → loadLibrary ← FolderBinding.fs (FSA or Tauri) → replace OPFS project. */
    async openProjectFolder() {
      if (s.busy) return;
      const fb = await pickFolderBinding();
      if (!fb) return;
      s.busy = true; s.error = null;
      try {
        let loaded: LoadedLibrary;
        try { loaded = await loadLibrary(fb.fs); }
        catch { window.alert("That folder isn't an Archie library."); return; }
        if (loaded.library.exhibits.length === 0) { window.alert("That folder has no exhibits."); return; }
        if (!window.confirm("Open this folder as your library? Your current library will be replaced.")) return;
        await deps.replaceProjectFrom(loaded);
        folderFs = fb.fs;
        folderResynced = false; resetDirt(); // new library + folder — resync before incremental mirrors
        lastMirrorToken = null; s.externalChange = false; // fresh folder — reset the generation baseline
        s.binding = { kind: "folder", name: fb.name, handleKey: fb.key };
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
        const reb = await reopenFolderBinding(r.id, r.name);
        if (!reb) { s.error = `Couldn't reopen "${r.name}" — grant access again to reconnect it.`; return; }
        let loaded: LoadedLibrary;
        try { loaded = await loadLibrary(reb.fs); }
        catch { s.error = `"${r.name}" is no longer an Archie library.`; return; }
        if (!window.confirm(`Open "${r.name}"? Your current library will be replaced.`)) return;
        await deps.replaceProjectFrom(loaded);
        folderFs = reb.fs;
        folderResynced = false; resetDirt(); // new library + folder — resync before incremental mirrors
        lastMirrorToken = null; s.externalChange = false; // fresh folder — reset the generation baseline
        s.binding = { kind: "folder", name: reb.name, handleKey: r.id };
        s.dirty = false; rememberBinding();
      } finally { s.busy = false; }
    },

    forgetRecent(r: RecentProject) {
      s.recents = removeRecent(s.recents, r.id);
      saveRecents(s.recents);
      if (r.kind === "folder") void forgetFolderBinding(r.id);
    },

    /** Detach from disk → back to this-browser-only. Keeps the OPFS working copy (Close ≠ delete). */
    closeProject() {
      if (s.binding.kind === "folder" && s.binding.handleKey) void forgetFolderBinding(s.binding.handleKey);
      folderFs = null;
      folderResynced = false; resetDirt(); // a new binding must resync before incremental mirrors resume
      lastMirrorToken = null; s.externalChange = false; // detached — no generation baseline
      s.binding = { kind: "unbound" };
      s.error = null; s.dirty = false;
      saveLastBinding(s.binding);
    },

    autosaveToFolder: mirrorToFolder,

    // — incremental dirty-set seams (spike-0002): the studio mutation sites tag what changed; the next
    //   autosaveToFolder drains it. A slug in `reassets` reruns the expensive asset-copy + DZI-tiling
    //   passes; `dirty`-only reruns just that exhibit's JSON/HTML (the note-edit hot path). —
    // Re-marking a slug for WRITING cancels any pending EXHIBIT removal of it (a remove-then-recreate in one
    // drain must not both write and delete the exhibit) — the inverse of markExhibitRemoved's dEx.delete.
    // We do NOT purge dRemovedObj here. NB: object ids are NOT always minted fresh — nextObjectId (ingest-
    // flows.ts) REUSES a freed trailing id (remove o3 from [o1,o2,o3], re-add → o3 again; a freed MIDDLE id
    // is not reused). So a re-add can name-collide with a pending removal of the SAME id+asset. This is still
    // safe, but for a SUBTLER reason than "ids are fresh": any asset-writing re-add sets `reassets` for the
    // exhibit (markAssetsDirty), so in a single drain site.ts PRUNES the file then RE-COPIES it in the same
    // asset pass — the tree ends consistent; across drains each drain is self-consistent (ISSUES.md Issue 25
    // row (e), ledgers/MIRROR.md: two concurrently-live objects can never share an asset name, so the
    // prune-vs-skip-asset-pass dangling manifest is not-reachable). The load-bearing invariant is therefore
    // "an asset-writing re-add always marks reassets", NOT "ids are fresh" — if that ever stops holding,
    // purge dRemovedObj by matching (slug, assetName) against live objects here.
    /** A note edit / exhibit-metadata edit — rewrite that exhibit's JSON/HTML only (no byte passes). */
    markExhibitDirty(slug: string) { dEx.add(slug); dRemovedEx = dRemovedEx.filter((x) => x !== slug); },
    /** An object added / an asset changed — also rerun that exhibit's asset-copy + tiling byte passes. */
    markAssetsDirty(slug: string) { dEx.add(slug); dAssets.add(slug); dRemovedEx = dRemovedEx.filter((x) => x !== slug); },
    /** An object removed — rewrite the exhibit's manifest AND prune the object's orphaned tree files. */
    markObjectRemoved(slug: string, objId: string, assetName?: string) {
      dEx.add(slug);
      dRemovedObj.push({ slug, objId, ...(assetName !== undefined ? { assetName } : {}) });
    },
    /** An exhibit removed — drop it from the rewrite set and prune its whole `{slug}/` directory. */
    markExhibitRemoved(slug: string) { dEx.delete(slug); dAssets.delete(slug); dRemovedEx.push(slug); },
    /** Library-global metadata (title / rights) changed — rewrite only the cheap global projections. */
    markLibraryDirty() { dLibrary = true; },
  };
}
export type BindingStore = ReturnType<typeof createBindingStore>;
