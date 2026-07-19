// Headless tests for the structure-log reconcile (Archie-42f3): array-shaped editor mutations →
// rev-log appends, and the working projection the App snapshots into library.json.
import { describe, it, expect } from "vitest";
import { reconcileSections, workingStructure } from "./structure-reconcile.js";
import {
  appendNewSection,
  asClientId,
  asExhibitId,
  mintRevId,
  sectionKey,
  type Section,
  type SectionLog,
  type SectionRecord,
  type SectionStamp,
} from "@render/core";

const ex = asExhibitId("ex1");
const alice = asClientId("alice");
// Deterministic stamps (mintRevId consumes now+rng; a fresh counter per call keeps revs unique + ordered).
let tick = 0;
const stamp = (): SectionStamp => ({ lastEditor: alice, now: ++tick, rng: () => (tick % 97) / 97 });

const sec = (id: string, title: string, objectId = "o1", rest: Partial<Section> = {}): Section => ({ id, title, objectId, ...rest });
const projected = (log: SectionLog) => workingStructure(log, new Set());

describe("reconcileSections — create / edit / reorder / delete / un-delete as appends", () => {
  it("seeds an empty log from a working array and round-trips it (then reconciles idempotently)", () => {
    const next = [sec("a", "Alpha", "o1", { prose: "p1" }), sec("b", "Beta", "o2", { start: "xywh=pixel:1,2,3,4" })];
    const r1 = reconcileSections([], ex, next, stamp());
    expect(r1.changed).toBe(true);
    expect(r1.gated).toEqual([]);
    expect(r1.log).toHaveLength(2); // one v1 root per section
    expect(projected(r1.log).sections).toEqual(next);

    const r2 = reconcileSections(r1.log, ex, next, stamp()); // projection back against its own log
    expect(r2.changed).toBe(false);
    expect(r2.log).toBe(r1.log);
  });

  it("a content edit appends ONE record and lands exactly on the desired working shape (start/prose clear via tri-state)", () => {
    const base = reconcileSections([], ex, [sec("a", "Alpha", "o1", { start: "xywh=pixel:1,2,3,4", prose: "p" })], stamp()).log;
    const want = [sec("a", "Alpha renamed", "o1", { prose: "p2" })]; // start REMOVED, prose changed
    const r = reconcileSections(base, ex, want, stamp());
    expect(r.log).toHaveLength(base.length + 1);
    expect(projected(r.log).sections).toEqual(want);
  });

  it("a single ▲/▼ swap appends ONE order edit (neighbors keep their keys)", () => {
    const base = reconcileSections([], ex, [sec("a", "A"), sec("b", "B"), sec("c", "C")], stamp()).log;
    const want = [sec("a", "A"), sec("c", "C"), sec("b", "B")]; // swap b/c
    const r = reconcileSections(base, ex, want, stamp());
    expect(r.log).toHaveLength(base.length + 1); // exactly one reorder append
    expect(projected(r.log).sections.map((s) => s.id)).toEqual(["a", "c", "b"]);
  });

  it("an insertion between neighbors mints a between-key without touching them", () => {
    const base = reconcileSections([], ex, [sec("a", "A"), sec("b", "B")], stamp()).log;
    const r = reconcileSections(base, ex, [sec("a", "A"), sec("m", "Mid"), sec("b", "B")], stamp());
    expect(r.log).toHaveLength(base.length + 1); // just the new v1 root
    expect(projected(r.log).sections.map((s) => s.id)).toEqual(["a", "m", "b"]);
  });

  it("a removal appends a tombstone: the key leaves the working set and enters `tombstoned`", () => {
    const base = reconcileSections([], ex, [sec("a", "A"), sec("b", "B")], stamp()).log;
    const r = reconcileSections(base, ex, [sec("a", "A")], stamp());
    const ws = projected(r.log);
    expect(ws.sections.map((s) => s.id)).toEqual(["a"]);
    expect([...ws.tombstoned]).toEqual([sectionKey(ex, "b")]);
  });

  it("re-adding a tombstoned id UN-deletes losslessly (content restored from the carried tombstone)", () => {
    const seeded = reconcileSections([], ex, [sec("a", "A"), sec("b", "Beta", "o2", { prose: "kept" })], stamp()).log;
    const afterDelete = reconcileSections(seeded, ex, [sec("a", "A")], stamp()).log;
    // The UI's un-delete shape: the array shows up with the id again, content as it was.
    const r = reconcileSections(afterDelete, ex, [sec("a", "A"), sec("b", "Beta", "o2", { prose: "kept" })], stamp());
    const ws = projected(r.log);
    expect(ws.tombstoned.size).toBe(0);
    expect(ws.sections).toEqual([sec("a", "A"), sec("b", "Beta", "o2", { prose: "kept" })]);
    // One un-delete append restored it — no extra edit needed when content matches the tombstone.
    expect(r.log).toHaveLength(afterDelete.length + 1);
  });
});

describe("reconcileSections — plural-head GATE (merge contract C4)", () => {
  /** A log whose key "a" holds a genuine conflict: two concurrent children of the same v1 root. */
  function conflictedLog(): SectionLog {
    const { log, record: v1 } = appendNewSection([], { key: sectionKey(ex, "a"), order: "i", objectId: "o1", title: "A", ...stamp() });
    const child = (n: number, title: string): SectionRecord => ({
      logicalId: v1.logicalId,
      rev: mintRevId(1000 + n, () => 0.5),
      version: 2,
      parent: v1.rev,
      modifiedAt: "t",
      lastEditor: alice,
      deleted: false,
      order: v1.order,
      objectId: v1.objectId,
      title,
    });
    return [...log, child(1, "A mine"), child(2, "A theirs")];
  }

  it("an edit to a conflicted section is REFUSED (no append) and reported in `gated`", () => {
    const log = conflictedLog();
    const ws = projected(log);
    expect(ws.conflicted).toEqual(new Set(["a"]));
    const r = reconcileSections(log, ex, [sec("a", "A renamed")], stamp());
    expect(r.changed).toBe(false);
    expect(r.log).toBe(log);
    expect(r.gated).toEqual(["a"]);
  });

  it("a delete of a conflicted section is REFUSED (no tombstone) and reported in `gated`", () => {
    const log = conflictedLog();
    const r = reconcileSections(log, ex, [], stamp());
    expect(r.changed).toBe(false);
    expect(r.gated).toEqual(["a"]);
  });

  it("non-conflicted neighbors still reconcile around a gated section", () => {
    const log = conflictedLog();
    const r = reconcileSections(log, ex, [sec("a", "A ignored-rename"), sec("b", "B new")], stamp());
    expect(r.gated).toEqual(["a"]);
    expect(r.log).toHaveLength(log.length + 1); // only b's v1 root appended
    expect(projected(r.log).sections.map((s) => s.id)).toEqual(["a", "b"]);
  });
});

describe("workingStructure — plural heads dedupe to ONE row (keyed {#each} safety)", () => {
  it("emits a single Section per conflicted key and flags it", () => {
    const { log, record: v1 } = appendNewSection([], { key: sectionKey(ex, "a"), order: "i", objectId: "o1", title: "A", ...stamp() });
    const child = (n: number, title: string): SectionRecord => ({
      logicalId: v1.logicalId, rev: mintRevId(1000 + n, () => 0.5), version: 2, parent: v1.rev, modifiedAt: "t",
      lastEditor: alice, deleted: false, order: v1.order, objectId: v1.objectId, title,
    });
    const ws = workingStructure([...log, child(1, "A mine"), child(2, "A theirs")], new Set());
    expect(ws.sections).toHaveLength(1);
    expect(ws.sections[0]!.id).toBe("a");
    expect(ws.conflicted).toEqual(new Set(["a"]));
  });
});
