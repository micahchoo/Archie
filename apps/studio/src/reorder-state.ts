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

/** The accurate, plain-language reason reordering is off right now — split by WHICH condition(s)
 *  actually block it (Archie-adae review follow-up): "clear search & sort" was wrong for a user who'd
 *  only touched ONE of the two (told to clear a sort they never set). "" when reordering IS available
 *  (isReorderable true), so callers can render this directly without a separate isReorderable branch —
 *  the canvas indicator, list mode's persistent hint, AND the list grip's title all share this ONE
 *  function instead of three copies of the same two-part condition (the pre-existing flaw was in all
 *  three call sites, not just the canvas indicator this was written for). */
export function reorderBlockedMessage(sortMode: OverviewSortMode, search: string): string {
  const searchActive = search.trim() !== "";
  const sortActive = sortMode !== "reading";
  if (searchActive && sortActive) return "Reordering is off while search and sort are active — clear the search and switch back to reading order to turn it back on.";
  if (searchActive) return "Reordering is off while search is active — clear the search to turn it back on.";
  if (sortActive) return "Reordering is off while sort is active — switch back to reading order to turn it back on.";
  return "";
}
