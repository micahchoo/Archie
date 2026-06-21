// AnnotationSession — the Studio editor brain (pure, headless-tested). Owns an append-only
// annotation log for one canvas/exhibit and exposes the authoring loop: create / edit / delete
// notes, a WORKING projection (annotations keyed by stable logicalId so selection survives
// version bumps — distinct from the versioned publish projection), and persist/reload via the
// Filesystem seam. The Svelte editor is a thin shell binding to this; the logic is here, tested.

import { appendNew, appendEdit, appendDelete } from "../spine/log.js";
import { isDegenerateTarget } from "../geometry/selector.js";
import { projectHeads } from "../spine/heads.js";
import { recordToAnnotation } from "../spine/serialize.js";
import { writeAnnotations, readAnnotations } from "../spine/persist.js";
import type { SerializeOptions } from "../spine/serialize.js";
import type { FsDirectory } from "../fs/seam.js";
import { ARCHIE_READING, ARCHIE_EMPHASIS, ARCHIE_WHOLE_OBJECT, ARCHIE_GEO } from "../wadm/types.js";
import type { Emphasis, GeoAnchor } from "../wadm/types.js";
import { mergeLogs, headsOf, resolveConflict } from "../spine/merge.js";
import type { AnnotationLog, AnnotationRecord, W3CAnnotation, W3CBody, W3CTarget } from "../wadm/types.js";
import type { ClientId, LogicalId } from "../wadm/brand.js";

export interface NewNote {
  target: W3CTarget;
  body?: W3CBody | W3CBody[];
  /** The single Reading this note belongs to (ADR-0007), or undefined = base. */
  reading?: string;
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
  /** Emphasis; undefined here leaves it unchanged (carried forward). To CLEAR to `"normal"`, pass null. */
  emphasis?: Emphasis | null;
  /** Region-override (ADR-0018); undefined = carry forward, null/false = clear, true = set. */
  wholeObject?: boolean | null;
  /** Geo anchor (ADR-0015); undefined = carry forward, null = clear, value = set. Mirrors `emphasis`. */
  geo?: GeoAnchor | null;
  motivation?: string | string[];
}

export class AnnotationSession {
  private log: AnnotationLog;
  /** Memoized heads projection, keyed by log IDENTITY. Every mutation REPLACES `this.log` with a new
   *  array (appendNew/appendEdit/appendDelete/merge/resolve), so a reference match proves the projection
   *  is unchanged. notes() and workingAnnotations() both read it, so the Studio's per-edit `rev` bump
   *  (which re-derives BOTH) projects the log ONCE, not twice. */
  private headsCache: { log: AnnotationLog; heads: AnnotationRecord[] } | null = null;
  /** Logical ids changed since the last save — the incremental-persist dirty set (the session is the ONE
   *  writer, so this is authoritative). Each mutation adds its id; save() writes just these pages. */
  private dirty = new Set<LogicalId>();
  /** True once the full log is known to be on disk (after a full write, or a load FROM disk). Until then
   *  the next save is a FULL write — incremental writes are only safe once every page exists on disk. */
  private persistedFully = false;

  constructor(
    private readonly editor: ClientId,
    log: AnnotationLog = [],
  ) {
    this.log = log;
  }

  /** The head records, memoized by `this.log` identity (recomputed only when the log actually changed). */
  private heads(): AnnotationRecord[] {
    if (this.headsCache === null || this.headsCache.log !== this.log) {
      this.headsCache = { log: this.log, heads: projectHeads(this.log) };
    }
    return this.headsCache.heads;
  }

  /** Load a session from a persisted annotations directory (the reload/open path). */
  static async load(annDir: FsDirectory, editor: ClientId): Promise<AnnotationSession> {
    const s = new AnnotationSession(editor, await readAnnotations(annDir));
    s.persistedFully = true; // every page is on disk (we just read them) — subsequent saves can be incremental
    return s;
  }

  /** The raw append-only log (e.g. for publish or inspection). */
  get entries(): AnnotationLog {
    return this.log;
  }

  /** Append a new note. Returns its stable logicalId (use it to select / open the form).
   *  Throws on a degenerate target (empty/NaN geometry) — the log is the ONE writer of annotation
   *  state (worklist 0.2), so it must never hold a record the canvas can't render. The mount's
   *  gesture guard filters these before the app sees them; reaching this throw is an invariant
   *  violation (a bad import path or a guard regression), not a user-facing flow. */
  createNote(input: NewNote): LogicalId {
    if (isDegenerateTarget(input.target)) throw new Error("createNote: degenerate target selector (empty/NaN geometry) must not enter the log");
    const { log, record } = appendNew(this.log, {
      target: input.target,
      lastEditor: this.editor,
      ...(input.body !== undefined ? { body: input.body } : {}),
      ...(input.reading !== undefined ? { reading: input.reading } : {}),
      ...(input.emphasis !== undefined ? { emphasis: input.emphasis } : {}),
      ...(input.wholeObject ? { wholeObject: true } : {}),
      ...(input.geo !== undefined ? { geo: input.geo } : {}),
      ...(input.motivation !== undefined ? { motivation: input.motivation } : {}),
    });
    this.log = log;
    this.dirty.add(record.logicalId);
    return record.logicalId;
  }

  /** Append an edited version (carries unchanged fields forward).
   *  Throws on a degenerate replacement target — same log-boundary invariant as createNote. */
  editNote(logicalId: LogicalId, changes: NoteEdit): void {
    if (changes.target !== undefined && isDegenerateTarget(changes.target)) throw new Error("editNote: degenerate target selector (empty/NaN geometry) must not enter the log");
    const { log } = appendEdit(this.log, logicalId, {
      lastEditor: this.editor,
      ...(changes.target !== undefined ? { target: changes.target } : {}),
      ...(changes.body !== undefined ? { body: changes.body } : {}),
      ...(changes.reading !== undefined ? { reading: changes.reading } : {}),
      ...(changes.emphasis !== undefined ? { emphasis: changes.emphasis } : {}),
      ...(changes.wholeObject !== undefined ? { wholeObject: changes.wholeObject } : {}),
      ...(changes.geo !== undefined ? { geo: changes.geo } : {}),
      ...(changes.motivation !== undefined ? { motivation: changes.motivation } : {}),
    });
    this.log = log;
    this.dirty.add(logicalId);
  }

  /** Append a tombstone (append-only delete). */
  deleteNote(logicalId: LogicalId): void {
    const { log } = appendDelete(this.log, logicalId, { lastEditor: this.editor });
    this.log = log;
    this.dirty.add(logicalId);
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
    this.log = mergeLogs(this.log, incoming);
    // A merge can add/rewrite MANY pages (fast-forwards, new logicalIds) the dirty set didn't track —
    // force the next save to be a full write rather than risk a stale page on disk.
    this.persistedFully = false;
    return this.conflicts();
  }

  /** LogicalIds with an unresolved concurrent conflict (plural heads). */
  conflicts(): LogicalId[] {
    const ids = [...new Set(this.log.map((r) => r.logicalId))];
    return ids.filter((id) => headsOf(this.log, id).length > 1);
  }

  /** The competing heads of a conflicted note (for the conflict card to show both sides). */
  conflictHeads(logicalId: LogicalId): AnnotationRecord[] {
    return headsOf(this.log, logicalId);
  }

  /**
   * Resolve a conflict by appending a merge node with the chosen/merged content. `reading`/`emphasis`/
   * `geo` are CARRIED onto the merge node — from the choice when supplied, else inherited from the same
   * lexicographically-first ("primary") head `resolveConflict` defaults body/target from — so a note
   * carrying a reading assignment, authored emphasis, or a geo anchor does NOT lose it on resolution
   * (the latent data-loss bug: `resolveConflict` reconstructs the node from body/target/motivation
   * only, dropping these three). Carried here rather than in `resolveConflict` because that primitive's
   * `ConflictResolution` contract does not model them; this is the session-level fix.
   */
  resolve(
    logicalId: LogicalId,
    choice: { body?: W3CBody | W3CBody[]; target?: W3CTarget; motivation?: string | string[]; reading?: string; emphasis?: Emphasis; wholeObject?: boolean; geo?: GeoAnchor } = {},
  ): void {
    // Inherit reading/emphasis/geo to carry onto the merge node when the choice doesn't override them.
    // Prefer the primary head (lexicographically-first rev — what resolveConflict builds the node from),
    // but FALL BACK to any other head that carries the field: a conflict between "has reading" and "no
    // reading" must keep the reading rather than drop it on rev ordering (that's the data-loss bug).
    const heads = [...this.conflictHeads(logicalId)].sort((a, b) => (a.rev < b.rev ? -1 : a.rev > b.rev ? 1 : 0));
    const inherit = <K extends "reading" | "emphasis" | "wholeObject" | "geo">(k: K): AnnotationRecord[K] | undefined =>
      heads.find((h) => h[k] !== undefined)?.[k];
    const reading = choice.reading ?? inherit("reading");
    const emphasis = choice.emphasis ?? inherit("emphasis");
    const wholeObject = choice.wholeObject ?? inherit("wholeObject");
    const geo = choice.geo ?? inherit("geo");
    const merged = resolveConflict(this.log, logicalId, {
      lastEditor: this.editor,
      ...(choice.body !== undefined ? { body: choice.body } : {}),
      ...(choice.target !== undefined ? { target: choice.target } : {}),
      ...(choice.motivation !== undefined ? { motivation: choice.motivation } : {}),
    });
    // Carry reading/emphasis/geo onto the just-appended merge node (the last record) — resolveConflict
    // does not model them. Only when present, so a plain conflict stays byte-stable.
    if (reading !== undefined || emphasis !== undefined || wholeObject !== undefined || geo !== undefined) {
      const head = merged[merged.length - 1]!;
      const carried: AnnotationRecord = {
        ...head,
        ...(reading !== undefined ? { reading } : {}),
        ...(emphasis !== undefined ? { emphasis } : {}),
        ...(wholeObject ? { wholeObject: true } : {}),
        ...(geo !== undefined ? { geo } : {}),
      };
      this.log = Object.freeze([...merged.slice(0, -1), carried]);
    } else {
      this.log = merged;
    }
    this.dirty.add(logicalId);
  }

  /**
   * WORKING annotations for the editing surface — each `id` is the stable LOGICAL id (not the
   * versioned citation id), so selection/highlight survives edits. Publish uses the versioned
   * projection (toHeadsPage) instead.
   */
  workingAnnotations(): W3CAnnotation[] {
    return this.heads().map((record) => {
      const ann = recordToAnnotation(record, record.logicalId);
      if (record.reading !== undefined) (ann as unknown as Record<string, unknown>)[ARCHIE_READING] = record.reading;
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
      await writeAnnotations(annDir, this.log, opts); // full projection — every page to disk
      this.persistedFully = true;
      this.dirty.clear();
      return;
    }
    // Snapshot the dirty set, write just those pages, then clear ONLY what we wrote — edits that land
    // during the async write stay dirty for the next save (the log passed reflects this snapshot).
    const snapshot = new Set(this.dirty);
    await writeAnnotations(annDir, this.log, opts, snapshot);
    for (const id of snapshot) this.dirty.delete(id);
  }
}
