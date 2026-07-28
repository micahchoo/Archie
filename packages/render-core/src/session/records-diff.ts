// RecordsDiff — the three-bucket change description tldraw's history is built on, ported for
// Archie's annotation projection (Archie-69a6 prototype; scouted in
// `ledgers/RESEARCH-tldraw-source-scout-2026-07-22.md` §2 from
// `tldraw/tldraw:packages/store/src/lib/RecordsDiff.ts` — 181 lines, main @ 2026-07-22).
//
// WHAT IS DIFFED, AND WHAT IS NOT. tldraw diffs its STORE, and applying a reversed diff writes
// records back into that store. Archie's store is an append-only version DAG (ADR-0003) and is
// never rewritten, so here a diff describes the *projection* — which head record each logicalId
// shows on the editing surface. Applying one moves the projection; the log is untouched either
// way. See `undo.ts` for the overlay that consumes these.
//
// Ported verbatim in SHAPE, not in code: tldraw's `added`/`updated`/`removed` are plain objects
// keyed by record id, `updated` holding a `[from, to]` tuple. Kept because the reverse of that
// shape is trivially total — swap two buckets, flip the tuples — which is the whole reason the
// pattern is worth borrowing.

/** A change to a set of records, keyed by id. `updated` holds `[from, to]`. */
export interface RecordsDiff<K extends string, R> {
  added: Record<K, R>;
  updated: Record<K, [from: R, to: R]>;
  removed: Record<K, R>;
}

export function emptyDiff<K extends string, R>(): RecordsDiff<K, R> {
  return { added: {} as Record<K, R>, updated: {} as Record<K, [R, R]>, removed: {} as Record<K, R> };
}

/** True when the diff describes no change. `for-in` with an early return, not `Object.keys().length`
 *  — tldraw's `hasAnyKey`, kept for the same reason: this is read on every mutation. */
function hasAnyKey(obj: object): boolean {
  for (const _ in obj) return true;
  return false;
}

export function isEmptyDiff<K extends string, R>(diff: RecordsDiff<K, R>): boolean {
  return !hasAnyKey(diff.added) && !hasAnyKey(diff.updated) && !hasAnyKey(diff.removed);
}

/**
 * The inverse change: `added` ↔ `removed` swap, and every `[from, to]` becomes `[to, from]`.
 *
 * O(|updated|) — added/removed are handed over by reference (tldraw's RecordsDiff.ts does the same;
 * the returned diff is a fresh object, so no caller can alias its way into the original's buckets).
 */
export function reverseRecordsDiff<K extends string, R>(diff: RecordsDiff<K, R>): RecordsDiff<K, R> {
  const updated = {} as Record<K, [R, R]>;
  for (const k in diff.updated) {
    const pair = diff.updated[k as K]!;
    updated[k as K] = [pair[1], pair[0]];
  }
  return { added: diff.removed, updated, removed: diff.added };
}

/**
 * Fold `diffs` into `target`, IN PLACE — tldraw's `squashRecordDiffsMutable`.
 *
 * The four collapses that make a squash more than a concatenation, all of them from the source:
 *   added → updated  ⇒ stays `added`, carrying the final state
 *   added → removed  ⇒ cancels (the record never existed as far as the outside is concerned)
 *   removed → added  ⇒ becomes an `updated` [original, latest]
 *   updated → updated ⇒ chains to [first-from, last-to]
 *
 * This runs once per mutation on the pending diff, so the loops must not allocate per entry: `for-in`
 * rather than `Object.entries`, and the `updated` tuples are mutated in place (the target owns them
 * exclusively — `accumulate` in undo.ts only ever hands it freshly-built single-entry diffs).
 */
export function squashRecordDiffsMutable<K extends string, R>(
  target: RecordsDiff<K, R>,
  diffs: readonly RecordsDiff<K, R>[],
): void {
  for (const diff of diffs) {
    for (const k in diff.added) {
      const id = k as K;
      const value = diff.added[id]!;
      if (target.removed[id] !== undefined) {
        // removed then re-added: the net effect is an update from what was removed to what is now here.
        const original = target.removed[id]!;
        delete target.removed[id];
        if (original !== value) target.updated[id] = [original, value];
      } else {
        target.added[id] = value;
      }
    }

    for (const k in diff.updated) {
      const id = k as K;
      const [from, to] = diff.updated[id]!;
      if (target.added[id] !== undefined) {
        target.added[id] = to; // added then updated ⇒ still an add, at the final state
        continue;
      }
      const existing = target.updated[id];
      if (existing !== undefined) {
        existing[1] = to; // chain: keep the ORIGINAL `from`, take the latest `to`
        continue;
      }
      target.updated[id] = [from, to];
    }

    for (const k in diff.removed) {
      const id = k as K;
      const value = diff.removed[id]!;
      if (target.added[id] !== undefined) {
        delete target.added[id]; // added then removed within one squash ⇒ cancels entirely
        continue;
      }
      const updated = target.updated[id];
      if (updated !== undefined) {
        // updated then removed: what is removed is what was there BEFORE this diff sequence.
        delete target.updated[id];
        target.removed[id] = updated[0];
        continue;
      }
      target.removed[id] = value;
    }
  }
}
