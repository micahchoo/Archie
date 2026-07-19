// Zip/folder-import structure-log merging (Archie-2a9a, deliverable 1 — closes the deferral named
// at Archie-42f3's close). When an opened library carries `{slug}/structure/history/` pages, the
// incoming section rev-log is MERGED into the local exhibit's log via the SAME one-contract merge
// annotations use — `mergeLogs` (spine/merge.ts), exactly as `AnnotationSession.importChanges`
// calls it. No second contract: shared history dedupes by `rev`; genuinely concurrent section
// edits become plural heads, which the existing conflicted gating (42f3, NarrativeEditor
// conflictedIds) surfaces — they are deliberately NOT auto-resolved here.
//
// Called from ingest-flows' replaceProjectFrom, flag-ON only (archie.structureRevlog); with the
// flag off the import path never touches a structure dir (today's byte-identical behavior).
// Absent incoming pages → no write at all, so the seed-from-array path on next exhibit open
// (structure-session ensureLoaded) stays exactly today's behavior.
import {
  asExhibitId,
  mergeLogs,
  readStructureReport,
  writeStructure,
  type CorruptStructurePage,
  type FsDirectory,
  type SectionRecord,
} from "@render/core";

export interface StructureImportResult {
  /** What happened:
   *  - `merged`: incoming pages were merged into the local log and written back.
   *  - `none`: the incoming exhibit carries no readable structure pages (absent dir, no committed
   *    index, or every page corrupt) — the local store is untouched (seed-from-array stays).
   *  - `no-store`: incoming pages exist but there is nowhere to persist locally (no OPFS).
   *  - `local-torn`: the LOCAL store has unreadable pages — the merge write is REFUSED (rule #2:
   *    a full writeStructure would rewrite the index without the unreadable pages, orphaning them
   *    for good; same posture as structure-session's corrupt-store write pause). */
  action: "merged" | "none" | "no-store" | "local-torn";
  /** Incoming pages that failed to read — skipped and reported, never fatal (rule #2). */
  corruptIncoming: readonly CorruptStructurePage[];
}

/**
 * Merge one incoming exhibit's structure log (if it carries one) into the local store.
 *
 * `srcExhibitDir` is the incoming library's `{slug}/` directory (zip or folder — the Filesystem
 * seam makes them the same); `exhibitId` is the exhibit id the log will be read back under
 * (SectionKeys recompose from `{exhibitId}/{localId}` at read time — on-disk pages carry only the
 * local id, so the SAME id must scope both sides of the merge). `openLocalStructDir` is lazy: it
 * is only invoked once incoming pages are known to exist, so an import WITHOUT structure pages
 * never creates a local `structure/` dir.
 */
export async function mergeImportedStructure(
  srcExhibitDir: FsDirectory,
  exhibitId: string,
  openLocalStructDir: () => Promise<FsDirectory | null>,
): Promise<StructureImportResult> {
  let incDir: FsDirectory;
  try {
    incDir = await srcExhibitDir.getDirectory("structure");
  } catch {
    return { action: "none", corruptIncoming: [] }; // no structure/ in the incoming library — today's path
  }
  // Tolerant read (rule #2): a corrupt incoming page is skipped-and-reported; what survived merges.
  const incoming = await readStructureReport(incDir, asExhibitId(exhibitId));
  if (incoming.log.length === 0) {
    // Nothing readable to merge (empty/uncommitted store, or every page corrupt). Local log intact.
    return { action: "none", corruptIncoming: incoming.corrupt };
  }
  const localDir = await openLocalStructDir();
  if (!localDir) return { action: "no-store", corruptIncoming: incoming.corrupt };
  const local = await readStructureReport(localDir, asExhibitId(exhibitId));
  if (local.corrupt.length > 0) {
    // Corrupt ≠ empty: never clobber a torn local store — writing the merged log would rewrite the
    // index without the unreadable pages. structure-session will surface the torn store on open.
    return { action: "local-torn", corruptIncoming: incoming.corrupt };
  }
  // The ONE merge contract (spine/merge.ts) — the same call AnnotationSession.importChanges makes.
  // Plural heads are fine: they gate editing via the projection's `conflicted` set (42f3).
  const merged = mergeLogs<SectionRecord>(local.log, incoming.log);
  await writeStructure(localDir, merged); // pages first, index LAST (rule #1) lives inside
  return { action: "merged", corruptIncoming: incoming.corrupt };
}
