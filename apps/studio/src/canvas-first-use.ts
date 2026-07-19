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

const LEGEND_SEEN_KEY = "archie.canvasLegendSeen.v1";
const HINT_SEEN_KEY = "archie.canvasHintSeen.v1";

export function legendSeen(): boolean {
  try { return localStorage.getItem(LEGEND_SEEN_KEY) === "1"; } catch { return false; }
}
export function markLegendSeen(): void {
  try { localStorage.setItem(LEGEND_SEEN_KEY, "1"); } catch { /* private mode — cue simply re-shows, harmless */ }
}

export function hintSeen(): boolean {
  try { return localStorage.getItem(HINT_SEEN_KEY) === "1"; } catch { return false; }
}
export function markHintSeen(): void {
  try { localStorage.setItem(HINT_SEEN_KEY, "1"); } catch { /* private mode — cue simply re-shows, harmless */ }
}
