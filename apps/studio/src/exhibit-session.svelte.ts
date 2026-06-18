// The per-exhibit annotation-SESSION state machine (the DOMINO cut out of App.svelte). Owns the
// reactive lifecycle cluster for the exhibit currently open in the editor:
//   session    — the live AnnotationSession (the WADM log the canvas + form read/write)
//   annDir     — its OPFS annotations directory (null for a template playground / no-OPFS browser)
//   storeReady — annDir !== null (an object can only be added when its bytes can persist)
//   dirty      — unsaved-to-OPFS edits pending (drives the debounced autosave)
// plus the autosave lifecycle (save / scheduleSave) that reads exactly this cluster, and — the reason
// this cut exists (fix #3) — an ATOMIC `open` transition: it runs ALL the slow async work (flush the
// outgoing exhibit, resolve assets, load/seed the incoming log) into locals FIRST, then applies the
// session/annDir/storeReady swap in ONE synchronous batch, so a subscriber never renders a half-opened
// exhibit (the old inline openExhibit interleaved 7 mutations across 2 awaits — partial states visible).
//
// A `.svelte.ts` rune module (cf. library-meta.svelte.ts / binding-store.svelte.ts): the $state
// container is never reassigned, so getters stay live across the module boundary. The editor CURSOR
// (selected / editing / creating / currentObjectId / rev) stays in App — it is `bind:`-bound on the
// Canvas and mutated per-keystroke, where moving it behind a getter would break two-way binding.
import { AnnotationSession, type FsDirectory, type ClientId } from "@render/core";
import { openExhibitAnnotationsDir } from "./store.js";
import { enqueueSave } from "./save-queue.svelte.js";

export interface ExhibitSessionDeps {
  baseUrl: string;
  /** The live editor identity (reactive — read per call). */
  author: () => ClientId;
  /** Is this slug a bundled EXAMPLE (a playground — annotations never persist)? */
  isTemplate: (slug: string) => boolean;
  /** The per-slug seed factory (seededFor(author, slug)) — null for a user-created exhibit. */
  seedFor: (slug: string) => (() => AnnotationSession) | null;
  /** Mirror a folder-bound Project to disk after an OPFS save (no-op when unbound). */
  autosaveToFolder: () => void;
  /** Mark the bound location behind (binding chip) on every edit. */
  touchBinding: () => void;
}

/** What `open` needs from the incoming exhibit, plus the side-effects App still owns (asset resolve +
 *  the post-swap view routing) so the WHOLE transition lands atomically from a subscriber's view. */
export interface OpenRequest {
  slug: string;
  /** Resolve the incoming exhibit's OPFS assets → blob URLs. Awaited BEFORE the swap (so the canvas
   *  mounts against resolved sources). App owns assetUrls/assetsReady + the editor cursor; this returns
   *  when ready. (The cursor — currentObjectId/selected/… — is set by App, not threaded through here.) */
  resolveAssets: () => Promise<void>;
}

export function createExhibitSession(deps: ExhibitSessionDeps) {
  const s = $state<{ session: AnnotationSession; storeReady: boolean; dirty: boolean }>({
    session: new AnnotationSession(deps.author()),
    storeReady: false,
    dirty: false,
  });
  // annDir + saveTimer are NOT reactive (no template reads them) — plain module-local mutable state.
  let annDir: FsDirectory | null = null;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;

  /** Persist the current exhibit's log to OPFS (queued; serialized per-exhibit). Gated on a bound,
   *  non-template exhibit with notes. Clears `dirty` and mirrors to a bound folder on success. */
  async function save(currentSlug: string): Promise<void> {
    if (!annDir || deps.isTemplate(currentSlug)) return; // examples are playgrounds — notes aren't saved
    if (s.session.entries.length > 0) {
      const dir = annDir, sess = s.session;
      if (!(await enqueueSave(`ann:${currentSlug}`, "Notes", () => sess.save(dir, { baseUrl: deps.baseUrl })))) return;
    }
    s.dirty = false;
    deps.autosaveToFolder();
  }
  /** Debounced autosave (800ms). Touches the binding regardless; only schedules a write when bound to OPFS. */
  function scheduleSave(currentSlug: string) {
    deps.touchBinding();
    if (!annDir) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void save(currentSlug), 800);
  }
  /** Cancel any pending debounced write (before a swap / destructive replace). */
  function cancelPendingSave() { clearTimeout(saveTimer); }

  return {
    // — reactive reads (live getters) —
    get session(): AnnotationSession { return s.session; },
    get storeReady(): boolean { return s.storeReady; },
    get dirty(): boolean { return s.dirty; },

    save, scheduleSave, cancelPendingSave,

    /** Mark unsaved (an edit happened) — the bump() path. */
    markDirty() { s.dirty = true; },

    /** Replace the live session in place (keepCopy / a bulk rebuild that mints a fresh session). */
    replace(session: AnnotationSession) { s.session = session; },

    /**
     * ATOMIC open transition (fix #3). Flushes the OUTGOING exhibit, then does ALL the slow async work
     * (asset resolve + log load/seed) into LOCALS, and only then applies the session/annDir/storeReady
     * swap in one synchronous batch — no `await` sits between the related state writes, so subscribers
     * never observe a half-opened exhibit. `prevSlug` is flushed under the OLD annDir before the swap.
     */
    async open(prevSlug: string, req: OpenRequest): Promise<void> {
      // 1) Flush the outgoing exhibit against the CURRENT session/dir (Archie-788e) before anything moves.
      cancelPendingSave();
      await save(prevSlug);
      // 2) Resolve the incoming exhibit's assets (App owns assetUrls; awaited so the canvas mounts ready).
      await req.resolveAssets();
      // 3) Compute the incoming session + dir into LOCALS — all awaits happen here, BEFORE any state write.
      const author = deps.author();
      const seed = deps.seedFor(req.slug);
      const freshSeed = () => (seed ? seed() : new AnnotationSession(author));
      let nextDir: FsDirectory | null = null;
      let nextSession: AnnotationSession;
      let persistFreshSeed = false;
      if (deps.isTemplate(req.slug)) {
        // Example = playground: in-memory only — never touch OPFS, always seed fresh (no leak from a
        // prior session's persisted notes).
        nextSession = freshSeed();
      } else {
        nextDir = await openExhibitAnnotationsDir(req.slug);
        if (nextDir) {
          const loaded = await AnnotationSession.load(nextDir, author);
          if (loaded.notes().length > 0) nextSession = loaded;
          else { nextSession = freshSeed(); persistFreshSeed = true; }
        } else {
          nextSession = freshSeed();
        }
      }
      // 4) THE SWAP — one synchronous batch, no await between writes. annDir (non-reactive) + the
      //    reactive session/storeReady flip together; a render in between is impossible.
      annDir = nextDir;
      s.session = nextSession;
      s.storeReady = nextDir !== null;
      s.dirty = false;
      // 5) A freshly-seeded NON-template exhibit persists its seed (now that annDir is set) — post-swap,
      //    so the very first save writes against the just-installed dir.
      if (persistFreshSeed) await save(req.slug);
    },
  };
}
export type ExhibitSession = ReturnType<typeof createExhibitSession>;
