// HeadIndex is a PERFORMANCE mirror of the heads.ts projections. Its only contract is that it agrees
// with them exactly — so these tests never assert a hand-written expected value. They replay operation
// sequences and compare against `projectHeads` / `headsByLogicalId` / `headsOf` recomputed from the
// whole log after EVERY step. If heads.ts's projection changes, this is what fails.
import { describe, it, expect } from "vitest";
import { HeadIndex } from "./head-index.js";
import { projectHeads, headsByLogicalId } from "./heads.js";
import { headsOf, mergeLogs, resolveConflict } from "./merge.js";
import { appendNew, appendEdit, appendDelete, append, linearHead } from "./log.js";
import { asClientId, type LogicalId, type RevId } from "../wadm/brand.js";
import type { AnnotationLog, AnnotationRecord } from "../wadm/types.js";

const alice = asClientId("alice");
const bob = asClientId("bob");

/** Assert the index agrees with the from-scratch projections on every surface it exposes. */
function expectAgrees(ix: HeadIndex<AnnotationRecord>, log: AnnotationLog): void {
  expect(ix.heads()).toEqual(projectHeads(log));
  const byId = headsByLogicalId(log);
  const expectedConflicts = [...byId].filter(([, h]) => h.length > 1).map(([id]) => id);
  expect(ix.conflicts()).toEqual(expectedConflicts);
  for (const id of byId.keys()) expect(ix.headsOf(id)).toEqual(headsOf(log, id));
}

/** A deterministic PRNG so a failure is reproducible from its seed. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000; };
}

describe("HeadIndex — agrees with the from-scratch projection", () => {
  it("an empty log projects to nothing", () => {
    expectAgrees(HeadIndex.from([]), []);
  });

  it("tracks create / edit / delete step by step", () => {
    let log: AnnotationLog = [];
    const ix = HeadIndex.from(log);
    const ids: LogicalId[] = [];
    let clock = 1;

    for (let i = 0; i < 25; i++) {
      const r = appendNew(log, { target: `https://img/${i}.jpg`, body: { type: "TextualBody", value: `n${i}` }, lastEditor: alice, now: clock++ });
      log = r.log; ids.push(r.record.logicalId); ix.append(r.record);
      expectAgrees(ix, log);
    }
    for (const id of ids.slice(0, 10)) {
      const r = appendEdit(log, id, { body: { type: "TextualBody", value: "edited" }, lastEditor: bob, now: clock++ });
      log = r.log; ix.append(r.record);
      expectAgrees(ix, log);
    }
    for (const id of ids.slice(5, 15)) {
      const r = appendDelete(log, id, { lastEditor: alice, now: clock++ });
      log = r.log; ix.append(r.record);
      expectAgrees(ix, log);
    }
    // Re-editing is refused on a tombstoned note, but an untouched one still edits cleanly.
    const r = appendEdit(log, ids[20]!, { body: { type: "TextualBody", value: "late" }, lastEditor: alice, now: clock++ });
    log = r.log; ix.append(r.record);
    expectAgrees(ix, log);
  });

  it("randomized create/edit/delete sequences agree at every step", () => {
    for (const seed of [1, 7, 42, 1234, 99991]) {
      const rand = rng(seed);
      let log: AnnotationLog = [];
      const ix = HeadIndex.from(log);
      const live: LogicalId[] = [];
      let clock = 1;
      for (let step = 0; step < 200; step++) {
        const roll = rand();
        if (live.length === 0 || roll < 0.5) {
          const r = appendNew(log, { target: `https://img/${step}.jpg`, body: { type: "TextualBody", value: `v${step}` }, lastEditor: alice, now: clock++ });
          log = r.log; live.push(r.record.logicalId); ix.append(r.record);
        } else if (roll < 0.85) {
          const id = live[Math.floor(rand() * live.length)]!;
          const r = appendEdit(log, id, { body: { type: "TextualBody", value: `e${step}` }, lastEditor: bob, now: clock++ });
          log = r.log; ix.append(r.record);
        } else {
          const i = Math.floor(rand() * live.length);
          const id = live[i]!;
          live.splice(i, 1);
          const r = appendDelete(log, id, { lastEditor: alice, now: clock++ });
          log = r.log; ix.append(r.record);
        }
        expectAgrees(ix, log);
      }
    }
  });

  it("plural heads (an unresolved merge) match, and survive resolution", () => {
    // Two clients edit the same note from a shared base — the classic concurrent-edit conflict.
    const base = appendNew([], { target: "https://img/a.jpg", body: { type: "TextualBody", value: "base" }, lastEditor: alice, now: 1 });
    const id = base.record.logicalId;
    const mine = appendEdit(base.log, id, { body: { type: "TextualBody", value: "mine" }, lastEditor: alice, now: 2 }).log;
    const theirs = appendEdit(base.log, id, { body: { type: "TextualBody", value: "theirs" }, lastEditor: bob, now: 3 }).log;

    const merged = mergeLogs(mine, theirs) as AnnotationLog;
    const ix = HeadIndex.from(merged);
    expect(ix.conflicts()).toEqual([id]); // the state the projection must report
    expectAgrees(ix, merged);

    const resolved = resolveConflict(merged, id, { lastEditor: alice, now: 4 });
    const ix2 = HeadIndex.from(resolved);
    expect(ix2.conflicts()).toEqual([]);
    expectAgrees(ix2, resolved);
  });

  it("plural heads sort by rev inside the shared logicalId, like projectHeads", () => {
    // Force two live heads for ONE logicalId and check the array order, not just membership — this is
    // the case where a naive splice of log-ordered heads would diverge from the (logicalId, rev) sort.
    const base = appendNew([], { target: "https://img/a.jpg", lastEditor: alice, now: 1 });
    const id = base.record.logicalId;
    const a = appendEdit(base.log, id, { body: { type: "TextualBody", value: "a" }, lastEditor: alice, now: 2 }).record;
    const b = appendEdit(base.log, id, { body: { type: "TextualBody", value: "b" }, lastEditor: bob, now: 3 }).record;
    // Append the HIGHER rev first so log order and rev order disagree.
    const [first, second] = a.rev > b.rev ? [a, b] : [b, a];
    const log = append(append(base.log, first), second) as AnnotationLog;
    const ix = HeadIndex.from(log);
    expect(ix.heads()).toEqual(projectHeads(log));
    expect(ix.heads().map((h) => h.rev)).toEqual([...ix.heads()].map((h) => h.rev).sort());
    expectAgrees(ix, log);
  });

  it("incremental append matches a from-scratch rebuild of the same log", () => {
    let log: AnnotationLog = [];
    const ix = HeadIndex.from(log);
    let clock = 1;
    const ids: LogicalId[] = [];
    for (let i = 0; i < 40; i++) {
      const r = appendNew(log, { target: `https://img/${i % 4}.jpg`, lastEditor: alice, now: clock++ });
      log = r.log; ids.push(r.record.logicalId); ix.append(r.record);
    }
    for (const id of ids) {
      const r = appendEdit(log, id, { body: { type: "TextualBody", value: "x" }, lastEditor: alice, now: clock++ });
      log = r.log; ix.append(r.record);
    }
    const rebuilt = HeadIndex.from(log);
    expect(ix.heads()).toEqual(rebuilt.heads());
    expect(ix.conflicts()).toEqual(rebuilt.conflicts());
    for (const id of ids) expect(ix.headsOf(id)).toEqual(rebuilt.headsOf(id));
  });

  // The tests above drive plural/merge states through `HeadIndex.from`, which shares almost no code
  // with `append`. Mutation testing proved that gap real: dropping resplice's rev-sort, ignoring
  // mergeParents in `append`, and never clearing the plural set ALL survived the suite above. These
  // four drive the same states through the INCREMENTAL path, and each one kills a mutant.
  describe("the incremental path through plural states", () => {
    /** Replay `log`'s records into an index one at a time, checking agreement after each. */
    function replay(log: AnnotationLog): HeadIndex<AnnotationRecord> {
      const ix = HeadIndex.from<AnnotationRecord>([]);
      const so_far: AnnotationRecord[] = [];
      for (const r of log) {
        so_far.push(r);
        ix.append(r);
        expectAgrees(ix, so_far as AnnotationLog);
      }
      return ix;
    }

    /** base → two concurrent edits → resolution, as one linear log to replay record-by-record. */
    function conflictLog(): { log: AnnotationLog; id: LogicalId } {
      const base = appendNew([], { target: "https://img/a.jpg", body: { type: "TextualBody", value: "base" }, lastEditor: alice, now: 1 });
      const id = base.record.logicalId;
      const mine = appendEdit(base.log, id, { body: { type: "TextualBody", value: "mine" }, lastEditor: alice, now: 2 }).log;
      const theirs = appendEdit(base.log, id, { body: { type: "TextualBody", value: "theirs" }, lastEditor: bob, now: 3 }).log;
      return { log: mergeLogs(mine, theirs) as AnnotationLog, id };
    }

    it("appending into a plural state agrees at every record", () => {
      const { log, id } = conflictLog();
      const ix = replay(log);
      expect(ix.conflicts()).toEqual([id]); // reached plural through append(), not from()
    });

    it("appending a merge node collapses plural → single and clears the conflict", () => {
      // Kills the "append ignores mergeParents" mutant (the node is only a head if mergeParents count)
      // AND the "plural set never cleared" mutant (the id must leave conflicts()).
      const { log, id } = conflictLog();
      const resolved = resolveConflict(log, id, { lastEditor: alice, now: 4 });
      const ix = replay(resolved);
      expect(ix.conflicts()).toEqual([]);
      expect(ix.headsOf(id)).toHaveLength(1);
      expect(ix.headsOf(id)[0]!.mergeParents?.length).toBeGreaterThan(0);
    });

    it("plural heads spliced in by append are rev-ordered, not log-ordered", () => {
      // Kills the "resplice drops the rev sort" mutant: the two heads are appended in DESCENDING rev
      // order, so log order and the required (logicalId, rev) order disagree.
      const base = appendNew([], { target: "https://img/a.jpg", lastEditor: alice, now: 1 });
      const id = base.record.logicalId;
      const a = appendEdit(base.log, id, { body: { type: "TextualBody", value: "a" }, lastEditor: alice, now: 2 }).record;
      const b = appendEdit(base.log, id, { body: { type: "TextualBody", value: "b" }, lastEditor: bob, now: 3 }).record;
      const [hi, lo] = a.rev > b.rev ? [a, b] : [b, a];
      const log = append(append(base.log, hi), lo) as AnnotationLog;
      const ix = replay(log);
      expect(ix.heads()).toHaveLength(2);
      expect(ix.heads().map((h) => h.rev)).toEqual([lo.rev, hi.rev]); // ascending rev, NOT append order
    });

    it("an edit arriving after a tombstone head does not evict a neighbour from the sorted array", () => {
      // The delete-vs-edit conflict session.ts:209-211 calls out: one client deletes, another edits the
      // same base. Replaying the merged log appends the edit while the group's only head is a TOMBSTONE
      // — so the group holds a head but occupies NO slot in the live sorted array. A resplice that
      // counts `before.length` instead of `before.filter(live).length` deletes one entry too many, and
      // the victim is the NEXT logicalId's head. Two neighbour notes bracket the conflicted one so the
      // corruption has somewhere to show up.
      const before = appendNew([], { logicalId: "id-0" as LogicalId, target: "https://img/before.jpg", lastEditor: alice, now: 1 });
      const base = appendNew(before.log, { logicalId: "id-1" as LogicalId, target: "https://img/a.jpg", lastEditor: alice, now: 2 });
      const after = appendNew(base.log, { logicalId: "id-2" as LogicalId, target: "https://img/after.jpg", lastEditor: alice, now: 3 });
      const id = base.record.logicalId;
      const deleted = appendDelete(after.log, id, { lastEditor: alice, now: 4 }).log;
      const edited = appendEdit(after.log, id, { body: { type: "TextualBody", value: "theirs" }, lastEditor: bob, now: 5 }).log;
      const merged = mergeLogs(deleted, edited) as AnnotationLog;

      const ix = replay(merged); // expectAgrees runs after EVERY record, including the post-tombstone edit
      // Both neighbours must survive, and the conflicted note contributes only its live (edited) head.
      expect(ix.heads().map((h) => h.logicalId)).toEqual(["id-0", "id-1", "id-2"]);
      expect(ix.conflicts()).toEqual([id]); // tombstone + edit = plural heads = a conflict
    });

    it("plural heads of DIFFERENT notes keep the sorted array correct around them", () => {
      // A plural run is 2 entries wide, so a neighbouring note's splice offset must account for it —
      // the case where a wrong `removed` count would corrupt the array silently.
      let combined: AnnotationRecord[] = [];
      const ids: LogicalId[] = [];
      for (let i = 0; i < 3; i++) {
        const base = appendNew([], { logicalId: `id-${i}` as LogicalId, target: `https://img/${i}.jpg`, lastEditor: alice, now: 1 });
        const id = base.record.logicalId;
        ids.push(id);
        const mine = appendEdit(base.log, id, { body: { type: "TextualBody", value: "m" }, lastEditor: alice, now: 2 }).log;
        const theirs = appendEdit(base.log, id, { body: { type: "TextualBody", value: "t" }, lastEditor: bob, now: 3 }).log;
        combined = [...combined, ...(mergeLogs(mine, theirs) as AnnotationRecord[])];
      }
      const ix = replay(combined as AnnotationLog);
      expect(ix.conflicts()).toEqual(ids);
      expect(ix.heads()).toHaveLength(6); // three notes × two live heads
    });
  });

  describe("linearHead — the O(1) route must refuse exactly what the scanning route refuses", () => {
    // appendEdit/appendDelete now take this head instead of re-deriving it with a whole-log filter.
    // If the fast route ACCEPTED something linearHead rejects, a bad edit would enter the log — so
    // every rejection case is compared against the real `linearHead`, error message included.
    const bothReject = (log: AnnotationLog, id: LogicalId) => {
      let slow: string | null = null;
      let fast: string | null = null;
      try { linearHead(log, id); } catch (e) { slow = (e as Error).message; }
      try { HeadIndex.from<AnnotationRecord>(log).linearHead(id); } catch (e) { fast = (e as Error).message; }
      expect(fast).toBe(slow);
      expect(slow).not.toBeNull();
    };

    it("agrees on the happy path", () => {
      const base = appendNew([], { target: "https://img/a.jpg", lastEditor: alice, now: 1 });
      const ix = HeadIndex.from<AnnotationRecord>(base.log);
      expect(ix.linearHead(base.record.logicalId)).toEqual(linearHead(base.log, base.record.logicalId));
    });

    it("agrees on 'no such note'", () => {
      bothReject([], "missing" as LogicalId);
    });

    it("agrees on plural heads (an unresolved conflict blocks editing)", () => {
      const { log, id } = (() => {
        const base = appendNew([], { target: "https://img/a.jpg", lastEditor: alice, now: 1 });
        const lid = base.record.logicalId;
        const mine = appendEdit(base.log, lid, { body: { type: "TextualBody", value: "m" }, lastEditor: alice, now: 2 }).log;
        const theirs = appendEdit(base.log, lid, { body: { type: "TextualBody", value: "t" }, lastEditor: bob, now: 3 }).log;
        return { log: mergeLogs(mine, theirs) as AnnotationLog, id: lid };
      })();
      bothReject(log, id);
    });

    it("agrees on a cyclic DAG (corrupt store)", () => {
      // Every version references another as its parent, so no version is a tip.
      const a: AnnotationRecord = { logicalId: "L" as LogicalId, rev: "rA" as RevId, version: 1, parent: "rB" as RevId, modifiedAt: "t1", lastEditor: alice, deleted: false, target: "https://img/a.jpg" };
      const b: AnnotationRecord = { logicalId: "L" as LogicalId, rev: "rB" as RevId, version: 2, parent: "rA" as RevId, modifiedAt: "t2", lastEditor: alice, deleted: false, target: "https://img/a.jpg" };
      bothReject([a, b], "L" as LogicalId);
    });

    it("agrees after incremental appends, not just a from() rebuild", () => {
      let log: AnnotationLog = [];
      const ix = HeadIndex.from<AnnotationRecord>([]);
      const first = appendNew(log, { target: "https://img/a.jpg", lastEditor: alice, now: 1 });
      log = first.log; ix.append(first.record);
      const id = first.record.logicalId;
      for (let i = 0; i < 5; i++) {
        const r = appendEdit(log, id, { body: { type: "TextualBody", value: `e${i}` }, lastEditor: alice, now: i + 2 });
        log = r.log; ix.append(r.record);
        expect(ix.linearHead(id)).toEqual(linearHead(log, id));
      }
    });
  });

  it("heads() array IDENTITY is stable between mutations and fresh after each", () => {
    // Not a micro-detail: `projectHeads` allocated per call and the session memoized by log identity,
    // so a Svelte `$derived` could treat "same array" as "nothing changed". The index mutates its
    // sorted array in place, so without the snapshot it would hand back one identity forever and
    // strand the UI on stale notes — a reactivity bug no vitest assertion on CONTENTS would catch.
    const base = appendNew([], { target: "https://img/a.jpg", lastEditor: alice, now: 1 });
    const ix = HeadIndex.from<AnnotationRecord>(base.log);
    const first = ix.heads();
    expect(ix.heads()).toBe(first); // stable across reads
    const edit = appendEdit(base.log, base.record.logicalId, { body: { type: "TextualBody", value: "e" }, lastEditor: alice, now: 2 });
    ix.append(edit.record);
    expect(ix.heads()).not.toBe(first); // fresh after a mutation
    expect(first.map((h) => h.rev)).toEqual([base.record.rev]); // and the old snapshot is untouched
  });

  it("an unknown logicalId has no heads (headsOf's empty case)", () => {
    const ix = HeadIndex.from<AnnotationRecord>([]);
    expect(ix.headsOf("nope" as LogicalId)).toEqual([]);
    expect(headsOf([], "nope" as LogicalId)).toEqual([]);
  });

  it("a merge node referencing both heads via mergeParents collapses to one head", () => {
    // Guards the `parentsOf` (parent + mergeParents) definition of "referenced" — a merge node is only
    // the single head if mergeParents counts, which is the OQ-1 fix heads.ts calls out.
    const base = appendNew([], { target: "https://img/a.jpg", lastEditor: alice, now: 1 });
    const id = base.record.logicalId;
    const mine = appendEdit(base.log, id, { body: { type: "TextualBody", value: "m" }, lastEditor: alice, now: 2 }).log;
    const theirs = appendEdit(base.log, id, { body: { type: "TextualBody", value: "t" }, lastEditor: bob, now: 3 }).log;
    const resolved = resolveConflict(mergeLogs(mine, theirs) as AnnotationLog, id, { lastEditor: alice, now: 4 });
    const ix = HeadIndex.from(resolved);
    expect(ix.headsOf(id)).toHaveLength(1);
    expect(ix.headsOf(id)[0]!.mergeParents?.length).toBeGreaterThan(0);
    expectAgrees(ix, resolved);
  });

  it("a tombstone-only note is absent from heads() but still reported by headsOf", () => {
    const base = appendNew([], { target: "https://img/a.jpg", lastEditor: alice, now: 1 });
    const id = base.record.logicalId;
    const log = appendDelete(base.log, id, { lastEditor: alice, now: 2 }).log;
    const ix = HeadIndex.from(log);
    expect(ix.heads()).toEqual([]);              // projectHeads drops tombstone heads
    expect(ix.headsOf(id)).toHaveLength(1);      // headsOf keeps them (conflicts() depends on this)
    expect(ix.headsOf(id)[0]!.deleted).toBe(true);
    expectAgrees(ix, log);
  });

  it("heads() stays sorted across many logicalIds appended out of id order", () => {
    // ULIDs are minted in ascending time order, so a natural session appends nearly in sorted order.
    // Drive explicit logicalIds in DESCENDING order so every insert lands before its predecessors.
    let log: AnnotationLog = [];
    const ix = HeadIndex.from(log);
    for (let i = 30; i >= 0; i--) {
      const r = appendNew(log, { logicalId: `id-${String(i).padStart(3, "0")}` as LogicalId, target: `https://img/${i}.jpg`, lastEditor: alice, now: i + 1 });
      log = r.log; ix.append(r.record);
      expectAgrees(ix, log);
    }
    expect(ix.heads().map((h) => h.logicalId)).toEqual([...ix.heads()].map((h) => h.logicalId).sort());
  });

  it("a rev that is referenced as a parent before it appears still projects identically", () => {
    // Out-of-order arrival (an incoming log whose child precedes its parent) — `from` must not assume
    // topological order. Hand-assembled because the append helpers always emit parent-first.
    const parent: AnnotationRecord = {
      logicalId: "L1" as LogicalId, rev: "r2" as RevId, version: 2, parent: "r1" as RevId,
      modifiedAt: "t2", lastEditor: alice, deleted: false, target: "https://img/a.jpg",
    };
    const child: AnnotationRecord = {
      logicalId: "L1" as LogicalId, rev: "r1" as RevId, version: 1, parent: null,
      modifiedAt: "t1", lastEditor: alice, deleted: false, target: "https://img/a.jpg",
    };
    const log: AnnotationLog = [parent, child]; // child (r1) arrives AFTER the record that names it
    expectAgrees(HeadIndex.from(log), log);
  });
});
