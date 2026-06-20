// Version-DAG merge (ADR-0003 / Q-3) — three-way merge semantics WITHOUT git.
//
// The merge-base of any two heads is found by walking the parent DAG (by `rev`, the
// collision-free node id — ADR-0003 Refinement). This is the one interactive/stateful
// projection in the architecture (highest impl-risk-per-line). modifiedAt is an in-card
// tiebreaker ONLY: clock skew makes wall-clock LWW a silent data-loss bug, so it never
// drives classification or auto-resolution.

import { mintRevId, type RevId, type LogicalId, type ClientId } from "../wadm/brand.js";
import type { AnnotationLog, AnnotationRecord, W3CBody, W3CTarget } from "../wadm/types.js";
import { linearHead, append } from "./log.js";

/** Index a log by `rev` (the collision-free node id) for O(1) parent-walk lookups — built ONCE per
 *  traversal so lineage/ancestors stay O(n) instead of O(n²) (was `log.find` per step). First-wins
 *  matches the old `log.find` semantics; revs are unique by construction (ADR-0003) so it's moot. */
function indexByRev(log: AnnotationLog): Map<RevId, AnnotationRecord> {
  const m = new Map<RevId, AnnotationRecord>();
  for (const r of log) if (!m.has(r.rev)) m.set(r.rev, r);
  return m;
}

/** The chain from `rev` to the root: [rev, parent, grandparent, …]. Self first. Cycle-guarded. */
export function lineage(log: AnnotationLog, rev: RevId): RevId[] {
  const byRev = indexByRev(log);
  const out: RevId[] = [];
  const seen = new Set<RevId>();
  let cur: RevId | null = rev;
  while (cur !== null && !seen.has(cur)) {
    seen.add(cur);
    out.push(cur);
    const rec = byRev.get(cur);
    if (rec === undefined) break;
    cur = rec.parent;
  }
  return out;
}

/** All parents of a record: the primary `parent` plus any `mergeParents` (Q-7 merge nodes). */
function parentsOf(record: AnnotationRecord): RevId[] {
  return [record.parent, ...(record.mergeParents ?? [])].filter((p): p is RevId => p !== null);
}

/** Proper ancestors of `rev` — a multi-parent DAG walk (follows parent + mergeParents). */
export function ancestors(log: AnnotationLog, rev: RevId): Set<RevId> {
  const byRev = indexByRev(log);
  const out = new Set<RevId>();
  const start = byRev.get(rev);
  const stack: RevId[] = start ? parentsOf(start) : [];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (out.has(cur)) continue;
    out.add(cur);
    const rec = byRev.get(cur);
    if (rec) stack.push(...parentsOf(rec));
  }
  return out;
}

/** Every ancestor of `rev` INCLUDING itself, keyed to its shortest BFS distance from `rev` (0 = self).
 *  Multi-parent (follows parent + mergeParents) so a merge node never hides shared history reachable
 *  only through a `mergeParents` edge. */
function ancestorDepths(byRev: Map<RevId, AnnotationRecord>, rev: RevId): Map<RevId, number> {
  const depth = new Map<RevId, number>([[rev, 0]]);
  let frontier: RevId[] = [rev];
  let d = 0;
  while (frontier.length > 0) {
    d += 1;
    const next: RevId[] = [];
    for (const r of frontier) {
      const rec = byRev.get(r);
      if (!rec) continue;
      for (const p of parentsOf(rec)) {
        if (!depth.has(p)) {
          depth.set(p, d);
          next.push(p);
        }
      }
    }
    frontier = next;
  }
  return depth;
}

/** The merge-base: the common ancestor nearest BOTH heads (min summed distance), or null if unrelated.
 *  Multi-parent aware — a merge node's `mergeParents` history counts, which `lineage` (primary chain
 *  only) missed (Q-7). For a purely linear pair this still returns the nearest shared rev. */
export function commonAncestor(log: AnnotationLog, revA: RevId, revB: RevId): RevId | null {
  const byRev = indexByRev(log);
  const depthA = ancestorDepths(byRev, revA);
  const depthB = ancestorDepths(byRev, revB);
  let best: RevId | null = null;
  let bestScore = Infinity;
  for (const [rev, da] of depthA) {
    const db = depthB.get(rev);
    if (db !== undefined && da + db < bestScore) {
      bestScore = da + db;
      best = rev;
    }
  }
  return best;
}

/** Heads of a logicalId — records no other version references as `parent`. Plural = unresolved. */
export function headsOf(log: AnnotationLog, logicalId: LogicalId): AnnotationRecord[] {
  const versions = log.filter((r) => r.logicalId === logicalId);
  const referenced = new Set<RevId>();
  for (const r of versions) for (const p of parentsOf(r)) referenced.add(p);
  return versions.filter((r) => !referenced.has(r.rev));
}

/** Union two logs, deduping shared history by `rev` (shared ancestors appear once). */
export function mergeLogs(local: AnnotationLog, incoming: AnnotationLog): AnnotationLog {
  const seen = new Set<RevId>();
  const out: AnnotationRecord[] = [];
  for (const r of local) {
    seen.add(r.rev);
    out.push(r);
  }
  for (const r of incoming) {
    if (!seen.has(r.rev)) {
      seen.add(r.rev);
      out.push(r);
    }
  }
  return Object.freeze(out);
}

export type MergeClassification =
  | { kind: "identical"; rev: RevId }
  | { kind: "fast-forward"; ahead: RevId; behind: RevId }
  | { kind: "conflict"; a: RevId; b: RevId; base: RevId | null };

/**
 * Classify two heads in one (union) log. `identical` = same rev (no card); `fast-forward`
 * = one is an ancestor of the other, take the descendant `ahead` (no card); `conflict` =
 * both advanced from a common `base` (manual card). modifiedAt plays NO part here (Q-3).
 */
export function classifyMerge(log: AnnotationLog, revA: RevId, revB: RevId): MergeClassification {
  if (revA === revB) return { kind: "identical", rev: revA };
  const ancA = ancestors(log, revA);
  const ancB = ancestors(log, revB);
  if (ancA.has(revB)) return { kind: "fast-forward", ahead: revA, behind: revB };
  if (ancB.has(revA)) return { kind: "fast-forward", ahead: revB, behind: revA };
  return { kind: "conflict", a: revA, b: revB, base: commonAncestor(log, revA, revB) };
}

export type LogicalMergeResult =
  | MergeClassification
  | { kind: "only-local"; rev: RevId }
  | { kind: "only-incoming"; rev: RevId };

/**
 * The per-logicalId async-zip merge entry point: compare the local and incoming heads.
 * Disjoint note sets (the common case — "most conflicts are fast-forwards in disguise")
 * resolve to only-local / only-incoming. Both inputs are assumed individually resolved
 * (single head each); resolve your own conflicts before exchanging zips.
 */
export function classifyLogical(local: AnnotationLog, incoming: AnnotationLog, logicalId: LogicalId): LogicalMergeResult {
  const inLocal = local.some((r) => r.logicalId === logicalId);
  const inIncoming = incoming.some((r) => r.logicalId === logicalId);
  if (!inLocal && !inIncoming) throw new Error(`logicalId not present in either log: ${logicalId}`);
  if (inLocal && !inIncoming) return { kind: "only-local", rev: linearHead(local, logicalId).rev };
  if (!inLocal && inIncoming) return { kind: "only-incoming", rev: linearHead(incoming, logicalId).rev };
  const localHead = linearHead(local, logicalId);
  const incomingHead = linearHead(incoming, logicalId);
  return classifyMerge(mergeLogs(local, incoming), localHead.rev, incomingHead.rev);
}

/**
 * The in-card tiebreaker HINT — prefers the later modifiedAt. This is the ONLY sanctioned
 * use of modifiedAt, and it is a UI suggestion inside a conflict card, NEVER automatic
 * resolution (Q-3). Callers must surface both sides to the user regardless.
 */
export function conflictTiebreak(a: AnnotationRecord, b: AnnotationRecord): AnnotationRecord {
  return b.modifiedAt > a.modifiedAt ? b : a;
}

export interface ConflictResolution {
  /** Resolved body/target/motivation; default to the lexicographically-first head's. */
  body?: W3CBody | W3CBody[];
  target?: W3CTarget;
  motivation?: string | string[];
  lastEditor: ClientId;
  now?: number;
}

/**
 * Resolve a concurrent conflict (Q-7): append a multi-parent MERGE NODE that reconciles the
 * plural heads into one. `parent` = the lexicographically-first head (deterministic), the rest
 * go in `mergeParents`; version = max(head versions) + 1. After this, headsOf returns a single
 * head. Throws if there is no conflict (< 2 heads). The conflict-card UI calls this with the
 * user's chosen/merged content; modifiedAt-tiebreak is a UI hint only (never auto-resolution).
 */
export function resolveConflict(log: AnnotationLog, logicalId: LogicalId, resolution: ConflictResolution): AnnotationLog {
  const heads = headsOf(log, logicalId);
  if (heads.length < 2) {
    throw new Error(`no conflict to resolve for ${logicalId} (${heads.length} head(s))`);
  }
  const sorted = [...heads].sort((a, b) => (a.rev < b.rev ? -1 : a.rev > b.rev ? 1 : 0));
  const primary = sorted[0]!;
  const maxVersion = Math.max(...heads.map((h) => h.version));
  const body = resolution.body ?? primary.body;
  const motivation = resolution.motivation ?? primary.motivation;
  const record: AnnotationRecord = {
    logicalId,
    rev: mintRevId(resolution.now),
    version: maxVersion + 1,
    parent: primary.rev,
    mergeParents: sorted.slice(1).map((h) => h.rev),
    modifiedAt: new Date(resolution.now ?? Date.now()).toISOString(),
    lastEditor: resolution.lastEditor,
    deleted: false,
    target: resolution.target ?? primary.target,
    ...(body !== undefined ? { body } : {}),
    ...(motivation !== undefined ? { motivation } : {}),
  };
  return append(log, record);
}
