// In-exhibit navigation helpers (SCALE-GALLERY Phase 4) — the pure step/position logic behind the
// filmstrip jump, ←/→ object-stepping, and the "Object N of M" / "Section N of M" indicators. Kept
// out of the Svelte components so the index math is unit-testable (the components stay presentational,
// as the viewer's `note-arrival` / `section-landing` helpers already are). Viewer-local.

/** Step from `currentId` by `delta` (±1) over an ordered object list, WITHOUT wrapping. Returns the
 *  target object id, or null when there is no neighbour (at an end, an unknown/absent current, or a
 *  one-object list). Drives ←/→ stepping and any prev/next control over sibling objects. */
export function stepObjectId(
  objects: ReadonlyArray<{ id: string }>,
  currentId: string | null,
  delta: number,
): string | null {
  const i = objects.findIndex((o) => o.id === currentId);
  if (i < 0) return null; // no current object (e.g. the grid overview) — nothing to step from
  const j = i + delta;
  if (j < 0 || j >= objects.length) return null; // at an end — no wrap
  return objects[j]!.id;
}

/** A persistent position indicator: 1-based `index` of `total`, named by `unit` (e.g. "Object 14 of 32",
 *  "Section 3 of 7"). `index` is 0-based; callers pass an in-range index. */
export function positionLabel(index: number, total: number, unit: string): string {
  return `${unit} ${index + 1} of ${total}`;
}
