// The overview's ingest feedback, as a render model.
//
// WHY THIS EXISTS: `importStatus` (App) is written by the four ticking ingest flows (ingest-flows.ts
// 320/492/574/644) and cleared in their `finally` blocks — but its only renderer lived inside App's
// editor-branch status strip, so an import started from the OVERVIEW's own Add-media affordances
// (ExhibitOverview `.tb-add` / `.plate.add` / `.li-add` → onaddobject) showed the user nothing at all.
// This module folds App's three separate signals — in-flight run count, the per-item tick, and the
// terminal `importNote` — into ONE discriminated union the overview band renders directly.
//
// It is a PURE function on purpose. ExhibitOverview.svelte and App.svelte carry no unit coverage (only
// the extracted reducers overview-move-mode.ts / overview-selection.ts do), so the ordering rules below
// — which signal wins, when a stale note is suppressed — would otherwise be gated by svelte-check alone.

/** One tick from a ticking ingest flow: the item being worked on, and how many there are. */
export type IngestStatus = { name: string; index: number; total: number };

/** How a terminal import message should read. Declared by the flow that composes the message, because
 *  nothing downstream can infer it: an ingest flow that REFUSES (no OPFS, over quota, no open exhibit)
 *  composes its note and then RESOLVES normally, so "the promise rejected" is not the signal. */
export type ImportTone = "ok" | "problem";

/** The terminal message a flow composes when it finishes (App's `importNote` channel). */
export type IngestNote = {
  message: string;
  /** The run settled without throwing. NOT "everything succeeded" — a flow composes partial-failure
   *  text into `message` itself (e.g. addFiles' `failed` tally, ingest-flows.ts:517) and still resolves.
   *  So this drives the ✓-vs-⚠ glyph on the outcome line, while the nuance stays in the text. */
  ok: boolean;
};

export type IngestActivity =
  /** A run is underway but hasn't reported a total yet — the silent discovery phases: fetchManifestPlan
   *  (ingest-flows.ts:614, up to 32MB), traverseCollection (:766), newExhibitFromFolder's EXIF pre-pass
   *  (:531-540). Renders as an indeterminate spinner, so a slow start doesn't read as a hang. */
  | { kind: "preparing" }
  /** A run with a known total. Renders as a determinate bar. */
  | { kind: "running"; name: string; index: number; total: number; done: number }
  /** The run finished; this is what happened. Persists until dismissed. */
  | { kind: "done"; message: string; ok: boolean };

/**
 * Fold App's live ingest signals into the one thing the overview band renders.
 *
 * Precedence is deliberate:
 *  1. `status` wins over everything — a live tick is the most specific thing we know.
 *  2. `busy` without a tick is the discovery lead-in (spinner, not bar).
 *  3. `note` shows only once nothing is in flight, which is what suppresses a STALE note from a previous
 *     import sitting beside a new run's bar (App clears `importNote` at the start of only two of the five
 *     flows — ingest-flows.ts:311/461 — so the guard has to live here, not there).
 *
 * @param busy   count of ingest runs currently in flight (App increments around each flow call)
 * @param status the latest per-item tick, or null between runs
 * @param note   the terminal message from the last completed run, or null if none/dismissed
 */
export function ingestActivityOf(
  busy: number,
  status: IngestStatus | null,
  note: IngestNote | null,
): IngestActivity | null {
  if (status) {
    // `done` is index-1, not index: every tick site sets the status BEFORE processing that item
    // (ingest-flows.ts:492 sets `list[i].name` ahead of addObjectFromFile), so `index` names the item
    // being worked on and index-1 is the count actually landed. The bar therefore tops out at
    // (total-1)/total rather than ever painting a full track mid-run — completion is signalled by the
    // flip to the `done` line, not by a filled bar. Clamped because a flow can tick index 0 defensively.
    const done = Math.max(0, Math.min(status.index - 1, status.total));
    return { kind: "running", name: status.name, index: status.index, total: status.total, done };
  }
  if (busy > 0) return { kind: "preparing" };
  if (note) return { kind: "done", message: note.message, ok: note.ok };
  return null;
}
