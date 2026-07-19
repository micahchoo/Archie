// The section rev-log family (Archie-08af) — production tests for structure.ts.
//
// Replicas are modeled as plain arrays exchanged via `mergeLogs` (transport is out of scope).
// Revs are ULIDs minted from (`now`, `rng`); every append gets a DISTINCT `now` so revs are
// unique and their lexicographic order tracks mint order — which is what makes "primary =
// lexicographically-first head" (C12) controllable per test.

import { describe, it, expect } from "vitest";
import { asClientId, asExhibitId } from "../wadm/brand.js";
import { assertSafeName } from "../fs/names.js"; // TEST-ONLY import — the parity drift-detector below
import type { AnnotationLog } from "../wadm/types.js";
import { linearHead } from "./log.js";
import { mergeLogs, headsOf, classifyLogical } from "./merge.js";
import {
  sectionKey,
  localSectionId,
  orderKeyBetween,
  appendNewSection,
  appendEditSection,
  appendDeleteSection,
  appendUndeleteSection,
  resolveSectionConflict,
  projectSections,
  toWorkingSections,
  type SectionLog,
  type SectionKey,
} from "./structure.js";

const alice = asClientId("alice");
const bob = asClientId("bob");
const EX = asExhibitId("ex-test");
const rng = () => 0.5; // deterministic revs (each append passes a distinct `now`)
const keyOf = (id: string) => sectionKey(EX, id);
const liveIds = new Set(["o1", "o2", "o3"]);

/** Three sections sa < sb < sc with sequentially generated order keys. */
function trio(): { log: SectionLog; orders: string[] } {
  let log: SectionLog = [];
  const orders: string[] = [];
  let prev: string | null = null;
  let now = 1000;
  for (const id of ["sa", "sb", "sc"]) {
    const order = orderKeyBetween(prev, null);
    orders.push(order);
    prev = order;
    log = appendNewSection(log, {
      key: keyOf(id), order, objectId: "o1", title: id.toUpperCase(),
      lastEditor: alice, modifiedAt: "t0", now: now++, rng,
    }).log;
  }
  return { log, orders };
}

describe("sectionKey — composed branded identity with containment (#4)", () => {
  it("composes {exhibitId}/{localId} and localSectionId strips back", () => {
    const key = keyOf("s1");
    expect(key).toBe("ex-test/s1");
    expect(localSectionId(key)).toBe("s1");
  });

  // The containment negatives (spec-review debt on the probe): every rejected shape, explicitly.
  it.each([
    ["empty", ""],
    ["dot", "."],
    ["dot-dot", ".."],
    ["slash", "a/b"],
    ["leading slash", "/a"],
    ["trailing slash", "a/"],
    ["backslash", "a\\b"],
    ["NUL", "a\0b"],
  ])("rejects a localId containing %s", (_name, localId) => {
    expect(() => sectionKey(EX, localId)).toThrow(/invalid section localId/);
  });

  it("rejects an exhibitId that would corrupt the key grammar", () => {
    expect(() => sectionKey(asExhibitId("ex/1"), "s1")).toThrow(/invalid exhibitId/);
    expect(() => sectionKey(asExhibitId(".."), "s1")).toThrow(/invalid exhibitId/);
  });

  it("accepts ordinary ids (dots inside, dashes, unicode)", () => {
    expect(localSectionId(sectionKey(EX, "s.1-intro"))).toBe("s.1-intro");
    expect(localSectionId(sectionKey(EX, "sección"))).toBe("sección");
  });

  it("parity: the key-segment guard accepts/rejects EXACTLY like fs/names.ts assertSafeName (drift detector)", () => {
    // structure.ts restates the predicate with domain wording instead of importing it; this
    // table is what keeps the two in step. A vector added to one rule set must be added here.
    const vectors = ["", ".", "..", "/", "\\", "\0", "a/b", "/a", "a/", "a\\b", "a\0b", "..a", "a..", ".hidden", "s.1-ok", "ordinary", "sección"];
    const throws = (fn: () => void) => { try { fn(); return true; } catch { return false; } };
    for (const v of vectors) {
      expect(throws(() => sectionKey(EX, v)), `vector ${JSON.stringify(v)}`).toBe(throws(() => assertSafeName(v)));
    }
  });
});

describe("orderKeyBetween — base-36 fractional midpoint (#3)", () => {
  it("seeds and stays strictly between open bounds", () => {
    const first = orderKeyBetween(null, null);
    expect(first).toBe("i");
    const after = orderKeyBetween(first, null);
    const before = orderKeyBetween(null, first);
    const mid = orderKeyBetween(first, after);
    expect(before < first && first < mid && mid < after).toBe(true);
  });

  it("rejects equal or inverted bounds", () => {
    expect(() => orderKeyBetween("5", "5")).toThrow(/>=/);
    expect(() => orderKeyBetween("6", "5")).toThrow(/>=/);
  });

  it("property: 50-deep dense inserts stay strictly between and never end in '0' (both squeeze directions)", () => {
    const first = orderKeyBetween(null, null);
    const after = orderKeyBetween(first, null);
    // Squeeze upward: raise the lower bound 50 times against a fixed ceiling.
    let lo = first;
    for (let i = 0; i < 50; i++) {
      const k = orderKeyBetween(lo, after);
      expect(lo < k && k < after).toBe(true);
      expect(k.endsWith("0")).toBe(false);
      lo = k;
    }
    // Squeeze downward: lower the upper bound 50 times against a fixed floor.
    let hi = after;
    for (let i = 0; i < 50; i++) {
      const k = orderKeyBetween(first, hi);
      expect(first < k && k < hi).toBe(true);
      expect(k.endsWith("0")).toBe(false);
      hi = k;
    }
  });

  it("property: keys generated at random slots sort a growing list correctly", () => {
    // Deterministic LCG so the test is reproducible.
    let seed = 42;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const keys: string[] = [orderKeyBetween(null, null)];
    for (let i = 0; i < 200; i++) {
      const at = Math.floor(rand() * (keys.length + 1));
      const a = at === 0 ? null : keys[at - 1]!;
      const b = at === keys.length ? null : keys[at]!;
      const k = orderKeyBetween(a, b);
      if (a !== null) expect(a < k).toBe(true);
      if (b !== null) expect(k < b).toBe(true);
      expect(k.endsWith("0")).toBe(false);
      keys.splice(at, 0, k);
    }
    expect([...keys].sort()).toEqual(keys);
  });
});

describe("append family — single-writer invariants", () => {
  it("appendNewSection appends a v1 DAG root and refuses a duplicate key", () => {
    const { record, log } = appendNewSection([], {
      key: keyOf("s1"), order: "i", objectId: "o1", title: "One",
      start: "xywh=pixel:0,0,10,10", prose: "p", lastEditor: alice, modifiedAt: "t1", now: 2000, rng,
    });
    expect(record).toMatchObject({ logicalId: keyOf("s1"), version: 1, parent: null, deleted: false });
    expect(log).toHaveLength(1);
    expect(() => appendNewSection(log, {
      key: keyOf("s1"), order: "j", objectId: "o1", title: "Dup", lastEditor: alice, now: 2001, rng,
    })).toThrow(/already exists/);
  });

  it("appendEditSection carries content forward, clears via null, and bumps version/parent", () => {
    let { log } = appendNewSection([], {
      key: keyOf("s1"), order: "i", objectId: "o1", title: "One",
      start: "xywh=pixel:0,0,10,10", prose: "p", lastEditor: alice, modifiedAt: "t1", now: 2100, rng,
    });
    const v1 = log[0]!;
    const { record: v2, log: log2 } = appendEditSection(log, keyOf("s1"), {
      title: "One (renamed)", start: null, lastEditor: bob, modifiedAt: "t2", now: 2101, rng,
    });
    log = log2;
    expect(v2.version).toBe(2);
    expect(v2.parent).toBe(v1.rev);
    expect(v2.title).toBe("One (renamed)");
    expect(v2.order).toBe("i"); // carried forward
    expect(v2.objectId).toBe("o1"); // carried forward
    expect(v2.prose).toBe("p"); // carried forward
    expect("start" in v2).toBe(false); // null = clear
    expect(linearHead(log, keyOf("s1"))).toBe(v2);
  });

  it("a reorder is an ordinary content edit (order is a child-carried content field, #3)", () => {
    const { log, orders } = trio();
    const moved = orderKeyBetween(orders[2]!, null);
    const { record } = appendEditSection(log, keyOf("sa"), { order: moved, lastEditor: alice, now: 2200, rng });
    expect(record.order).toBe(moved);
    expect(record.title).toBe("SA"); // everything else carried
  });

  it("editing or deleting requires a single resolved head (C4)", () => {
    const { log } = trio();
    const a = appendEditSection(log, keyOf("sa"), { title: "A", lastEditor: alice, now: 2300, rng }).log;
    const b = appendEditSection(log, keyOf("sa"), { title: "B", lastEditor: bob, now: 2301, rng }).log;
    const merged = mergeLogs(a, b);
    expect(() => appendEditSection(merged, keyOf("sa"), { title: "C", lastEditor: alice, now: 2302, rng })).toThrow(/plural heads/);
    expect(() => appendDeleteSection(merged, keyOf("sa"), { lastEditor: alice, now: 2303, rng })).toThrow(/plural heads/);
  });

  it("delete refuses a double-delete; edit refuses a tombstoned head; undelete refuses a live head", () => {
    let { log } = trio();
    log = appendDeleteSection(log, keyOf("sb"), { lastEditor: alice, modifiedAt: "td", now: 2400, rng }).log;
    expect(() => appendDeleteSection(log, keyOf("sb"), { lastEditor: alice, now: 2401, rng })).toThrow(/already deleted/);
    expect(() => appendEditSection(log, keyOf("sb"), { title: "x", lastEditor: alice, now: 2402, rng })).toThrow(/tombstoned/);
    expect(() => appendUndeleteSection(log, keyOf("sa"), { lastEditor: alice, now: 2403, rng })).toThrow(/not deleted/);
  });
});

describe("tombstone-carry and first-class un-delete (#6)", () => {
  it("un-delete deep-equals the pre-delete content — ONE lossless append, no parent-walk", () => {
    let { log } = trio();
    log = appendEditSection(log, keyOf("sb"), {
      objectId: "o2", start: "t=3,9", prose: "full content", lastEditor: alice, modifiedAt: "t1", now: 3000, rng,
    }).log;
    const before = projectSections(log, liveIds).sections.find((p) => p.key === keyOf("sb"))!;

    log = appendDeleteSection(log, keyOf("sb"), { lastEditor: bob, modifiedAt: "td", now: 3001, rng }).log;
    const tombstone = linearHead(log, keyOf("sb"));
    expect(tombstone.deleted).toBe(true);
    // The tombstone CARRIES content — the divergence from annotation _deleteCarry, on purpose.
    expect(tombstone.title).toBe("SB");
    expect(tombstone.prose).toBe("full content");
    const deleted = projectSections(log, liveIds);
    expect(deleted.sections.map((p) => p.section.id)).toEqual(["sa", "sc"]); // omitted, not errored
    expect(deleted.tombstoned.has(keyOf("sb"))).toBe(true); // the hide-by-ancestry set

    log = appendUndeleteSection(log, keyOf("sb"), { lastEditor: bob, modifiedAt: "tu", now: 3002, rng }).log;
    const revived = projectSections(log, liveIds).sections.find((p) => p.key === keyOf("sb"))!;
    expect(revived.section).toEqual(before.section); // deep-equal working shape
    expect(revived.order).toBe(before.order); // order key survives the round-trip too
    expect(projectSections(log, liveIds).sections.map((p) => p.section.id)).toEqual(["sa", "sb", "sc"]);
    expect(linearHead(log, keyOf("sb")).version).toBe(4); // create, edit, delete, undelete
  });
});

describe("convergence — replicas as plain arrays exchanged via mergeLogs", () => {
  it("concurrent reorder of the SAME section: identical projections in BOTH merge directions, then one resolution converges both", () => {
    const { log: base, orders } = trio();
    // alice moves sa after sc; bob moves sa between sb and sc — a real DAG conflict on `order`.
    const rA = appendEditSection(base, keyOf("sa"), { order: orderKeyBetween(orders[2]!, null), lastEditor: alice, modifiedAt: "tA", now: 4000, rng }).log;
    const rB = appendEditSection(base, keyOf("sa"), { order: orderKeyBetween(orders[1]!, orders[2]!), lastEditor: bob, modifiedAt: "tB", now: 4001, rng }).log;

    const mergedAB = mergeLogs(rA, rB);
    const mergedBA = mergeLogs(rB, rA);
    const projAB = projectSections(mergedAB, liveIds);
    const projBA = projectSections(mergedBA, liveIds);

    // Pre-resolution: plural live heads project honestly (two rows for sa, flagged conflicted),
    // and BOTH replicas produce the IDENTICAL row sequence regardless of merge direction.
    expect(projAB.sections.map((p) => [p.key, p.rev])).toEqual(projBA.sections.map((p) => [p.key, p.rev]));
    expect(projAB.sections.filter((p) => p.conflicted).map((p) => p.section.id)).toEqual(["sa", "sa"]);
    expect(headsOf(mergedAB, keyOf("sa"))).toHaveLength(2);
    expect(classifyLogical(rA, rB, keyOf("sa")).kind).toBe("conflict");

    // One replica resolves (multi-parent merge node); the other merges the resolution in.
    const resolved = resolveSectionConflict(mergedAB, keyOf("sa"), { lastEditor: alice, modifiedAt: "tR", now: 4002, rng });
    const other = mergeLogs(mergedBA, resolved);
    expect(headsOf(resolved, keyOf("sa"))).toHaveLength(1);
    expect(headsOf(other, keyOf("sa"))).toHaveLength(1);
    expect(projectSections(other, liveIds).sections.map((p) => [p.key, p.rev]))
      .toEqual(projectSections(resolved, liveIds).sections.map((p) => [p.key, p.rev]));
    expect(linearHead(other, keyOf("sa")).order).toBe(linearHead(resolved, keyOf("sa")).order);
    expect(projectSections(other, liveIds).sections.every((p) => !p.conflicted)).toBe(true);
  });

  it("equal-key concurrent inserts converge via the id tiebreak in both merge directions (#3)", () => {
    const { log: base, orders } = trio();
    const between = orderKeyBetween(orders[0]!, orders[1]!); // both replicas compute the SAME slot key
    const rA = appendNewSection(base, { key: keyOf("ins-alice"), order: between, objectId: "o1", title: "A's", lastEditor: alice, modifiedAt: "t", now: 4100, rng }).log;
    const rB = appendNewSection(base, { key: keyOf("ins-bob"), order: between, objectId: "o1", title: "B's", lastEditor: bob, modifiedAt: "t", now: 4101, rng }).log;
    const seqAB = projectSections(mergeLogs(rA, rB), liveIds).sections.map((p) => p.section.id);
    const seqBA = projectSections(mergeLogs(rB, rA), liveIds).sections.map((p) => p.section.id);
    expect(seqAB).toEqual(seqBA); // merge order does not matter
    expect(seqAB).toEqual(["sa", "ins-alice", "ins-bob", "sb", "sc"]); // equal order keys → key (id) tiebreak
  });

  it("delete-vs-edit is a real, part-hidden conflict (C15): one live row, flagged, resolvable to live", () => {
    const { log: base } = trio();
    const rA = appendDeleteSection(base, keyOf("sc"), { lastEditor: alice, modifiedAt: "tA", now: 4200, rng }).log;
    const rB = appendEditSection(base, keyOf("sc"), { title: "SC edited", lastEditor: bob, modifiedAt: "tB", now: 4201, rng }).log;
    const merged = mergeLogs(rA, rB);
    expect(headsOf(merged, keyOf("sc"))).toHaveLength(2);
    const proj = projectSections(merged, liveIds);
    const scRows = proj.sections.filter((p) => p.key === keyOf("sc"));
    expect(scRows).toHaveLength(1); // the tombstone head is hidden — only the live edit shows
    expect(scRows[0]!.conflicted).toBe(true); // …but writes are gated (C4), so the row says so
    expect(proj.tombstoned.has(keyOf("sc"))).toBe(false); // not fully tombstoned

    const resolved = resolveSectionConflict(merged, keyOf("sc"), { lastEditor: alice, modifiedAt: "tR", now: 4202, rng });
    const head = linearHead(resolved, keyOf("sc"));
    expect(head.deleted).toBe(false); // resolution is live always; resolve-then-delete is the path
    expect(head.title).toBeTruthy(); // section tombstones carry content, so even a tombstone primary contributes (no OQ-3 hole)
  });
});

describe("resolveSectionConflict — the ONE merge contract, section fields (C12/C13/C14)", () => {
  /** Base with one section (no prose), then: bob (earlier now → primary) edits title, alice adds prose. */
  function conflictedPair() {
    const base = appendNewSection([], {
      key: keyOf("s1"), order: "i", objectId: "o1", title: "Original", lastEditor: alice, modifiedAt: "t0", now: 5000, rng,
    }).log;
    const rBob = appendEditSection(base, keyOf("s1"), { title: "Bob's title", objectId: "o2", lastEditor: bob, modifiedAt: "tB", now: 5001, rng }).log;
    const rAlice = appendEditSection(base, keyOf("s1"), { prose: "Alice's prose", lastEditor: alice, modifiedAt: "tA", now: 5002, rng }).log;
    return { merged: mergeLogs(rAlice, rBob), bobRev: linearHead(rBob, keyOf("s1")).rev };
  }

  it("throws when there is no conflict", () => {
    const { log } = trio();
    expect(() => resolveSectionConflict(log, keyOf("sa"), { lastEditor: alice, now: 5100, rng })).toThrow(/no conflict/);
  });

  it("appends a deterministic multi-parent merge node: primary = lexicographically-first head, version = max + 1", () => {
    const { merged, bobRev } = conflictedPair();
    const resolved = resolveSectionConflict(merged, keyOf("s1"), { lastEditor: alice, modifiedAt: "tR", now: 5200, rng });
    const node = linearHead(resolved, keyOf("s1"));
    expect(node.parent).toBe(bobRev); // bob's rev minted earlier → sorts first → primary
    expect(node.mergeParents).toHaveLength(1);
    expect(node.version).toBe(3); // max(2, 2) + 1
    expect(node.deleted).toBe(false);
  });

  it("C13: omitted required fields default to the PRIMARY head; C14: optional fields inherit from ANY head", () => {
    const { merged } = conflictedPair();
    const node = linearHead(resolveSectionConflict(merged, keyOf("s1"), { lastEditor: alice, now: 5300, rng }), keyOf("s1"));
    expect(node.title).toBe("Bob's title"); // required → primary's (bob)
    expect(node.objectId).toBe("o2"); // required → primary's (bob)
    expect(node.prose).toBe("Alice's prose"); // optional → inherited from the head that carries it
  });

  it("C14 determinism: when BOTH heads carry different optional values, the lexicographically-first carrier wins", () => {
    const base = appendNewSection([], {
      key: keyOf("s1"), order: "i", objectId: "o1", title: "Original", lastEditor: alice, modifiedAt: "t0", now: 6100, rng,
    }).log;
    // bob's rev is minted earlier → sorts first → the deterministic carrier for BOTH fields.
    const rBob = appendEditSection(base, keyOf("s1"), { prose: "Bob's prose", start: "t=1,2", lastEditor: bob, modifiedAt: "tB", now: 6101, rng }).log;
    const rAlice = appendEditSection(base, keyOf("s1"), { prose: "Alice's prose", start: "t=3,4", lastEditor: alice, modifiedAt: "tA", now: 6102, rng }).log;
    const node = linearHead(resolveSectionConflict(mergeLogs(rAlice, rBob), keyOf("s1"), { lastEditor: alice, now: 6103, rng }), keyOf("s1"));
    expect(node.prose).toBe("Bob's prose"); // NOT alice's — sorted-first carrier, not merge order
    expect(node.start).toBe("t=1,2");
  });

  it("explicit resolution content wins over every default", () => {
    const { merged } = conflictedPair();
    const node = linearHead(resolveSectionConflict(merged, keyOf("s1"), {
      title: "Chosen", objectId: "o3", order: "q", prose: "Chosen prose", start: "t=1,2", lastEditor: alice, now: 5400, rng,
    }), keyOf("s1"));
    expect(node).toMatchObject({ title: "Chosen", objectId: "o3", order: "q", prose: "Chosen prose", start: "t=1,2" });
  });
});

describe("projection — ordered working Section[] with tolerance (#5)", () => {
  it("projects (order asc, key asc) rows in the working Section shape, each row carrying its head's order key", () => {
    const { log, orders } = trio();
    const proj = projectSections(log, liveIds);
    expect(proj.sections.map((p) => p.order)).toEqual(orders); // the row exposes the head's order key
    expect(toWorkingSections(proj)).toEqual([
      { id: "sa", title: "SA", objectId: "o1" },
      { id: "sb", title: "SB", objectId: "o1" },
      { id: "sc", title: "SC", objectId: "o1" },
    ]);
    expect(proj.sections.every((p) => !p.conflicted && !p.missingObject)).toBe(true);
  });

  it("a dangling objectId projects missingObject: true — flagged, never a throw, reference kept raw", () => {
    let { log } = trio();
    log = appendEditSection(log, keyOf("sb"), { objectId: "ghost", lastEditor: alice, modifiedAt: "tg", now: 6000, rng }).log;
    const proj = projectSections(log, liveIds); // no throw
    const sb = proj.sections.find((p) => p.key === keyOf("sb"))!;
    expect(sb.missingObject).toBe(true);
    expect(sb.section.objectId).toBe("ghost"); // kept raw for repair, not erased or remapped
    expect(proj.sections.filter((p) => p.missingObject)).toHaveLength(1); // everyone else untouched
  });

  it("is pure and idempotent — projecting twice yields deep-equal results and never touches the log", () => {
    const { log } = trio();
    const len = log.length;
    expect(projectSections(log, liveIds)).toEqual(projectSections(log, liveIds));
    expect(log).toHaveLength(len);
  });
});

describe("type gates — SectionKey and AnnotationLog stay disjoint (consumed @ts-expect-error)", () => {
  it("a SectionKey cannot be passed where an annotation log expects a LogicalId", () => {
    const annLog: AnnotationLog = [];
    const sKey: SectionKey = keyOf("s1");
    // @ts-expect-error — annotation logs remain keyed by LogicalId, exactly as strict as before
    const call = () => linearHead(annLog, sKey);
    expect(call).toThrow(/no such note/); // runtime shape identical; the line above is the type gate
  });
});
