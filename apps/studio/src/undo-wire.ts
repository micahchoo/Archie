// UndoWire (Archie-9da0) — the ONE studio-side seam between the editing surface and
// `AnnotationUndoManager`. WHY A SEAM AND NOT BARE MANAGER CALLS: the manager records history
// only for mutations routed through it, and a missed call site fails SILENTLY — the edit lands
// in the log but is absent from history. So the editor holds a wire, not a raw session: every
// note mutation goes through here (the manager's internal tripwire turns any bypass loud), and
// `importChanges` — the ONE legitimate log-level bypass — is re-baselined automatically.
//
// SESSION-FOLLOWING: `sess.session` is REPLACED on every exhibit open (exhibit-session.svelte.ts),
// so the wire takes a session GETTER, not an instance, and pairs each session with its own fresh
// manager. That makes the per-context isolation (feasibility rec 3) structural: history never
// crosses an exhibit switch, because the switch mints a new manager — the session-scoped undo
// decision (Archie-69a6) enforced by construction, not by discipline.
//
// Each routed mutation pulses `notify`. Routed mutations already move `session.revision` (the
// App epoch edge fires on its own); undo/redo move ONLY the projection overlay, so `notify`
// (App's resync tick) is what makes them visible at all.

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
  /** The CURRENT session's manager — read side and gesture marks (`notes()`, `canUndo`,
   *  `mark()`/`bailToMark()` around composite gestures). Mutations go through the routed methods
   *  below. Replaced (empty history) whenever the session itself is replaced. */
  readonly mgr: AnnotationUndoManager;
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
  const manager = (): AnnotationUndoManager => {
    const s = getSession();
    if (s !== current) {
      // A new session instance = a new exhibit (or a wholesale replace): EMPTY history, by design.
      current = s;
      currentMgr = new AnnotationUndoManager(s);
    }
    return currentMgr;
  };
  return {
    get mgr() { return manager(); },
    get canUndo() { return manager().canUndo; },
    get canRedo() { return manager().canRedo; },
    createNote(input: NewNote): LogicalId {
      const id = manager().createNote(input);
      notify();
      return id;
    },
    editNote(logicalId: LogicalId, changes: NoteEdit): void {
      manager().editNote(logicalId, changes);
      notify();
    },
    deleteNote(logicalId: LogicalId): void {
      manager().deleteNote(logicalId);
      notify();
    },
    resolveNote(logicalId: LogicalId, choice: ResolveChoice = {}): void {
      manager().resolveNote(logicalId, choice);
      notify();
    },
    resolve(logicalId: LogicalId, choice: ResolveChoice = {}): void {
      manager().resolveNote(logicalId, choice);
      notify();
    },
    importChanges(incoming: AnnotationLog): LogicalId[] {
      const ids = getSession().importChanges(incoming);
      manager().resyncLog();
      notify();
      return ids;
    },
    undo(): void {
      manager().undo();
      notify();
    },
    redo(): void {
      manager().redo();
      notify();
    },
    notes: () => manager().notes(),
    workingAnnotations: () => manager().workingAnnotations(),
    conflicts: () => getSession().conflicts(),
    conflictHeads: (logicalId: LogicalId) => getSession().conflictHeads(logicalId),
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
