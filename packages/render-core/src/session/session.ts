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
import { ARCHIE_LAYERS, ARCHIE_READING, ARCHIE_EMPHASIS, ARCHIE_GEO } from "../wadm/types.js";
import type { Emphasis, GeoAnchor } from "../wadm/types.js";
import { mergeLogs, headsOf, resolveConflict } from "../spine/merge.js";
import type { AnnotationLog, AnnotationRecord, W3CAnnotation, W3CBody, W3CTarget } from "../wadm/types.js";
import type { ClientId, LogicalId } from "../wadm/brand.js";

export interface NewNote {
  target: W3CTarget;
  body?: W3CBody | W3CBody[];
  /** @deprecated use `reading` (ADR-0007). */
  layers?: string[];
  /** The single Reading this note belongs to (ADR-0007), or undefined = base. */
  reading?: string;
  /** Authored per-note emphasis (1489), or undefined = default `"normal"`. */
  emphasis?: Emphasis;
  /** Geographic anchor (geo-truth, ADR-0015) for a Map note, or undefined = none. */
  geo?: GeoAnchor;
  motivation?: string | string[];
}

export interface NoteEdit {
  target?: W3CTarget;
  body?: W3CBody | W3CBody[];
  /** @deprecated use `reading` (ADR-0007). */
  layers?: string[];
  /** Reading id; undefined here leaves it unchanged (carried forward). To CLEAR it, pass null. */
  reading?: string | null;
  /** Emphasis; undefined here leaves it unchanged (carried forward). To CLEAR to `"normal"`, pass null. */
  emphasis?: Emphasis | null;
  /** Geo anchor (ADR-0015); undefined = carry forward, null = clear, value = set. Mirrors `emphasis`. */
  geo?: GeoAnchor | null;
  motivation?: string | string[];
}

export class AnnotationSession {
  private log: AnnotationLog;

  constructor(
    private readonly editor: ClientId,
    log: AnnotationLog = [],
  ) {
    this.log = log;
  }

  /** Load a session from a persisted annotations directory (the reload/open path). */
  static async load(annDir: FsDirectory, editor: ClientId): Promise<AnnotationSession> {
    return new AnnotationSession(editor, await readAnnotations(annDir));
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
      ...(input.layers !== undefined ? { layers: input.layers } : {}),
      ...(input.reading !== undefined ? { reading: input.reading } : {}),
      ...(input.emphasis !== undefined ? { emphasis: input.emphasis } : {}),
      ...(input.geo !== undefined ? { geo: input.geo } : {}),
      ...(input.motivation !== undefined ? { motivation: input.motivation } : {}),
    });
    this.log = log;
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
      ...(changes.layers !== undefined ? { layers: changes.layers } : {}),
      ...(changes.reading !== undefined ? { reading: changes.reading } : {}),
      ...(changes.emphasis !== undefined ? { emphasis: changes.emphasis } : {}),
      ...(changes.geo !== undefined ? { geo: changes.geo } : {}),
      ...(changes.motivation !== undefined ? { motivation: changes.motivation } : {}),
    });
    this.log = log;
  }

  /** Append a tombstone (append-only delete). */
  deleteNote(logicalId: LogicalId): void {
    const { log } = appendDelete(this.log, logicalId, { lastEditor: this.editor });
    this.log = log;
  }

  /** The current live notes (head records) — for the sidebar list. */
  notes(): AnnotationRecord[] {
    return projectHeads(this.log);
  }

  // ── Collaboration (async-zip exchange — the Review-Changes flow) ──

  /**
   * Merge a colleague's log into this session (Import changes). Fast-forwards collapse silently;
   * genuinely concurrent edits become plural heads. Returns the logicalIds that need a decision.
   */
  importChanges(incoming: AnnotationLog): LogicalId[] {
    this.log = mergeLogs(this.log, incoming);
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
   * (the latent data-loss bug: `resolveConflict` reconstructs the node from body/target/layers/motivation
   * only, dropping these three). Carried here rather than in `resolveConflict` because that primitive's
   * `ConflictResolution` contract does not model them; this is the session-level fix.
   */
  resolve(
    logicalId: LogicalId,
    choice: { body?: W3CBody | W3CBody[]; target?: W3CTarget; layers?: string[]; motivation?: string | string[]; reading?: string; emphasis?: Emphasis; geo?: GeoAnchor } = {},
  ): void {
    // Inherit reading/emphasis/geo to carry onto the merge node when the choice doesn't override them.
    // Prefer the primary head (lexicographically-first rev — what resolveConflict builds the node from),
    // but FALL BACK to any other head that carries the field: a conflict between "has reading" and "no
    // reading" must keep the reading rather than drop it on rev ordering (that's the data-loss bug).
    const heads = [...this.conflictHeads(logicalId)].sort((a, b) => (a.rev < b.rev ? -1 : a.rev > b.rev ? 1 : 0));
    const inherit = <K extends "reading" | "emphasis" | "geo">(k: K): AnnotationRecord[K] | undefined =>
      heads.find((h) => h[k] !== undefined)?.[k];
    const reading = choice.reading ?? inherit("reading");
    const emphasis = choice.emphasis ?? inherit("emphasis");
    const geo = choice.geo ?? inherit("geo");
    const merged = resolveConflict(this.log, logicalId, {
      lastEditor: this.editor,
      ...(choice.body !== undefined ? { body: choice.body } : {}),
      ...(choice.target !== undefined ? { target: choice.target } : {}),
      ...(choice.layers !== undefined ? { layers: choice.layers } : {}),
      ...(choice.motivation !== undefined ? { motivation: choice.motivation } : {}),
    });
    // Carry reading/emphasis/geo onto the just-appended merge node (the last record) — resolveConflict
    // does not model them. Only when present, so a plain conflict stays byte-stable.
    if (reading !== undefined || emphasis !== undefined || geo !== undefined) {
      const head = merged[merged.length - 1]!;
      const carried: AnnotationRecord = {
        ...head,
        ...(reading !== undefined ? { reading } : {}),
        ...(emphasis !== undefined ? { emphasis } : {}),
        ...(geo !== undefined ? { geo } : {}),
      };
      this.log = Object.freeze([...merged.slice(0, -1), carried]);
    } else {
      this.log = merged;
    }
  }

  /**
   * WORKING annotations for the editing surface — each `id` is the stable LOGICAL id (not the
   * versioned citation id), so selection/highlight survives edits. Publish uses the versioned
   * projection (toHeadsPage) instead.
   */
  workingAnnotations(): W3CAnnotation[] {
    return projectHeads(this.log).map((record) => {
      const ann = recordToAnnotation(record, record.logicalId);
      if (record.layers !== undefined) (ann as unknown as Record<string, unknown>)[ARCHIE_LAYERS] = record.layers;
      if (record.reading !== undefined) (ann as unknown as Record<string, unknown>)[ARCHIE_READING] = record.reading;
      if (record.emphasis !== undefined) (ann as unknown as Record<string, unknown>)[ARCHIE_EMPHASIS] = record.emphasis;
      if (record.geo !== undefined) (ann as unknown as Record<string, unknown>)[ARCHIE_GEO] = record.geo;
      return ann;
    });
  }

  /** Persist the log (heads + history) into an annotations directory. */
  async save(annDir: FsDirectory, opts: SerializeOptions = {}): Promise<void> {
    await writeAnnotations(annDir, this.log, opts);
  }
}
