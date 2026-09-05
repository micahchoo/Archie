// Studio note commands: each mutation is an undo action; body edits coalesce during a
// short typing burst and batch() groups synchronous imports/drags. Session replacement
// resets history. Callers never manage marks or projection reconciliation.

import {
  AnnotationUndoManager,
  type AnnotationSession,
  type AnnotationLog,
  type AnnotationRecord,
  type W3CAnnotation,
  type NewNote,
  type NoteEdit,
  type LogicalId,
} from "@render/core";
import { matches, typingInField } from "./shortcuts.js";

/** The resolution payload `session.resolve` / `mgr.resolveNote` takes — re-derived, never
 *  re-declared. */
export type ResolveChoice = Parameters<AnnotationSession["resolve"]>[1];

export interface UndoWire {
  /** Group synchronous mutations (a completed import or composite gesture) as one action. */
  batch<T>(action: () => T): T;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  createNote(input: NewNote): LogicalId;
  editNote(logicalId: LogicalId, changes: NoteEdit): void;
  deleteNote(logicalId: LogicalId): void;
  resolveNote(logicalId: LogicalId, choice?: ResolveChoice): void;
  /** Routed alias for MergeReview's `session.resolve(...)` call shape — same semantics. */
  resolve(logicalId: LogicalId, choice?: ResolveChoice): void;
  /** Merge a colleague's log — passthrough to `session.importChanges`, then re-baseline the
   *  bypass tripwire (the merge's revisions are the ONE by-design bypass) and pulse `notify`. */
  importChanges(incoming: AnnotationLog): LogicalId[];
  undo(): void;
  redo(): void;
  // ── The undo-aware READ SURFACE the editor consumes (the shape editor-model's deps accept) ──
  /** Session heads + the overlay — what the surface should draw. */
  notes(): AnnotationRecord[];
  /** Working (logicalId-keyed) WADM projection over the same undo-aware notes. */
  workingAnnotations(): W3CAnnotation[];
  /** Log-truth passthroughs: an overlay never hides a conflict or the raw log. */
  conflicts(): LogicalId[];
  conflictHeads(logicalId: LogicalId): AnnotationRecord[];
  get entries(): AnnotationLog;
}

export function createUndoWire(getSession: () => AnnotationSession, notify: () => void): UndoWire {
  let current: AnnotationSession | null = null;
  let currentMgr: AnnotationUndoManager;
  let depth = 0;
  let sequence = 0;
  let typing: { id: LogicalId; at: number } | null = null;
  const manager = (): AnnotationUndoManager => {
    const session = getSession();
    if (session !== current) {
      current = session;
      currentMgr = new AnnotationUndoManager(session);
      currentMgr.resyncLog();
      typing = null;
    }
    return currentMgr;
  };
  function perform<T>(action: (mgr: AnnotationUndoManager) => T, textId?: LogicalId): T {
    const mgr = manager();
    const now = Date.now();
    if (depth === 0) {
      if (!textId || typing?.id !== textId || now - typing.at >= 800) mgr.mark(`action:${++sequence}`);
      typing = textId ? { id: textId, at: now } : null;
    }
    const result = action(mgr);
    if (depth === 0) notify();
    return result;
  }
  const resolve = (id: LogicalId, choice: ResolveChoice = {}) => perform(m => m.resolveNote(id, choice));
  return {
    batch<T>(action: () => T): T {
      const mgr = manager();
      const outer = depth === 0;
      if (outer) { typing = null; mgr.mark(`batch:${++sequence}`); }
      depth += 1;
      try { return action(); }
      finally {
        depth -= 1;
        // Partial synchronous work remains one reversible action if an import throws.
        if (outer) { mgr.mark(`end:${++sequence}`); notify(); }
      }
    },
    get canUndo() { return manager().canUndo; },
    get canRedo() { return manager().canRedo; },
    createNote: input => perform(m => m.createNote(input)),
    editNote: (id, changes) => perform(m => m.editNote(id, changes),
      Object.keys(changes).length === 1 && changes.body !== undefined ? id : undefined),
    deleteNote: id => perform(m => m.deleteNote(id)),
    resolveNote: resolve,
    resolve,
    importChanges(incoming) {
      const mgr = manager();
      typing = null;
      mgr.mark(`import:${++sequence}`);
      const ids = getSession().importChanges(incoming);
      mgr.resyncLog();
      notify();
      return ids;
    },
    undo() { typing = null; manager().undo(); notify(); },
    redo() { typing = null; manager().redo(); notify(); },
    notes: () => manager().notes(),
    workingAnnotations: () => manager().workingAnnotations(),
    conflicts: () => getSession().conflicts(),
    conflictHeads: id => getSession().conflictHeads(id),
    get entries() { return getSession().entries; },
  };
}

export interface UndoKeyHandlers {
  undo: () => void;
  redo: () => void;
  /** Gate — e.g. only while the editor view is live. Omitted = always enabled. */
  enabled?: () => boolean;
}

/**
 * Window-level ⌘Z / ⇧⌘Z (registry rows in shortcuts.ts are the cheat-sheet's source of truth).
 * While the focus is in a text field the BROWSER's own text undo must win — the note history is
 * not the text history — so typing targets are skipped entirely. Returns the detach function
 * (drop it in a Svelte `$effect` cleanup). Node-env tests exercise `matches` directly; this
 * wrapper is the 6-line DOM mount.
 */
export function installUndoKeyboard(h: UndoKeyHandlers): () => void {
  const onKeydown = (e: KeyboardEvent): void => {
    if (typingInField(e)) return;
    if (h.enabled && !h.enabled()) return;
    if (matches(e, "⌘Z")) {
      e.preventDefault();
      h.undo();
    } else if (matches(e, "⇧⌘Z")) {
      e.preventDefault();
      h.redo();
    }
  };
  window.addEventListener("keydown", onKeydown);
  return () => window.removeEventListener("keydown", onKeydown);
}
