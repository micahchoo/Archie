// Incremental heads index (perf 2026-07-24) — the same projection as `heads.ts`, maintained across
// appends instead of recomputed from the whole log each time.
//
// WHY: every AnnotationSession mutation replaces `this.log` with a new array, which invalidates the
// identity-keyed memos on `heads()` and `conflicts()`. Both then rebuild by scanning the ENTIRE log
// — and they each build their own `headsByLogicalId`, so the same O(records) group-by runs TWICE per
// edit. Measured on the interactive path (edit + notes() + conflicts()):
//
//     log size    2000      8000     20000
//     per edit    0.84 ms   4.31 ms  ~14.7 ms      ← against this repo's 16 ms interactivity bar
//
// That is quadratic in a session's own history, and it makes every BULK loop over notes quadratic too
// (App.svelte's per-canvas bulk delete and carry-on-replace both call one mutation per note).
//
// The projection is a pure function of the log, so an append can be folded in instead: a record
// touches exactly ONE logicalId, so only that group's heads can change. Everything here is O(versions
// of the touched note) plus one binary-searched splice — independent of total log length.
//
// EQUIVALENCE IS THE CONTRACT, not an optimization detail. `head-index.test.ts` replays randomized
// operation sequences and asserts, after EVERY step, that this index deep-equals `projectHeads` /
// `headsByLogicalId` / `headsOf` computed from scratch. Change the projection in heads.ts and that
// test is what tells you this file drifted.

import { linearHeadOf, parentsOf, type DagRecord } from "./log.js";
import type { RevId } from "../wadm/brand.js";

interface Group<R> {
  /** Every version of this logicalId, in log order. */
  versions: R[];
  /** Revs referenced as a parent by some version (parent + mergeParents — `parentsOf` is the one definition). */
  referenced: Set<RevId>;
  /** versions not in `referenced`, in log order — identical to `headsOf(log, logicalId)`. */
  heads: R[];
  /** First-appearance rank of this logicalId, so `conflicts()` can restore `headsByLogicalId` order. */
  order: number;
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Order records exactly as `projectHeads` sorts them: by logicalId, then rev. */
function cmpRecord(x: DagRecord<string>, y: DagRecord<string>): number {
  return cmp(x.logicalId, y.logicalId) || cmp(x.rev, y.rev);
}

/**
 * Incrementally-maintained equivalent of the `heads.ts` projections.
 *
 * Build once with {@link HeadIndex.from}; fold each newly-appended record in with {@link append}.
 * `append` is only valid for a record that is NEW to the log (the session's create/edit/delete path).
 * Any other mutation — a merge, a conflict resolution, a load from disk — rebuilds with `from`, which
 * is the same cost as the projection it replaces.
 */
export class HeadIndex<R extends DagRecord<string>> {
  /** Insertion-ordered by FIRST APPEARANCE of each logicalId — `conflicts()` reports in that order,
   *  matching `headsByLogicalId`'s Map iteration. */
  private readonly groups = new Map<R["logicalId"], Group<R>>();
  /** Live (non-tombstone) heads, sorted by (logicalId, rev) — exactly `projectHeads`'s output. */
  private sorted: R[] = [];
  /** LogicalIds whose group currently has plural heads — kept so `conflicts()` costs nothing when
   *  there are none (the normal state) instead of scanning every group. */
  private readonly plural = new Set<R["logicalId"]>();
  /** Copy-on-read cache of `sorted`, invalidated by every mutation — see {@link heads} for why the
   *  array identity has to change per mutation rather than being reused. */
  private snapshot: R[] | null = null;

  private constructor() {}

  /** Get this logicalId's group, creating (and ranking) it on first appearance. */
  private groupFor(logicalId: R["logicalId"]): Group<R> {
    let g = this.groups.get(logicalId);
    if (g === undefined) {
      g = { versions: [], referenced: new Set<RevId>(), heads: [], order: this.groups.size };
      this.groups.set(logicalId, g);
    }
    return g;
  }

  /** Keep `plural` in step with a group's current head count. */
  private syncPlural(logicalId: R["logicalId"], g: Group<R>): void {
    if (g.heads.length > 1) this.plural.add(logicalId);
    else this.plural.delete(logicalId);
  }

  /** Build from a whole log — the same single-pass group-by as `headsByLogicalId`, plus the sort. */
  static from<R extends DagRecord<string>>(log: readonly R[]): HeadIndex<R> {
    const ix = new HeadIndex<R>();
    for (const r of log) {
      const g = ix.groupFor(r.logicalId);
      g.versions.push(r);
      for (const p of parentsOf(r)) g.referenced.add(p);
    }
    for (const [id, g] of ix.groups) {
      g.heads = g.versions.filter((v) => !g.referenced.has(v.rev));
      ix.syncPlural(id, g);
      for (const h of g.heads) if (!h.deleted) ix.sorted.push(h);
    }
    ix.sorted.sort(cmpRecord);
    return ix;
  }

  /**
   * Fold ONE newly-appended record into the index.
   *
   * The record must not already be in the log — this is the session's append path, where the record
   * was just minted. Only `record.logicalId`'s group can change, so the whole update is O(versions of
   * that note) for the head recompute plus one splice into the sorted array.
   */
  append(record: R): void {
    const g = this.groupFor(record.logicalId);
    g.versions.push(record);
    for (const p of parentsOf(record)) g.referenced.add(p);
    // Recompute from this group's versions only. Deliberately NOT the cheaper
    // `heads.filter(not-newly-referenced).concat(record)` shortcut: that one is correct only while
    // `record` is guaranteed unreferenced, which couples this method to its caller's freshness
    // guarantee. Versions-per-note is small; a whole-log scan is what actually cost anything.
    const before = g.heads;
    g.heads = g.versions.filter((v) => !g.referenced.has(v.rev));
    this.syncPlural(record.logicalId, g);
    this.resplice(record.logicalId, before, g.heads);
    this.snapshot = null; // the projection moved — next heads() hands out a new array identity
  }

  /** Replace one logicalId's live heads inside the sorted array. All entries for a logicalId are
   *  contiguous under (logicalId, rev) ordering, so this is a binary-searched range swap. */
  private resplice(logicalId: R["logicalId"], before: readonly R[], after: readonly R[]): void {
    const removed = before.filter((h) => !h.deleted).length;
    // Sort the replacements by rev: `g.heads` is in LOG order, but the array is (logicalId, rev)-ordered
    // and plural heads share a logicalId, so log order would put them in the wrong place. Single-head
    // (the overwhelmingly common) case sorts trivially.
    const inserted = after.filter((h) => !h.deleted).sort(cmpRecord);
    if (removed === 0 && inserted.length === 0) return; // tombstone → tombstone: nothing live either side
    const start = this.lowerBound(logicalId);
    this.sorted.splice(start, removed, ...inserted);
  }

  /** First index whose logicalId is >= `logicalId` (the start of that id's contiguous run). */
  private lowerBound(logicalId: R["logicalId"]): number {
    let lo = 0;
    let hi = this.sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (cmp(this.sorted[mid]!.logicalId, logicalId) < 0) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  /**
   * Live head records sorted by (logicalId, rev) — equivalent to `projectHeads(log)`.
   *
   * IDENTITY IS PART OF THE CONTRACT, not just contents. `projectHeads` allocates a fresh array per
   * call, and `AnnotationSession` memoized it by log identity, so callers could rely on "same array
   * ⇒ nothing changed" — which is exactly what a Svelte `$derived` does. `sorted` is mutated IN PLACE
   * by `resplice`, so handing it out directly would keep one identity across mutations and silently
   * strand any identity-comparing consumer on stale notes (a class of bug vitest cannot see, since
   * it has no reactivity graph). The snapshot restores the old contract: stable between mutations,
   * fresh after each one. One O(heads) copy per MUTATION, not per read.
   */
  heads(): R[] {
    if (this.snapshot === null) this.snapshot = this.sorted.slice();
    return this.snapshot;
  }

  /** LogicalIds with plural heads, in first-appearance order — equivalent to iterating
   *  `headsByLogicalId(log)` and keeping the entries with more than one head. Tombstone heads COUNT
   *  (a delete concurrent with an edit is a conflict), matching `AnnotationSession.conflicts()`.
   *
   *  Read off the `plural` set, so this stays O(conflicts log conflicts) — normally zero. Scanning
   *  every group instead would leave an O(notes) pass on the per-edit path, which is the thing this
   *  file exists to remove.
   *
   *  The sort restores FIRST-APPEARANCE order from each group's `order` stamp. Set insertion order
   *  would be wrong: a group that goes plural → resolved → plural again would re-insert at the end,
   *  behind ids whose logicalId first appeared later. (Not reachable through `append` today — an
   *  appended record's parent is the current head, so groups stay single-headed, and merges rebuild
   *  via `from` — but the ordering contract shouldn't rest on that staying true.) */
  conflicts(): R["logicalId"][] {
    if (this.plural.size === 0) return [];
    return [...this.plural].sort((a, b) => (this.groups.get(a)?.order ?? 0) - (this.groups.get(b)?.order ?? 0));
  }

  /** The heads of one logicalId — equivalent to `headsOf(log, logicalId)` (empty when unknown). */
  headsOf(logicalId: R["logicalId"]): R[] {
    return this.groups.get(logicalId)?.heads ?? [];
  }

  /** The single head of one logicalId — equivalent to `linearHead(log, logicalId)`, including its
   *  absent / plural / cyclic throws, which come from the SHARED `linearHeadOf` guards rather than a
   *  second copy. O(1) instead of a whole-log filter: this is what takes `appendEdit`/`appendDelete`
   *  (and therefore every bulk note loop) off the quadratic path. */
  linearHead(logicalId: R["logicalId"]): R {
    const g = this.groups.get(logicalId);
    return linearHeadOf(logicalId, g?.versions ?? [], g?.heads ?? []);
  }
}
