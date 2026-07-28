import { describe, it, expect } from "vitest";
import { isReorderable, reorderBlockedMessage, canCommitSort, commitSortBlockedMessage } from "./reorder-state.js";

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

describe("canCommitSort / commitSortBlockedMessage (Archie-3b9f)", () => {
  it("is offered only when a sort is active AND nothing is filtered", () => {
    expect(canCommitSort("name", "")).toBe(true);
    expect(canCommitSort("recent", "")).toBe(true);
    expect(canCommitSort("reading", "")).toBe(false); // a no-op — the view already IS the order
    expect(canCommitSort("name", "cat")).toBe(false); // a filtered view is a SUBSET
    // Whitespace-only is NOT a search: displayObjects filters on search.trim(), so nothing is hidden
    // and committing is safe. Same rule isReorderable uses — the two must agree, or a view could be
    // reorderable by drag and not committable by button, which is incoherent.
    expect(canCommitSort("name", "   ")).toBe(true);
  });

  it("is the exact complement of a non-empty reason — no state is both offered and explained", () => {
    // The two functions are read by the same UI in the same breath (enabled? / why not?), so a state
    // where both say yes, or both say no, would render a disabled button with no explanation or an
    // enabled one carrying a warning. Pin the total relationship rather than the individual rows.
    for (const mode of ["reading", "name", "recent"] as const) {
      for (const q of ["", "  ", "cat"]) {
        expect(commitSortBlockedMessage(mode, q) === "").toBe(canCommitSort(mode, q));
      }
    }
  });

  it("blames the SEARCH first when both block it — clearing the sort alone wouldn't help", () => {
    // Same correction reorderBlockedMessage already carries: telling someone to change a sort they
    // must change anyway, while the search is the thing actually making the view partial, sends them
    // round the wrong loop.
    expect(commitSortBlockedMessage("name", "cat")).toMatch(/Clear the search/);
    expect(commitSortBlockedMessage("reading", "")).toMatch(/already IS the reading order/);
  });
});
