// Heads projection (ADR-0003 / Q-3) — a pure, idempotent function of the append-only log.
//
// Returns the head version(s) per logicalId: the current state a viewer renders. One head
// in the linear/resolved case; PLURAL after an unresolved concurrent merge (showing both
// competing overlays is honest degradation, not a bug). Tombstoned heads are omitted (a
// deleted note shows nothing). Idempotent: projecting the heads again returns the same set.
//
// Source-before-projection (Q-5): this is the canonical projection — the log is the source,
// the heads page is derived and regeneratable.

import { parentsOf, type DagRecord } from "./log.js";
import type { RevId } from "../wadm/brand.js";

/**
 * Single-pass group-by heads computation (Archie-c16d) — the shared engine under BOTH
 * projections (`projectHeads` here, `projectSections` in structure.ts). ONE scan groups
 * records by logicalId and collects each group's referenced-as-parent set (parent +
 * mergeParents via `parentsOf` — the one definition of "referenced"); a group's heads are
 * its versions not in that set. O(records) total, vs per-key `headsOf` which filters the
 * WHOLE log per key — O(records × keys), measured 8–12ms avg / 15.3ms max at 2000 records
 * against the 16ms interactivity bar (probe ledger PROBE-structure-revlog A3).
 *
 * Semantics are IDENTICAL to per-key `headsOf` (merge.ts, which remains the per-key API):
 * for every key in the log, `headsByLogicalId(log).get(key)` deep-equals
 * `headsOf(log, key)` — same heads, same (log) order. Keys iterate in first-appearance
 * order. Pinned by projection-groupby.test.ts equivalence tests.
 */
export function headsByLogicalId<R extends DagRecord<string>>(log: readonly R[]): Map<R["logicalId"], R[]> {
  const groups = new Map<R["logicalId"], { versions: R[]; referenced: Set<RevId> }>();
  for (const r of log) {
    let g = groups.get(r.logicalId);
    if (g === undefined) {
      g = { versions: [], referenced: new Set<RevId>() };
      groups.set(r.logicalId, g);
    }
    g.versions.push(r);
    for (const p of parentsOf(r)) g.referenced.add(p);
  }
  const out = new Map<R["logicalId"], R[]>();
  for (const [lid, g] of groups) {
    out.set(lid, g.versions.filter((v) => !g.referenced.has(v.rev)));
  }
  return out;
}

/**
 * Project the log to its currently-live head records, sorted deterministically by
 * (logicalId, rev). Tombstone heads are excluded; plural live heads (unresolved merge)
 * are all included. Generic over the DAG record shape (PROBE Archie-b766) — annotation
 * call sites infer R = AnnotationRecord unchanged.
 */
export function projectHeads<R extends DagRecord<string>>(log: readonly R[]): R[] {
  const out: R[] = [];
  for (const heads of headsByLogicalId(log).values()) {
    for (const head of heads) {
      if (!head.deleted) out.push(head);
    }
  }
  return out.sort((x, y) => cmp(x.logicalId, y.logicalId) || cmp(x.rev, y.rev));
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
