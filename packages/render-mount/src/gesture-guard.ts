// GestureGuard — pure decision core for createMount's lifecycle guard (worklist 0.2).
//
// Replaces the annotator.state.store monkey-patch (undocumented Annotorious internals) with
// decisions at the PUBLIC event layer. The mount reports each lifecycle event; the guard answers
// what to do. Programmatic guard actions echo back as lifecycle events — verified on
// @annotorious/core 3.8.2: `removeAnnotation`/`updateAnnotation` write the store with the default
// Origin.LOCAL, and the lifecycle observer emits LOCAL changes only (so the echo is GUARANTEED,
// and `setAnnotations`, which writes Origin.REMOTE, never echoes). The guard therefore marks the
// id and swallows exactly one echo per action — deterministic, no leak.
//
// Pure and headless-tested on purpose: this is the one piece of the mount where a logic error
// means silent canvas↔log divergence (the worklist's "test the inventions, not the certainties").

export type CreateDecision = "notify" | "remove";
export type UpdateDecision = "notify" | "revert" | "swallow";
export type DeleteDecision = "notify" | "swallow";

export class GestureGuard {
  private pendingDeleteEcho = new Set<string>();
  private pendingUpdateEcho = new Set<string>();

  /** A createAnnotation event arrived. "remove" = degenerate draw: remove it via the public API
   *  and do NOT notify listeners (the log never learns it existed). */
  onCreate(id: string | undefined, degenerate: boolean): CreateDecision {
    if (!degenerate) return "notify";
    if (id !== undefined) this.pendingDeleteEcho.add(id);
    return "remove";
  }

  /** A deleteAnnotation event arrived. "swallow" = it is the echo of our own onCreate removal. */
  onDelete(id: string | undefined): DeleteDecision {
    return id !== undefined && this.pendingDeleteEcho.delete(id) ? "swallow" : "notify";
  }

  /** An updateAnnotation event arrived. "revert" = degenerate geometry edit: restore the previous
   *  annotation via the public API, do NOT notify. "swallow" = the echo of our own restore (its
   *  payload is the previous, non-degenerate state the listeners already hold). */
  onUpdate(id: string | undefined, degenerate: boolean): UpdateDecision {
    if (id !== undefined && this.pendingUpdateEcho.delete(id)) return "swallow";
    if (!degenerate) return "notify";
    if (id !== undefined) this.pendingUpdateEcho.add(id);
    return "revert";
  }
}
