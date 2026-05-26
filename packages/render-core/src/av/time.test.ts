import { describe, it, expect } from "vitest";
import { parseTimeFragment, activeNoteIndex, timeFragmentValue, type TimeRange } from "./time.js";

// Reads back what transcript.ts writes (`t=start,end`) for the player's seek + highlight, plus the
// bare media-fragments forms a Studio author / import may supply.

describe("parseTimeFragment — media-fragments `t=` → seconds", () => {
  it("parses the stored `t=start,end` form (what cuesToNotes emits)", () => {
    expect(parseTimeFragment("t=12,15.5")).toEqual({ start: 12, end: 15.5 });
  });
  it("accepts the value without the `t=` prefix", () => {
    expect(parseTimeFragment("12,15.5")).toEqual({ start: 12, end: 15.5 });
  });
  it("parses the bare forms: `start`, `start,`, `,end`", () => {
    expect(parseTimeFragment("t=30")).toEqual({ start: 30 });        // point marker (no end)
    expect(parseTimeFragment("t=30,")).toEqual({ start: 30 });       // open-ended
    expect(parseTimeFragment("t=,15")).toEqual({ start: 0, end: 15 }); // start defaults to 0
  });
  it("tolerates an `npt:` prefix", () => {
    expect(parseTimeFragment("t=npt:5,9")).toEqual({ start: 5, end: 9 });
  });
  it("returns null on malformed input", () => {
    expect(parseTimeFragment("")).toBeNull();
    expect(parseTimeFragment("t=")).toBeNull();
    expect(parseTimeFragment("t=abc")).toBeNull();
    expect(parseTimeFragment("t=5,3")).toBeNull();   // end < start
    expect(parseTimeFragment("t=-2,5")).toBeNull();  // negative
    expect(parseTimeFragment("t=1,2,3")).toBeNull(); // >2 parts
  });
});

describe("timeFragmentValue — write-side inverse of parseTimeFragment (one source of truth)", () => {
  it("builds `t=start,end` and `t=start`, and round-trips through parseTimeFragment", () => {
    expect(timeFragmentValue(12, 15.5)).toBe("t=12,15.5");
    expect(timeFragmentValue(30)).toBe("t=30");
    expect(parseTimeFragment(timeFragmentValue(5, 9))).toEqual({ start: 5, end: 9 });
    expect(parseTimeFragment(timeFragmentValue(7))).toEqual({ start: 7 });
  });
});

describe("activeNoteIndex — the cue active at time t (half-open [start,end))", () => {
  const ranges: TimeRange[] = [
    { start: 0, end: 5 },
    { start: 5, end: 10 },
    { start: 10, end: 20 },
  ];
  it("finds the containing cue", () => {
    expect(activeNoteIndex(ranges, 2)).toBe(0);
    expect(activeNoteIndex(ranges, 7)).toBe(1);
  });
  it("is half-open: at exactly t=end the NEXT cue is active", () => {
    expect(activeNoteIndex(ranges, 5)).toBe(1); // 5 belongs to [5,10), not [0,5)
    expect(activeNoteIndex(ranges, 0)).toBe(0);
  });
  it("returns -1 before the first / after the last cue", () => {
    expect(activeNoteIndex(ranges, -1)).toBe(-1);
    expect(activeNoteIndex(ranges, 20)).toBe(-1); // [10,20) excludes 20
  });
  it("ignores point markers (no end) and null entries", () => {
    expect(activeNoteIndex([{ start: 0 }, null, { start: 1, end: 4 }], 2)).toBe(2);
    expect(activeNoteIndex([{ start: 0 }], 0)).toBe(-1); // a point marker is never 'active'
  });
  it("on overlap returns the most-recently-started active range", () => {
    // [0,10) and [3,6) both contain t=4 → the later-starting [3,6] (index 1) wins.
    expect(activeNoteIndex([{ start: 0, end: 10 }, { start: 3, end: 6 }], 4)).toBe(1);
    // outside the inner range, the outer one is active again.
    expect(activeNoteIndex([{ start: 0, end: 10 }, { start: 3, end: 6 }], 8)).toBe(0);
  });
});
