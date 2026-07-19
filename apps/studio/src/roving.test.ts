import { describe, it, expect } from "vitest";
import { roveIndex } from "./roving.js";

describe("roveIndex", () => {
  it("advances on ArrowDown / ArrowRight (both axes forward)", () => {
    expect(roveIndex(1, 5, "ArrowDown")).toBe(2);
    expect(roveIndex(1, 5, "ArrowRight")).toBe(2);
  });
  it("retreats on ArrowUp / ArrowLeft (both axes backward)", () => {
    expect(roveIndex(3, 5, "ArrowUp")).toBe(2);
    expect(roveIndex(3, 5, "ArrowLeft")).toBe(2);
  });
  it("clamps at the ends", () => {
    expect(roveIndex(4, 5, "ArrowDown")).toBe(4);
    expect(roveIndex(0, 5, "ArrowUp")).toBe(0);
  });
  it("Home / End jump to the ends", () => {
    expect(roveIndex(3, 5, "Home")).toBe(0);
    expect(roveIndex(1, 5, "End")).toBe(4);
  });
  it("returns null for non-nav keys (leave focus put)", () => {
    expect(roveIndex(1, 5, "Enter")).toBeNull();
    expect(roveIndex(1, 5, "a")).toBeNull();
  });
  it("returns null for an empty list", () => {
    expect(roveIndex(0, 0, "ArrowDown")).toBeNull();
  });
  it("treats a -1 (nothing roved yet) current as the start", () => {
    expect(roveIndex(-1, 5, "ArrowDown")).toBe(1);
    expect(roveIndex(-1, 5, "ArrowUp")).toBe(0);
  });
});
