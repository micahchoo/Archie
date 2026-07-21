// Zip/folder-import structure-log merging (Archie-2a9a, deliverable 1 — closes the deferral named
// at Archie-42f3's close). When an opened library carries `{slug}/structure/history/` pages, the
// incoming section rev-log is MERGED into the local exhibit's log via the SAME one-contract merge
// annotations use — `mergeLogs` (spine/merge.ts), exactly as `AnnotationSession.importChanges`
// calls it. No second contract: shared history dedupes by `rev`; genuinely concurrent section
// edits become plural heads, which the existing conflicted gating (42f3, NarrativeEditor
// conflictedIds) surfaces — they are deliberately NOT auto-resolved here.
//
// Called from ingest-flows' replaceProjectFrom, UNGATED (Archie-b0b1): the merge fires on incoming
// structure-page EXISTENCE, NOT on archie.structureRevlog — the mirror of the publish/export leg, so a
// published library's section history round-trips on a default reopen regardless of the kill-switch.
// Absent incoming pages → no write at all (no structure dir touched), so the seed-from-array path on
// next exhibit open (structure-session ensureLoaded) stays byte-identical to a no-history import.
import {
  asExhibitId,
  composeLegacyObjectId,
  isLegacyObjectId,
  mergeLogs,
  readStructureReport,
  remapArchieRefs,
  writeStructure,
  type CorruptStructurePage,
  type FsDirectory,
  type LinkTarget,
  type SectionLog,
  type SectionRecord,
} from "@render/core";

/**
 * ADR-0026 trigger 3 — migrate an INCOMING (possibly legacy-scheme) section log to the composed global
 * object-id scheme BEFORE it merges against the local (already-migrated) log. The merge reconciles by
 * `rev`, but the surviving/plural-head records must carry ids in the SAME scheme as the local store, or
 * the merge folds a legacy `o<n>` into a migrated store (the exact coexistence Archie-8439 forbids).
 * Determinism is the point: an independently-migrated copy composes the same `<exhibitId>.<ordinal>`, so
 * two copies align under merge. Same five-class mapping the render-core engine performs, on the class-4
 * fields a SectionRecord carries — `objectId` composes under the OWNING exhibit; `prose` `archie:` refs
 * compose under their TARGET exhibit (named by slug), resolved through `exhibitIdBySlug`. The single-source
 * primitives are reused verbatim: `isLegacyObjectId` is the sole gate, `composeLegacyObjectId` the sole
 * composer, `remapArchieRefs` the sole ref rewriter (ADR-0026's single-parser contract). Idempotent —
 * already-composed ids and ULIDs pass through untouched, so re-running is a no-op.
 */
export function migrateSectionLogIds(
  log: SectionLog,
  ownExhibitId: string,
  exhibitIdBySlug: ReadonlyMap<string, string>,
): SectionLog {
  const mapCrossLink = (t: LinkTarget): LinkTarget => {
    if (t.objectId === undefined || !isLegacyObjectId(t.objectId)) return t;
    const targetId = exhibitIdBySlug.get(t.exhibitSlug);
    return targetId === undefined ? t : { ...t, objectId: composeLegacyObjectId(targetId, t.objectId) };
  };
  let changed = false;
  const out = log.map((rec) => {
    const objectId = isLegacyObjectId(rec.objectId) ? composeLegacyObjectId(ownExhibitId, rec.objectId) : rec.objectId;
    const prose = rec.prose !== undefined ? remapArchieRefs(rec.prose, mapCrossLink) : rec.prose;
    if (objectId === rec.objectId && prose === rec.prose) return rec;
    changed = true;
    return prose !== undefined ? { ...rec, objectId, prose } : { ...rec, objectId };
  });
  return changed ? out : log;
}

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
 *
 * `migrateIncoming` (ADR-0026 trigger 3) is applied to the incoming log AFTER the tolerant read and
 * BEFORE `mergeLogs`, so both sides of the merge carry object ids in the same (composed) scheme —
 * see {@link migrateSectionLogIds}. Absent (the pre-8439 tests, or a caller with no library map) ⇒
 * the incoming log merges as-is (byte-identical to today's behavior).
 */
export async function mergeImportedStructure(
  srcExhibitDir: FsDirectory,
  exhibitId: string,
  openLocalStructDir: () => Promise<FsDirectory | null>,
  migrateIncoming?: (log: SectionLog) => SectionLog,
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
  // ADR-0026 trigger 3: bring the incoming log into the local store's (composed) id scheme before the
  // merge, so a legacy `o<n>` never survives into a migrated store. Idempotent + no-op when absent.
  const incomingLog = migrateIncoming ? migrateIncoming(incoming.log) : incoming.log;
  // The ONE merge contract (spine/merge.ts) — the same call AnnotationSession.importChanges makes.
  // Plural heads are fine: they gate editing via the projection's `conflicted` set (42f3).
  const merged = mergeLogs<SectionRecord>(local.log, incomingLog);
  await writeStructure(localDir, merged); // pages first, index LAST (rule #1) lives inside
  return { action: "merged", corruptIncoming: incoming.corrupt };
}
