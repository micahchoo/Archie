// First-use-only chrome for the exhibit overview canvas (Archie-a9fc chrome trim): the pan/zoom legend
// and the "click a media item to open" hint each teach a ONE-TIME gesture, then get out of the way
// permanently once the user has demonstrated they know it — a successful plate drag (legend) / a plate
// open (hint). App-global, not per-slug (unlike App.svelte's FIRST_ADD_KEY narrative cue): the canvas
// gesture doesn't change exhibit to exhibit, so seeing it once in any exhibit is enough.
//
// Same localStorage try/catch idiom as App.svelte's FIRST_ADD_KEY (metadata, not content — private mode
// / disabled storage just means the cue re-shows next load, harmless, never an error). Plain functions
// (not a `.svelte.ts` rune module): ExhibitOverview.svelte seeds its own local $state from these at
// mount, exactly like FIRST_ADD_KEY seeds App.svelte's — no cross-component reactivity is needed.
//
// Per-mode legend flag (Archie-adae canvas review): the pan/zoom + drag-to-reorder legend is CANVAS-mode
// chrome — list mode never renders it. Before this, a single global flag meant a first reorder done in
// LIST mode (dragging a row by its grip) marked the flag seen, so a user who reorders only in list mode
// would never see the canvas legend once they switched to canvas — dismissed unseen. Each mode now has
// its own key, written only by a reorder performed WHILE that mode is on screen (ExhibitOverview's
// `commit()` marks the mode live at drop time, not a fixed one). `legendSeen(mode)` still honors the OLD
// single flag as a migration fallback — a user who already dismissed it before this split demonstrated
// SOME reorder and shouldn't see the legend resurface in either mode; the old key is read-only now,
// never written again.
const LEGEND_SEEN_KEY = "archie.canvasLegendSeen.v1"; // pre-per-mode flag — migration fallback only
const LEGEND_SEEN_MODE_KEY = {
  canvas: "archie.canvasLegendSeen.v2.canvas",
  list: "archie.canvasLegendSeen.v2.list",
} as const;
const HINT_SEEN_KEY = "archie.canvasHintSeen.v1";

/** The two overview UI modes that can each independently demonstrate the drag-to-reorder gesture
 *  (mirrors view-prefs.svelte.ts `OverviewMode` — duplicated as a literal union here rather than
 *  imported, to keep this a dependency-free plain-functions module; the two must stay in sync). */
export type LegendMode = "canvas" | "list";

export function legendSeen(mode: LegendMode): boolean {
  try {
    if (localStorage.getItem(LEGEND_SEEN_MODE_KEY[mode]) === "1") return true;
    return localStorage.getItem(LEGEND_SEEN_KEY) === "1"; // old single flag — grandfather both modes
  } catch { return false; }
}
export function markLegendSeen(mode: LegendMode): void {
  try { localStorage.setItem(LEGEND_SEEN_MODE_KEY[mode], "1"); } catch { /* private mode — cue simply re-shows, harmless */ }
}

export function hintSeen(): boolean {
  try { return localStorage.getItem(HINT_SEEN_KEY) === "1"; } catch { return false; }
}
export function markHintSeen(): void {
  try { localStorage.setItem(HINT_SEEN_KEY, "1"); } catch { /* private mode — cue simply re-shows, harmless */ }
}
