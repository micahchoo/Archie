// Pattern 1 — keyboard "move mode" reorder for the exhibit overview list (Archie-f260, applying
// docs/research/a11y-interactions.md §1: the WAI-ARIA APG Grid pattern's rearrangeable-row grammar —
// space/enter lifts, arrows move, space/enter drops, escape cancels, live-announced BY POSITION). The
// drag-to-reorder path (moveBlock in overview-selection.ts) is the pointer twin of this; both commit
// through App's single `onreorder(orderedIds)` channel. Kept framework-free (cf. reorder-state.ts,
// overview-selection.ts) so the reducer + the announcement grammar are unit-testable headless: the
// component holds the `MoveState | null` $state and renders the working `order`, App commits on drop.
//
// A lift snapshots the canonical order into a WORKING copy; arrows re-index the moving id WITHIN that copy
// without touching canonical state, so Escape is a pure discard (no restore call needed) and only a Drop
// reaches `onreorder`. Position is 1-based in every announcement — matching the on-plate order badge
// (`orderIndexOf` + 1) and the grid's own aria-posinset/aria-setsize, so the spoken number is already true.

export interface MoveState {
  /** The working order (object ids) while a row is lifted — committed on drop, discarded on cancel. */
  order: string[];
  /** The lifted row travelling through `order`. */
  movingId: string;
  /** The row's index when lifted — the position Cancel announces it returns to (Cancel discards `order`). */
  origin: number;
}

/** Lift `id` out of `order` into move mode (a working copy). null when `id` isn't in the order. */
export function liftRow(order: readonly string[], id: string): MoveState | null {
  const origin = order.indexOf(id);
  if (origin < 0) return null;
  return { order: [...order], movingId: id, origin };
}

/** The moving row's current 0-based index in the working order. */
export function indexOfMoving(state: MoveState): number {
  return state.order.indexOf(state.movingId);
}

function reinsert(order: readonly string[], id: string, to: number): string[] {
  const rest = order.filter((x) => x !== id);
  const at = Math.min(rest.length, Math.max(0, to));
  return [...rest.slice(0, at), id, ...rest.slice(at)];
}

/** Move the lifted row by `delta` positions (clamped to the ends). A no-op at an end returns an equal order. */
export function moveRow(state: MoveState, delta: number): MoveState {
  const from = indexOfMoving(state);
  const to = Math.min(state.order.length - 1, Math.max(0, from + delta));
  return { ...state, order: reinsert(state.order, state.movingId, to) };
}

/** Move the lifted row to an absolute position — Home (0) / End (length-1). */
export function moveRowTo(state: MoveState, to: number): MoveState {
  return { ...state, order: reinsert(state.order, state.movingId, to) };
}

// --- Live-region announcement grammar (docs §1 "Live-region announcement grammar"). One polite region,
// text-toggled; position is 1-based (indexOfMoving + 1), n = order length. ---

const pos1 = (state: MoveState): number => indexOfMoving(state) + 1;

export function liftAnnouncement(label: string, state: MoveState): string {
  return `Picked up ${label}, position ${pos1(state)} of ${state.order.length}.`;
}
export function moveAnnouncement(state: MoveState): string {
  return `Moved to position ${pos1(state)} of ${state.order.length}.`;
}
export function dropAnnouncement(label: string, state: MoveState): string {
  return `Dropped ${label} at position ${pos1(state)} of ${state.order.length}.`;
}
export function cancelAnnouncement(label: string, state: MoveState): string {
  return `Reorder cancelled. ${label} is back at position ${state.origin + 1} of ${state.order.length}.`;
}
