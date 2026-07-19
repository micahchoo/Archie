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
// preference resets to default next load, never an error.

export type OverviewMode = "canvas" | "list";
export type GalleryView = "exhibits" | "wall";

const OVERVIEW_MODE_KEY = "archie.overviewMode.v1";
const GALLERY_VIEW_KEY = "archie.libraryGalleryView.v1";
// Editor chrome (Archie-c7ef): the filmstrip rail's collapsed state and the docked note editor's width
// are "how the author likes the editor to look" — persisted view preferences, last-set wins (CONTEXT.md
// Navigation § "View preference"), never part of a place. Rail default is EXPANDED (Archie-b671
// amendment); the dock defaults to the CSS clamp() (~320px) until dragged (null = default width).
const RAIL_COLLAPSED_KEY = "archie.editorRailCollapsed.v1";
const DOCK_WIDTH_KEY = "archie.editorDockWidth.v1";

function loadOverviewMode(): OverviewMode {
  try { return localStorage.getItem(OVERVIEW_MODE_KEY) === "list" ? "list" : "canvas"; } catch { return "canvas"; }
}
function loadGalleryView(): GalleryView {
  try { return localStorage.getItem(GALLERY_VIEW_KEY) === "wall" ? "wall" : "exhibits"; } catch { return "exhibits"; }
}
function loadRailCollapsed(): boolean {
  try { return localStorage.getItem(RAIL_COLLAPSED_KEY) === "1"; } catch { return false; }
}
function loadDockWidth(): number | null {
  try { const v = localStorage.getItem(DOCK_WIDTH_KEY); return v ? (Number(v) || null) : null; } catch { return null; }
}

const s = $state<{ overviewMode: OverviewMode; galleryView: GalleryView; railCollapsed: boolean; dockWidth: number | null }>({
  overviewMode: loadOverviewMode(),
  galleryView: loadGalleryView(),
  railCollapsed: loadRailCollapsed(),
  dockWidth: loadDockWidth(),
});

/** The exhibit overview's Canvas/List mode + the library's Exhibits/All-images lens + the editor's
 *  filmstrip-collapsed and dock-width — persisted, last-set wins, shared across every component that
 *  reads/writes them (one preference, not per-slug). */
export const viewPrefs = {
  get overviewMode(): OverviewMode { return s.overviewMode; },
  setOverviewMode(v: OverviewMode) {
    s.overviewMode = v;
    try { localStorage.setItem(OVERVIEW_MODE_KEY, v); } catch { /* private mode — resets next load, harmless */ }
  },

  get galleryView(): GalleryView { return s.galleryView; },
  setGalleryView(v: GalleryView) {
    s.galleryView = v;
    try { localStorage.setItem(GALLERY_VIEW_KEY, v); } catch { /* private mode — resets next load, harmless */ }
  },

  get railCollapsed(): boolean { return s.railCollapsed; },
  setRailCollapsed(v: boolean) {
    s.railCollapsed = v;
    try { localStorage.setItem(RAIL_COLLAPSED_KEY, v ? "1" : "0"); } catch { /* private mode — resets next load, harmless */ }
  },

  get dockWidth(): number | null { return s.dockWidth; },
  setDockWidth(v: number | null) {
    s.dockWidth = v;
    try {
      if (v == null) localStorage.removeItem(DOCK_WIDTH_KEY); else localStorage.setItem(DOCK_WIDTH_KEY, String(Math.round(v)));
    } catch { /* private mode — resets next load, harmless */ }
  },
};

/** Test seam: re-read from localStorage (module-singleton pattern mirrors save-queue's
 *  resetSaveQueueForTests) — a test can stub localStorage, call this, and observe a fresh default/restore. */
export function reloadViewPrefsForTests(): void {
  s.overviewMode = loadOverviewMode();
  s.galleryView = loadGalleryView();
  s.railCollapsed = loadRailCollapsed();
  s.dockWidth = loadDockWidth();
}
