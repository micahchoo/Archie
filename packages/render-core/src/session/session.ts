// AnnotationSession — the Studio editor brain (pure, headless-tested). Owns an append-only
// annotation log for one canvas/exhibit and exposes the authoring loop: create / edit / delete
// notes, a WORKING projection (annotations keyed by stable logicalId so selection survives
// version bumps — distinct from the versioned publish projection), and persist/reload via the
// Filesystem seam. The Svelte editor is a thin shell binding to this; the logic is here, tested.

import { appendNew, appendEdit, appendDelete } from "../spine/log.js";
import { projectHeads } from "../spine/heads.js";
import { recordToAnnotation } from "../spine/serialize.js";
import { writeAnnotations, readAnnotations } from "../spine/persist.js";
import type { SerializeOptions } from "../spine/serialize.js";
import type { FsDirectory } from "../fs/seam.js";
import { ARCHIE_LAYERS, ARCHIE_READING } from "../wadm/types.js";
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
  motivation?: string | string[];
}

export interface NoteEdit {
  target?: W3CTarget;
  body?: W3CBody | W3CBody[];
  /** @deprecated use `reading` (ADR-0007). */
  layers?: string[];
  /** Reading id; undefined here leaves it unchanged (carried forward). To CLEAR it, pass null. */
  reading?: string | null;
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

  /** Append a new note. Returns its stable logicalId (use it to select / open the form). */
  createNote(input: NewNote): LogicalId {
    const { log, record } = appendNew(this.log, {
      target: input.target,
      lastEditor: this.editor,
      ...(input.body !== undefined ? { body: input.body } : {}),
      ...(input.layers !== undefined ? { layers: input.layers } : {}),
      ...(input.reading !== undefined ? { reading: input.reading } : {}),
      ...(input.motivation !== undefined ? { motivation: input.motivation } : {}),
    });
    this.log = log;
    return record.logicalId;
  }

  /** Append an edited version (carries unchanged fields forward). */
  editNote(logicalId: LogicalId, changes: NoteEdit): void {
    const { log } = appendEdit(this.log, logicalId, {
      lastEditor: this.editor,
      ...(changes.target !== undefined ? { target: changes.target } : {}),
      ...(changes.body !== undefined ? { body: changes.body } : {}),
      ...(changes.layers !== undefined ? { layers: changes.layers } : {}),
      ...(changes.reading !== undefined ? { reading: changes.reading } : {}),
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

  /** Resolve a conflict by appending a merge node with the chosen/merged content. */
  resolve(logicalId: LogicalId, choice: { body?: W3CBody | W3CBody[]; target?: W3CTarget; layers?: string[]; motivation?: string | string[] }): void {
    this.log = resolveConflict(this.log, logicalId, {
      lastEditor: this.editor,
      ...(choice.body !== undefined ? { body: choice.body } : {}),
      ...(choice.target !== undefined ? { target: choice.target } : {}),
      ...(choice.layers !== undefined ? { layers: choice.layers } : {}),
      ...(choice.motivation !== undefined ? { motivation: choice.motivation } : {}),
    });
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
      return ann;
    });
  }

  /** Persist the log (heads + history) into an annotations directory. */
  async save(annDir: FsDirectory, opts: SerializeOptions = {}): Promise<void> {
    await writeAnnotations(annDir, this.log, opts);
  }
}
