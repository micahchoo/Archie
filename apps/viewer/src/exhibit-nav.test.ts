// Phase 4 — in-exhibit nav step/position math (filmstrip jump, ←/→ stepping, position indicators).
import { describe, it, expect } from "vitest";
import { stepObjectId, positionLabel } from "./exhibit-nav.js";

const objs = [{ id: "o1" }, { id: "o2" }, { id: "o3" }];

describe("stepObjectId — ±1 over siblings, no wrap", () => {
  it("steps forward and back between neighbours", () => {
    expect(stepObjectId(objs, "o1", 1)).toBe("o2");
    expect(stepObjectId(objs, "o2", 1)).toBe("o3");
    expect(stepObjectId(objs, "o2", -1)).toBe("o1");
  });

  it("returns null at the ends (no wrap-around)", () => {
    expect(stepObjectId(objs, "o1", -1)).toBeNull();
    expect(stepObjectId(objs, "o3", 1)).toBeNull();
  });

  it("returns null when there is no current object (grid overview) or an unknown id", () => {
    expect(stepObjectId(objs, null, 1)).toBeNull();
    expect(stepObjectId(objs, "nope", 1)).toBeNull();
  });

  it("returns null for a one-object list", () => {
    expect(stepObjectId([{ id: "only" }], "only", 1)).toBeNull();
    expect(stepObjectId([{ id: "only" }], "only", -1)).toBeNull();
  });
});

describe("positionLabel — 1-based 'Unit N of M'", () => {
  it("formats objects and sections", () => {
    expect(positionLabel(13, 32, "Object")).toBe("Object 14 of 32");
    expect(positionLabel(2, 7, "Section")).toBe("Section 3 of 7");
  });

  it("is 1-based from index 0", () => {
    expect(positionLabel(0, 5, "Object")).toBe("Object 1 of 5");
  });
});
