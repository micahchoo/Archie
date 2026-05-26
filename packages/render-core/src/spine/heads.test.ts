import { describe, it, expect } from "vitest";
import { appendNew, appendEdit, appendDelete, append } from "./log.js";
import { projectHeads } from "./heads.js";
import { asClientId, mintRevId } from "../wadm/brand.js";
import type { AnnotationRecord } from "../wadm/types.js";

// Heads projection (ADR-0003 / Q-3): a pure, idempotent function of the append-only log
// yielding the head version(s) per logicalId — the current state viewers render. Plural
// after an unresolved concurrent merge (honest degradation); tombstoned notes are omitted.

const alice = asClientId("alice");
const bob = asClientId("bob");
const target = "https://example.org/canvas/1";
const t = "2026-05-24T10:00:00.000Z";

describe("projectHeads (Q-3)", () => {
  it("projects a single live note to its only head", () => {
    const { log, record } = appendNew([], { target, body: { type: "TextualBody", value: "x" }, lastEditor: alice, modifiedAt: t, now: 1 });
    expect(projectHeads(log).map((r) => r.rev)).toEqual([record.rev]);
  });

  it("projects an edited chain to the LATEST version only (not history)", () => {
    const { log: l1, record: v1 } = appendNew([], { target, lastEditor: alice, modifiedAt: t, now: 1 });
    const { log: l2 } = appendEdit(l1, v1.logicalId, { body: { type: "TextualBody", value: "v2" }, lastEditor: alice, modifiedAt: t, now: 2 });
    const { log: l3, record: v3 } = appendEdit(l2, v1.logicalId, { body: { type: "TextualBody", value: "v3" }, lastEditor: alice, modifiedAt: t, now: 3 });
    const heads = projectHeads(l3);
    expect(heads).toHaveLength(1);
    expect(heads[0]!.rev).toBe(v3.rev);
    expect(heads[0]!.version).toBe(3);
  });

  it("omits a tombstoned note (a deleted note shows nothing)", () => {
    const { log: l1, record: v1 } = appendNew([], { target, lastEditor: alice, modifiedAt: t, now: 1 });
    const { log: l2 } = appendDelete(l1, v1.logicalId, { lastEditor: alice, modifiedAt: t, now: 2 });
    expect(projectHeads(l2)).toHaveLength(0);
  });

  it("projects PLURAL heads after an unresolved concurrent merge (honest degradation)", () => {
    const { log: base, record: v1 } = appendNew([], { target, lastEditor: alice, modifiedAt: t, now: 1 });
    const a: AnnotationRecord = { logicalId: v1.logicalId, rev: mintRevId(), version: 2, parent: v1.rev, modifiedAt: t, lastEditor: alice, deleted: false, target, body: { type: "TextualBody", value: "Alice" } };
    const b: AnnotationRecord = { logicalId: v1.logicalId, rev: mintRevId(), version: 2, parent: v1.rev, modifiedAt: t, lastEditor: bob, deleted: false, target, body: { type: "TextualBody", value: "Bob" } };
    const heads = projectHeads(append(append(base, a), b));
    expect(heads).toHaveLength(2);
    expect(new Set(heads.map((r) => r.rev))).toEqual(new Set([a.rev, b.rev]));
  });

  it("in a concurrent edit-vs-delete, the live head shows and the tombstone head does not", () => {
    const { log: base, record: v1 } = appendNew([], { target, lastEditor: alice, modifiedAt: t, now: 1 });
    const liveEdit: AnnotationRecord = { logicalId: v1.logicalId, rev: mintRevId(), version: 2, parent: v1.rev, modifiedAt: t, lastEditor: alice, deleted: false, target, body: { type: "TextualBody", value: "Alice kept it" } };
    const tomb: AnnotationRecord = { logicalId: v1.logicalId, rev: mintRevId(), version: 2, parent: v1.rev, modifiedAt: t, lastEditor: bob, deleted: true, target };
    const heads = projectHeads(append(append(base, liveEdit), tomb));
    expect(heads.map((r) => r.rev)).toEqual([liveEdit.rev]);
  });

  it("projects each live note across multiple notes", () => {
    const { log: l1 } = appendNew([], { target, body: { type: "TextualBody", value: "n1" }, lastEditor: alice, modifiedAt: t, now: 1 });
    const { log: l2, record: n2 } = appendNew(l1, { target, body: { type: "TextualBody", value: "n2" }, lastEditor: alice, modifiedAt: t, now: 2 });
    const { log: l3 } = appendDelete(l2, n2.logicalId, { lastEditor: alice, modifiedAt: t, now: 3 }); // delete n2
    const heads = projectHeads(l3);
    expect(heads).toHaveLength(1); // only n1 survives
  });

  it("is idempotent: projecting the heads again yields the same heads", () => {
    const { log: base, record: v1 } = appendNew([], { target, lastEditor: alice, modifiedAt: t, now: 1 });
    const a: AnnotationRecord = { logicalId: v1.logicalId, rev: mintRevId(), version: 2, parent: v1.rev, modifiedAt: t, lastEditor: alice, deleted: false, target };
    const b: AnnotationRecord = { logicalId: v1.logicalId, rev: mintRevId(), version: 2, parent: v1.rev, modifiedAt: t, lastEditor: bob, deleted: false, target };
    const { log: l2 } = appendNew(append(append(base, a), b), { target, body: { type: "TextualBody", value: "other" }, lastEditor: alice, modifiedAt: t, now: 9 });
    const once = projectHeads(l2);
    const twice = projectHeads(once); // AnnotationRecord[] is assignable to AnnotationLog
    expect(twice).toEqual(once);
  });
});
