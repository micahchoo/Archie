// Hide-by-ancestry read derivation + the explicit bulk-delete verb (Archie-6b8e; spine-gate
// Archie-494c semantic #6; probe ledger PROBE-structure-revlog sharp edge 7).
//
// Two DISTINCT delete shapes for "a section and its notes", and the asymmetry between them is
// the point of this module:
//
// 1. HIDE-BY-ANCESTRY (deleteSection alone → this derivation). Tombstoning a section writes ONE
//    section tombstone and ZERO note records. Its attributed notes become HIDDEN at read time —
//    a pure derivation over (annotation heads × tombstoned-section set). Because nothing was
//    written to the notes, `appendUndeleteSection` restores their visibility ATOMICALLY: the
//    next projection simply stops hiding them. The notes' own tombstones stay fully independent.
//
// 2. BULK DELETE (`deleteSectionWithNotes` — the user-invoked "delete section AND its notes").
//    Tombstones the section AND appends a REAL tombstone per attributed note. Each note
//    tombstone drops content including `section` (log.ts `_deleteCarry` — mirrors `reading`), so
//    un-deleting the section later does NOT auto-revive these notes: their deletion was an
//    explicit per-note authored fact, not an ancestry shadow. That is the deliberate asymmetry —
//    hidden-by-ancestry is reversible-for-free, bulk-deleted is not (annotation resurrection is
//    undefined in v1, log.ts appendEdit).
//
// This module is read-derivation + append composition ONLY: it never edits structure.ts's
// projection or heads.ts (their internals are owned elsewhere this wave); it CALLS them.

import type { LogicalId } from "../wadm/brand.js";
import type { AnnotationLog, AnnotationRecord } from "../wadm/types.js";
import { appendDelete } from "./log.js";
import { headsOf } from "./merge.js";
import { projectHeads } from "./heads.js";
import {
  appendDeleteSection,
  localSectionId,
  type SectionKey,
  type SectionLog,
  type SectionRecord,
  type SectionStamp,
} from "./structure.js";

/** The tombstoned-section keys reduced to their LOCAL ids — the grammar `AnnotationRecord.section`
 *  speaks (exhibit-scoped local id, matching `reading`'s registry-local scoping; a composed
 *  SectionKey would redundantly embed the exhibitId inside an already exhibit-scoped log). */
function tombstonedLocalIds(tombstoned: ReadonlySet<SectionKey>): Set<string> {
  const out = new Set<string>();
  for (const key of tombstoned) out.add(localSectionId(key));
  return out;
}

/**
 * Is this (live head) record hidden because its attributed section is tombstoned?
 * Pure per-record predicate. An unattributed note is never hidden; a DANGLING attribution (id
 * matching no section at all) is tolerated and visible (structure semantic #5 — read-time
 * tolerance, never fatal). `tombstoned` is `StructureProjection.tombstoned` from `projectSections`.
 */
export function noteHiddenByStructure(record: AnnotationRecord, tombstoned: ReadonlySet<SectionKey>): boolean {
  if (record.section === undefined) return false;
  return tombstonedLocalIds(tombstoned).has(record.section);
}

/**
 * The hide-by-ancestry set: logicalIds of notes hidden AT READ because every live head is
 * attributed to a tombstoned section. Pure, idempotent derivation of
 * (annotation log × `projectSections(...).tombstoned`) — ZERO writes, which is exactly why
 * `appendUndeleteSection` restores visibility atomically (the derivation just stops returning
 * the id). A note's own tombstone is independent: already-deleted notes have no live head and
 * never appear here.
 *
 * Plural live heads (an unresolved concurrent merge) hide the note only when ALL of them are
 * attributed to tombstoned sections — if one branch moved the note out, hiding it would
 * suppress live authored content (honest degradation, same posture as plural-head projection).
 */
export function hiddenNoteIds(log: AnnotationLog, tombstoned: ReadonlySet<SectionKey>): ReadonlySet<LogicalId> {
  const hiddenLocals = tombstonedLocalIds(tombstoned);
  if (hiddenLocals.size === 0) return new Set();
  const headsByNote = new Map<LogicalId, AnnotationRecord[]>();
  for (const head of projectHeads(log)) {
    const arr = headsByNote.get(head.logicalId);
    if (arr) arr.push(head);
    else headsByNote.set(head.logicalId, [head]);
  }
  const out = new Set<LogicalId>();
  for (const [lid, heads] of headsByNote) {
    if (heads.every((h) => h.section !== undefined && hiddenLocals.has(h.section))) out.add(lid);
  }
  return out;
}

export interface DeleteSectionWithNotesResult {
  /** The structure log with the section's content-carrying tombstone appended. */
  structure: SectionLog;
  /** The annotation log with one REAL tombstone appended per attributed live note. */
  annotations: AnnotationLog;
  /** The section tombstone record. */
  section: SectionRecord;
  /** The per-note tombstones, in (logicalId asc) order. */
  noteTombstones: readonly AnnotationRecord[];
}

/**
 * The explicit BULK-DELETE verb (gate decision #6): tombstone `key` AND every note attributed
 * to it, as real per-note tombstone appends. Distinct from hide-by-ancestry (see module header):
 * because each note gets its OWN tombstone (which drops `section` — `_deleteCarry`), a later
 * `appendUndeleteSection` restores the section but does NOT revive these notes.
 *
 * Atomicity (pure-function style): all appends are staged on local copies and returned together;
 * preconditions are checked BEFORE any append, so a throw returns nothing partial. Throws if the
 * section is absent/already deleted, or if any attributed note has plural heads (writes are gated
 * on unresolved merges — merge contract C4; resolve first, then bulk-delete). Notes already
 * tombstoned independently are skipped, not errors.
 */
export function deleteSectionWithNotes(
  structure: SectionLog,
  annotations: AnnotationLog,
  key: SectionKey,
  input: SectionStamp,
): DeleteSectionWithNotesResult {
  const local = localSectionId(key);
  // Attributed live notes, deterministically ordered (projectHeads sorts by logicalId, rev).
  const attributed = [...new Set(projectHeads(annotations).filter((h) => h.section === local).map((h) => h.logicalId))];
  // Precondition: no attributed note may sit on an unresolved merge (C4 gates writes). Checked
  // for ALL notes before ANY append so a refusal is total, never partial. headsOf (not the
  // live-only projection) so a part-hidden delete-vs-edit branch (C15) also refuses.
  for (const lid of attributed) {
    if (headsOf(annotations, lid).length > 1) {
      throw new Error(`cannot bulk-delete ${key}: note ${lid} has plural heads — resolve the concurrent merge first (C4)`);
    }
  }
  // Section tombstone first — appendDeleteSection throws on absent/already-deleted BEFORE any
  // note tombstone exists.
  const sectionResult = appendDeleteSection(structure, key, input);
  let annLog = annotations;
  const noteTombstones: AnnotationRecord[] = [];
  for (const lid of attributed) {
    const r = appendDelete(annLog, lid, {
      lastEditor: input.lastEditor,
      ...(input.modifiedAt !== undefined ? { modifiedAt: input.modifiedAt } : {}),
      ...(input.now !== undefined ? { now: input.now } : {}),
    });
    annLog = r.log;
    noteTombstones.push(r.record);
  }
  return { structure: sectionResult.log, annotations: annLog, section: sectionResult.record, noteTombstones };
}
