// One-time OPFS→folder migration (Archie-623e Phase 1 — the safety net, dormant here). When the
// desktop app flips to a native-folder canonical store (Phase 2), an existing user already has a
// real OPFS working library; this copies it into the folder ONCE, sentinel-guarded and idempotent,
// modelled on store.ts `migrateResidentStoreIds` (snapshot-then-marker) and render-core-data-
// integrity rule 1 (content first, marker LAST).
//
// Contract (non-negotiable — CANON kill criteria):
//   - COPY, never move. The OPFS source is left intact so a build rollback still reads it, and it
//     is retained across the release (Micah's answer #2: keep until manual clear). No delete here.
//   - migrated.json is written LAST, AFTER copyTree returns. A crash mid-copy leaves the marker
//     absent → next boot reads as not-migrated → re-runs, overwriting the partial files
//     idempotently (copyTree overwrites in place). A torn folder never reads as "complete".
//   - Backend-agnostic: takes Filesystems, so it is fully headless-testable over MemoryFilesystem
//     (there is no OPFS/Tauri fs in vitest). Production wiring (Phase 2) hands it the OPFS-project
//     FsaFilesystem and the TauriFilesystem at defaultLibraryRoot().

import { copyTree, type Filesystem } from "@render/core";

/** The commit-point marker written into the folder root LAST. Its presence == "migration done". */
export const MIGRATION_MARKER = "migrated.json";
/** A store is considered present-and-worth-migrating iff its root holds `library.json`. */
const LIBRARY_FILE = "library.json";

/** What the marker records — enough to audit a migration after the fact. */
export interface MigrationStamp {
  v: 1;
  /** ISO timestamp the migration committed. */
  at: string;
  /** Files copied from OPFS into the folder. */
  files: number;
  /** Directories created in the folder. */
  directories: number;
}

export type MigrationOutcome =
  | { migrated: false; reason: "already-migrated" }
  | { migrated: false; reason: "no-source" }
  | { migrated: true; reason: "copied"; stamp: MigrationStamp };

/** Does the filesystem root hold an immediate child with this name? (Seam has no `exists`.) */
async function rootHasEntry(fs: Filesystem, name: string): Promise<boolean> {
  for await (const e of (await fs.root()).entries()) if (e.name === name) return true;
  return false;
}

/**
 * Run the one-time migration if it hasn't run yet. `source` is the OPFS working-store Filesystem
 * (rooted at the project dir so the folder gets the project's CONTENTS, matching the OPFS layout),
 * or `null` when there is no OPFS at all (nothing to migrate). `target` is the folder Filesystem.
 *
 * Idempotent and safe to call on every desktop boot: it short-circuits once `migrated.json` exists,
 * and re-runs cleanly (overwriting partials) if a prior run was torn.
 */
export async function migrateOpfsToFolder(
  source: Filesystem | null,
  target: Filesystem,
): Promise<MigrationOutcome> {
  // Sentinel FIRST: a committed marker means done — never re-copy over live folder work.
  if (await rootHasEntry(target, MIGRATION_MARKER)) return { migrated: false, reason: "already-migrated" };

  // Nothing to migrate: no OPFS, or an OPFS store that was never authored (no library.json). We do
  // NOT write a marker in this case — a folder-native first run has no OPFS predecessor, and leaving
  // the marker absent lets a later-appearing OPFS library (unusual, but possible) still migrate.
  if (!source || !(await rootHasEntry(source, LIBRARY_FILE))) return { migrated: false, reason: "no-source" };

  // CONTENT FIRST: copy the whole tree. copyTree writes no marker of its own.
  const counts = await copyTree(source, target);

  // MARKER LAST: the commit point. If any copy write above threw, we never reach here → the folder
  // reads as not-migrated on the next boot and the copy re-runs idempotently.
  const stamp: MigrationStamp = { v: 1, at: new Date().toISOString(), files: counts.files, directories: counts.directories };
  const marker = await (await target.root()).getFile(MIGRATION_MARKER, { create: true });
  const w = await marker.writable();
  await w.write(JSON.stringify(stamp, null, 2));
  await w.close();

  return { migrated: true, reason: "copied", stamp };
}
