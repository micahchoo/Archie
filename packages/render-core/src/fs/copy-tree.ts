// Backend-agnostic recursive Filesystem→Filesystem copy (Archie-623e Phase 1 — the migration
// engine's primitive). Walks the SOURCE tree and writes every file and content-bearing
// subdirectory into the TARGET, going through the seam only — so it copies OPFS→folder,
// folder→OPFS, or memory→memory identically, and the conformance backends already prove each
// leg. No @tauri-apps/*, no DOM beyond Blob/File; stays headless.
//
// Two contracts it is built to honour:
//   1. CONTENT FIRST (render-core-data-integrity rule 1). copyTree writes only content; it NEVER
//      writes a completion marker. The one-time migration (apps/studio/src/opfs-to-folder.ts)
//      writes its `migrated.json` marker AFTER copyTree returns, so a torn copy reads as
//      not-migrated and re-runs idempotently (getFile{create}+writable overwrites in place).
//   2. BOUNDED MEMORY for large media. Each file is read as its lazy source Blob (`getFile()`,
//      NOT `readable()` which materializes an ArrayBuffer) and handed to the target's
//      `writable().write(blob)`. On the Tauri target that hits the streaming write path
//      (fs/tauri.ts), so a multi-GB asset streams chunk-by-chunk and never fully materializes.
//
// Names copied from `entries()` are re-joined onto the target via getDirectory/getFile, so the
// path-joining backends' `assertSafeName` guard runs on every segment (real tree entries are
// safe; the guard is defence-in-depth, same trust boundary as the untrusted-archive open seam).

import type { Filesystem, FsDirectory } from "./seam.js";

export interface CopyTreeResult {
  /** Files written into the target. */
  files: number;
  /** Content-bearing directories created in the target (empty dirs are not guaranteed to appear
   *  in `entries()` per the seam contract, so they are neither observed nor created). */
  directories: number;
}

/** Recursively copy the whole SOURCE tree into TARGET. Existing target files are overwritten in
 *  place (so a re-run after a torn copy is idempotent). Returns per-kind counts. */
export async function copyTree(source: Filesystem, target: Filesystem): Promise<CopyTreeResult> {
  const counts: CopyTreeResult = { files: 0, directories: 0 };
  await copyDir(await source.root(), await target.root(), counts);
  return counts;
}

async function copyDir(src: FsDirectory, dst: FsDirectory, counts: CopyTreeResult): Promise<void> {
  // Snapshot the listing before writing — a backend iterating its own directory while it is being
  // mutated is undefined; the source is never mutated, but the recursion writes into a target dir
  // that may alias the source (memory→memory tests) so snapshot to stay safe on every backend.
  const entries: { name: string; kind: "file" | "directory" }[] = [];
  for await (const e of src.entries()) entries.push(e);
  for (const e of entries) {
    if (e.kind === "directory") {
      const s = await src.getDirectory(e.name);
      const d = await dst.getDirectory(e.name, { create: true });
      counts.directories++;
      await copyDir(s, d, counts);
    } else {
      const srcFile = await src.getFile(e.name);
      const blob = await srcFile.getFile(); // lazy Blob — NOT read into the heap here
      const dstFile = await dst.getFile(e.name, { create: true });
      const w = await dstFile.writable();
      await w.write(blob); // Blob → the target's streaming write path (bounded memory on Tauri)
      await w.close();
      counts.files++;
    }
  }
}
