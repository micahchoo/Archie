// First-use-only chrome for the exhibit overview (Archie-a9fc chrome trim): the "click a media item to
// open" hint teaches the one-time open gesture, then gets out of the way permanently once the user has
// demonstrated they know it (a plate open). App-global, not per-slug (unlike App.svelte's FIRST_ADD_KEY
// narrative cue): the gesture doesn't change exhibit to exhibit, so seeing it once anywhere is enough.
//
// Same localStorage try/catch idiom as App.svelte's FIRST_ADD_KEY (metadata, not content — private mode /
// disabled storage just means the cue re-shows next load, harmless, never an error) — now via
// persisted.ts's persistedFlag (Archie-3148), which the App.svelte copy is deliberately NOT migrated to
// (Issue-18 territory). Plain functions (not a `.svelte.ts` rune module): ExhibitOverview.svelte seeds its
// own local $state from this at mount, exactly like FIRST_ADD_KEY seeds App.svelte's — no cross-component
// reactivity is needed.
//
// SCALE-GALLERY: the per-mode pan/zoom LEGEND flag (legendSeen/markLegendSeen/LegendMode) was retired with
// the spatial canvas itself — the grid that replaced it has no pan/zoom gesture to teach, and its
// drag-to-reorder guidance is a standing hint line (mirroring list mode's .list-hint), not first-use
// chrome. Only the open hint survives; the legend's localStorage keys are simply left dormant.
import { persistedFlag } from "./persisted.js";

const HINT_SEEN_KEY = "archie.canvasHintSeen.v1";
const hintFlag = persistedFlag(HINT_SEEN_KEY);

export function hintSeen(): boolean {
  return hintFlag.get();
}
export function markHintSeen(): void {
  hintFlag.set(true);
}
