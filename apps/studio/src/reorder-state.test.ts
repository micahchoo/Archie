import { describe, it, expect } from "vitest";
import { isReorderable, reorderBlockedMessage } from "./reorder-state.js";

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

describe("reorderBlockedMessage", () => {
  it("is empty when reordering is available (matches isReorderable true)", () => {
    expect(reorderBlockedMessage("reading", "")).toBe("");
    expect(reorderBlockedMessage("reading", "   ")).toBe(""); // whitespace-only search still counts as empty
  });

  it("names ONLY search when search alone blocks it — never tells the user to clear a sort they never set", () => {
    expect(reorderBlockedMessage("reading", "voynich")).toBe(
      "Reordering is off while search is active — clear the search to turn it back on.",
    );
  });

  it("names ONLY sort when sort alone blocks it — never tells the user to clear a search they never typed", () => {
    expect(reorderBlockedMessage("name", "")).toBe(
      "Reordering is off while sort is active — switch back to reading order to turn it back on.",
    );
    expect(reorderBlockedMessage("recent", "")).toBe(
      "Reordering is off while sort is active — switch back to reading order to turn it back on.",
    );
  });

  it("names BOTH when search and sort are both active", () => {
    expect(reorderBlockedMessage("name", "voynich")).toBe(
      "Reordering is off while search and sort are active — clear the search and switch back to reading order to turn it back on.",
    );
  });
});
