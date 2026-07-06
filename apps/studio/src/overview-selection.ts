// Pure selection + multi-drag logic for the exhibit overview (SCALE-GALLERY Phase 2). Kept framework-free
// (cf. library-meta-reducers.ts) so the load-bearing math is unit-testable headless: the ExhibitOverview
// emits pointer intents, App holds `selection`/`anchor` $state and runs these reducers. Every function is
// pure — a new Set / array out, inputs untouched — so Svelte reactivity invalidates on the reassignment.

/** Drop-target sentinels for moveBlock — the overview's leading/trailing insert positions (a real object
 *  id means "insert before this object"). Shared with ExhibitOverview so there's ONE definition. */
export const START = "__start__";
export const END = "__end__";

export interface ClickMods {
  /** ⌘/Ctrl held — toggle this id in/out of the selection. */
  meta: boolean;
  /** Shift held — select the contiguous range from the anchor to this id. */
  shift: boolean;
}

/** The App-owned selection cursor: which object ids are selected + the anchor a shift-range extends from. */
export interface SelectionState {
  selection: Set<string>;
  /** The last plainly/toggled-clicked id — the fixed end of a shift-range. null = nothing anchored. */
  anchor: string | null;
}

/**
 * Fold a plate click into the selection (photo-app semantics):
 *   plain  → replace the selection with just this id (single-select);
 *   ⌘/ctrl → toggle this id, keeping the rest;
 *   shift  → the contiguous range from the anchor to this id, replacing the selection but KEEPING the
 *            anchor (so successive shift-clicks re-range from the same origin).
 * `orderedIds` is the order the range runs over — the caller passes the VISIBLE/DISPLAY order (what's on
 * screen under the active filter/sort), NOT the canonical array: photo apps range over the visible
 * sequence, and canonical ranging would silently select filtered-OUT objects a bulk delete then removes
 * unseen. A shift with no live anchor — OR an anchor that the current filter has hidden (not in
 * `orderedIds`, so indexOf = -1) — degrades to a plain single-select (predictable; never a phantom range).
 */
export function applyClick(
  state: SelectionState,
  id: string,
  mods: ClickMods,
  orderedIds: readonly string[],
): SelectionState {
  if (mods.shift && state.anchor !== null) {
    const a = orderedIds.indexOf(state.anchor);
    const b = orderedIds.indexOf(id);
    if (a === -1 || b === -1) return { selection: new Set([id]), anchor: id };
    const [lo, hi] = a <= b ? [a, b] : [b, a];
    return { selection: new Set(orderedIds.slice(lo, hi + 1)), anchor: state.anchor };
  }
  if (mods.meta) {
    const next = new Set(state.selection);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return { selection: next, anchor: id };
  }
  return { selection: new Set([id]), anchor: id };
}

/** A plate's viewport-space bounds, for marquee hit-testing (the component reads these off live DOM rects). */
export interface PlateRect { id: string; left: number; top: number; right: number; bottom: number }
/** A rubber-band drag in the same coordinate space (start → current corner, either direction). */
export interface Rubber { x0: number; y0: number; x1: number; y1: number }

/**
 * Which plates a marquee rubber-band touches — the pure geometry behind background-drag select. A plate
 * is a hit when its box OVERLAPS the (direction-normalized) band at all (standard AABB intersection), so
 * dragging in any direction and grazing a plate selects it. The DOM-rect gathering stays in the component;
 * this is the testable core.
 */
export function marqueeHits(plates: readonly PlateRect[], r: Rubber): string[] {
  const lo = Math.min(r.x0, r.x1), hi = Math.max(r.x0, r.x1);
  const top = Math.min(r.y0, r.y1), bot = Math.max(r.y0, r.y1);
  return plates.filter((p) => p.left < hi && p.right > lo && p.top < bot && p.bottom > top).map((p) => p.id);
}

/** Select every object (⌘A). The anchor moves to the last id so a following shift-click ranges from the end. */
export function selectAll(orderedIds: readonly string[]): SelectionState {
  return { selection: new Set(orderedIds), anchor: orderedIds[orderedIds.length - 1] ?? null };
}

/** Empty the selection (Esc, or a background click). */
export function clearSelection(): SelectionState {
  return { selection: new Set(), anchor: null };
}

/**
 * Fold a marquee result into the selection: the geometry hit-test (which plates the rubber-band covers)
 * lives in the component against live DOM rects; this just installs the hit set and anchors on the last
 * hit so a subsequent shift-click extends from there. Empty rubber-band → cleared.
 */
export function applyMarquee(hitIds: readonly string[]): SelectionState {
  return { selection: new Set(hitIds), anchor: hitIds.length ? hitIds[hitIds.length - 1]! : null };
}

/**
 * Reorder `orderedIds` by lifting the `movingIds` block (in its canonical relative order) and re-inserting
 * it before `before` (START → position 0; END/null → the end; a real id → before that id). Generalizes the
 * old single-item commitReorder/commitToStart into one path and SUBSUMES their first-position edge case:
 * the moving ids are filtered out of `rest` before `indexOf`, so a dragged-item-is-first never hits the
 * `indexOf(self) = -1 → wrong append` bug. Dropping the block onto one of its OWN members is a no-op.
 */
export function moveBlock(
  orderedIds: readonly string[],
  movingIds: ReadonlySet<string> | readonly string[],
  before: string | null,
): string[] {
  const movingSet = movingIds instanceof Set ? movingIds : new Set(movingIds);
  if (before !== START && before !== END && before !== null && movingSet.has(before)) {
    return [...orderedIds]; // dropped onto the moving block itself — nothing to do
  }
  const moving = orderedIds.filter((id) => movingSet.has(id)); // canonical relative order preserved
  const rest = orderedIds.filter((id) => !movingSet.has(id));
  let at: number;
  if (before === START) at = 0;
  else if (before === END || before === null) at = rest.length;
  else {
    const i = rest.indexOf(before);
    at = i < 0 ? rest.length : i;
  }
  return [...rest.slice(0, at), ...moving, ...rest.slice(at)];
}
