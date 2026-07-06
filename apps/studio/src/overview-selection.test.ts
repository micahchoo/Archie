// Phase 2 — the load-bearing overview selection + multi-drag math (headless, no DOM).
import { describe, it, expect } from "vitest";
import { applyClick, selectAll, clearSelection, applyMarquee, marqueeHits, moveBlock, START, END, type SelectionState, type PlateRect } from "./overview-selection.js";

const ORDER = ["a", "b", "c", "d", "e"];
const st = (ids: string[], anchor: string | null = null): SelectionState => ({ selection: new Set(ids), anchor });
const arr = (s: SelectionState) => [...s.selection];

describe("applyClick — plain / toggle / range", () => {
  it("plain click replaces the selection with just that id and anchors it", () => {
    const r = applyClick(st(["a", "b"]), "d", { meta: false, shift: false }, ORDER);
    expect(arr(r)).toEqual(["d"]);
    expect(r.anchor).toBe("d");
  });

  it("⌘/ctrl click toggles the id, keeping the rest, and re-anchors", () => {
    const add = applyClick(st(["a"]), "c", { meta: true, shift: false }, ORDER);
    expect(new Set(arr(add))).toEqual(new Set(["a", "c"]));
    expect(add.anchor).toBe("c");
    const remove = applyClick(st(["a", "c"], "a"), "a", { meta: true, shift: false }, ORDER);
    expect(arr(remove)).toEqual(["c"]);
  });

  it("shift click selects the contiguous anchor→id range and keeps the anchor", () => {
    const r = applyClick(st(["b"], "b"), "d", { meta: false, shift: true }, ORDER);
    expect(arr(r)).toEqual(["b", "c", "d"]);
    expect(r.anchor).toBe("b"); // anchor holds so a further shift re-ranges from b
  });

  it("shift range works backwards (id before anchor)", () => {
    const r = applyClick(st(["d"], "d"), "b", { meta: false, shift: true }, ORDER);
    expect(arr(r)).toEqual(["b", "c", "d"]);
  });

  it("shift with no anchor degrades to a plain single-select", () => {
    const r = applyClick(st([], null), "c", { meta: false, shift: true }, ORDER);
    expect(arr(r)).toEqual(["c"]);
    expect(r.anchor).toBe("c");
  });

  it("shift ranges over the VISIBLE order — a filtered view selects ONLY visible members", () => {
    // Display (filtered) order hides b and d; the caller passes that subset as orderedIds.
    const visible = ["a", "c", "e"];
    const r = applyClick(st(["a"], "a"), "e", { meta: false, shift: true }, visible);
    expect(arr(r)).toEqual(["a", "c", "e"]); // b, d are NOT selected (never in view)
  });

  it("shift when the anchor is HIDDEN by the filter (a === -1) falls back to replace, not a phantom range", () => {
    // Anchor "b" was selected earlier but is now filtered out of the visible set.
    const visible = ["a", "c", "e"];
    const r = applyClick(st(["b"], "b"), "e", { meta: false, shift: true }, visible);
    expect(arr(r)).toEqual(["e"]); // single-select the clicked, drop the invisible-anchor range
    expect(r.anchor).toBe("e");
  });
});

describe("selectAll / clearSelection / applyMarquee", () => {
  it("selectAll selects every id, anchored on the last", () => {
    const r = selectAll(ORDER);
    expect(arr(r)).toEqual(ORDER);
    expect(r.anchor).toBe("e");
  });

  it("clearSelection empties everything", () => {
    const r = clearSelection();
    expect(r.selection.size).toBe(0);
    expect(r.anchor).toBeNull();
  });

  it("applyMarquee installs the hit set and anchors on the last hit; empty clears", () => {
    const hit = applyMarquee(["b", "c"]);
    expect(arr(hit)).toEqual(["b", "c"]);
    expect(hit.anchor).toBe("c");
    const none = applyMarquee([]);
    expect(none.selection.size).toBe(0);
    expect(none.anchor).toBeNull();
  });
});

describe("marqueeHits — AABB intersection, direction-agnostic", () => {
  const plates: PlateRect[] = [
    { id: "a", left: 0, top: 0, right: 50, bottom: 50 },
    { id: "b", left: 100, top: 0, right: 150, bottom: 50 },
    { id: "c", left: 0, top: 100, right: 50, bottom: 150 },
  ];
  it("selects plates the band overlaps", () => {
    expect(marqueeHits(plates, { x0: -10, y0: -10, x1: 60, y1: 60 })).toEqual(["a"]);
    expect(marqueeHits(plates, { x0: -10, y0: -10, x1: 200, y1: 60 })).toEqual(["a", "b"]);
  });
  it("normalizes a band dragged up-and-left (negative direction)", () => {
    expect(marqueeHits(plates, { x0: 60, y0: 60, x1: -10, y1: -10 })).toEqual(["a"]);
  });
  it("a band touching nothing selects nothing; a grazing edge still counts", () => {
    expect(marqueeHits(plates, { x0: 60, y0: 60, x1: 90, y1: 90 })).toEqual([]);
    expect(marqueeHits(plates, { x0: 40, y0: 40, x1: 120, y1: 120 })).toEqual(["a", "b", "c"]);
  });
});

describe("moveBlock — single + multi drag, sentinels, guards", () => {
  it("moves a single id before a target (relative order intact around it)", () => {
    expect(moveBlock(ORDER, ["d"], "b")).toEqual(["a", "d", "b", "c", "e"]);
  });

  it("moves a multi-id block, preserving its canonical relative order", () => {
    // selection {d,b} lifts as [b,d] (canonical order), inserts before c
    expect(moveBlock(ORDER, new Set(["d", "b"]), "c")).toEqual(["a", "b", "d", "c", "e"]);
  });

  it("START prepends, END/null append", () => {
    expect(moveBlock(ORDER, ["c"], START)).toEqual(["c", "a", "b", "d", "e"]);
    expect(moveBlock(ORDER, ["c"], END)).toEqual(["a", "b", "d", "e", "c"]);
    expect(moveBlock(ORDER, ["c"], null)).toEqual(["a", "b", "d", "e", "c"]);
  });

  it("subsumes the first-position edge: dragging the FIRST item to a mid target appends correctly (no -1 bug)", () => {
    // old commitReorder(objects[0]) did indexOf(self)=-1 → wrong append; moveBlock filters self out of rest.
    expect(moveBlock(ORDER, ["a"], "d")).toEqual(["b", "c", "a", "d", "e"]);
    expect(moveBlock(ORDER, ["a"], START)).toEqual(["a", "b", "c", "d", "e"]); // first → start = no change
  });

  it("dropping the block onto one of its own members is a no-op", () => {
    expect(moveBlock(ORDER, new Set(["b", "c"]), "c")).toEqual(ORDER);
    expect(moveBlock(ORDER, new Set(["b", "c"]), "b")).toEqual(ORDER);
  });

  it("a multi-block dropped at END keeps relative order at the tail", () => {
    expect(moveBlock(ORDER, new Set(["a", "c", "e"]), END)).toEqual(["b", "d", "a", "c", "e"]);
  });
});
