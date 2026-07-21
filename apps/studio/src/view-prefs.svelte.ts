// Persisted VIEW PREFERENCES (CONTEXT.md Navigation § "View preference" — Archie-a9fc chrome-trim
// decision: overview mode and library lens become preferences, not transient screen state). A view
// preference is "how a user likes to look at things" — it persists across sessions (last choice = new
// default) but is still never part of a place (a fresh library / a different machine still gets it).
// Contrast: search text, scroll position, canvas pan/zoom, selection mode are TRANSIENT screen state —
// remembered best-effort within a session, reset on a fresh load — and stay local component $state,
// never routed through this module.
//
// A `.svelte.ts` rune module (cf. library-meta.svelte.ts, save-queue.svelte.ts): the $state container
// is never reassigned, so reads stay live across modules/components. Same localStorage
// try/catch idiom as App.svelte's FIRST_ADD_KEY — private mode / disabled storage just means the
// preference resets to default next load, never an error — now via persisted.ts's persistedFlag /
// persistedString / safeGet / safeSet / safeRemove (Archie-3148). The rune $state SHAPE stays exactly
// as it was: persisted.ts is wrapped INSIDE this singleton, not used to replace the reactivity.
import { persistedFlag, persistedString, safeGet, safeSet, safeRemove } from "./persisted.js";

// Overview mode: the exhibit overview's Grid/List switch. The old spatial-canvas mode (pan/zoom over a
// transformed tableau) was retired (SCALE-GALLERY: it persisted NO spatial data and deterred use above
// ~100 objects) and replaced by a plain scrollable, virtualized GRID. A value of "canvas" persisted from
// before the retirement migrates to "grid" on read — see overviewModePref below.
export type OverviewMode = "grid" | "list";
export type GalleryView = "exhibits" | "wall";
// Grid density (SCALE-GALLERY): a 2-step per-device preference (Comfortable / Compact) for the overview
// GRID, mirroring the viewer gallery wall's density toggle (apps/viewer/src/grid-density.ts, Phase 4). The
// metrics couple the grid's min column width AND its `contain-intrinsic-size` estimate — they MUST move
// together or the content-visibility virtualization mis-reserves height and scrolling janks; one function
// returns both so a caller can't set one and forget the other. (Studio's earlier density "Size" range
// slider was REMOVED in Archie-a9fc in favour of one fixed size; this lighter 2-step toggle is its
// replacement — a discrete choice, not a continuous slider, so it reintroduces neither the fiddly control
// nor the per-pixel intrinsic-size drift the slider risked.)
export type OverviewDensity = "comfortable" | "compact";

const OVERVIEW_MODE_KEY = "archie.overviewMode.v1";
const OVERVIEW_DENSITY_KEY = "archie.overviewDensity.v1";
const GALLERY_VIEW_KEY = "archie.libraryGalleryView.v1";
// Editor chrome (Archie-c7ef): the filmstrip rail's collapsed state and the inspector panel's width
// are "how the author likes the editor to look" — persisted view preferences, last-set wins (CONTEXT.md
// Navigation § "View preference"), never part of a place. Rail default is EXPANDED (Archie-b671
// amendment); the inspector defaults to the CSS clamp() (~320px) until dragged (null = default width).
const RAIL_COLLAPSED_KEY = "archie.editorRailCollapsed.v1";
// "dock" retired as a chrome term (Archie-d48e): the right panel is the INSPECTOR now. The width pref is
// re-keyed to match, but load falls back to the legacy dock key so a user who dragged the old dock keeps
// their width across the rename; the setter writes only the new key, migrating on the next drag.
const INSPECTOR_WIDTH_KEY = "archie.editorInspectorWidth.v1";
const LEGACY_DOCK_WIDTH_KEY = "archie.editorDockWidth.v1";

// "list" stays list; EVERYTHING else — a fresh install, garbage, OR a legacy "canvas" left in storage
// from before the spatial canvas was retired — resolves to the new default "grid". That collapse IS the
// canvas→grid migration: no explicit rewrite needed, the read simply never yields "canvas" again.
const overviewModePref = persistedString<OverviewMode>(OVERVIEW_MODE_KEY, ["list"], "grid");
const overviewDensityPref = persistedString<OverviewDensity>(OVERVIEW_DENSITY_KEY, ["compact"], "comfortable");
const galleryViewPref = persistedString<GalleryView>(GALLERY_VIEW_KEY, ["wall"], "exhibits");
const railCollapsedPref = persistedFlag(RAIL_COLLAPSED_KEY);

/** The overview grid metrics for a density: `minCol` feeds `minmax(<minCol>, 1fr)` (the flex-wrap plate
 *  width), `intrinsic` feeds `contain-intrinsic-size: auto <intrinsic>` (the off-screen height estimate the
 *  content-visibility virtualization reserves). They move in lockstep — a plate's real rendered height
 *  tracks its width, so a narrower Compact column needs a shorter intrinsic estimate or the scrollbar
 *  jumps. Comfortable matches the retired canvas plate's 12.5rem width. */
export function overviewDensityMetrics(d: OverviewDensity): { minCol: string; intrinsic: string } {
  return d === "compact"
    ? { minCol: "9rem", intrinsic: "12rem" }
    : { minCol: "12.5rem", intrinsic: "15.5rem" };
}
function loadInspectorWidth(): number | null {
  const v = safeGet(INSPECTOR_WIDTH_KEY) ?? safeGet(LEGACY_DOCK_WIDTH_KEY);
  return v ? (Number(v) || null) : null;
}

const s = $state<{ overviewMode: OverviewMode; overviewDensity: OverviewDensity; galleryView: GalleryView; railCollapsed: boolean; inspectorWidth: number | null }>({
  overviewMode: overviewModePref.get(),
  overviewDensity: overviewDensityPref.get(),
  galleryView: galleryViewPref.get(),
  railCollapsed: railCollapsedPref.get(),
  inspectorWidth: loadInspectorWidth(),
});

/** The exhibit overview's Canvas/List mode + the library's Exhibits/All-images lens + the editor's
 *  filmstrip-collapsed and inspector-width — persisted, last-set wins, shared across every component that
 *  reads/writes them (one preference, not per-slug). */
export const viewPrefs = {
  get overviewMode(): OverviewMode { return s.overviewMode; },
  setOverviewMode(v: OverviewMode) {
    s.overviewMode = v;
    overviewModePref.set(v);
  },

  get overviewDensity(): OverviewDensity { return s.overviewDensity; },
  setOverviewDensity(v: OverviewDensity) {
    s.overviewDensity = v;
    overviewDensityPref.set(v);
  },

  get galleryView(): GalleryView { return s.galleryView; },
  setGalleryView(v: GalleryView) {
    s.galleryView = v;
    galleryViewPref.set(v);
  },

  get railCollapsed(): boolean { return s.railCollapsed; },
  setRailCollapsed(v: boolean) {
    s.railCollapsed = v;
    railCollapsedPref.set(v);
  },

  get inspectorWidth(): number | null { return s.inspectorWidth; },
  setInspectorWidth(v: number | null) {
    s.inspectorWidth = v;
    if (v == null) {
      // Reset (ResizeDivider double-click) clears BOTH keys — otherwise loadInspectorWidth's legacy
      // fallback would resurrect a stale archie.editorDockWidth.v1 on the next load.
      safeRemove(INSPECTOR_WIDTH_KEY);
      safeRemove(LEGACY_DOCK_WIDTH_KEY);
    } else {
      safeSet(INSPECTOR_WIDTH_KEY, String(Math.round(v)));
    }
  },
};

/** Test seam: re-read from localStorage (module-singleton pattern mirrors save-queue's
 *  resetSaveQueueForTests) — a test can stub localStorage, call this, and observe a fresh default/restore. */
export function reloadViewPrefsForTests(): void {
  s.overviewMode = overviewModePref.get();
  s.overviewDensity = overviewDensityPref.get();
  s.galleryView = galleryViewPref.get();
  s.railCollapsed = railCollapsedPref.get();
  s.inspectorWidth = loadInspectorWidth();
}
