import { describe, it, expect } from "vitest";
import { appendNew, appendEdit, appendDelete, append } from "./log.js";
import { toHistory } from "./serialize.js";
import { fromHistory, fromHistoryPage } from "./deserialize.js";
import { asClientId, mintRevId } from "../wadm/brand.js";
import { tagsOf } from "../query/filter.js";
import type { AnnotationLog, AnnotationRecord, W3CAnnotation, W3CAnnotationPage, W3CBody } from "../wadm/types.js";

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

// ADR-0007 back-compat (A3 contraction): OLD persisted history JSON carrying `archie:layers`
// must, on LOAD, fold those layer values into Tags (purpose:tagging bodies) losslessly and drop
// `layers` — so no information is lost and no live reader past the load boundary ever sees the
// retired field. The fold is wired into recordFromHistoryAnnotation, so EVERY load path (OPFS
// reload, working-library cold-read, ZIP import — all funnel through fromHistory) inherits it.
describe("ADR-0007: legacy archie:layers folds into Tags on load (back-compat)", () => {
  // Valid 26-char Crockford-base32 ULIDs (the id grammar asLogicalId/asRevId enforce).
  const OLD_LOGICAL = "01HZZZZZZZZZZZZZZZZZZZZZZA";
  const OLD_REV = "01HZZZZZZZZZZZZZZZZZZZZZZB";

  /** A hand-authored OLD-format history page, exactly as a pre-contraction Archie wrote it. */
  function legacyPage(layers: string[], extraBodies: W3CBody[] = []): W3CAnnotationPage {
    return {
      type: "AnnotationPage",
      id: `annotations/history/${OLD_LOGICAL}.json`,
      items: [
        {
          id: `${base}${OLD_LOGICAL}/v1`,
          type: "Annotation",
          target,
          modified: "2026-05-01T00:00:00.000Z",
          body: [{ type: "TextualBody", value: "a legacy comment" }, ...extraBodies],
          "archie:logicalId": OLD_LOGICAL,
          "archie:rev": OLD_REV,
          "archie:version": 1,
          "archie:lastEditor": "alice",
          "archie:parent": null,
          "archie:layers": layers,
        } as unknown as W3CAnnotation,
      ],
    };
  }

  it("folds every legacy layer into a purpose:tagging body and drops `layers` (no data loss)", () => {
    const [rec] = fromHistory([legacyPage(["conservation", "iconography"])]);
    expect(rec).toBeDefined();
    expect((rec as { layers?: string[] }).layers).toBeUndefined();
    expect(tagsOf(rec!).sort()).toEqual(["conservation", "iconography"]);
    // the original comment body survives alongside the new tag bodies
    const bodies = Array.isArray(rec!.body) ? rec!.body : [rec!.body];
    expect(bodies.some((b) => (b as { value?: string }).value === "a legacy comment")).toBe(true);
  });

  it("does not duplicate a layer that is already present as a tag", () => {
    const [rec] = fromHistory([legacyPage(["ink", "gold"], [{ type: "TextualBody", value: "ink", purpose: "tagging" }])]);
    expect(tagsOf(rec!).sort()).toEqual(["gold", "ink"]); // 'ink' appears once
    expect((rec as { layers?: string[] }).layers).toBeUndefined();
  });

  it("leaves a record with no archie:layers byte-identical (idempotent — modern data untouched)", () => {
    const { log } = appendNew([], { target, body: { type: "TextualBody", value: "modern" }, reading: "cipher", lastEditor: alice, modifiedAt: "t", now: 1 });
    const { pages } = toHistory(log, { baseUrl: base });
    const [rec] = fromHistory(Object.values(pages));
    expect((rec as { layers?: string[] }).layers).toBeUndefined();
    expect(rec!.reading).toBe("cipher"); // reading is unaffected by the fold
    expect(tagsOf(rec!)).toEqual([]); // no spurious tags introduced
  });
});
