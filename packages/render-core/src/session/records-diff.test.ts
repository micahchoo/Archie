import { describe, it, expect } from "vitest";
import { emptyDiff, isEmptyDiff, reverseRecordsDiff, squashRecordDiffsMutable, type RecordsDiff } from "./records-diff.js";

// The four squash collapses named in tldraw's RecordsDiff.ts are the reason this is not a
// concatenation; each gets its own case, because getting one wrong makes an undo stack apply a
// change that never happened.

type R = { id: string; v: number };
type D = RecordsDiff<string, R>;

const added = (...rs: R[]): D => ({ ...emptyDiff<string, R>(), added: Object.fromEntries(rs.map((r) => [r.id, r])) });
const removed = (...rs: R[]): D => ({ ...emptyDiff<string, R>(), removed: Object.fromEntries(rs.map((r) => [r.id, r])) });
const updated = (id: string, from: R, to: R): D => ({ ...emptyDiff<string, R>(), updated: { [id]: [from, to] } });

const a1 = { id: "a", v: 1 };
const a2 = { id: "a", v: 2 };
const a3 = { id: "a", v: 3 };

describe("reverseRecordsDiff", () => {
  it("swaps added/removed and flips every update tuple", () => {
    const d: D = { added: { a: a1 }, updated: { b: [{ id: "b", v: 1 }, { id: "b", v: 2 }] }, removed: { c: { id: "c", v: 9 } } };
    const r = reverseRecordsDiff(d);
    expect(r.added).toEqual({ c: { id: "c", v: 9 } });
    expect(r.removed).toEqual({ a: a1 });
    expect(r.updated["b"]).toEqual([{ id: "b", v: 2 }, { id: "b", v: 1 }]);
  });

  it("is its own inverse", () => {
    const d: D = { added: { a: a1 }, updated: { b: [{ id: "b", v: 1 }, { id: "b", v: 2 }] }, removed: { c: { id: "c", v: 9 } } };
    expect(reverseRecordsDiff(reverseRecordsDiff(d))).toEqual(d);
  });

  it("does not mutate its input (the undo stack keeps holding the forward diff)", () => {
    const d = added(a1);
    reverseRecordsDiff(d);
    expect(d).toEqual(added(a1));
  });
});

describe("squashRecordDiffsMutable", () => {
  it("added then updated stays an add, carrying the final state", () => {
    const t = emptyDiff<string, R>();
    squashRecordDiffsMutable(t, [added(a1), updated("a", a1, a2)]);
    expect(t.added).toEqual({ a: a2 });
    expect(isEmptyDiff({ ...t, added: {} })).toBe(true);
  });

  it("added then removed cancels entirely", () => {
    const t = emptyDiff<string, R>();
    squashRecordDiffsMutable(t, [added(a1), removed(a1)]);
    expect(isEmptyDiff(t)).toBe(true);
  });

  it("removed then re-added becomes an update from the original to the latest", () => {
    const t = emptyDiff<string, R>();
    squashRecordDiffsMutable(t, [removed(a1), added(a2)]);
    expect(t.updated["a"]).toEqual([a1, a2]);
    expect(t.removed).toEqual({});
    expect(t.added).toEqual({});
  });

  it("chained updates keep the FIRST from and the LAST to", () => {
    const t = emptyDiff<string, R>();
    squashRecordDiffsMutable(t, [updated("a", a1, a2), updated("a", a2, a3)]);
    expect(t.updated["a"]).toEqual([a1, a3]);
  });

  it("updated then removed removes what was there BEFORE the sequence", () => {
    const t = emptyDiff<string, R>();
    squashRecordDiffsMutable(t, [updated("a", a1, a2), removed(a2)]);
    expect(t.removed).toEqual({ a: a1 });
    expect(t.updated).toEqual({});
  });

  it("a squash then its reverse round-trips to the identity of the sequence", () => {
    const t = emptyDiff<string, R>();
    squashRecordDiffsMutable(t, [added(a1), updated("a", a1, a2), updated("a", a2, a3)]);
    expect(t.added).toEqual({ a: a3 });
    expect(reverseRecordsDiff(t).removed).toEqual({ a: a3 });
  });
});
