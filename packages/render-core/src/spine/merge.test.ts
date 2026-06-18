import { describe, it, expect } from "vitest";
import { appendNew, appendEdit } from "./log.js";
import { lineage, ancestors, commonAncestor, headsOf, mergeLogs, classifyMerge, classifyLogical, conflictTiebreak, resolveConflict } from "./merge.js";
import { asClientId } from "../wadm/brand.js";
import type { AnnotationLog } from "../wadm/types.js";

// Version-DAG merge (ADR-0003 / Q-3, the highest-risk module). Walks by rev (the
// collision-free DAG node id, ADR-0003 Refinement). modifiedAt is an in-card tiebreaker
// ONLY — it MUST NOT drive primary auto-resolution (clock skew = data loss).

const alice = asClientId("alice");
const bob = asClientId("bob");
const target = "https://example.org/canvas/1";

/** A shared base note (v1) plus two divergent edits = the canonical concurrent fixture. */
function diverge() {
  const { log: base, record: v1 } = appendNew([], { target, body: { type: "TextualBody", value: "v1" }, lastEditor: alice, modifiedAt: "2026-05-24T10:00:00.000Z", now: 1000 });
  const aliceLog = appendEdit(base, v1.logicalId, { body: { type: "TextualBody", value: "Alice" }, lastEditor: alice, modifiedAt: "2026-05-24T11:00:00.000Z", now: 2000 });
  const bobLog = appendEdit(base, v1.logicalId, { body: { type: "TextualBody", value: "Bob" }, lastEditor: bob, modifiedAt: "2026-05-24T11:30:00.000Z", now: 3000 });
  return { base, v1, aliceLog: aliceLog.log, v2alice: aliceLog.record, bobLog: bobLog.log, v2bob: bobLog.record };
}

describe("lineage / ancestors", () => {
  it("lineage lists self then each parent up to the root", () => {
    const { log: l1, record: v1 } = appendNew([], { target, lastEditor: alice, modifiedAt: "t", now: 1 });
    const { log: l2, record: v2 } = appendEdit(l1, v1.logicalId, { lastEditor: alice, modifiedAt: "t", now: 2 });
    const { log: l3, record: v3 } = appendEdit(l2, v1.logicalId, { lastEditor: alice, modifiedAt: "t", now: 3 });
    expect(lineage(l3, v3.rev)).toEqual([v3.rev, v2.rev, v1.rev]);
    expect(ancestors(l3, v3.rev).has(v3.rev)).toBe(false); // proper ancestors exclude self
    expect(ancestors(l3, v3.rev).has(v1.rev)).toBe(true);
  });
});

describe("commonAncestor", () => {
  it("finds the divergence point of two concurrent heads", () => {
    const { aliceLog, bobLog, v1, v2alice, v2bob } = diverge();
    const union = mergeLogs(aliceLog, bobLog);
    expect(commonAncestor(union, v2alice.rev, v2bob.rev)).toBe(v1.rev);
  });
  it("returns the ancestor itself when one head is an ancestor of the other (linear)", () => {
    const { base, aliceLog, v1, v2alice } = diverge();
    const union = mergeLogs(base, aliceLog);
    expect(commonAncestor(union, v1.rev, v2alice.rev)).toBe(v1.rev);
  });
  it("follows mergeParents — an ancestor reachable ONLY through a merge node's secondary edge (Q-7)", () => {
    const { aliceLog, bobLog, v1, v2alice, v2bob } = diverge();
    const union = mergeLogs(aliceLog, bobLog);
    // Resolve the concurrent conflict → a multi-parent merge node M (parent = first head, mergeParents = rest).
    const resolved = resolveConflict(union, v1.logicalId, { lastEditor: alice, now: 4000 });
    const merge = headsOf(resolved, v1.logicalId)[0]!;
    expect(merge.mergeParents?.length ?? 0).toBeGreaterThan(0);
    const secondary = merge.parent === v2alice.rev ? v2bob : v2alice; // the head that landed in mergeParents
    // `secondary` is reachable from M ONLY through the mergeParents edge. A lineage-only walk (the
    // pre-fix behavior) would miss it and fall back to v1; the multi-parent walk sees it as a proper
    // ancestor, so the merge-base of (M, secondary) IS secondary, not v1.
    expect(ancestors(resolved, merge.rev).has(secondary.rev)).toBe(true);
    expect(commonAncestor(resolved, merge.rev, secondary.rev)).toBe(secondary.rev);
  });
});

describe("classifyMerge", () => {
  it("identical when the two heads are the same rev", () => {
    const { aliceLog, v2alice } = diverge();
    expect(classifyMerge(aliceLog, v2alice.rev, v2alice.rev).kind).toBe("identical");
  });

  it("fast-forward when one head is an ancestor of the other (no card)", () => {
    const { base, aliceLog, v1, v2alice } = diverge();
    const union = mergeLogs(base, aliceLog);
    const c = classifyMerge(union, v2alice.rev, v1.rev);
    expect(c.kind).toBe("fast-forward");
    if (c.kind === "fast-forward") expect(c.ahead).toBe(v2alice.rev); // descendant wins
  });

  it("conflict when both advanced from a common ancestor (manual card)", () => {
    const { aliceLog, bobLog, v1, v2alice, v2bob } = diverge();
    const union = mergeLogs(aliceLog, bobLog);
    const c = classifyMerge(union, v2alice.rev, v2bob.rev);
    expect(c.kind).toBe("conflict");
    if (c.kind === "conflict") expect(c.base).toBe(v1.rev);
  });
});

describe("modifiedAt is an in-card tiebreaker ONLY (Q-3)", () => {
  it("a later modifiedAt does NOT auto-resolve a concurrent conflict", () => {
    const { aliceLog, bobLog, v2alice, v2bob } = diverge();
    // v2bob has a LATER modifiedAt than v2alice. Wall-clock LWW would silently pick Bob.
    expect(v2bob.modifiedAt > v2alice.modifiedAt).toBe(true);
    const union = mergeLogs(aliceLog, bobLog);
    // Still a conflict — classification ignores modifiedAt entirely.
    expect(classifyMerge(union, v2alice.rev, v2bob.rev).kind).toBe("conflict");
  });

  it("conflictTiebreak (the in-card hint, never auto-resolution) prefers the later modifiedAt", () => {
    const { v2alice, v2bob } = diverge();
    expect(conflictTiebreak(v2alice, v2bob).rev).toBe(v2bob.rev); // Bob is later — only a UI hint
  });
});

describe("mergeLogs dedupes shared history by rev", () => {
  it("the common ancestor appears once in the union", () => {
    const { aliceLog, bobLog, v1 } = diverge();
    const union = mergeLogs(aliceLog, bobLog);
    expect(union.filter((r) => r.rev === v1.rev)).toHaveLength(1);
    expect(union).toHaveLength(3); // v1 + v2alice + v2bob
  });
});

describe("classifyLogical — the per-logicalId async-zip merge entry point", () => {
  it("fast-forwards when incoming strictly extends local", () => {
    const { base, aliceLog, v1 } = diverge();
    const c = classifyLogical(base, aliceLog, v1.logicalId);
    expect(c.kind).toBe("fast-forward");
  });
  it("flags a conflict when local and incoming concurrently diverged", () => {
    const { aliceLog, bobLog, v1 } = diverge();
    const c = classifyLogical(aliceLog, bobLog, v1.logicalId);
    expect(c.kind).toBe("conflict");
  });
  it("identical when local and incoming heads match", () => {
    const { aliceLog, v1 } = diverge();
    expect(classifyLogical(aliceLog, aliceLog, v1.logicalId).kind).toBe("identical");
  });
  it("only-incoming when the note is new to local (disjoint sets are the common case)", () => {
    const { aliceLog, v1 } = diverge();
    const other = appendNew([], { target, lastEditor: bob, modifiedAt: "t", now: 9000 });
    expect(classifyLogical([], aliceLog, v1.logicalId).kind).toBe("only-incoming");
    expect(classifyLogical(aliceLog, [], v1.logicalId).kind).toBe("only-local");
    void other;
  });
});

describe("headsOf", () => {
  it("returns the single tip of a resolved chain and the plural set of an unresolved one", () => {
    const { base, aliceLog, bobLog, v1 } = diverge();
    expect(headsOf(aliceLog, v1.logicalId)).toHaveLength(1);
    const union: AnnotationLog = mergeLogs(aliceLog, bobLog);
    expect(headsOf(union, v1.logicalId)).toHaveLength(2); // plural heads (honest degradation)
    expect(headsOf(base, v1.logicalId)).toHaveLength(1);
  });
});
