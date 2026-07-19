import { describe, it, expect } from "vitest";
import {
  liftRow,
  indexOfMoving,
  moveRow,
  moveRowTo,
  liftAnnouncement,
  moveAnnouncement,
  dropAnnouncement,
  cancelAnnouncement,
  type MoveState,
} from "./overview-move-mode.js";

const ORDER = ["a", "b", "c", "d", "e"];

describe("liftRow", () => {
  it("snapshots a working copy, records the moving id + origin index", () => {
    const s = liftRow(ORDER, "c")!;
    expect(s.movingId).toBe("c");
    expect(s.origin).toBe(2);
    expect(s.order).toEqual(ORDER);
    expect(s.order).not.toBe(ORDER); // a copy, not the input array
  });
  it("returns null for an id not in the order", () => {
    expect(liftRow(ORDER, "zzz")).toBeNull();
  });
});

describe("moveRow", () => {
  it("moves the lifted row down one position", () => {
    const s = moveRow(liftRow(ORDER, "b")!, 1);
    expect(s.order).toEqual(["a", "c", "b", "d", "e"]);
    expect(indexOfMoving(s)).toBe(2);
  });
  it("moves the lifted row up one position", () => {
    const s = moveRow(liftRow(ORDER, "d")!, -1);
    expect(s.order).toEqual(["a", "b", "d", "c", "e"]);
  });
  it("clamps at the top — moving up from index 0 is a no-op order", () => {
    const s = moveRow(liftRow(ORDER, "a")!, -1);
    expect(s.order).toEqual(ORDER);
    expect(indexOfMoving(s)).toBe(0);
  });
  it("clamps at the bottom — moving down from the last index stays last", () => {
    const s = moveRow(liftRow(ORDER, "e")!, 1);
    expect(s.order).toEqual(ORDER);
    expect(indexOfMoving(s)).toBe(4);
  });
  it("chains — successive moves accumulate on the working order", () => {
    let s = liftRow(ORDER, "a")!;
    s = moveRow(s, 1);
    s = moveRow(s, 1);
    expect(s.order).toEqual(["b", "c", "a", "d", "e"]);
    expect(indexOfMoving(s)).toBe(2);
  });
});

describe("moveRowTo", () => {
  it("Home sends the row to the front", () => {
    const s = moveRowTo(liftRow(ORDER, "d")!, 0);
    expect(s.order).toEqual(["d", "a", "b", "c", "e"]);
  });
  it("End sends the row to the back", () => {
    const s = moveRowTo(liftRow(ORDER, "b")!, ORDER.length - 1);
    expect(s.order).toEqual(["a", "c", "d", "e", "b"]);
  });
});

describe("announcement grammar", () => {
  it("lift names the label + 1-based picked-up position", () => {
    const s = liftRow(ORDER, "c")!; // index 2 → position 3
    expect(liftAnnouncement("Folio 3", s)).toBe("Picked up Folio 3, position 3 of 5.");
  });
  it("move announces the new 1-based position", () => {
    const s = moveRow(liftRow(ORDER, "c")!, 1); // 3 → 4
    expect(moveAnnouncement(s)).toBe("Moved to position 4 of 5.");
  });
  it("drop names the label + landing position", () => {
    const s = moveRowTo(liftRow(ORDER, "a")!, ORDER.length - 1);
    expect(dropAnnouncement("Folio 1", s)).toBe("Dropped Folio 1 at position 5 of 5.");
  });
  it("cancel reports the ORIGIN position (not the working one) the row returns to", () => {
    let s = liftRow(ORDER, "b")!; // origin index 1 → position 2
    s = moveRow(s, 2); // wandered away
    expect(cancelAnnouncement("Folio 2", s)).toBe("Reorder cancelled. Folio 2 is back at position 2 of 5.");
  });
});
