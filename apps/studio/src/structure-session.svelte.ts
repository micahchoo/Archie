// The per-exhibit STRUCTURE-log session (Archie-42f3) — the reactive owner of the section rev-log
// behind the archie.structureRevlog flag. A `.svelte.ts` rune module in the house pattern
// (exhibit-session.svelte.ts / library-meta.svelte.ts): the $state container is never reassigned,
// so getters stay live across the module boundary; the pure logic lives framework-free in
// structure-reconcile.ts (tested headless) and spine/structure*(-persist).ts.
//
// FLAG OFF (the default) this module is INERT: every entry point returns before touching state,
// storage, or the fs seam — no `structure/` directory is ever created, nothing is read or written,
// and callers fall through to today's array-only behavior byte-identically (pinned in
// structure-session.svelte.test.ts).
//
// FLAG ON: section mutations reconcile into the log (appends), the log persists via
// writeStructure beside the annotation history (`{exhibit}/structure/history/*`), and the working
// Section[] the App patches into library.json becomes the log's projection — library.json keeps
// being written exactly as today (it is the projection's SNAPSHOT; the log is the source).
import {
  asExhibitId,
  hiddenNoteIds,
  readStructureReport,
  writeStructure,
  type AnnotationLog,
  type ClientId,
  type FsDirectory,
  type LogicalId,
  type Section,
  type SectionKey,
  type SectionLog,
} from "@render/core";
import { reconcileSections, workingStructure, type WorkingStructure } from "./structure-reconcile.js";
import { structureRevlogEnabled } from "./feature-flags.js";

export interface StructureSessionDeps {
  /** The live editor identity (reactive — read per append), stamped as lastEditor. */
  author: () => ClientId;
  /** The exhibit's OPFS structure dir (store.ts openExhibitStructureDir). Null = no persistence
   *  (OPFS unsupported) — the log still works in memory for the session. */
  openStructDir: (slug: string) => Promise<FsDirectory | null>;
  /** The save queue (save-queue.svelte.ts enqueueSave) — injectable for tests. */
  enqueue: (key: string, label: string, job: () => Promise<void>) => Promise<boolean>;
  /** Is this slug a bundled EXAMPLE (playground)? Template structure never persists — in-memory only,
   *  mirroring the annotation session's isTemplate gate. */
  isTemplate: (slug: string) => boolean;
  /** The flag read — defaults to the real localStorage flag; injectable for tests. */
  enabled?: () => boolean;
}

const EMPTY_LOCALS: ReadonlySet<string> = new Set();
const EMPTY_KEYS: ReadonlySet<SectionKey> = new Set();
const EMPTY_IDS: ReadonlySet<LogicalId> = new Set();

export function createStructureSession(deps: StructureSessionDeps) {
  const enabled = deps.enabled ?? structureRevlogEnabled;
  // Reactive: per-slug logs (the source the projections derive from). Container never reassigned.
  const s = $state<{ logs: Record<string, SectionLog> }>({ logs: {} });
  // Non-reactive bookkeeping (no template reads these).
  const dirs = new Map<string, FsDirectory | null>();
  const loaded = new Set<string>();
  const loading = new Map<string, Promise<void>>();
  // Slugs whose on-disk store is TORN (readStructureReport reported unreadable pages). Writes are
  // refused for them — a full writeStructure would rewrite the index without the unreadable pages,
  // orphaning them for good (corrupt ≠ empty, rule #2 / the annotation session's Issue 19 posture).
  const corrupt = new Set<string>();
  // Per-slug projection memo, keyed by log identity (every reconcile REPLACES the log array).
  const projMemo = new Map<string, { log: SectionLog; ws: WorkingStructure }>();

  function project(slug: string): WorkingStructure | null {
    const log = s.logs[slug]; // reactive read — $derived callers re-run when a reconcile lands
    if (log === undefined) return null;
    const memo = projMemo.get(slug);
    if (memo && memo.log === log) return memo.ws;
    const ws = workingStructure(log, EMPTY_LOCALS);
    projMemo.set(slug, { log, ws });
    return ws;
  }

  function schedulePersist(slug: string): void {
    const dir = dirs.get(slug);
    if (!dir || corrupt.has(slug)) return; // unpersistable (no OPFS / template) or torn store (refuse)
    void deps.enqueue(`structure:${slug}`, "Narrative structure", async () => {
      const log = s.logs[slug];
      if (log !== undefined) await writeStructure(dir, log);
    });
  }

  return {
    /**
     * Load (once per slug) the exhibit's structure log — called on exhibit open when the flag is on.
     * An EMPTY log under a non-empty working array is the first flag-on run over an exhibit authored
     * pre-revlog: seed the log FROM the array (every section becomes a v1 root) and persist, so the
     * projection round-trips the authored structure from the start.
     */
    async ensureLoaded(slug: string, exhibitId: string, seed: readonly Section[]): Promise<void> {
      if (!enabled() || loaded.has(slug)) return;
      const inflight = loading.get(slug);
      if (inflight) return inflight;
      const job = (async () => {
        let log: SectionLog = [];
        let dir: FsDirectory | null = null;
        if (!deps.isTemplate(slug)) {
          dir = await deps.openStructDir(slug);
          if (dir) {
            const report = await readStructureReport(dir, asExhibitId(exhibitId));
            log = report.log;
            if (report.corrupt.length > 0) {
              corrupt.add(slug);
              console.warn(`[structure] ${slug}: structure store is torn (${report.corrupt.length} unreadable page(s)) — keeping what survived; structure writes are paused for this exhibit.`);
            }
          }
        }
        if (log.length === 0 && seed.length > 0 && !corrupt.has(slug)) {
          log = reconcileSections(log, asExhibitId(exhibitId), seed, { lastEditor: deps.author() }).log;
        }
        dirs.set(slug, dir);
        s.logs[slug] = log;
        loaded.add(slug);
        if (log.length > 0 && !corrupt.has(slug)) schedulePersist(slug); // the seed (or a fresh load) is cheap to (re)write; no-op when dir is null
      })();
      loading.set(slug, job);
      try {
        await job;
      } finally {
        loading.delete(slug);
      }
    },

    /**
     * Apply the editor's next working array as log APPENDS (create/edit/reorder/delete/un-delete),
     * persist, and return the log's working projection — the array the App should snapshot into
     * library.json. Null ⇒ the caller keeps its own array untouched (flag off, log not loaded yet,
     * or a torn store with writes paused). Synchronous on the in-memory log; the disk write rides
     * the save queue.
     */
    apply(slug: string, exhibitId: string, next: readonly Section[]): WorkingStructure | null {
      if (!enabled() || !loaded.has(slug) || corrupt.has(slug)) return null;
      const log = s.logs[slug] ?? [];
      const res = reconcileSections(log, asExhibitId(exhibitId), next, { lastEditor: deps.author() });
      if (res.changed) {
        s.logs[slug] = res.log;
        schedulePersist(slug);
      }
      return project(slug);
    },

    /** Local ids of sections with plural heads (unresolved concurrent edits) — the UI edit gate. */
    conflictedLocalIds(slug: string): ReadonlySet<string> {
      if (!enabled()) return EMPTY_LOCALS;
      return project(slug)?.conflicted ?? EMPTY_LOCALS;
    },

    /** Keys whose every head is a tombstone — the hide-by-ancestry input. */
    tombstonedKeys(slug: string): ReadonlySet<SectionKey> {
      if (!enabled()) return EMPTY_KEYS;
      return project(slug)?.tombstoned ?? EMPTY_KEYS;
    },

    /** Note logicalIds hidden by ancestry (attributed to a tombstoned section) — spine/visibility. */
    hiddenIds(slug: string, annLog: AnnotationLog): ReadonlySet<LogicalId> {
      if (!enabled()) return EMPTY_IDS;
      const tombstoned = project(slug)?.tombstoned;
      if (!tombstoned || tombstoned.size === 0) return EMPTY_IDS;
      return hiddenNoteIds(annLog, tombstoned);
    },

    /** Is this slug's structure store torn (writes paused)? Read by tests + future surfacing. */
    isCorrupt(slug: string): boolean {
      return corrupt.has(slug);
    },
  };
}
export type StructureSession = ReturnType<typeof createStructureSession>;
