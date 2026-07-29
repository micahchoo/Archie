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

/** True when "make this the reading order" is offered: a sort IS active (otherwise it is a no-op) and
 *  no search is filtering the view (Archie-3b9f).
 *
 *  The search half is the load-bearing one. A filtered view is a SUBSET, so committing it would have to
 *  decide what happens to the objects you cannot see — either silently dropping them or interleaving
 *  them by some rule nobody asked for. Both are destructive in a way the author can't preview, which is
 *  exactly the hazard `isReorderable`'s own comment is about. Disabling is the honest option, and it
 *  keeps ONE rule for "a filtered view can't be turned into an order". */
export function canCommitSort(sortMode: OverviewSortMode, search: string): boolean {
  return sortMode !== "reading" && search.trim() === "";
}

/** Why the commit action is unavailable, or "" when it is available — same channel and same voice as
 *  `reorderBlockedMessage`, so the two never drift into describing the same state differently. */
export function commitSortBlockedMessage(sortMode: OverviewSortMode, search: string): string {
  if (search.trim() !== "") return "Clear the search first — a filtered view is only part of the exhibit, so committing it would move objects you can't see.";
  if (sortMode === "reading") return "This already IS the reading order.";
  return "";
}
