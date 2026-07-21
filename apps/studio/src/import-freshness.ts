// Import freshness — the per-exhibit "+N since your last import" library-card badge (Archie-abf9,
// decision Archie-d71c part 3c). APP-LOCAL watermark chrome, same posture as collab-attribution.ts's
// header: it reads only the log's existing `lastEditor` stamps (via collab.ts's collabBreakdown,
// reused rather than re-implemented — same counting rule the ⑧ summary panel already uses: heads
// projection, deletions drop out) and stores a plain number in localStorage. It NEVER adds a
// model/schema field — carry-sentinel territory (packages/render-core/src/model/carry.ts) stays
// untouched; render-core is not part of this change.
//
// Wiring reality (Archie-7e5b): today the only production "import from a colleague" path is
// ingest-flows.ts's openZip, which REPLACES the whole project — there is no live incremental-merge
// caller for importChanges yet. So this seam is correct but DORMANT: `recordImportFreshness` is called
// once per exhibit at import completion, and the stored delta is a snapshot that stays fixed until the
// NEXT import recomputes it (nothing today changes an exhibit's others-count in between imports). A
// future incremental import caller (Archie-7e5b) can call the same function after each merge and the
// contract holds without touching this file again.
import type { AnnotationLog, ClientId } from "@render/core";
import { collabBreakdown } from "./collab.js";
import { readJson, writeJson } from "./persisted.js";

export interface ImportFreshness {
  /** Others' live-note count observed at THIS import — the new baseline the next import compares against. */
  baseline: number;
  /** New others' notes since the previously stored baseline (never negative — a shrinking others-count,
   *  e.g. a colleague's copy with fewer notes than before, is not "freshness"). */
  delta: number;
}

/** Live notes attributed to anyone but `you`, in one exhibit's log. Delegates to collab.ts's
 *  collabBreakdown (scoped to a single exhibit) rather than re-deriving the counting rule. */
export function othersLiveNoteCount(log: AnnotationLog, you: ClientId): number {
  return collabBreakdown({ exhibit: log }, you).others.reduce((sum, o) => sum + o.count, 0);
}

/** Pure: given the previously stored baseline (undefined = no prior import recorded for this exhibit)
 *  and the freshly-imported log's current others'-note count, compute the watermark to store next and
 *  the delta this import's badge should show. A FIRST import establishes the baseline silently
 *  (delta 0): "+N since your last import" presupposes a prior import, so there is nothing truthful
 *  to claim yet. */
export function computeImportFreshness(previousBaseline: number | undefined, currentOthersCount: number): ImportFreshness {
  if (previousBaseline === undefined) return { baseline: currentOthersCount, delta: 0 };
  return { baseline: currentOthersCount, delta: Math.max(0, currentOthersCount - previousBaseline) };
}

/** The badge-render predicate + copy. Null when there is no watermark for this exhibit (no import has
 *  ever happened) OR the last recorded import's delta was 0 — "shown ONLY where a merge/import from a
 *  colleague has happened" AND actually brought something new. */
export function freshnessBadgeText(freshness: ImportFreshness | null | undefined): string | null {
  if (!freshness || freshness.delta <= 0) return null;
  return `+${freshness.delta} since your last import`;
}

// --- localStorage persistence (app-local watermark; same try/catch idiom as App.svelte's
// IDENTITY_KEY / FIRST_ADD_KEY — private mode / disabled storage degrades to "no watermark", never
// throws) — now via persisted.ts's readJson/writeJson (Archie-3148) ---
const KEY = (slug: string) => `archie.importFreshness.v1.${slug}`;

export function loadImportFreshness(slug: string): ImportFreshness | null {
  const parsed = readJson<Partial<ImportFreshness>>(KEY(slug));
  if (parsed && typeof parsed.baseline === "number" && typeof parsed.delta === "number") {
    return { baseline: parsed.baseline, delta: parsed.delta };
  }
  return null;
}

export function saveImportFreshness(slug: string, freshness: ImportFreshness): void {
  writeJson(KEY(slug), freshness);
}

/** The one production call site (ingest-flows.ts's openZip, via App.svelte's openZipFile) calls this
 *  once per imported exhibit slug: reads the prior watermark, computes the new one, and persists it.
 *  Kept here (not inlined in App.svelte) so the read-compute-write sequence is unit-tested as one seam. */
export function recordImportFreshness(slug: string, log: AnnotationLog, you: ClientId): ImportFreshness {
  const current = othersLiveNoteCount(log, you);
  const next = computeImportFreshness(loadImportFreshness(slug)?.baseline, current);
  saveImportFreshness(slug, next);
  return next;
}
