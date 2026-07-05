import { describe, it, expect } from "vitest";

// Deliberate CI tripwire test (ISSUES.md Issue 1) — proves the test job catches a real failure.
// Reverted in the next commit.
describe("CI tripwire", () => {
  it("deliberately fails", () => {
    expect(1).toBe(2);
  });
});
