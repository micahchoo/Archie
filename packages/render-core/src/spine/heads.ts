// Heads projection (ADR-0003 / Q-3) — a pure, idempotent function of the append-only log.
//
// Returns the head version(s) per logicalId: the current state a viewer renders. One head
// in the linear/resolved case; PLURAL after an unresolved concurrent merge (showing both
// competing overlays is honest degradation, not a bug). Tombstoned heads are omitted (a
// deleted note shows nothing). Idempotent: projecting the heads again returns the same set.
//
// Source-before-projection (Q-5): this is the canonical projection — the log is the source,
// the heads page is derived and regeneratable.

import type { LogicalId, RevId } from "../wadm/brand.js";
import type { AnnotationLog, AnnotationRecord } from "../wadm/types.js";
import { headsOf } from "./merge.js";

/**
 * Project the log to its currently-live head records, sorted deterministically by
 * (logicalId, rev). Tombstone heads are excluded; plural live heads (unresolved merge)
 * are all included.
 */
export function projectHeads(log: AnnotationLog): AnnotationRecord[] {
  const logicalIds: LogicalId[] = [...new Set(log.map((r) => r.logicalId))];
  const out: AnnotationRecord[] = [];
  for (const lid of logicalIds) {
    for (const head of headsOf(log, lid)) {
      if (!head.deleted) out.push(head);
    }
  }
  return out.sort((x, y) => cmp(x.logicalId, y.logicalId) || cmp(x.rev, y.rev));
}

function cmp(a: LogicalId | RevId, b: LogicalId | RevId): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
