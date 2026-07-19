import { describe, it, expect } from "vitest";
import { formatZoomRatio } from "./zoom-cue.js";

describe("formatZoomRatio (Archie-93fd — the scale cue's text contract)", () => {
  it("formats the ticket's own example", () => {
    expect(formatZoomRatio(3.2)).toBe("3.2×");
  });
  it("home zoom (fit-to-viewport) reads as a clean whole number, no false-precision decimal", () => {
    expect(formatZoomRatio(1)).toBe("1×");
    expect(formatZoomRatio(2)).toBe("2×");
  });
  it("rounds to one decimal", () => {
    expect(formatZoomRatio(3.14)).toBe("3.1×");
    expect(formatZoomRatio(3.15)).toBe("3.2×");
    expect(formatZoomRatio(0.849)).toBe("0.8×");
  });
  it("a rounded-to-whole value drops the decimal even off an inexact ratio", () => {
    expect(formatZoomRatio(1.96)).toBe("2×"); // rounds to 2.0 → "2×"
    expect(formatZoomRatio(0.96)).toBe("1×"); // rounds to 1.0 → "1×"
  });
  it("below fit-to-viewport (zoomed out past home) still formats, no floor at 1×", () => {
    expect(formatZoomRatio(0.5)).toBe("0.5×");
  });
  it("a degenerate ratio degrades to the fit baseline, never NaN/blank/Infinity (mirrors zoomBand's own degrade)", () => {
    expect(formatZoomRatio(NaN)).toBe("1×");
    expect(formatZoomRatio(Infinity)).toBe("1×");
    expect(formatZoomRatio(0)).toBe("1×");
    expect(formatZoomRatio(-2)).toBe("1×");
  });
});
