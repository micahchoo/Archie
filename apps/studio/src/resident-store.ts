// The RESIDENT working store's mount point (Archie-623e Phase 2 — the flip). ONE accessor both store.ts
// (metadata: library.json, annotations, structure, pending-notes) and asset-store.ts (binary assets) open
// through, so the store lives in ONE place per platform:
//
//   • Web  — OPFS, unchanged. `FsaFilesystem` over `navigator.storage.getDirectory()`; the project is the
//            `{PROJECT}` subdir, exactly as before the flip (byte-identical — see store.ts history).
//   • Desktop (Tauri) — a NATIVE FOLDER on disk at `defaultLibraryRoot()` ({appDataDir}/library), authored
//            in place via `TauriFilesystem` with atomic temp-then-rename (.claude/rules/tauri-fs-seam.md).
//            No storage quota, no WebKitGTK eviction (freecut finding #2). The folder root IS the project
//            (no subdir) — the honest folder-canonical layout.
//
// On the FIRST desktop access this runs the one-time OPFS→folder migration (opfs-to-folder.ts): a shipped
// OPFS-canonical desktop user already has a real library, so it is COPIED into the folder (never moved,
// marker LAST, OPFS retained across the release — CANON kill criteria). The copy is memoized per process
// so every later opener short-circuits. ABORT-not-skip: a migration throw PROPAGATES — boot must surface it
// rather than author onto a half-migrated tree (see the a09d plan note).
//
// Web is byte-identical: nothing here runs off the `isTauri()` false branch that the pre-flip store.ts
// didn't already do, and no `@tauri-apps/*` import escapes tauri-fs.ts.

import { FsaFilesystem, type Filesystem, type FsDirectory } from "@render/core";
import { isTauri, defaultLibraryRoot, makeTauriFilesystem } from "./tauri-fs.js";
import { PROJECT, type OpfsRoot } from "./opfs-project.js";
import { migrateOpfsToFolder } from "./opfs-to-folder.js";

/** The OPFS root as a Filesystem, or null where OPFS is unavailable (non-browser/headless). */
async function opfsRootFs(): Promise<Filesystem | null> {
  const storage = (navigator as Navigator & { storage?: OpfsRoot }).storage;
  if (!storage?.getDirectory) return null;
  return new FsaFilesystem(await storage.getDirectory());
}

/**
 * The OPFS PROJECT dir wrapped as a Filesystem whose ROOT is the project's contents (library.json,
 * exhibits/, assets/…) — the migration SOURCE. Null when there is no prior OPFS project (a fresh
 * desktop install with no shipped-OPFS predecessor → nothing to migrate). Reads OPFS even under Tauri:
 * the desktop app shipped OPFS-canonical, so an existing user's library lives here (plan §1.2).
 */
async function opfsProjectSource(): Promise<Filesystem | null> {
  const storage = (navigator as Navigator & { storage?: OpfsRoot }).storage;
  if (!storage?.getDirectory) return null;
  try {
    const root = await storage.getDirectory();
    return new FsaFilesystem(await root.getDirectoryHandle(PROJECT, { create: false }));
  } catch {
    return null; // no prior OPFS project (NotFoundError) — nothing to migrate
  }
}

/** Memoized once-per-process desktop mount: build the folder fs, run the copy-migration once, return it. */
let desktopReady: Promise<Filesystem> | null = null;

async function desktopResidentFs(): Promise<Filesystem> {
  return (desktopReady ??= (async () => {
    const folder = await makeTauriFilesystem(await defaultLibraryRoot());
    // COPY OPFS→folder once (marker LAST). ABORT-not-skip: if this throws we do NOT hand back a
    // half-migrated folder — the rejection propagates so boot surfaces it instead of authoring onto a
    // torn tree. The memo caches the REJECTED promise too, so a failed migration doesn't silently retry
    // mid-session as "ok"; a fresh process (relaunch) re-runs it idempotently (partials overwritten).
    await migrateOpfsToFolder(await opfsProjectSource(), folder);
    return folder;
  })());
}

/**
 * The resident working store's ROOT filesystem — the native folder on desktop (migrated once), else the
 * OPFS root. Null only where neither exists (headless / no-OPFS web). The object-id migration engine
 * (migrateLibraryObjectIds) roots off this; see `residentProjectAtRoot`.
 */
export async function residentRootFs(): Promise<Filesystem | null> {
  return isTauri() ? desktopResidentFs() : opfsRootFs();
}

/** True when the resident root fs IS the project (desktop folder-canonical), so the id-migration engine
 *  and the openers descend NO `{PROJECT}` subdir. Web/OPFS keeps the subdir (false). */
export function residentProjectAtRoot(): boolean {
  return isTauri();
}

/**
 * The project-level directory both store.ts and asset-store.ts author into: the folder root itself on
 * desktop (folder-canonical), the `{PROJECT}` subdir on OPFS. Null where no store exists (no OPFS / not
 * yet mounted). `create` applies only to the web subdir open (the desktop root always exists).
 */
export async function residentProjectDir(create = true): Promise<FsDirectory | null> {
  const fs = await residentRootFs();
  if (!fs) return null;
  const root = await fs.root();
  return residentProjectAtRoot() ? root : root.getDirectory(PROJECT, { create });
}

/**
 * The waveform-peaks CACHE dir for one exhibit (Archie-623e Phase 4, answer #3). Peaks are REGENERABLE,
 * Studio-only, never published — so on the DESKTOP folder they live in a HIDDEN `.archie-cache/peaks/{slug}`
 * dotdir, keeping the user-visible library folder clean; on WEB they stay in the exhibit's `assets-peaks/`
 * (OPFS is already hidden, so the pre-flip location is preserved byte-identically). Null where no store
 * exists. The platform branch lives HERE (resident-store owns platform selection), not in asset-store.
 */
export async function residentPeaksDir(slug: string, create: boolean): Promise<FsDirectory | null> {
  const project = await residentProjectDir(create);
  if (!project) return null;
  if (isTauri()) {
    const cache = await project.getDirectory(".archie-cache", { create });
    const peaks = await cache.getDirectory("peaks", { create });
    return peaks.getDirectory(slug, { create });
  }
  const exhibits = await project.getDirectory("exhibits", { create });
  const ex = await exhibits.getDirectory(slug, { create });
  return ex.getDirectory("assets-peaks", { create });
}
