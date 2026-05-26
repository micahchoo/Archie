import { describe, it, expect } from "vitest";
import { append, appendNew, appendEdit, appendDelete, linearHead } from "./log.js";
import { asClientId, mintRevId, type LogicalId } from "../wadm/brand.js";
import type { AnnotationLog, AnnotationRecord } from "../wadm/types.js";

// Append-only log (ADR-0003 / Q-3). Single-writer-linear invariants enforced by the
// helpers; the log type itself tolerates plural-head collisions (Q-6) — that case is
// assembled directly, NOT via the helpers, and is what the merge pass (P0-4) produces.

const alice = asClientId("alice");
const bob = asClientId("bob");
const target = "https://example.org/canvas/1";
const t0 = "2026-05-24T10:00:00.000Z";

function freshNote() {
  return appendNew([], { target, body: { type: "TextualBody", value: "v1 text" }, lastEditor: alice, modifiedAt: t0 });
}

describe("appendNew (Q-3)", () => {
  it("creates a v1 record: version 1, parent null, not deleted", () => {
    const { log, record } = freshNote();
    expect(log).toHaveLength(1);
    expect(record.version).toBe(1);
    expect(record.parent).toBeNull();
    expect(record.deleted).toBe(false);
  });

  it("mints a ULID logical id when none is given", () => {
    const { record } = freshNote();
    expect(record.logicalId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it("does not mutate the input log (append-only is pure)", () => {
    const empty: AnnotationLog = [];
    const { log } = appendNew(empty, { target, lastEditor: alice, modifiedAt: t0 });
    expect(empty).toHaveLength(0);
    expect(log).not.toBe(empty);
  });
});

describe("appendEdit (Q-3)", () => {
  it("bumps version and sets parent to the prior version id", () => {
    const { log: l1, record: v1 } = freshNote();
    const { record: v2 } = appendEdit(l1, v1.logicalId, { body: { type: "TextualBody", value: "v2 text" }, lastEditor: bob, modifiedAt: "2026-05-24T11:00:00.000Z" });
    expect(v2.version).toBe(2);
    expect(v2.parent).toBe(v1.rev); // parent targets the rev (DAG node id), not the version id
    expect(v2.rev).not.toBe(v1.rev);
    expect(v2.lastEditor).toBe(bob);
  });

  it("carries forward unchanged fields from the head", () => {
    const { log: l1, record: v1 } = freshNote();
    const { record: v2 } = appendEdit(l1, v1.logicalId, { lastEditor: alice, modifiedAt: t0 }); // no body/target override
    expect(v2.target).toBe(v1.target);
    expect(v2.body).toEqual(v1.body);
  });

  it("never mutates the prior version record", () => {
    const { log: l1, record: v1 } = freshNote();
    const before = JSON.stringify(v1);
    appendEdit(l1, v1.logicalId, { body: { type: "TextualBody", value: "changed" }, lastEditor: bob, modifiedAt: t0 });
    expect(JSON.stringify(v1)).toBe(before);
    expect(l1).toHaveLength(1); // l1 unchanged
  });

  it("throws when editing a non-existent note", () => {
    expect(() => appendEdit([], "01ARZ3NDEKTSV4RRFFQ69G5FAV" as LogicalId, { lastEditor: alice, modifiedAt: t0 })).toThrow();
  });
});

describe("appendDelete — tombstone, not removal (Q-3)", () => {
  it("appends a tombstone version (deleted true), keeping prior versions intact", () => {
    const { log: l1, record: v1 } = freshNote();
    const { log: l2, record: tomb } = appendDelete(l1, v1.logicalId, { lastEditor: alice, modifiedAt: t0 });
    expect(tomb.deleted).toBe(true);
    expect(tomb.version).toBe(2);
    expect(tomb.parent).toBe(v1.rev);
    expect(l2).toHaveLength(2); // v1 still present — append-only
    expect(l2[0]).toEqual(v1);
  });

  it("throws when deleting an already-deleted note", () => {
    const { log: l1, record: v1 } = freshNote();
    const { log: l2 } = appendDelete(l1, v1.logicalId, { lastEditor: alice, modifiedAt: t0 });
    expect(() => appendDelete(l2, v1.logicalId, { lastEditor: alice, modifiedAt: t0 })).toThrow();
  });

  it("throws when editing a tombstoned note (resurrection not defined in v1)", () => {
    const { log: l1, record: v1 } = freshNote();
    const { log: l2 } = appendDelete(l1, v1.logicalId, { lastEditor: alice, modifiedAt: t0 });
    expect(() => appendEdit(l2, v1.logicalId, { lastEditor: alice, modifiedAt: t0 })).toThrow();
  });
});

describe("linearHead", () => {
  it("returns the tip of a linear chain", () => {
    const { log: l1, record: v1 } = freshNote();
    const { log: l2 } = appendEdit(l1, v1.logicalId, { body: { type: "TextualBody", value: "v2" }, lastEditor: alice, modifiedAt: t0 });
    expect(linearHead(l2, v1.logicalId).version).toBe(2);
  });
});

describe("Q-6: the log tolerates plural-head collisions assembled directly", () => {
  // THIS TEST FAILS THE RENUMBERING MODEL. Two concurrent v2 edits from a common v1
  // both legitimately claim {logicalId}/v2. The log must NOT reject this — renumbering
  // would break citation integrity. linearHead must refuse to pick a single head.
  it("accepts two records sharing (logicalId, version) with distinct revs, and refuses to resolve a head", () => {
    const { log: l1, record: v1 } = freshNote();
    const lid = v1.logicalId;
    // Both concurrent edits claim citation-version 2 and descend from v1.rev, but each has
    // its OWN rev — the DAG stays collision-free (ADR-0003 Refinement) while the citation
    // id {lid}/v2 legitimately collides (resolved at serialization, Q-6).
    const concurrentA: AnnotationRecord = { logicalId: lid, rev: mintRevId(), version: 2, parent: v1.rev, modifiedAt: "2026-05-24T11:00:00.000Z", lastEditor: alice, deleted: false, target, body: { type: "TextualBody", value: "Alice v2" } };
    const concurrentB: AnnotationRecord = { logicalId: lid, rev: mintRevId(), version: 2, parent: v1.rev, modifiedAt: "2026-05-24T11:05:00.000Z", lastEditor: bob, deleted: false, target, body: { type: "TextualBody", value: "Bob v2" } };
    expect(concurrentA.rev).not.toBe(concurrentB.rev);
    const merged = append(append(l1, concurrentA), concurrentB);
    expect(merged).toHaveLength(3); // accepted, NOT renumbered away (citation integrity, Q-6)
    expect(concurrentA.version).toBe(concurrentB.version); // same citation version int
    expect(() => linearHead(merged, lid)).toThrow(/plural head/i); // cannot pick one
  });
});
