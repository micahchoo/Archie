// Pure, framework-free selection helpers for LibraryHome's exhibit multi-select (SCALE-GALLERY Phase 2,
// ledgers/PLAN-collection-import-2026-07-19.md §9). The selection GRAMMAR — plain replace / ⌘-toggle / shift-range,
// select-all, clear — is overview-selection.ts's, IMPORTED not re-invented: the plan forbids a second
// selection idiom, and the reducers there already range over a caller-supplied "visible order" (photo-app
// semantics), which is exactly what LibraryHome needs. This module adds only what the LIBRARY surface
// requires on top: deriving the SELECTABLE, in-view slug list the shared reducers range over.
import {
  applyClick,
  selectAll,
  clearSelection,
  type SelectionState,
  type ClickMods,
} from "./overview-selection.js";

// Re-export the shared grammar so LibraryHome imports the whole vocabulary from ONE place (the seam),
// never reaching past this module into overview-selection.ts and never growing a parallel copy.
export { applyClick, selectAll, clearSelection };
export type { SelectionState, ClickMods };

/**
 * The slugs a select-all / shift-range may touch, in DISPLAY order. `shown` is the exhibits the current
 * view actually renders — already narrowed by the active search (filterExhibits) and/or the browsing shelf
 * — so "search `Documents` → select all" selects ONLY the filtered set (the plan's flatten-mitigation
 * workflow, §9). Passing this list as the reducer's `orderedIds` is what makes select-all-respects-search
 * fall out of the shared grammar with no second range implementation.
 *
 * Template/example exhibits are EXCLUDED (the caller's `isTemplate` predicate): an Example is an unsaved
 * playground, so a future bulk delete or bulk rights-edit over one is meaningless — keeping them out of the
 * selectable list keeps them out of every range and ⌘A by construction, not by a downstream filter.
 */
export function selectableSlugs(
  shown: ReadonlyArray<{ slug: string }>,
  isTemplate: (slug: string) => boolean,
): string[] {
  return shown.filter((e) => !isTemplate(e.slug)).map((e) => e.slug);
}

/**
 * True when every selectable-in-view slug is already selected — drives the "Select all" affordance's
 * disabled state (nothing left to add). An empty selectable set is `false`: there is nothing to have
 * selected, so "all selected" would be a misleading enabled-looking no-op.
 */
export function allSelected(selection: ReadonlySet<string>, selectable: readonly string[]): boolean {
  return selectable.length > 0 && selectable.every((s) => selection.has(s));
}

/**
 * Drop selected slugs that no longer exist — an exhibit removed (per-card pencil) while a selection is
 * live. Pure (new Set out, inputs untouched) so the count/actions never dangle on a deleted exhibit.
 */
export function pruneSelection(selection: ReadonlySet<string>, existing: Iterable<string>): Set<string> {
  const live = existing instanceof Set ? existing : new Set(existing);
  const next = new Set<string>();
  for (const s of selection) if (live.has(s)) next.add(s);
  return next;
}

/**
 * Reconcile a whole SelectionState against the exhibits that still EXIST — prune removed slugs out of the
 * selection AND drop a dangling anchor (its exhibit gone). The caller writes this back into the actual
 * selection STATE (not a derived view), so `selection` stays the ONE source of truth: a delete under an
 * active selection can't strand a phantom entry that the bar hides but Esc still consumes, and the coming
 * bulk tickets (Archie-ddaa / Archie-d2cc) act on `selection` directly with no separate "live" set to
 * remember. `selectionChanged` reports whether anything was dropped, so a reactive caller only reassigns
 * when there's real work (no self-triggering loop).
 */
export function reconcileSelection(
  state: SelectionState,
  existing: Iterable<string>,
): { state: SelectionState; selectionChanged: boolean } {
  const live = existing instanceof Set ? existing : new Set(existing);
  const selection = pruneSelection(state.selection, live);
  const anchor = state.anchor !== null && live.has(state.anchor) ? state.anchor : null;
  return { state: { selection, anchor }, selectionChanged: selection.size !== state.selection.size };
}
