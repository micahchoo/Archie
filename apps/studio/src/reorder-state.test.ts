import { describe, it, expect } from "vitest";
import { isReorderable } from "./reorder-state.js";

describe("isReorderable", () => {
  it("is reorderable in reading order with no search", () => {
    expect(isReorderable("reading", "")).toBe(true);
  });

  it("is NOT reorderable when sorted by name or recency, even with no search", () => {
    expect(isReorderable("name", "")).toBe(false);
    expect(isReorderable("recent", "")).toBe(false);
  });

  it("is NOT reorderable while a search is active, even in reading order", () => {
    expect(isReorderable("reading", "voynich")).toBe(false);
  });

  it("whitespace-only search still counts as empty (trimmed)", () => {
    expect(isReorderable("reading", "   ")).toBe(true);
  });

  it("both conditions must hold — sort AND search block independently", () => {
    expect(isReorderable("name", "voynich")).toBe(false);
  });
});
