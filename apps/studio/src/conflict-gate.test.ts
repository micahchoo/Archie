import { describe, it, expect } from "vitest";
import { liveNoteIdsOnCanvas, conflictsBlockingRemoval, dedupeById, type HeadLike } from "./conflict-gate.js";

// Archie-7e5b S3a/S3b. Three paths reached editNote/deleteNote without asking whether the note had
// plural heads: a canvas drag, an object removal, a bulk removal. editNote/deleteNote resolve the
// LINEAR head and throw on plural heads, so each path failed — the drag uncaught inside an
// Annotorious callback, the removals half-way through a non-transactional loop.

const src = (t: unknown): string | undefined => (t as { source?: string } | undefined)?.source;
const head = (logicalId: string, source: string, deleted = false): HeadLike => ({ logicalId, deleted, target: { source } });

describe("liveNoteIdsOnCanvas", () => {
  it("DEDUPES a conflicted note's two heads to one id — the loop must not delete it twice", () => {
    // The whole shape of the S3b bug: a head list carries a conflicted note once PER head.
    const heads = [head("n1", "c1"), head("n1", "c1"), head("n2", "c1")];
    expect(liveNoteIdsOnCanvas(heads, "c1", src)).toEqual(["n1", "n2"]);
  });

  it("keeps only this canvas's notes", () => {
    expect(liveNoteIdsOnCanvas([head("n1", "c1"), head("n2", "c2")], "c1", src)).toEqual(["n1"]);
  });

  it("skips tombstones — a deleted note needs no second delete", () => {
    expect(liveNoteIdsOnCanvas([head("n1", "c1", true), head("n2", "c1")], "c1", src)).toEqual(["n2"]);
  });

  it("a note whose every head is deleted does not survive via one live-looking sibling", () => {
    expect(liveNoteIdsOnCanvas([head("n1", "c1", true), head("n1", "c1", true)], "c1", src)).toEqual([]);
  });
});

describe("conflictsBlockingRemoval", () => {
  const liveIdsOn = (obj: string): string[] => ({ o1: ["n1", "n2"], o2: ["n3"], o3: [] } as Record<string, string[]>)[obj] ?? [];

  it("a clean removal is not blocked", () => {
    expect(conflictsBlockingRemoval(["o1", "o2"], liveIdsOn, () => false)).toEqual([]);
  });

  it("names the conflicted notes that block it", () => {
    expect(conflictsBlockingRemoval(["o1", "o2"], liveIdsOn, (id) => id === "n2")).toEqual(["n2"]);
  });

  it("ALL-OR-NOTHING across a bulk selection: a conflict on the LAST object blocks the whole batch", () => {
    // This is the case the bulk loop got wrong. It tombstones notes for every id and only then calls
    // one batched removeObjects — so a throw on the third object left the first two's notes
    // tombstoned with no meta mutation at all. The check must see the whole list up front.
    const blocking = conflictsBlockingRemoval(["o1", "o2"], liveIdsOn, (id) => id === "n3");
    expect(blocking).toEqual(["n3"]);
  });

  it("an object with no notes contributes nothing", () => {
    expect(conflictsBlockingRemoval(["o3"], liveIdsOn, () => true)).toEqual([]);
  });
});

describe("dedupeById", () => {
  it("hands the canvas ONE annotation per id — duplicate ids draw a note twice, half of it dead", () => {
    const a = [{ id: "n1", v: 1 }, { id: "n1", v: 2 }, { id: "n2", v: 3 }];
    expect(dedupeById(a).map((x) => x.v)).toEqual([1, 3]); // first-seen wins, order preserved
  });

  it("is identity for an already-unique list", () => {
    const a = [{ id: "n1" }, { id: "n2" }];
    expect(dedupeById(a)).toEqual(a);
  });
});
