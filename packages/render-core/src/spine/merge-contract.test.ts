import { describe, it, expect } from "vitest";
import { append, appendNew, appendEdit, appendDelete, linearHead } from "./log.js";
import {
  lineage,
  ancestors,
  commonAncestor,
  headsOf,
  mergeLogs,
  classifyMerge,
  classifyLogical,
  conflictTiebreak,
  resolveConflict,
} from "./merge.js";
import { projectHeads } from "./heads.js";
import { toHistory } from "./serialize.js";
import { fromHistory } from "./deserialize.js";
import { asClientId, mintRevId } from "../wadm/brand.js";
import type { AnnotationLog, AnnotationRecord } from "../wadm/types.js";

// CHARACTERIZATION suite for ./MERGE-CONTRACT.md (B2 / Archie-697c): one describe per spec
// clause (C1..C18), test names carry the clause id for grep-able spec<->test traceability.
// These tests PIN current behavior — including the pinned defects logged as OQ-2..OQ-6 in the
// spec (OQ-1 is FIXED; its former bug-pins under C4/C11 now assert the fixed behavior). A failure here means the merge contract CHANGED; update the spec deliberately, never
// silently. This file extends (and deliberately overlaps) merge.test.ts / heads.test.ts /
// log.test.ts / resolve.test.ts; it modifies none of them.

const alice = asClientId("alice");
const bob = asClientId("bob");
const carol = asClientId("carol");
const target = "https://example.org/canvas/1";

/** v1 root + two concurrent edits on separate log copies (the canonical divergence). Distinct
 *  `now` values make the rev ULIDs' time prefixes ordered: v2alice.rev < v2bob.rev. */
function diverge() {
  const { log: base, record: v1 } = appendNew([], {
    target,
    body: { type: "TextualBody", value: "v1" },
    lastEditor: alice,
    modifiedAt: "2026-05-24T10:00:00.000Z",
    now: 1000,
  });
  const a = appendEdit(base, v1.logicalId, { body: { type: "TextualBody", value: "Alice" }, lastEditor: alice, modifiedAt: "2026-05-24T11:00:00.000Z", now: 2000 });
  const b = appendEdit(base, v1.logicalId, { body: { type: "TextualBody", value: "Bob" }, lastEditor: bob, modifiedAt: "2026-05-24T11:30:00.000Z", now: 3000 });
  return { base, v1, aliceLog: a.log, v2alice: a.record, bobLog: b.log, v2bob: b.record };
}

/** A sibling head hand-built beside `parent`, with a deterministic rev: same time prefix, the
 *  `frac` constant drives the random tail, so frac 0.2 < 0.5 < 0.8 orders the revs. */
function sibling(parent: AnnotationRecord, frac: number, editor = bob, extra: Partial<AnnotationRecord> = {}): AnnotationRecord {
  return {
    logicalId: parent.logicalId,
    rev: mintRevId(0, () => frac),
    version: parent.version + 1,
    parent: parent.rev,
    modifiedAt: "2026-05-24T12:00:00.000Z",
    lastEditor: editor,
    deleted: false,
    target,
    ...extra,
  };
}

const revs = (log: AnnotationLog) => new Set(log.map((r) => r.rev));

describe("C1 — creation appends a v1 root", () => {
  it("C1: appendNew mints version 1, parent null, deleted false; explicit logicalId is honored", () => {
    const { record: v1 } = appendNew([], { target, lastEditor: alice, now: 1000 });
    expect(v1.version).toBe(1);
    expect(v1.parent).toBeNull();
    expect(v1.deleted).toBe(false);
    const { record: adopted } = appendNew([], { logicalId: v1.logicalId, target, lastEditor: bob, now: 2000 });
    expect(adopted.logicalId).toBe(v1.logicalId);
    expect(adopted.rev).not.toBe(v1.rev); // rev is always freshly minted
  });

  it("C1: the returned log is frozen and the input log is not mutated", () => {
    const { log: l1 } = appendNew([], { target, lastEditor: alice, now: 1000 });
    const { log: l2 } = appendNew(l1, { target, lastEditor: alice, now: 2000 });
    expect(Object.isFrozen(l1)).toBe(true);
    expect(Object.isFrozen(l2)).toBe(true);
    expect(l1).toHaveLength(1); // untouched by the second append
    expect(l2).toHaveLength(2);
  });
});

describe("C2 — an edit is a single-parent child of the single head", () => {
  it("C2: version = head.version + 1, parent = head.rev, unchanged content carries forward", () => {
    const { log: l1, record: v1 } = appendNew([], { target, body: { type: "TextualBody", value: "v1" }, reading: "cipher", lastEditor: alice, now: 1000 });
    const { record: v2 } = appendEdit(l1, v1.logicalId, { lastEditor: bob, now: 2000 });
    expect(v2.version).toBe(2);
    expect(v2.parent).toBe(v1.rev);
    expect(v2.deleted).toBe(false);
    expect(v2.mergeParents).toBeUndefined(); // named drop in _editCarry — never a merge node
    expect(v2.body).toEqual({ type: "TextualBody", value: "v1" }); // carried forward
    expect(v2.reading).toBe("cipher");
  });

  it("C2: null clears reading/emphasis/geo; false/null clears wholeObject", () => {
    const { log: l1, record: v1 } = appendNew([], {
      target,
      reading: "cipher",
      emphasis: "strong",
      wholeObject: true,
      geo: { type: "bbox", west: 0, south: 0, east: 1, north: 1 },
      lastEditor: alice,
      now: 1000,
    });
    const { record: v2 } = appendEdit(l1, v1.logicalId, { reading: null, emphasis: null, wholeObject: null, geo: null, lastEditor: alice, now: 2000 });
    expect(v2.reading).toBeUndefined();
    expect(v2.emphasis).toBeUndefined();
    expect(v2.wholeObject).toBeUndefined();
    expect(v2.geo).toBeUndefined();
  });

  it("C2: editing a tombstoned note throws (resurrection undefined in v1)", () => {
    const { log: l1, record: v1 } = appendNew([], { target, lastEditor: alice, now: 1000 });
    const { log: l2 } = appendDelete(l1, v1.logicalId, { lastEditor: alice, now: 2000 });
    expect(() => appendEdit(l2, v1.logicalId, { lastEditor: alice, now: 3000 })).toThrow(/tombstoned/);
  });
});

describe("C3 — a delete is a tombstone version", () => {
  it("C3: the tombstone keeps only target; the content fields are dropped", () => {
    const { log: l1, record: v1 } = appendNew([], {
      target,
      body: { type: "TextualBody", value: "v1" },
      motivation: "commenting",
      reading: "cipher",
      lastEditor: alice,
      now: 1000,
    });
    const { record: tomb } = appendDelete(l1, v1.logicalId, { lastEditor: bob, now: 2000 });
    expect(tomb.deleted).toBe(true);
    expect(tomb.version).toBe(2);
    expect(tomb.parent).toBe(v1.rev);
    expect(tomb.target).toBe(target); // kept for citation/dereference
    expect(tomb.body).toBeUndefined();
    expect(tomb.motivation).toBeUndefined();
    expect(tomb.reading).toBeUndefined();
  });

  it("C3: deleting an already-tombstoned note throws", () => {
    const { log: l1, record: v1 } = appendNew([], { target, lastEditor: alice, now: 1000 });
    const { log: l2 } = appendDelete(l1, v1.logicalId, { lastEditor: alice, now: 2000 });
    expect(() => appendDelete(l2, v1.logicalId, { lastEditor: alice, now: 3000 })).toThrow(/already deleted/);
  });
});

describe("C4 — writes require a single head", () => {
  it("C4: appendEdit refuses a plural-head note (linearHead throws) — UIs must gate", () => {
    const { aliceLog, bobLog, v1 } = diverge();
    const union = mergeLogs(aliceLog, bobLog);
    expect(() => appendEdit(union, v1.logicalId, { lastEditor: alice, now: 9000 })).toThrow(/plural heads/);
    expect(() => appendDelete(union, v1.logicalId, { lastEditor: alice, now: 9000 })).toThrow(/plural heads/);
  });

  it("C4: linearHead throws on an absent note", () => {
    const { record: other } = appendNew([], { target, lastEditor: alice, now: 1000 });
    expect(() => linearHead([], other.logicalId)).toThrow(/no such note/);
  });

  it("C4: zero heads = a cyclic DAG is reported as corruption, not guessed around", () => {
    const { record: v1 } = appendNew([], { target, lastEditor: alice, now: 1000 });
    const ra = mintRevId(0, () => 0.2);
    const rb = mintRevId(0, () => 0.8);
    const a: AnnotationRecord = { logicalId: v1.logicalId, rev: ra, version: 1, parent: rb, modifiedAt: "t", lastEditor: alice, deleted: false, target };
    const b: AnnotationRecord = { logicalId: v1.logicalId, rev: rb, version: 2, parent: ra, modifiedAt: "t", lastEditor: alice, deleted: false, target };
    expect(() => linearHead([a, b], v1.logicalId)).toThrow(/cyclic version DAG/);
  });

  it("C4: after resolveConflict, linearHead returns the merge node — a resolved note is a single head again", () => {
    const { aliceLog, bobLog, v1 } = diverge();
    const resolved = resolveConflict(mergeLogs(aliceLog, bobLog), v1.logicalId, { lastEditor: alice, now: 4000 });
    const merge = resolved[resolved.length - 1]!;
    expect(headsOf(resolved, v1.logicalId)).toHaveLength(1);
    // linearHead counts mergeParents as references (shares parentsOf with headsOf — the OQ-1
    // fix), so the non-primary head is referenced and the merge node is the single head.
    expect(linearHead(resolved, v1.logicalId).rev).toBe(merge.rev);
  });

  it("C4: resolve → appendEdit succeeds — the new rev is a single-parent child of the merge node", () => {
    const { aliceLog, bobLog, v1 } = diverge();
    const resolved = resolveConflict(mergeLogs(aliceLog, bobLog), v1.logicalId, { lastEditor: alice, now: 4000 });
    const merge = resolved[resolved.length - 1]!;
    const { log: after, record: next } = appendEdit(resolved, v1.logicalId, { body: { type: "TextualBody", value: "post-resolve" }, lastEditor: alice, now: 5000 });
    expect(next.parent).toBe(merge.rev);
    expect(next.version).toBe(merge.version + 1);
    expect(next.mergeParents).toBeUndefined(); // an edit is never a merge node (C2)
    expect(headsOf(after, v1.logicalId).map((r) => r.rev)).toEqual([next.rev]);
  });

  it("C4: resolve → appendDelete succeeds — resolve-live-then-delete is a real path (C15)", () => {
    const { aliceLog, bobLog, v1 } = diverge();
    const resolved = resolveConflict(mergeLogs(aliceLog, bobLog), v1.logicalId, { lastEditor: alice, now: 4000 });
    const merge = resolved[resolved.length - 1]!;
    const { record: tomb } = appendDelete(resolved, v1.logicalId, { lastEditor: bob, now: 5000 });
    expect(tomb.deleted).toBe(true);
    expect(tomb.parent).toBe(merge.rev);
    expect(tomb.version).toBe(merge.version + 1);
  });
});

describe("C5 — heads are the unreferenced tips, mergeParents-aware", () => {
  it("C5: concurrent edits of one note create sibling revs = plural heads", () => {
    const { aliceLog, bobLog, v1, v2alice, v2bob } = diverge();
    const union = mergeLogs(aliceLog, bobLog);
    expect(v2alice.parent).toBe(v2bob.parent); // true siblings
    expect(new Set(headsOf(union, v1.logicalId).map((r) => r.rev))).toEqual(new Set([v2alice.rev, v2bob.rev]));
  });

  it("C5: an absent note yields [] (no throw)", () => {
    const { record: other } = appendNew([], { target, lastEditor: alice, now: 1000 });
    expect(headsOf([], other.logicalId)).toEqual([]);
  });

  it("C5: a rev referenced only via mergeParents is NOT a head — a resolved note has exactly one", () => {
    const { aliceLog, bobLog, v1 } = diverge();
    const resolved = resolveConflict(mergeLogs(aliceLog, bobLog), v1.logicalId, { lastEditor: alice, now: 4000 });
    const heads = headsOf(resolved, v1.logicalId);
    expect(heads).toHaveLength(1);
    expect(heads[0]!.mergeParents?.length).toBe(1);
  });
});

describe("C6 — the heads projection is deterministic and tombstone-hiding", () => {
  it("C6: projectHeads output is independent of log record order (sorted by logicalId, rev)", () => {
    const { aliceLog, bobLog } = diverge();
    const { log: withOther } = appendNew(mergeLogs(aliceLog, bobLog), { target, lastEditor: carol, now: 500 });
    const ab = projectHeads(withOther);
    const ba = projectHeads([...withOther].reverse());
    expect(ab.map((r) => r.rev)).toEqual(ba.map((r) => r.rev));
  });

  it("C6: tombstone heads are hidden and the projection is idempotent", () => {
    const { log: l1, record: v1 } = appendNew([], { target, lastEditor: alice, now: 1000 });
    const { log: l2 } = appendNew(l1, { target, lastEditor: alice, now: 2000 });
    const { log: l3 } = appendDelete(l2, v1.logicalId, { lastEditor: alice, now: 3000 });
    const once = projectHeads(l3);
    expect(once).toHaveLength(1); // the deleted note shows nothing
    expect(projectHeads(once)).toEqual(once);
  });
});

describe("C7 — mergeLogs is a set union by rev; local wins collisions", () => {
  it("C7: shared history appears once in the union", () => {
    const { aliceLog, bobLog, v1 } = diverge();
    const union = mergeLogs(aliceLog, bobLog);
    expect(union).toHaveLength(3); // v1 + the two edits; v1 deduped
    expect(union.filter((r) => r.rev === v1.rev)).toHaveLength(1);
  });

  it("C7 (OQ-2 pin): a rev collision with DIFFERENT content keeps the LOCAL record, silently", () => {
    const { record: v1 } = appendNew([], { target, lastEditor: alice, now: 1000 });
    const forged: AnnotationRecord = { ...v1, body: { type: "TextualBody", value: "forged" }, lastEditor: bob };
    expect(forged.rev).toBe(v1.rev);
    const union = mergeLogs([v1], [forged]);
    expect(union).toHaveLength(1);
    expect(union[0]!.lastEditor).toBe(alice); // local content survives; no error, no report
  });

  it("C7: the union is frozen", () => {
    const { aliceLog, bobLog } = diverge();
    expect(Object.isFrozen(mergeLogs(aliceLog, bobLog))).toBe(true);
  });
});

describe("C8 — mergeLogs algebra", () => {
  it("C8: set-commutative but NOT sequence-commutative — same records, local order first", () => {
    const { aliceLog, bobLog, v2alice, v2bob } = diverge();
    const ab = mergeLogs(aliceLog, bobLog);
    const ba = mergeLogs(bobLog, aliceLog);
    expect(revs(ab)).toEqual(revs(ba)); // same set
    expect(ab.map((r) => r.rev)).not.toEqual(ba.map((r) => r.rev)); // different sequence
    expect(ab[ab.length - 1]!.rev).toBe(v2bob.rev); // incoming-new appended after local
    expect(ba[ba.length - 1]!.rev).toBe(v2alice.rev);
  });

  it("C8: idempotent — merging a log with itself (or again) adds nothing", () => {
    const { aliceLog, bobLog } = diverge();
    const union = mergeLogs(aliceLog, bobLog);
    expect(mergeLogs(aliceLog, aliceLog).map((r) => r.rev)).toEqual(aliceLog.map((r) => r.rev));
    expect(mergeLogs(union, bobLog).map((r) => r.rev)).toEqual(union.map((r) => r.rev));
  });

  it("C8: associative as sets, and downstream classification is union-order-independent", () => {
    const { base, aliceLog, bobLog, v1, v2alice, v2bob } = diverge();
    const carolEdit = appendEdit(base, v1.logicalId, { body: { type: "TextualBody", value: "Carol" }, lastEditor: carol, now: 5000 });
    const left = mergeLogs(mergeLogs(aliceLog, bobLog), carolEdit.log);
    const right = mergeLogs(aliceLog, mergeLogs(bobLog, carolEdit.log));
    expect(revs(left)).toEqual(revs(right));
    expect(classifyMerge(mergeLogs(aliceLog, bobLog), v2alice.rev, v2bob.rev)).toEqual(
      classifyMerge(mergeLogs(bobLog, aliceLog), v2alice.rev, v2bob.rev),
    );
  });
});

describe("C9 — ancestry", () => {
  it("C9: lineage walks the primary parent chain only — a merge node's secondary branch is absent", () => {
    const { aliceLog, bobLog, v1, v2alice, v2bob } = diverge();
    const resolved = resolveConflict(mergeLogs(aliceLog, bobLog), v1.logicalId, { lastEditor: alice, now: 4000 });
    const m = headsOf(resolved, v1.logicalId)[0]!;
    expect(m.parent).toBe(v2alice.rev); // primary = lexicographically-first (earlier now)
    expect(lineage(resolved, m.rev)).toEqual([m.rev, v2alice.rev, v1.rev]); // v2bob NOT in the chain
    expect(ancestors(resolved, m.rev).has(v2bob.rev)).toBe(true); // but IS a proper ancestor
  });

  it("C9: commonAncestor finds a merge-base reachable only through a mergeParents edge", () => {
    const { aliceLog, bobLog, v1, v2bob } = diverge();
    const resolved = resolveConflict(mergeLogs(aliceLog, bobLog), v1.logicalId, { lastEditor: alice, now: 4000 });
    const m = headsOf(resolved, v1.logicalId)[0]!;
    expect(commonAncestor(resolved, m.rev, v2bob.rev)).toBe(v2bob.rev);
  });

  it("C9: unrelated histories (no shared ancestor) yield null", () => {
    const { log: l1, record: rootA } = appendNew([], { target, lastEditor: alice, now: 1000 });
    const { log: l2, record: rootB } = appendNew(l1, { logicalId: rootA.logicalId, target, lastEditor: bob, now: 2000 });
    expect(commonAncestor(l2, rootA.rev, rootB.rev)).toBeNull();
  });
});

describe("C10 — classification is ancestry-only", () => {
  it("C10: identical when both heads are the same rev", () => {
    const { aliceLog, v2alice } = diverge();
    expect(classifyMerge(aliceLog, v2alice.rev, v2alice.rev)).toEqual({ kind: "identical", rev: v2alice.rev });
  });

  it("C10: fast-forward when one head descends from the other; ahead = the descendant", () => {
    const { base, aliceLog, v1, v2alice } = diverge();
    const union = mergeLogs(base, aliceLog);
    expect(classifyMerge(union, v1.rev, v2alice.rev)).toEqual({ kind: "fast-forward", ahead: v2alice.rev, behind: v1.rev });
  });

  it("C10: conflict carries the divergence point as base", () => {
    const { aliceLog, bobLog, v1, v2alice, v2bob } = diverge();
    const union = mergeLogs(aliceLog, bobLog);
    expect(classifyMerge(union, v2alice.rev, v2bob.rev)).toEqual({ kind: "conflict", a: v2alice.rev, b: v2bob.rev, base: v1.rev });
  });
});

describe("C11 — classifyLogical", () => {
  it("C11: disjoint note sets resolve to only-local / only-incoming", () => {
    const { aliceLog, v1, v2alice } = diverge();
    expect(classifyLogical(aliceLog, [], v1.logicalId)).toEqual({ kind: "only-local", rev: v2alice.rev });
    expect(classifyLogical([], aliceLog, v1.logicalId)).toEqual({ kind: "only-incoming", rev: v2alice.rev });
  });

  it("C11: a note absent from both logs throws", () => {
    const { record: other } = appendNew([], { target, lastEditor: alice, now: 1000 });
    expect(() => classifyLogical([], [], other.logicalId)).toThrow(/not present in either/);
  });

  it("C11: a log containing an already-resolved branch classifies — the merge node is its head", () => {
    const { aliceLog, bobLog, v1 } = diverge();
    const resolved = resolveConflict(mergeLogs(aliceLog, bobLog), v1.logicalId, { lastEditor: alice, now: 4000 });
    const merge = resolved[resolved.length - 1]!;
    // linearHead counts mergeParents (OQ-1 fix), so a resolved side reads as one head and the
    // async-zip path keeps working after a resolution.
    expect(classifyLogical(resolved, resolved, v1.logicalId)).toEqual({ kind: "identical", rev: merge.rev });
  });

  it("C11: post-resolution exchange — a resolved local classifies against incoming instead of throwing", () => {
    const { aliceLog, bobLog, v1, v2bob } = diverge();
    const resolved = resolveConflict(mergeLogs(aliceLog, bobLog), v1.logicalId, { lastEditor: alice, now: 4000 });
    const merge = resolved[resolved.length - 1]!;
    // A peer that hasn't seen the resolution yet: strictly behind → fast-forward, no card.
    expect(classifyLogical(resolved, bobLog, v1.logicalId)).toEqual({ kind: "fast-forward", ahead: merge.rev, behind: v2bob.rev });
    // A peer that kept editing its branch: a genuine conflict against the merge node (C12).
    const bob2 = appendEdit(bobLog, v1.logicalId, { body: { type: "TextualBody", value: "Bob again" }, lastEditor: bob, now: 3500 });
    expect(classifyLogical(resolved, bob2.log, v1.logicalId)).toEqual({ kind: "conflict", a: merge.rev, b: bob2.record.rev, base: v2bob.rev });
  });
});

describe("C12 — resolution node shape and deterministic primary", () => {
  it("C12: three-way — parent = lexicographically-first head, mergeParents = the rest in sorted order, version = max + 1", () => {
    const { log: base, record: v1 } = appendNew([], { target, lastEditor: alice, now: 1000 });
    const h2 = sibling(v1, 0.5, bob, { body: { type: "TextualBody", value: "mid" } });
    const h1 = sibling(v1, 0.2, alice, { body: { type: "TextualBody", value: "low" }, version: 4 });
    const h3 = sibling(v1, 0.8, carol, { body: { type: "TextualBody", value: "high" } });
    const log = append(append(append(base, h2), h1), h3); // appended out of rev order on purpose
    const resolved = resolveConflict(log, v1.logicalId, { lastEditor: alice, now: 9000 });
    const m = resolved[resolved.length - 1]!;
    expect(m.parent).toBe(h1.rev); // 0.2-rev sorts first regardless of append order
    expect(m.mergeParents).toEqual([h2.rev, h3.rev]); // sorted order
    expect(m.version).toBe(5); // max(4, 2, 2) + 1
    expect(m.deleted).toBe(false);
    expect(headsOf(resolved, v1.logicalId).map((r) => r.rev)).toEqual([m.rev]);
  });

  it("C12: resolve-then-resolve — the merge node is a normal parent for further branching", () => {
    const { aliceLog, bobLog, v1, v2bob } = diverge();
    const resolved = resolveConflict(mergeLogs(aliceLog, bobLog), v1.logicalId, { lastEditor: alice, now: 4000 });
    const m = headsOf(resolved, v1.logicalId)[0]!;
    // Bob edits HIS still-linear branch before seeing the resolution: a new sibling of m.
    const bob2 = appendEdit(bobLog, v1.logicalId, { body: { type: "TextualBody", value: "Bob again" }, lastEditor: bob, now: 3500 });
    const union = mergeLogs(resolved, bob2.log);
    expect(classifyMerge(union, m.rev, bob2.record.rev)).toEqual({ kind: "conflict", a: m.rev, b: bob2.record.rev, base: v2bob.rev });
    const resolved2 = resolveConflict(union, v1.logicalId, { lastEditor: alice, now: 6000 });
    const m2 = headsOf(resolved2, v1.logicalId);
    expect(m2).toHaveLength(1);
    expect(m2[0]!.version).toBe(4); // max(3, 3) + 1
    expect(new Set([m2[0]!.parent, ...(m2[0]!.mergeParents ?? [])])).toEqual(new Set([m.rev, bob2.record.rev]));
  });

  it("C12: fewer than two heads throws — there is no conflict to resolve", () => {
    const { log: l1, record: v1 } = appendNew([], { target, lastEditor: alice, now: 1000 });
    expect(() => resolveConflict(l1, v1.logicalId, { lastEditor: alice, now: 2000 })).toThrow(/no conflict to resolve/);
    const { record: other } = appendNew([], { target, lastEditor: alice, now: 1000 });
    expect(() => resolveConflict([], other.logicalId, { lastEditor: alice, now: 2000 })).toThrow(/0 head\(s\)/);
  });

  it("C12: the merge node's rev is freshly minted and its modifiedAt is the resolution time", () => {
    const { aliceLog, bobLog, v1 } = diverge();
    const resolved = resolveConflict(mergeLogs(aliceLog, bobLog), v1.logicalId, { lastEditor: carol, now: 4000 });
    const m = resolved[resolved.length - 1]!;
    expect(revs(mergeLogs(aliceLog, bobLog)).has(m.rev)).toBe(false);
    expect(m.modifiedAt).toBe(new Date(4000).toISOString());
    expect(m.lastEditor).toBe(carol);
  });
});

describe("C13 — omitted resolution content defaults to the primary head's", () => {
  it("C13: body/target/motivation come from the lexicographically-first head when the resolution omits them", () => {
    const { log: base, record: v1 } = appendNew([], { target, lastEditor: alice, now: 1000 });
    const low = sibling(v1, 0.2, alice, { body: { type: "TextualBody", value: "low" }, motivation: "commenting", target: "https://example.org/canvas/low" });
    const high = sibling(v1, 0.8, bob, { body: { type: "TextualBody", value: "high" }, motivation: "tagging" });
    const log = append(append(base, high), low);
    const m = resolveConflict(log, v1.logicalId, { lastEditor: carol, now: 9000 }).at(-1)!;
    expect(m.body).toEqual({ type: "TextualBody", value: "low" });
    expect(m.motivation).toBe("commenting");
    expect(m.target).toBe("https://example.org/canvas/low");
  });

  it("C13: the primary choice (and so the defaults) is independent of mergeLogs argument order", () => {
    const { aliceLog, bobLog, v1, v2alice } = diverge();
    const mAB = resolveConflict(mergeLogs(aliceLog, bobLog), v1.logicalId, { lastEditor: carol, now: 9000 }).at(-1)!;
    const mBA = resolveConflict(mergeLogs(bobLog, aliceLog), v1.logicalId, { lastEditor: carol, now: 9000 }).at(-1)!;
    expect(mAB.parent).toBe(v2alice.rev);
    expect(mBA.parent).toBe(mAB.parent);
    expect(mBA.body).toEqual(mAB.body);
    expect(mBA.mergeParents).toEqual(mAB.mergeParents);
  });
});

describe("C14 — field carry through resolution", () => {
  it("C14: reading/emphasis/wholeObject/geo are inherited from ANY head that carries them (not just the primary)", () => {
    const { log: base, record: v1 } = appendNew([], { target, lastEditor: alice, now: 1000 });
    const bare = sibling(v1, 0.2, alice); // the PRIMARY carries none of the four
    const rich = sibling(v1, 0.8, bob, {
      reading: "cipher",
      emphasis: "strong",
      wholeObject: true,
      geo: { type: "bbox", west: 0, south: 0, east: 1, north: 1 },
    });
    const m = resolveConflict(append(append(base, bare), rich), v1.logicalId, { lastEditor: alice, now: 9000 }).at(-1)!;
    expect(m.reading).toBe("cipher");
    expect(m.emphasis).toBe("strong");
    expect(m.wholeObject).toBe(true);
    expect(m.geo).toEqual({ type: "bbox", west: 0, south: 0, east: 1, north: 1 });
  });

  it("C14: an explicit resolution value overrides inheritance", () => {
    const { log: base, record: v1 } = appendNew([], { target, lastEditor: alice, now: 1000 });
    const a = sibling(v1, 0.2, alice, { reading: "cipher" });
    const b = sibling(v1, 0.8, bob);
    const m = resolveConflict(append(append(base, a), b), v1.logicalId, { lastEditor: alice, now: 9000, reading: "hoax", emphasis: "muted" }).at(-1)!;
    expect(m.reading).toBe("hoax");
    expect(m.emphasis).toBe("muted");
  });

  it("C14: when heads disagree on a field, the lexicographically-first CARRIER wins", () => {
    const { log: base, record: v1 } = appendNew([], { target, lastEditor: alice, now: 1000 });
    const a = sibling(v1, 0.2, alice, { reading: "cipher" });
    const b = sibling(v1, 0.8, bob, { reading: "hoax" });
    const m = resolveConflict(append(append(base, b), a), v1.logicalId, { lastEditor: alice, now: 9000 }).at(-1)!;
    expect(m.reading).toBe("cipher"); // sorted order, not append order
  });
});

describe("C15 — tombstones and branches", () => {
  it("C15: delete-vs-edit — headsOf reports both heads, projectHeads shows only the live one", () => {
    const { log: base, record: v1 } = appendNew([], { target, lastEditor: alice, now: 1000 });
    const live = sibling(v1, 0.8, alice, { body: { type: "TextualBody", value: "kept" } });
    const tomb = sibling(v1, 0.2, bob, { deleted: true });
    const log = append(append(base, live), tomb);
    expect(headsOf(log, v1.logicalId)).toHaveLength(2);
    expect(projectHeads(log).map((r) => r.rev)).toEqual([live.rev]);
  });

  it("C15: resolving a branch containing a tombstone always produces a LIVE node", () => {
    const { log: base, record: v1 } = appendNew([], { target, lastEditor: alice, now: 1000 });
    const live = sibling(v1, 0.2, alice, { body: { type: "TextualBody", value: "kept" } });
    const tomb = sibling(v1, 0.8, bob, { deleted: true });
    const m = resolveConflict(append(append(base, live), tomb), v1.logicalId, { lastEditor: alice, now: 9000 }).at(-1)!;
    expect(m.deleted).toBe(false); // there is no resolve-to-deleted
    expect(m.body).toEqual({ type: "TextualBody", value: "kept" }); // live head was primary here
  });

  it("C15 (OQ-3 pin): a tombstone PRIMARY yields a live, body-less merge node when the resolution omits body", () => {
    const { log: base, record: v1 } = appendNew([], { target, lastEditor: alice, now: 1000 });
    const tomb = sibling(v1, 0.2, bob, { deleted: true }); // sorts first → primary
    const live = sibling(v1, 0.8, alice, { body: { type: "TextualBody", value: "survives only in history" } });
    const m = resolveConflict(append(append(base, tomb), live), v1.logicalId, { lastEditor: alice, now: 9000 }).at(-1)!;
    expect(m.deleted).toBe(false);
    expect(m.body).toBeUndefined(); // the live edit's body is NOT inherited — pinned, see OQ-3
  });
});

describe("C16 — modifiedAt is an in-card tiebreaker only", () => {
  it("C16: a later modifiedAt neither fast-forwards nor wins a conflict", () => {
    const { aliceLog, bobLog, v2alice, v2bob } = diverge();
    expect(v2bob.modifiedAt > v2alice.modifiedAt).toBe(true);
    expect(classifyMerge(mergeLogs(aliceLog, bobLog), v2alice.rev, v2bob.rev).kind).toBe("conflict");
  });

  it("C16: conflictTiebreak prefers the later modifiedAt (a UI hint, never auto-resolution)", () => {
    const { v2alice, v2bob } = diverge();
    expect(conflictTiebreak(v2alice, v2bob).rev).toBe(v2bob.rev);
    expect(conflictTiebreak(v2bob, v2alice).rev).toBe(v2bob.rev);
  });

  it("C16: on an exact modifiedAt tie, the FIRST argument wins", () => {
    const { v2alice } = diverge();
    const twin: AnnotationRecord = { ...v2alice, rev: mintRevId(0, () => 0.9) };
    expect(conflictTiebreak(v2alice, twin).rev).toBe(v2alice.rev);
    expect(conflictTiebreak(twin, v2alice).rev).toBe(twin.rev);
  });
});

describe("C17 — version is a citation ordinal; identity is rev", () => {
  it("C17: sibling heads legitimately share (logicalId, version) and are never renumbered", () => {
    const { aliceLog, bobLog, v1, v2alice, v2bob } = diverge();
    expect(v2alice.version).toBe(2);
    expect(v2bob.version).toBe(2);
    const union = mergeLogs(aliceLog, bobLog);
    expect(union.filter((r) => r.logicalId === v1.logicalId && r.version === 2)).toHaveLength(2);
  });

  it("C17: fromHistory dedupes by rev — a doubled page collapses; distinct revs sharing (logicalId, version) survive", () => {
    const { aliceLog, bobLog, v1 } = diverge();
    const union = mergeLogs(aliceLog, bobLog);
    const pages = Object.values(toHistory(union, { baseUrl: "b/" }).pages);
    const reloaded = fromHistory([...pages, ...pages]); // torn/doubled write
    expect(reloaded).toHaveLength(3);
    expect(reloaded.filter((r) => r.logicalId === v1.logicalId && r.version === 2)).toHaveLength(2); // the genuine branch survives
  });

  it("C17: fromHistory is page-iteration-order independent (same record set either way)", () => {
    const { aliceLog, v1 } = diverge();
    const { log: two } = appendNew(aliceLog, { target, lastEditor: bob, now: 7000 });
    const pages = Object.values(toHistory(two, { baseUrl: "b/" }).pages);
    expect(pages.length).toBeGreaterThan(1); // two notes → two pages
    expect(revs(fromHistory(pages))).toEqual(revs(fromHistory([...pages].reverse())));
    void v1;
  });
});

describe("C18 — duplicate explicit logicalId creates a second root", () => {
  it("C18 (OQ-5 pin): appendNew does not guard an existing logicalId — two roots, conflict with base null", () => {
    const { log: l1, record: rootA } = appendNew([], { target, lastEditor: alice, now: 1000 });
    const { log: l2, record: rootB } = appendNew(l1, { logicalId: rootA.logicalId, target, lastEditor: bob, now: 2000 });
    expect(rootB.parent).toBeNull(); // a second DAG root, silently
    expect(headsOf(l2, rootA.logicalId)).toHaveLength(2);
    expect(classifyMerge(l2, rootA.rev, rootB.rev)).toEqual({ kind: "conflict", a: rootA.rev, b: rootB.rev, base: null });
  });
});
