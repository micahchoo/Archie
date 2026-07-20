import { describe, it, expect } from "vitest";
import { midEllipsis, splitForMidTruncation } from "./mid-ellipsis.js";

describe("midEllipsis", () => {
  it("returns short strings unchanged", () => {
    expect(midEllipsis("BHC006", 24)).toBe("BHC006");
    expect(midEllipsis("", 24)).toBe("");
  });

  it("returns strings exactly at max unchanged", () => {
    expect(midEllipsis("abcdefgh", 8)).toBe("abcdefgh");
  });

  it("drops the middle, keeping both ends — the suffix survives", () => {
    const out = midEllipsis("BHC006_GM_folio_scan_07a", 12);
    expect(out).toHaveLength(12);
    expect(out).toBe("BHC00…an_07a");
  });

  it("gives the tail the extra character on odd splits", () => {
    // max 10 → keep 9 → head 4, tail 5
    expect(midEllipsis("0123456789ABCDEF", 10)).toBe("0123…BCDEF");
  });

  it("distinguishes filename siblings that end-truncation would collapse", () => {
    const a = midEllipsis("BHC006_GM_folio_scan_07a", 14);
    const b = midEllipsis("BHC006_GM_folio_scan_07b", 14);
    expect(a).not.toBe(b);
    expect(a.endsWith("07a")).toBe(true);
    expect(b.endsWith("07b")).toBe(true);
  });

  it("never splits surrogate pairs (counts code points, not UTF-16 units)", () => {
    const s = "𝔄𝔅ℭ𝔇𝔈𝔉𝔊ℌℑ𝔍"; // 10 code points, mostly astral
    const out = midEllipsis(s, 7);
    expect([...out]).toHaveLength(7);
    expect(out.includes("�")).toBe(false);
    expect(out).toBe("𝔄𝔅ℭ…ℌℑ𝔍");
  });

  it("leaves degenerate maxima alone rather than emitting nonsense", () => {
    expect(midEllipsis("abcdefgh", 2)).toBe("abcdefgh");
  });

  it("max=3, the smallest active max: one char each side of the ellipsis", () => {
    // keep 2 → head 1, tail 1
    expect(midEllipsis("abcdefgh", 3)).toBe("a…h");
    expect(midEllipsis("abc", 3)).toBe("abc"); // exactly at max — untouched
  });
});

describe("splitForMidTruncation", () => {
  it("returns short strings whole in head — no tail, no layout change", () => {
    expect(splitForMidTruncation("BHC006", 7)).toEqual({ head: "BHC006", tail: "" });
    expect(splitForMidTruncation("exactly", 7)).toEqual({ head: "exactly", tail: "" });
    expect(splitForMidTruncation("", 7)).toEqual({ head: "", tail: "" });
  });

  it("splits off exactly the last tailLen code points", () => {
    expect(splitForMidTruncation("BHC006_GM_folio_scan_07a", 7)).toEqual({
      head: "BHC006_GM_folio_s",
      tail: "can_07a",
    });
  });

  it("head + tail always reassemble the original", () => {
    for (const s of ["BHC006_GM_folio_scan_07a", "𝔄𝔅ℭ𝔇𝔈𝔉𝔊ℌℑ𝔍", "a", "", "12345678"]) {
      const { head, tail } = splitForMidTruncation(s, 7);
      expect(head + tail).toBe(s);
    }
  });

  it("counts code points, not UTF-16 units", () => {
    const { head, tail } = splitForMidTruncation("𝔄𝔅ℭ𝔇𝔈𝔉𝔊ℌℑ𝔍", 7); // 10 code points
    expect([...tail]).toHaveLength(7);
    expect(head).toBe("𝔄𝔅ℭ");
    expect(tail.includes("�")).toBe(false);
  });
});
