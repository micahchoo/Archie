import { describe, it, expect } from "vitest";
import { readingNumber, circled, readingBadge } from "./reading-index.js";

const IDS = ["r1", "r2", "r3"];

describe("readingNumber", () => {
  it("base is number 1 (undefined / null / '' / 'base' all resolve to base)", () => {
    expect(readingNumber(undefined, IDS)).toBe(1);
    expect(readingNumber(null, IDS)).toBe(1);
    expect(readingNumber("", IDS)).toBe(1);
    expect(readingNumber("base", IDS)).toBe(1);
  });
  it("registry readings follow base in order — first is 2, then 3, …", () => {
    expect(readingNumber("r1", IDS)).toBe(2);
    expect(readingNumber("r2", IDS)).toBe(3);
    expect(readingNumber("r3", IDS)).toBe(4);
  });
  it("an unknown/pruned reading id is 0 (no badge)", () => {
    expect(readingNumber("gone", IDS)).toBe(0);
  });
});

describe("circled", () => {
  it("maps 0..20 to circled glyphs", () => {
    expect(circled(0)).toBe("⓪");
    expect(circled(1)).toBe("①");
    expect(circled(2)).toBe("②");
    expect(circled(20)).toBe("⑳");
  });
  it("falls back to (n) past 20", () => {
    expect(circled(21)).toBe("(21)");
  });
});

describe("readingBadge", () => {
  it("gives the circled number for base + real readings", () => {
    expect(readingBadge("base", IDS)).toBe("①");
    expect(readingBadge("r2", IDS)).toBe("③");
  });
  it("is empty for an unknown reading (number 0)", () => {
    expect(readingBadge("gone", IDS)).toBe("");
  });
});
