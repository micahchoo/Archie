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
import { recordsToWorking } from "../spine/serialize.js";

/** A diff over the note projection, keyed by the stable logicalId the surface selects on. */
export type NoteDiff = RecordsDiff<LogicalId, AnnotationRecord>;

/** The resolution payload `session.resolve` takes — re-derived from the session's own signature,
 *  never re-declared beside it. */
type ResolveChoice = Parameters<AnnotationSession["resolve"]>[1];

/** Undo-stack contents. A `stop` is tldraw's named mark — a boundary `undo`/`bailToMark` halt at. */
type Entry = { type: "stop"; id: string } | { type: "diff"; diff: NoteDiff };

/** What the overlay says about one logicalId: show this record, or show nothing. */
type Presence = { present: true; record: AnnotationRecord } | { present: false };

/** Undo depth, in marked BLOCKS (the freecut ring cap, feasibility rec 1 — `undo-feasibility.md`
 *  "What freecut still supplies"). The prototype's stack was unbounded: a long session accumulates
 *  one entry per mark forever. Each block is a squashed per-id diff, so 500 marked blocks is
 *  orders of magnitude beyond a real session's gesture count while staying a rounding error in
 *  memory (records are structurally shared with the log). Oldest blocks drop first; the trim may
 *  cut a block's stop off with it — that loses undo DEPTH only, never correctness. */
const DEFAULT_UNDO_LIMIT = 500;

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

  /** Undo depth cap in blocks — see {@link DEFAULT_UNDO_LIMIT}. */
  private readonly limit: number;

  /** Mutations since the last mark, squashed as they arrive (tldraw's `pendingDiff`). */
  private pending: NoteDiff = emptyDiff();
  private readonly undos: Entry[] = [];
  /** How many of `undos` are diffs (blocks) — the ring cap counts these, not raw entries. */
  private depth = 0;
  private readonly redos: NoteDiff[] = [];

  /**
   * The bypass tripwire's baseline. Every session mutation bumps `session.revision` exactly once
   * (`advance` per append, `setLog` for merge/resolve), so the revision delta between two
   * observations of `notes()` is fully accounted for when every mutation was routed through this
   * manager. A LARGER delta is a mutation that bypassed it — the edit lands in the log but is
   * absent from history, which is exactly the silent failure a missed call site produces. The
   * tripwire makes that loud instead.
   */
  private observedRevision = 0;
  private selfRevisions = 0;

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

  constructor(session: AnnotationSession, options: { limit?: number } = {}) {
    this.session = session;
    this.limit = options.limit ?? DEFAULT_UNDO_LIMIT;
  }

  // ── Authoring — every mutation goes through here, not through the session directly ──

  createNote(input: NewNote): LogicalId {
    this.assertNotApplying("createNote");
    const id = this.session.createNote(input);
    this.selfRevisions += 1; // create appends exactly one record (MERGE-CONTRACT C1) — one revision
    const record = this.headOf(id);
    if (record !== undefined) this.accumulate({ ...emptyDiff<LogicalId, AnnotationRecord>(), added: { [id]: record } as Record<LogicalId, AnnotationRecord> });
    return id;
  }

  editNote(logicalId: LogicalId, changes: NoteEdit): void {
    this.assertNotApplying("editNote");
    const from = this.shownHead(logicalId);
    if (!from) throw new Error(`cannot edit a hidden note: ${logicalId}`);
    this.session.editNote(logicalId, changes, from.rev);
    this.selfRevisions += 1; // an edit appends exactly one version (C2)
    const to = this.headOf(logicalId);
    this.overlay.delete(logicalId);
    this.composed = null;
    if (from !== undefined && to !== undefined) {
      this.accumulate({ ...emptyDiff<LogicalId, AnnotationRecord>(), updated: { [logicalId]: [from, to] } as Record<LogicalId, [AnnotationRecord, AnnotationRecord]> });
    }
  }

  deleteNote(logicalId: LogicalId): void {
    this.assertNotApplying("deleteNote");
    const from = this.shownHead(logicalId);
    if (!from) throw new Error(`cannot delete a hidden note: ${logicalId}`);
    // A restored deletion already has a tombstone in durable history. Deleting the
    // visible restoration removes that overlay; it does not append a duplicate delete.
    if (!this.headOf(logicalId)?.deleted) {
      this.session.deleteNote(logicalId);
      this.selfRevisions += 1;
    }
    this.overlay.delete(logicalId);
    this.composed = null;
    // The tombstone is the new head but the projection drops it, so the projection-level change is
    // a REMOVAL of the record that was live. Undoing it re-shows that record; the tombstone stays
    // in the log regardless, which is exactly the immutability property this class exists to keep.
    if (from !== undefined && !from.deleted) {
      this.accumulate({ ...emptyDiff<LogicalId, AnnotationRecord>(), removed: { [logicalId]: from } as Record<LogicalId, AnnotationRecord> });
    }
  }

  /**
   * Resolve a conflict the way every other mutation is routed — the wrapper for
   * `session.resolve`. Two reasons this must exist rather than letting Studio call the session:
   *
   * 1. A resolution IS a projection change — the plural heads the surface shows collapse into the
   *    merge node — so it belongs on the undo stack like any other act.
   * 2. It is the NEWEST word for its logicalId: any outstanding overlay decision for that id is
   *    void. Without this drop, a stale "show this instead" (an undo still outstanding when the
   *    colleague's edit arrived) keeps masking the resolved note — the surface silently disagrees
   *    with the log's single head. Pinned red/green by the undo × resolve tests below.
   *
   * The diff records the merge node as the id's new state. What the per-id diff model CANNOT
   * express is the OTHER competing head: undoing a resolution restores whichever record the
   * surface showed last, not both plural heads. That approximation is asserted by test, not
   * silent. Throws (via `session.resolve`) when the id is not actually conflicted.
   */
  resolveNote(logicalId: LogicalId, choice: ResolveChoice = {}): void {
    this.assertNotApplying("resolveNote");
    const shown = this.notes().find((n) => n.logicalId === logicalId);
    this.session.resolve(logicalId, choice);
    this.selfRevisions += 1; // a resolution appends exactly one merge node (D)
    const merged = this.headOf(logicalId);
    // Direct delete, NOT setOverlay: the merged head may legitimately differ from everything the
    // overlay was deciding between, and the drop-agreement check must not resurrect a stale row.
    this.overlay.delete(logicalId);
    this.composed = null;
    if (merged !== undefined) {
      this.accumulate({
        ...emptyDiff<LogicalId, AnnotationRecord>(),
        ...(shown !== undefined
          ? { updated: { [logicalId]: [shown, merged] } as Record<LogicalId, [AnnotationRecord, AnnotationRecord]> }
          : { added: { [logicalId]: merged } as Record<LogicalId, AnnotationRecord> }),
      });
    }
  }

  // ── History ──

  /** Name a stopping point. Flushes what has accumulated since the last mark as ONE undo entry.
   *  Composite-gesture habit (feasibility rec 2): a drag handler marks at gesture START and
   *  commits once at gesture END, so a 300-move drag is one undo step — the pending diff already
   *  squashes the moves. This method is also SAFE to call unconditionally: when nothing has
   *  accumulated since the last stop, the call is a no-op instead of stacking a redundant
   *  boundary, so an empty gesture (or a double-armed handler) cannot fragment history. */
  mark(id: string): void {
    this.flushPending();
    const top = this.undos[this.undos.length - 1];
    if (top?.type === "stop") return;
    this.pushUndo({ type: "stop", id });
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
    this.mark("redo");
    this.applyDiff(diff);
    this.pushUndo({ type: "diff", diff });
  }

  /** Abandon everything back to a named mark — no redo entry (tldraw's `bailToMark`: cancel an
   *  in-progress interaction). A mark id that is not on the stack unwinds nothing. */
  bailToMark(id: string): void {
    this.flushPending();
    if (!this.undos.some((e) => e.type === "stop" && e.id === id)) return;
    this.popAndReverse(id);
  }

  /** Re-baseline the bypass tripwire after a legitimate LOG-LEVEL mutation that by design does
   *  not go through this manager: `importChanges` (merge). The studio wrapper calls it right
   *  after the merge; without it the next `notes()` read would report the merge's revisions as
   *  bypassed mutations. Undo of a merge is not offered — the overlay's per-id decisions already
   *  survive one (pinned by test). */
  resyncLog(): void {
    this.observedRevision = this.session.revision.get();
    this.selfRevisions = 0;
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
    this.observeLog();
    const base = this.session.notes();
    if (this.overlay.size === 0) return base;
    if (this.composed !== null && this.composedBase === base) return this.composed;

    const out: AnnotationRecord[] = [];
    const seen = new Set<LogicalId>();
    for (const head of base) {
      const o = this.overlay.get(head.logicalId);
      // One decision per logicalId, even against PLURAL heads: a live conflict projects BOTH
      // competing heads (C6, honest degradation), but an overlay entry is a per-id verdict —
      // emitting it once per head row would duplicate it. No entry → both heads show, unchanged.
      if (o !== undefined && seen.has(head.logicalId)) continue;
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
   *  One shared projection with `AnnotationSession.workingAnnotations` — `recordsToWorking`
   *  (spine/serialize.ts), whose carry sentinel guards both callers. The head source differs:
   *  this composes `notes()` (session heads + the overlay), so an undone delete re-shows the
   *  reinstated record. */
  workingAnnotations(): W3CAnnotation[] {
    return recordsToWorking(this.notes());
  }

  // ── Internals ──

  /** The ring cap lives here, at the only door onto the undo stack. Trim is in BLOCKS (diff
   *  entries), not raw entries: a stop dropped with its block is depth lost, but a stop kept
   *  while its block drops would leave leading stops that mean nothing. */
  private pushUndo(entry: Entry): void {
    this.undos.push(entry);
    if (entry.type === "diff") this.depth += 1;
    while (this.depth > this.limit) {
      const dropped = this.undos.shift();
      if (dropped?.type === "diff") this.depth -= 1;
    }
  }

  /** The tripwire read. Runs on every `notes()` — O(1): one atom get and an integer compare,
   *  nothing that touches the log (reading `entries` here would materialize the session's frozen
   *  snapshot on the per-edit path, which the head-index work exists to keep off it). */
  private observeLog(): void {
    const rev = this.session.revision.get();
    const delta = rev - this.observedRevision;
    if (delta > this.selfRevisions) {
      // eslint-disable-next-line no-console -- the tripwire IS the feature: a bypassed mutation
      // fails silently on the surface, so it must be loud somewhere.
      console.error(
        `AnnotationUndoManager: ${delta - this.selfRevisions} session mutation(s) did not go through ` +
        `this manager — the edit(s) are in the log but missing from undo history. Route note ` +
        `mutations through createNote/editNote/deleteNote/resolveNote, or call resyncLog() after importChanges.`,
      );
    }
    this.observedRevision = rev;
    this.selfRevisions = 0;
  }

  /** The single head of a logicalId, or undefined when it is absent or conflicted.
   *  `conflictHeads` is `HeadIndex.headsOf` — an O(1) map read, NOT a log scan. */
  private headOf(logicalId: LogicalId): AnnotationRecord | undefined {
    const heads = this.session.conflictHeads(logicalId);
    return heads.length === 1 ? heads[0] : undefined;
  }

  /** Authoring follows the displayed revision, with the normal O(1) head fast path. */
  private shownHead(logicalId: LogicalId): AnnotationRecord | undefined {
    const shown = this.overlay.get(logicalId);
    if (shown) return shown.present ? shown.record : undefined;
    const head = this.headOf(logicalId);
    return head?.deleted ? undefined : head;
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
    this.pushUndo({ type: "diff", diff: this.pending });
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
