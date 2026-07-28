// AnnotationSession — the Studio editor brain (pure, headless-tested). Owns an append-only
// annotation log for one canvas/exhibit and exposes the authoring loop: create / edit / delete
// notes, a WORKING projection (annotations keyed by stable logicalId so selection survives
// version bumps — distinct from the versioned publish projection), and persist/reload via the
// Filesystem seam. The Svelte editor is a thin shell binding to this; the logic is here, tested.

import { newRecord, editRecord, deleteRecord } from "../spine/log.js";
import { atom, computed, type Atom, type Computed } from "../state/index.js";
import { isDegenerateTarget } from "../geometry/selector.js";
import { HeadIndex } from "../spine/head-index.js";
import { recordToAnnotation } from "../spine/serialize.js";
import { writeAnnotations, readAnnotationsReport, type CorruptAnnotationPage } from "../spine/persist.js";
import type { SerializeOptions } from "../spine/serialize.js";
import type { FsDirectory } from "../fs/seam.js";
import { ARCHIE_READING, ARCHIE_SECTION, ARCHIE_EMPHASIS, ARCHIE_WHOLE_OBJECT, ARCHIE_GEO } from "../wadm/types.js";
import type { Emphasis, GeoAnchor } from "../wadm/types.js";
import { mergeLogs, resolveConflict } from "../spine/merge.js";
import type { AnnotationLog, AnnotationRecord, W3CAnnotation, W3CBody, W3CTarget } from "../wadm/types.js";
import type { ClientId, LogicalId } from "../wadm/brand.js";
import type { CarryDisposition } from "../model/carry.js";

export interface NewNote {
  target: W3CTarget;
  body?: W3CBody | W3CBody[];
  /** The single Reading this note belongs to (ADR-0007), or undefined = base. */
  reading?: string;
  /** The Section this note is attributed to (Archie-6b8e) — the section's LOCAL id; undefined = unattributed. */
  section?: string;
  /** Authored per-note emphasis (1489), or undefined = default `"normal"`. */
  emphasis?: Emphasis;
  /** Region-override (ADR-0018): force the whole-object frame on a region note; undefined = none. */
  wholeObject?: boolean;
  /** Geographic anchor (geo-truth, ADR-0015) for a Map note, or undefined = none. */
  geo?: GeoAnchor;
  motivation?: string | string[];
}

export interface NoteEdit {
  target?: W3CTarget;
  body?: W3CBody | W3CBody[];
  /** Reading id; undefined here leaves it unchanged (carried forward). To CLEAR it, pass null. */
  reading?: string | null;
  /** Section attribution (LOCAL id); undefined = carry forward, null = clear. Mirrors `reading`. */
  section?: string | null;
  /** Emphasis; undefined here leaves it unchanged (carried forward). To CLEAR to `"normal"`, pass null. */
  emphasis?: Emphasis | null;
  /** Region-override (ADR-0018); undefined = carry forward, null/false = clear, true = set. */
  wholeObject?: boolean | null;
  /** Geo anchor (ADR-0015); undefined = carry forward, null = clear, value = set. Mirrors `emphasis`. */
  geo?: GeoAnchor | null;
  motivation?: string | string[];
}

// EXHAUSTIVENESS GUARD (rule render-core-data-integrity #3) for `workingAnnotations()` below — the
// working-surface re-emit is a hand-map over AnnotationRecord (recordToAnnotation for the base WADM
// fields + per-extension re-attachment), previously un-sentineled. Every record field is classified:
// a field added to AnnotationRecord fails the build HERE until the working projection decides whether
// the editing surface carries it (reading/section/emphasis/wholeObject/geo all had to be added by
// hand before this guard existed — section was the one that nearly slipped, Archie-42f3).
const _workingAnnotationCarry = {
  target: "carry", // recordToAnnotation
  modifiedAt: "carry", // recordToAnnotation → `modified`
  body: "carry", // recordToAnnotation
  motivation: "carry", // recordToAnnotation
  logicalId: "carry", // becomes the working annotation's stable `id` (recordToAnnotation id param)
  reading: "carry", // re-attached as archie:reading below
  section: "carry", // re-attached as archie:section below (Archie-6b8e attribution, Archie-42f3)
  emphasis: "carry", // re-attached as archie:emphasis below
  wholeObject: "carry", // re-attached as archie:wholeObject below (only when true — byte-stable)
  geo: "carry", // re-attached as archie:geo below
  rev: { drop: "DAG node id — the working surface keys by logicalId; versioned ids are the publish projection (toHeadsPage)" },
  version: { drop: "citation ordinal — publish-projection concern, not part of the editing surface" },
  parent: { drop: "DAG topology — the working surface reads heads only" },
  mergeParents: { drop: "DAG topology — the working surface reads heads only" },
  lastEditor: { drop: "stamp — not rendered on the editing surface (MergeReview reads it off the record, not this shape). The WADM `creator` projection of this field is publish-only (headsPageFromRecords, Archie-3452): the working surface deliberately emits neither `creator` nor `created`, so synthetic ids ('anonymous') never masquerade as authorship on the canvas" },
  deleted: { drop: "heads() excludes tombstones (projectHeads) — a working annotation is live by construction" },
} satisfies Record<keyof AnnotationRecord, CarryDisposition>;
void _workingAnnotationCarry; // zero-runtime: exists only to break the build on an unclassified field

export class AnnotationSession {
  /**
   * The log, OWNED and appended in place.
   *
   * It used to be a frozen array rebuilt per mutation by `append` (`Object.freeze([...log, rec])`),
   * which is O(log) per append and therefore O(log²) to build or bulk-edit one: 638 ms of the 777 ms
   * it took to create 20 000 notes, and the reason bulk delete stayed superlinear even after the
   * heads projection was made incremental. The append-only VALUE semantics callers depend on are
   * preserved by `entries` handing out a frozen snapshot instead (see below) — what changed is that
   * the copy happens once per READ of a changed log, not once per write.
   */
  private records: AnnotationRecord[];
  /** Frozen snapshot of `records`, rebuilt on the first read after any mutation. */
  private frozen: AnnotationLog | null = null;
  /** The heads/conflicts projection, maintained INCREMENTALLY (spine/head-index.ts) rather than
   *  recomputed per mutation. It replaced a pair of identity-keyed memos that were correct but rebuilt
   *  from the whole log on every edit — and rebuilt it TWICE, since heads() and conflicts() each ran
   *  their own `headsByLogicalId`. That made an edit O(log) and every bulk loop over notes O(log²):
   *  ~14.7 ms per edit at 20k records, against a 16 ms interactivity bar.
   *
   *  The invariant this class must hold: `index` always reflects `log`. The three append methods fold
   *  their new record in with `index.append`; EVERY OTHER path that replaces the log must go through
   *  `setLog`, which rebuilds. Pushing onto `records` without doing one of those two is the way to
   *  break this. */
  private index: HeadIndex<AnnotationRecord>;
  /** Logical ids changed since the last save — the incremental-persist dirty set (the session is the ONE
   *  writer, so this is authoritative). Each mutation adds its id; save() writes just these pages. */
  private dirty = new Set<LogicalId>();
  /** True once the full log is known to be on disk (after a full write, or a load FROM disk). Until then
   *  the next save is a FULL write — incremental writes are only safe once every page exists on disk. */
  private persistedFully = false;
  /** Pages the load could not read (torn write / corruption) — empty on a clean or fresh session. The
   *  studio-open path reads this to surface corruption AND to refuse to seed-fresh-over a torn store
   *  (which would orphan the unreadable pages permanently — Issue 19). Public, read-only for callers. */
  loadCorruption: CorruptAnnotationPage[] = [];

  /**
   * The log's REVISION, as a signal — the one reactive root of this class.
   *
   * A counter rather than the log itself, and that is forced rather than chosen: `records` is
   * appended IN PLACE (see the field comment above), so its identity never changes on a write
   * and an atom holding it would compare equal forever. The counter is what a mutation actually
   * moves.
   *
   * Public and read-only so a UI can subscribe without the session growing a callback API —
   * `onEpochChange` in `state/` is the push edge; this is what it means. Bumped by `advance`
   * and `setLog`, which are the only two paths that may change the log (that invariant already
   * existed for `index`; this rides on it rather than adding a second one to maintain).
   */
  readonly revision: Atom<number>;

  /** `workingAnnotations()` as a lazy memo. See the method for what this buys and what it does not. */
  private readonly working: Computed<W3CAnnotation[]>;

  constructor(
    editor: ClientId | (() => ClientId),
    log: AnnotationLog = [],
  ) {
    this.editorSource = editor;
    this.records = [...log];
    this.index = HeadIndex.from(this.records);
    this.revision = atom("session.revision", 0);
    this.working = computed("session.workingAnnotations", () => {
      this.revision.get(); // the dependency — everything below is read untracked, by design
      return this.projectWorkingAnnotations();
    });
  }

  /** Bump the revision. Called from `advance` (per append) and `setLog` (merge / resolve).
   *  MUST stay O(1): this is the spine's per-EDIT hot path
   *  (`.claude/rules/perf-measure-the-flow.md` §3). `atom.set` is an equality check, a counter
   *  increment and — only if somebody has subscribed — one listener pass. */
  private bumpRevision(): void {
    this.revision.update((n) => n + 1);
  }

  /** The identity every append stamps as `lastEditor`. A plain ClientId is captured for the session's
   *  life (the original contract); a THUNK is resolved at action time, so a mid-session rename reaches
   *  every subsequent stamp without reopening the session (Archie-7e5b S4 — the studio passes its live
   *  `author` rune through here). */
  private readonly editorSource: ClientId | (() => ClientId);
  private stamp(): ClientId {
    return typeof this.editorSource === "function" ? this.editorSource() : this.editorSource;
  }

  /** The head records — `projectHeads(entries)` by contract, served from the incremental index.
   *  Array identity is stable until the next mutation (see HeadIndex.heads). */
  private heads(): AnnotationRecord[] {
    return this.index.heads();
  }

  /** Replace the log wholesale and rebuild the projection. For every mutation that is NOT a single
   *  append — merge, conflict resolution — where folding one record in isn't possible. */
  private setLog(log: AnnotationLog): void {
    this.records = [...log];
    this.frozen = null;
    this.index = HeadIndex.from(this.records);
    this.bumpRevision();
  }

  /** Append one freshly-minted record: push it and fold it into the projection. O(1), no log copy. */
  private advance(record: AnnotationRecord): void {
    this.records.push(record);
    this.frozen = null;
    this.index.append(record);
    this.dirty.add(record.logicalId);
    this.bumpRevision();
  }

  /** Load a session from a persisted annotations directory (the reload/open path). */
  static async load(annDir: FsDirectory, editor: ClientId | (() => ClientId)): Promise<AnnotationSession> {
    const { log, corrupt } = await readAnnotationsReport(annDir);
    const s = new AnnotationSession(editor, log);
    s.loadCorruption = corrupt;
    // Only mark fully-persisted when EVERY page read cleanly. A partial (corrupt) load must NOT do an
    // incremental save — that would rewrite an index listing only the survivors, dropping the torn
    // pages' ids for good (Issue 19). corrupt ⇒ the next save is a full write.
    s.persistedFully = corrupt.length === 0;
    return s;
  }

  /** The raw append-only log (e.g. for publish or inspection).
   *
   *  A FROZEN SNAPSHOT, cached until the next mutation — so a caller that holds the returned array
   *  keeps a stable point-in-time value, exactly as when every append rebuilt one. Handing out the
   *  live `records` would be cheaper still and is wrong: it would grow under anyone holding it. */
  get entries(): AnnotationLog {
    if (this.frozen === null) this.frozen = Object.freeze([...this.records]);
    return this.frozen;
  }

  /** Append a new note. Returns its stable logicalId (use it to select / open the form).
   *  Throws on a degenerate target (empty/NaN geometry) — the log is the ONE writer of annotation
   *  state (worklist 0.2), so it must never hold a record the canvas can't render. The mount's
   *  gesture guard filters these before the app sees them; reaching this throw is an invariant
   *  violation (a bad import path or a guard regression), not a user-facing flow. */
  createNote(input: NewNote): LogicalId {
    if (isDegenerateTarget(input.target)) throw new Error("createNote: degenerate target selector (empty/NaN geometry) must not enter the log");
    const record = newRecord({
      target: input.target,
      lastEditor: this.stamp(),
      ...(input.body !== undefined ? { body: input.body } : {}),
      ...(input.reading !== undefined ? { reading: input.reading } : {}),
      ...(input.section !== undefined ? { section: input.section } : {}),
      ...(input.emphasis !== undefined ? { emphasis: input.emphasis } : {}),
      ...(input.wholeObject ? { wholeObject: true } : {}),
      ...(input.geo !== undefined ? { geo: input.geo } : {}),
      ...(input.motivation !== undefined ? { motivation: input.motivation } : {}),
    });
    this.advance(record);
    return record.logicalId;
  }

  /** Append an edited version (carries unchanged fields forward).
   *  Throws on a degenerate replacement target — same log-boundary invariant as createNote. */
  editNote(logicalId: LogicalId, changes: NoteEdit): void {
    if (changes.target !== undefined && isDegenerateTarget(changes.target)) throw new Error("editNote: degenerate target selector (empty/NaN geometry) must not enter the log");
    // The head comes from the index (O(1)); appendEdit would otherwise re-derive it with a whole-log
    // scan on every keystroke-scale edit. Same guards either way — see log.ts `linearHeadOf`.
    const record = editRecord(logicalId, {
      lastEditor: this.stamp(),
      ...(changes.target !== undefined ? { target: changes.target } : {}),
      ...(changes.body !== undefined ? { body: changes.body } : {}),
      ...(changes.reading !== undefined ? { reading: changes.reading } : {}),
      ...(changes.section !== undefined ? { section: changes.section } : {}),
      ...(changes.emphasis !== undefined ? { emphasis: changes.emphasis } : {}),
      ...(changes.wholeObject !== undefined ? { wholeObject: changes.wholeObject } : {}),
      ...(changes.geo !== undefined ? { geo: changes.geo } : {}),
      ...(changes.motivation !== undefined ? { motivation: changes.motivation } : {}),
    }, this.index.linearHead(logicalId));
    this.advance(record);
  }

  /** Append a tombstone (append-only delete). */
  deleteNote(logicalId: LogicalId): void {
    const record = deleteRecord(logicalId, { lastEditor: this.stamp() }, this.index.linearHead(logicalId));
    this.advance(record);
  }

  /** The current live notes (head records) — for the sidebar list. Memoized by log identity. */
  notes(): AnnotationRecord[] {
    return this.heads();
  }

  // ── Collaboration (async-zip exchange — the Review-Changes flow) ──

  /**
   * Merge a colleague's log into this session (Import changes). Fast-forwards collapse silently;
   * genuinely concurrent edits become plural heads. Returns the logicalIds that need a decision.
   */
  importChanges(incoming: AnnotationLog): LogicalId[] {
    this.setLog(mergeLogs(this.entries, incoming) as AnnotationLog);
    // A merge can add/rewrite MANY pages (fast-forwards, new logicalIds) the dirty set didn't track —
    // force the next save to be a full write rather than risk a stale page on disk.
    this.persistedFully = false;
    return this.conflicts();
  }

  /** LogicalIds with an unresolved concurrent conflict (plural heads).
   *  NOTE deliberately not derived from heads(): the heads projection drops tombstone heads, but a
   *  delete concurrent with an edit IS a conflict — the index keeps the raw per-id heads. */
  conflicts(): LogicalId[] {
    return this.index.conflicts();
  }

  /** The competing heads of a conflicted note (for the conflict card to show both sides).
   *  Equivalent to `headsOf(entries, logicalId)`, pinned by head-index.test.ts. */
  conflictHeads(logicalId: LogicalId): AnnotationRecord[] {
    return this.index.headsOf(logicalId);
  }

  /**
   * Resolve a conflict by appending a merge node with the chosen/merged content. reading/section/
   * emphasis/wholeObject/geo are carried onto the node by `resolveConflict` itself now — from the choice when
   * supplied, else inherited from whichever head carries them (Issue 21: the carry moved INSIDE the
   * primitive, so this delegate can no longer be the only thing standing between a note and a silent
   * data-loss on resolution). This method just threads the editor identity + the user's choice through.
   */
  resolve(
    logicalId: LogicalId,
    choice: { body?: W3CBody | W3CBody[]; target?: W3CTarget; motivation?: string | string[]; reading?: string; section?: string; emphasis?: Emphasis; wholeObject?: boolean; geo?: GeoAnchor } = {},
  ): void {
    this.setLog(resolveConflict(this.entries, logicalId, {
      lastEditor: this.stamp(),
      ...(choice.body !== undefined ? { body: choice.body } : {}),
      ...(choice.target !== undefined ? { target: choice.target } : {}),
      ...(choice.motivation !== undefined ? { motivation: choice.motivation } : {}),
      ...(choice.reading !== undefined ? { reading: choice.reading } : {}),
      ...(choice.section !== undefined ? { section: choice.section } : {}),
      ...(choice.emphasis !== undefined ? { emphasis: choice.emphasis } : {}),
      ...(choice.wholeObject !== undefined ? { wholeObject: choice.wholeObject } : {}),
      ...(choice.geo !== undefined ? { geo: choice.geo } : {}),
    }));
    this.dirty.add(logicalId);
  }

  /**
   * WORKING annotations for the editing surface — each `id` is the stable LOGICAL id (not the
   * versioned citation id), so selection/highlight survives edits. Publish uses the versioned
   * projection (toHeadsPage) instead.
   */
  workingAnnotations(): W3CAnnotation[] {
    return this.working.get();
  }

  /**
   * WHAT THE `computed` BUYS, stated narrowly so nobody reads more into it.
   *
   * It removes REPEATED work, not first work. The projection below is O(heads) and allocates a
   * fresh W3CAnnotation per head; before this it ran on EVERY call, and App.svelte's derivation
   * chain (`objAnnotations` -> `annotations` -> `canvasAnnotations`, plus `annById`) calls it
   * whenever anything upstream re-evaluates, including edits to state that has nothing to do
   * with annotations. Now N calls between two mutations cost one projection.
   *
   * The second, quieter win is REFERENCE STABILITY: an unchanged read returns the same array,
   * so a `$derived` chained off it stops cascading. That is what makes `state/`'s coarse
   * epoch tick affordable at the UI (see `state/index.ts`).
   *
   * What it does NOT buy: anything per-EDIT. A mutation still costs exactly one atom bump, and
   * the projection is deferred to the next read — the same total work as before for a
   * mutate-then-read cycle. That is deliberate; `head-index.perf.test.ts` is the gate that says
   * so, and its bound is a single pass over the log.
   */
  private projectWorkingAnnotations(): W3CAnnotation[] {
    return this.heads().map((record) => {
      const ann = recordToAnnotation(record, record.logicalId);
      if (record.reading !== undefined) (ann as unknown as Record<string, unknown>)[ARCHIE_READING] = record.reading;
      if (record.section !== undefined) (ann as unknown as Record<string, unknown>)[ARCHIE_SECTION] = record.section;
      if (record.emphasis !== undefined) (ann as unknown as Record<string, unknown>)[ARCHIE_EMPHASIS] = record.emphasis;
      if (record.wholeObject === true) (ann as unknown as Record<string, unknown>)[ARCHIE_WHOLE_OBJECT] = true;
      if (record.geo !== undefined) (ann as unknown as Record<string, unknown>)[ARCHIE_GEO] = record.geo;
      return ann;
    });
  }

  /** Persist the log (heads + history) into an annotations directory. Incremental once the full log is on
   *  disk: rewrites only the pages changed since the last save (the write-amplification fix). The first
   *  save (or one after a merge) writes everything. */
  async save(annDir: FsDirectory, opts: SerializeOptions = {}): Promise<void> {
    if (!this.persistedFully) {
      await writeAnnotations(annDir, this.entries, opts); // full projection — every page to disk
      this.persistedFully = true;
      this.dirty.clear();
      return;
    }
    // Snapshot the dirty set, write just those pages, then clear ONLY what we wrote — edits that land
    // during the async write stay dirty for the next save (the log passed reflects this snapshot).
    const snapshot = new Set(this.dirty);
    await writeAnnotations(annDir, this.entries, opts, snapshot);
    for (const id of snapshot) this.dirty.delete(id);
  }
}
