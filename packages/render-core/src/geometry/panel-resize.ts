// Panel resize math — pure 1-D width computation for a draggable divider between a fixed-width
// side panel and a flexible main area. The divider sits on the panel's inner edge; dragging it
// TOWARD the panel shrinks it, AWAY grows it. Framework-free + headless-tested; ResizeDivider.svelte
// is a thin projection of this. The responsive clamp() DEFAULT width lives in CSS — this computes
// only the user's explicit px OVERRIDE (null override ⇒ the CSS default is used, nothing here runs).

export type PanelSide = "left" | "right";

export interface ResizeBounds {
  /** Smallest the panel may be dragged, px. */
  min: number;
  /** Largest the panel may be dragged, px. */
  max: number;
}

/** Clamp a width into [min, max]. Non-finite ⇒ min; a degenerate min>max prefers min. */
export function clampWidth(width: number, bounds: ResizeBounds): number {
  const w = Number.isFinite(width) ? width : bounds.min;
  return Math.max(bounds.min, Math.min(bounds.max, w));
}

/**
 * New panel width (px) after dragging the divider by `deltaX` (cursor px from drag start), given
 * the drag began at `startWidth`. `side` = which side of the divider the resized panel sits on:
 *  - "left":  panel is left of the divider  → dragging right (deltaX > 0) GROWS it.
 *  - "right": panel is right of the divider → dragging right (deltaX > 0) SHRINKS it.
 * Result is clamped to [min, max]; a non-finite delta degrades to `startWidth` (clamped).
 */
export function resizePanelWidth(startWidth: number, deltaX: number, side: PanelSide, bounds: ResizeBounds): number {
  const d = Number.isFinite(deltaX) ? deltaX : 0;
  const signed = side === "left" ? d : -d;
  return clampWidth(startWidth + signed, bounds);
}

/**
 * Width after a keyboard nudge: `dir` is +1 (ArrowRight) / -1 (ArrowLeft), `step` the px increment.
 * Mirrors drag semantics via `side`, so ArrowRight always moves the divider rightward like the cursor.
 */
export function stepPanelWidth(width: number, dir: 1 | -1, step: number, side: PanelSide, bounds: ResizeBounds): number {
  return resizePanelWidth(width, dir * step, side, bounds);
}
