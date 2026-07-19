// Pure predicate for the exhibit overview's drag-to-reorder availability (Archie-adae canvas review).
// Reorder is meaningful ONLY over canonical reading order with no active search — a drop index computed
// against a filtered/sorted view doesn't map onto a canonical array position. Kept framework-free (cf.
// overview-selection.ts) so ExhibitOverview.svelte's `reorderable` $derived and the canvas mode's
// persistent "reordering is off" state indicator share ONE definition instead of two copies of the same
// two-part condition drifting apart.

export type OverviewSortMode = "reading" | "name" | "recent";

/** True when a plate/row drag actually reorders the canonical array — reading-order sort, no search text. */
export function isReorderable(sortMode: OverviewSortMode, search: string): boolean {
  return sortMode === "reading" && search.trim() === "";
}
