import { describe, it, expect } from "vitest";
import { matchesTitle } from "./match.js";

describe("matchesTitle — shared title-search primitive (spike-0004 §4)", () => {
  it("is case-insensitive", () => {
    expect(matchesTitle("Coastal Survey", "coastal")).toBe(true);
    expect(matchesTitle("coastal survey", "SURVEY")).toBe(true);
  });

  it("is a SUBSTRING match, anywhere in the title", () => {
    expect(matchesTitle("Field Notes", "eld")).toBe(true);
    expect(matchesTitle("Field Notes", "notes")).toBe(true);
    expect(matchesTitle("Field Notes", "xyz")).toBe(false);
  });

  it("ignores diacritics on BOTH sides", () => {
    expect(matchesTitle("Müller", "muller")).toBe(true);
    expect(matchesTitle("café society", "cafe")).toBe(true);
    expect(matchesTitle("cafe", "café")).toBe(true); // query carries the accent
    expect(matchesTitle("naïve", "naive")).toBe(true);
  });

  it("an empty / whitespace-only query matches everything", () => {
    expect(matchesTitle("anything", "")).toBe(true);
    expect(matchesTitle("anything", "   ")).toBe(true);
    expect(matchesTitle("", "")).toBe(true);
  });

  it("returns false when the query isn't present", () => {
    expect(matchesTitle("Coastal Survey", "archive")).toBe(false);
    expect(matchesTitle("", "x")).toBe(false);
  });
});
