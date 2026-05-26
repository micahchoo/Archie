import { describe, it, expect } from "vitest";
import { appendNew, appendEdit, appendDelete, append } from "./log.js";
import { toHistory } from "./serialize.js";
import { fromHistory, fromHistoryPage } from "./deserialize.js";
import { asClientId, mintRevId } from "../wadm/brand.js";
import type { AnnotationLog, AnnotationRecord } from "../wadm/types.js";

// deserialize = inverse of serialize (ADR-0003 reload/merge load path). The full DAG is
// reconstructed from the history pages (which carry archie: metadata), NOT the heads page.

const alice = asClientId("alice");
const bob = asClientId("bob");
const target = "https://example.org/canvas/1";
const base = "https://u.gh.io/lib/ex/";

function sortByRev(log: AnnotationLog): AnnotationRecord[] {
  return [...log].sort((a, b) => (a.rev < b.rev ? -1 : a.rev > b.rev ? 1 : 0));
}

/** A log exercising: multi-version chain, a tombstone, a second note, and a concurrent pair. */
function richLog(): AnnotationLog {
  const { log: l1, record: v1 } = appendNew([], { target, body: { type: "TextualBody", value: "v1" }, lastEditor: alice, modifiedAt: "2026-05-24T10:00:00.000Z", now: 1 });
  const { log: l2 } = appendEdit(l1, v1.logicalId, { body: { type: "TextualBody", value: "v2" }, lastEditor: bob, modifiedAt: "2026-05-24T11:00:00.000Z", now: 2 });
  const { log: l3, record: n2 } = appendNew(l2, { target, body: { type: "TextualBody", value: "note2" }, motivation: "commenting", lastEditor: alice, modifiedAt: "2026-05-24T12:00:00.000Z", now: 3 });
  const { log: l4 } = appendDelete(l3, n2.logicalId, { lastEditor: alice, modifiedAt: "2026-05-24T13:00:00.000Z", now: 4 });
  // a concurrent pair on a third note (plural heads)
  const { log: l5, record: v1c } = appendNew(l4, { target, body: { type: "TextualBody", value: "c1" }, lastEditor: alice, modifiedAt: "t", now: 5 });
  const cA: AnnotationRecord = { logicalId: v1c.logicalId, rev: mintRevId(0, () => 0.3), version: 2, parent: v1c.rev, modifiedAt: "tA", lastEditor: alice, deleted: false, target, body: { type: "TextualBody", value: "A" } };
  const cB: AnnotationRecord = { logicalId: v1c.logicalId, rev: mintRevId(0, () => 0.7), version: 2, parent: v1c.rev, modifiedAt: "tB", lastEditor: bob, deleted: false, target, body: { type: "TextualBody", value: "B" } };
  return append(append(l5, cA), cB);
}

describe("fromHistory — reconstruct the full log from history pages (the reload path)", () => {
  it("round-trips a rich log losslessly (log -> toHistory -> fromHistory == log)", () => {
    const log = richLog();
    const { pages } = toHistory(log, { baseUrl: base });
    const reloaded = fromHistory(Object.values(pages));
    expect(sortByRev(reloaded)).toEqual(sortByRev(log));
  });

  it("preserves tombstones, parents (as rev), versions, lastEditor, and motivation", () => {
    const { log: l1, record: v1 } = appendNew([], { target, body: { type: "TextualBody", value: "x" }, motivation: "commenting", lastEditor: alice, modifiedAt: "t", now: 1 });
    const { log } = appendDelete(l1, v1.logicalId, { lastEditor: bob, modifiedAt: "t2", now: 2 });
    const { pages } = toHistory(log, { baseUrl: base });
    const recs = sortByRev(fromHistory(Object.values(pages)));
    const tomb = recs.find((r) => r.deleted)!;
    expect(tomb.deleted).toBe(true);
    expect(tomb.parent).toBe(v1.rev); // parent reconstructed as a RevId
    expect(tomb.version).toBe(2);
    expect(tomb.lastEditor).toBe("bob");
    const root = recs.find((r) => r.parent === null)!;
    expect(root.motivation).toBe("commenting");
  });

  it("preserves concurrent plural-head records (distinct revs, same version)", () => {
    const log = richLog();
    const { pages } = toHistory(log, { baseUrl: base });
    const reloaded = fromHistory(Object.values(pages));
    // find a logicalId with two version-2 heads
    const byLogical = new Map<string, AnnotationRecord[]>();
    for (const r of reloaded) (byLogical.get(r.logicalId) ?? byLogical.set(r.logicalId, []).get(r.logicalId)!).push(r);
    const plural = [...byLogical.values()].find((rs) => rs.filter((r) => r.version === 2).length === 2);
    expect(plural).toBeDefined();
  });

  it("fromHistoryPage ignores annotations lacking archie metadata (a pure-WADM page)", () => {
    const pureWadmPage = { type: "AnnotationPage" as const, id: "p", items: [{ id: "x", type: "Annotation" as const, target }] };
    expect(fromHistoryPage(pureWadmPage)).toEqual([]);
  });
});
