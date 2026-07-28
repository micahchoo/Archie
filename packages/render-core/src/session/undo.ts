// AnnotationUndoManager — undo/redo over the PROJECTION, on top of an append-only log.
// Archie-69a6 prototype. Ported from tldraw's HistoryManager shape as scouted in
// `ledgers/RESEARCH-tldraw-source-scout-2026-07-22.md` §2 (two stacks, mark-based, diffs
// accumulated between marks; `tldraw/tldraw:packages/store/src/lib/RecordsDiff.ts` for the diff
// primitives, editor `HistoryManager` for mark/bailToMark/batch and the Recording/Paused modes).
//
// ── The one structural difference from tldraw, and it is the whole point ──
//
// tldraw's undo WRITES to its store: `reverseRecordsDiff(entry)` is applied with `store.put`/
// `store.remove`, so the store is the single source of truth and history is a stack of edits to it.
// Archie's spine is an append-only version DAG (ADR-0003, keystone) and MUST NOT be rewritten — a
// record, once appended, stays. So this manager never touches `AnnotationSession`'s log. It keeps an
// OVERLAY over the session's head projection, and a diff moves the overlay:
//
//     session.notes()   the head records the log projects   (grows; never shrinks)
//     overlay           per-logicalId "show this instead" / "show nothing"
//     notes()           the two composed — what the editing surface should draw
//
// Undoing a create therefore hides the note from the surface while every version of it remains in
// the log and in `session.entries`. That is the same move Archie already makes for a delete (a
// tombstone hides a note without erasing its history) — lifted one layer, to the UI.
//
// ── Cost ──
//
// [[perf-measure-the-flow]] §3: nothing here may add a whole-LOG operation to the per-edit path.
// Every mutation costs O(1): the pre/post head of the touched logicalId comes from the session's
// `HeadIndex` (via `conflictHeads`, an O(1) map lookup), and the pending diff gains one entry.
// `notes()` is O(1) — the session's own memoized array, by identity — while the overlay is empty,
// which is every moment except after an undo that is still outstanding.

import type { AnnotationRecord, W3CAnnotation } from "../wadm/types.js";
import type { LogicalId } from "../wadm/brand.js";
import type { AnnotationSession, NewNote, NoteEdit } from "./session.js";
import { emptyDiff, isEmptyDiff, reverseRecordsDiff, squashRecordDiffsMutable, type RecordsDiff } from "./records-diff.js";
import { recordToAnnotation } from "../spine/serialize.js";
import { ARCHIE_READING, ARCHIE_SECTION, ARCHIE_EMPHASIS, ARCHIE_WHOLE_OBJECT, ARCHIE_GEO } from "../wadm/types.js";

/** A diff over the note projection, keyed by the stable logicalId the surface selects on. */
export type NoteDiff = RecordsDiff<LogicalId, AnnotationRecord>;

/** Undo-stack contents. A `stop` is tldraw's named mark — a boundary `undo`/`bailToMark` halt at. */
type Entry = { type: "stop"; id: string } | { type: "diff"; diff: NoteDiff };

/** What the overlay says about one logicalId: show this record, or show nothing. */
type Presence = { present: true; record: AnnotationRecord } | { present: false };

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** `projectHeads`'s ordering (spine/heads.ts): by logicalId, then rev. The composed projection has
 *  to re-establish it, because an overlay can reinstate a record the session no longer emits. */
function cmpRecord(x: AnnotationRecord, y: AnnotationRecord): number {
  return cmp(x.logicalId, y.logicalId) || cmp(x.rev, y.rev);
}

export class AnnotationUndoManager {
  private readonly session: AnnotationSession;

  /** Mutations since the last mark, squashed as they arrive (tldraw's `pendingDiff`). */
  private pending: NoteDiff = emptyDiff();
  private readonly undos: Entry[] = [];
  private readonly redos: NoteDiff[] = [];

  /**
   * Per-logicalId projection override. EMPTY is the normal state and the fast path: with nothing
   * overridden, `notes()` hands back the session's own memoized array, identity and all (the
   * contract `HeadIndex.heads` documents, which Svelte `$derived` consumers depend on).
   *
   * An entry is dropped the moment it agrees with the session again, so a redo that restores the
   * authored state restores the fast path too — the map cannot silently accumulate no-op entries.
   */
  private readonly overlay = new Map<LogicalId, Presence>();
  /** Memoized composition, valid only against the exact `session.notes()` array it was built from.
   *  The session hands out a fresh array identity per mutation (HeadIndex.heads), so an identity
   *  check is exact — a stale composition cannot survive an append the manager did not make. */
  private composed: AnnotationRecord[] | null = null;
  private composedBase: readonly AnnotationRecord[] | null = null;

  /** True while a diff is being applied by undo/redo, so the projection write does not record
   *  itself as a new user edit (tldraw's `Paused` mode). Mutations are refused outright here
   *  rather than ignored — this manager is the only writer, so a re-entrant call is a bug. */
  private applying = false;

  constructor(session: AnnotationSession) {
    this.session = session;
  }

  // ── Authoring — every mutation goes through here, not through the session directly ──

  createNote(input: NewNote): LogicalId {
    this.assertNotApplying("createNote");
    const id = this.session.createNote(input);
    const record = this.headOf(id);
    if (record !== undefined) this.accumulate({ ...emptyDiff<LogicalId, AnnotationRecord>(), added: { [id]: record } as Record<LogicalId, AnnotationRecord> });
    return id;
  }

  editNote(logicalId: LogicalId, changes: NoteEdit): void {
    this.assertNotApplying("editNote");
    const from = this.headOf(logicalId);
    this.session.editNote(logicalId, changes);
    const to = this.headOf(logicalId);
    if (from !== undefined && to !== undefined) {
      this.accumulate({ ...emptyDiff<LogicalId, AnnotationRecord>(), updated: { [logicalId]: [from, to] } as Record<LogicalId, [AnnotationRecord, AnnotationRecord]> });
    }
  }

  deleteNote(logicalId: LogicalId): void {
    this.assertNotApplying("deleteNote");
    const from = this.headOf(logicalId);
    this.session.deleteNote(logicalId);
    // The tombstone is the new head but the projection drops it, so the projection-level change is
    // a REMOVAL of the record that was live. Undoing it re-shows that record; the tombstone stays
    // in the log regardless, which is exactly the immutability property this class exists to keep.
    if (from !== undefined && !from.deleted) {
      this.accumulate({ ...emptyDiff<LogicalId, AnnotationRecord>(), removed: { [logicalId]: from } as Record<LogicalId, AnnotationRecord> });
    }
  }

  // ── History ──

  /** Name a stopping point. Flushes what has accumulated since the last mark as ONE undo entry. */
  mark(id: string): void {
    this.flushPending();
    this.undos.push({ type: "stop", id });
  }

  /** Reverse the most recent block of changes, back to (and consuming) the nearest mark.
   *  Pushes what it undid onto the redo stack. */
  undo(): void {
    this.flushPending();
    const undone = this.popAndReverse(null);
    if (undone !== null) this.redos.push(undone);
  }

  /** Re-apply the most recently undone block. */
  redo(): void {
    const diff = this.redos.pop();
    if (diff === undefined) return;
    this.applyDiff(diff);
    this.undos.push({ type: "diff", diff });
  }

  /** Abandon everything back to a named mark — no redo entry (tldraw's `bailToMark`: cancel an
   *  in-progress interaction). A mark id that is not on the stack unwinds nothing. */
  bailToMark(id: string): void {
    this.flushPending();
    if (!this.undos.some((e) => e.type === "stop" && e.id === id)) return;
    this.popAndReverse(id);
  }

  get canUndo(): boolean {
    return !isEmptyDiff(this.pending) || this.undos.some((e) => e.type === "diff");
  }

  get canRedo(): boolean {
    return this.redos.length > 0;
  }

  // ── Projection ──

  /** The live notes the editing surface should draw — the session's heads with the overlay applied.
   *  Identical (by identity) to `session.notes()` whenever nothing is undone. */
  notes(): AnnotationRecord[] {
    const base = this.session.notes();
    if (this.overlay.size === 0) return base;
    if (this.composed !== null && this.composedBase === base) return this.composed;

    const out: AnnotationRecord[] = [];
    const seen = new Set<LogicalId>();
    for (const head of base) {
      const o = this.overlay.get(head.logicalId);
      seen.add(head.logicalId);
      if (o === undefined) out.push(head);
      else if (o.present) out.push(o.record);
    }
    // Records the overlay reinstates that the session no longer projects (an undone delete).
    for (const [id, o] of this.overlay) {
      if (o.present && !seen.has(id)) out.push(o.record);
    }
    out.sort(cmpRecord);
    this.composed = out;
    this.composedBase = base;
    return out;
  }

  /** The working (logicalId-keyed) WADM surface, over the undo-aware projection.
   *  Mirrors `AnnotationSession.workingAnnotations` exactly — see the carry sentinel there. */
  workingAnnotations(): W3CAnnotation[] {
    return this.notes().map((record) => {
      const ann = recordToAnnotation(record, record.logicalId);
      if (record.reading !== undefined) (ann as unknown as Record<string, unknown>)[ARCHIE_READING] = record.reading;
      if (record.section !== undefined) (ann as unknown as Record<string, unknown>)[ARCHIE_SECTION] = record.section;
      if (record.emphasis !== undefined) (ann as unknown as Record<string, unknown>)[ARCHIE_EMPHASIS] = record.emphasis;
      if (record.wholeObject === true) (ann as unknown as Record<string, unknown>)[ARCHIE_WHOLE_OBJECT] = true;
      if (record.geo !== undefined) (ann as unknown as Record<string, unknown>)[ARCHIE_GEO] = record.geo;
      return ann;
    });
  }

  // ── Internals ──

  /** The single head of a logicalId, or undefined when it is absent or conflicted.
   *  `conflictHeads` is `HeadIndex.headsOf` — an O(1) map read, NOT a log scan. */
  private headOf(logicalId: LogicalId): AnnotationRecord | undefined {
    const heads = this.session.conflictHeads(logicalId);
    return heads.length === 1 ? heads[0] : undefined;
  }

  private assertNotApplying(what: string): void {
    if (this.applying) throw new Error(`AnnotationUndoManager: ${what} during undo/redo application`);
  }

  /** Record one mutation. A new edit invalidates the redo stack (tldraw's `Recording` mode). */
  private accumulate(diff: NoteDiff): void {
    squashRecordDiffsMutable(this.pending, [diff]);
    this.redos.length = 0;
  }

  private flushPending(): void {
    if (isEmptyDiff(this.pending)) return;
    this.undos.push({ type: "diff", diff: this.pending });
    this.pending = emptyDiff();
  }

  /**
   * Pop entries off the undo stack, reverse-applying each diff, until a stop is consumed (the one
   * named by `haltAt`, or any stop when `haltAt` is null) or the stack runs out. Returns the
   * FORWARD diff of everything undone, for the redo stack — or null if nothing was undone.
   */
  private popAndReverse(haltAt: string | null): NoteDiff | null {
    const forward: NoteDiff = emptyDiff();
    let touched = false;
    while (this.undos.length > 0) {
      const entry = this.undos.pop()!;
      if (entry.type === "stop") {
        if (haltAt !== null) {
          if (entry.id === haltAt) break;
          continue; // an unrelated mark passed on the way to the one we were asked for
        }
        // Plain undo: a mark ENDS the block only once something has been undone. A mark sitting on
        // top of the stack (mark() called with nothing since) would otherwise make undo() a no-op —
        // and "I marked, then pressed undo" must still reverse the block before the mark.
        if (touched) break;
        continue;
      }
      this.applyDiff(reverseRecordsDiff(entry.diff));
      squashRecordDiffsMutable(forward, [entry.diff]);
      touched = true;
    }
    return touched ? forward : null;
  }

  /** Move the overlay by one diff. Never touches the log. */
  private applyDiff(diff: NoteDiff): void {
    this.applying = true;
    try {
      for (const k in diff.added) this.setOverlay(k as LogicalId, { present: true, record: diff.added[k as LogicalId]! });
      for (const k in diff.updated) this.setOverlay(k as LogicalId, { present: true, record: diff.updated[k as LogicalId]![1] });
      for (const k in diff.removed) this.setOverlay(k as LogicalId, { present: false });
    } finally {
      this.applying = false;
    }
    this.composed = null;
  }

  /** Write one overlay decision — or DROP it when it already agrees with what the session projects,
   *  so an overlay entry exists only where the surface genuinely diverges from the log's heads. */
  private setOverlay(logicalId: LogicalId, next: Presence): void {
    const head = this.headOf(logicalId);
    const sessionShows = head !== undefined && !head.deleted ? head : undefined;
    if (next.present ? next.record === sessionShows : sessionShows === undefined) {
      this.overlay.delete(logicalId);
      return;
    }
    this.overlay.set(logicalId, next);
  }
}
