// The library-meta store (the first POLISH-Q10 cut out of App.svelte). Owns the reactive LibraryMeta
// + the single persist trigger, collapsing ~14 hand-rolled `{...exhibits.map(...)}; persistLibrary()`
// copies into thin methods. A `.svelte.ts` rune module on purpose (cf. spike-0001 lib/undo.svelte.ts):
// the reactive owner that CONSUMES the framework-free store.ts (saveLibraryMeta) — not folded into it.
//
// Cross-module rune rule: the $state CONTAINER is never reassigned (only `s.meta` is), so reads stay
// live across modules. `persist` is injected with `onAfterPersist` (the App's `touchBinding`) so the
// binding seam stays on the App side for the next cut — the store owns persistence, not binding state.
import { saveLibraryMeta, type LibraryMeta, type ExhibitMeta, type ObjectMeta } from "./store";
import { patchLibraryIn, patchExhibitIn, patchObjectIn, appendObjectIn, addExhibitIn, removeExhibitIn, removeObjectIn } from "./library-meta-reducers";
import { enqueueSave } from "./save-queue.svelte";
import { LIVE_CHANNEL } from "@render/core";

/** Tell a same-origin Viewer's live source the library structure changed (exhibit added/removed) so it
 *  refreshes without a reload. Best-effort: no channel API (older browser / SSR) → quiet no-op. */
function signalLibraryChanged(): void {
  if (typeof BroadcastChannel === "undefined") return;
  const bc = new BroadcastChannel(LIVE_CHANNEL);
  bc.postMessage({ type: "library-changed" });
  bc.close();
}

export function createLibraryStore(initial: LibraryMeta, opts: { onAfterPersist?: () => void } = {}) {
  const s = $state<{ meta: LibraryMeta }>({ meta: initial });
  // Routed through the save queue (worklist 0.1): writes to library.json serialize, and a failure
  // lands in saveStatus instead of vanishing into the `void persist()` sites below.
  async function persist(): Promise<void> {
    if (await enqueueSave("library-meta", "Library details", () => saveLibraryMeta(s.meta)))
      opts.onAfterPersist?.();
  }
  return {
    /** Live read path for `$derived`, child props, and the publish builders. */
    get meta(): LibraryMeta { return s.meta; },
    /** Explicit persist for the set-only / conditional callers (onMount reconcile, replaceProjectFrom). */
    persist,

    // Auto-persist (fire-and-forget) — mirrors the `void persistLibrary()` patch sites.
    patchLibrary(fields: Partial<LibraryMeta>) { s.meta = patchLibraryIn(s.meta, fields); void persist(); },
    patchExhibit(slug: string, fields: Partial<ExhibitMeta>) { s.meta = patchExhibitIn(s.meta, slug, fields); void persist(); },
    patchObject(slug: string, objId: string, fields: Partial<ObjectMeta>) { s.meta = patchObjectIn(s.meta, slug, objId, fields); void persist(); },

    // Awaitable — for the sites that `await persistLibrary()` before navigating.
    async appendObject(slug: string, obj: ObjectMeta) { s.meta = appendObjectIn(s.meta, slug, obj); await persist(); },
    async addExhibit(ex: ExhibitMeta) { s.meta = addExhibitIn(s.meta, ex); await persist(); signalLibraryChanged(); },

    // Destructive removes (Archie-3f4c) — meta-only; the caller tombstones/clears annotations separately
    // (object → session.deleteNote per note; exhibit → clearExhibitAnnotations) before navigating away.
    async removeExhibit(slug: string) { s.meta = removeExhibitIn(s.meta, slug); await persist(); signalLibraryChanged(); },
    async removeObject(slug: string, objId: string) { s.meta = removeObjectIn(s.meta, slug, objId); await persist(); },

    // Set-only (NO auto-persist) — bulk rebuilds keep the caller's existing conditional persist timing.
    setMeta(next: LibraryMeta) { s.meta = next; },
  };
}
export type LibraryStore = ReturnType<typeof createLibraryStore>;
