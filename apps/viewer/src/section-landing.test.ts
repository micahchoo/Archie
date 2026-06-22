// Phase 3 / 4.6 — section-out-of-range floors/degrades to the nearest valid section, never resets to 0.
import { describe, it, expect } from "vitest";
import { resolveSectionIndex } from "./section-landing.js";

const sections = [{ id: "intro" }, { id: "body" }, { id: "close" }]; // indices 0,1,2

describe("resolveSectionIndex — route s/<id> → valid section index (4.6)", () => {
  it("resolves an exact id to its index", () => {
    expect(resolveSectionIndex("intro", sections)).toBe(0);
    expect(resolveSectionIndex("close", sections)).toBe(2);
  });

  it("resolves an in-range numeric index as-is", () => {
    expect(resolveSectionIndex("1", sections)).toBe(1);
    expect(resolveSectionIndex("0", sections)).toBe(0);
  });

  it("floors an out-of-range high index to the LAST section (not 0)", () => {
    expect(resolveSectionIndex("9", sections)).toBe(2);
    expect(resolveSectionIndex("99", sections)).toBe(2);
  });

  it("floors a negative numeric index to the FIRST section", () => {
    expect(resolveSectionIndex("-3", sections)).toBe(0);
  });

  it("unknown id / unparsable → null (caller keeps its landing default)", () => {
    expect(resolveSectionIndex("nope", sections)).toBeNull();
    expect(resolveSectionIndex("1.5", sections)).toBeNull(); // not an integer index, not an id
  });

  it("empty section list → null", () => {
    expect(resolveSectionIndex("intro", [])).toBeNull();
    expect(resolveSectionIndex(null, sections)).toBeNull();
    expect(resolveSectionIndex(undefined, sections)).toBeNull();
  });
});
