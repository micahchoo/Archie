import { describe, it, expect } from "vitest";
import { readingMarkerStyle } from "./marker-style.js";

// P-2 grill Q2: comparing = outline-only (no fill blend can lie about reading identity);
// solo restores one fill; emphasis modifiers always apply. The ONE source for both apps' numbers.

describe("readingMarkerStyle", () => {
  it("normal single-reading view: today's fill+stroke numbers", () => {
    expect(readingMarkerStyle("#a33", "normal")).toEqual({
      fill: "#a33", fillOpacity: 0.18, stroke: "#a33", strokeOpacity: 0.95, strokeWidth: 2,
    });
  });

  it("comparing: fill drops to ZERO, stroke keeps identity at full presence", () => {
    const s = readingMarkerStyle("#a33", "normal", { comparing: true });
    expect(s.fillOpacity).toBe(0);
    expect(s.stroke).toBe("#a33");
    expect(s.strokeOpacity).toBe(0.95);
  });

  it("solo-on-hover restores the soloed mark's fill while comparing", () => {
    expect(readingMarkerStyle("#a33", "normal", { comparing: true, soloed: true }).fillOpacity).toBe(0.18);
  });

  it("soloed without comparing is just the normal style (hover in single view changes nothing)", () => {
    expect(readingMarkerStyle("#a33", "normal", { soloed: true })).toEqual(readingMarkerStyle("#a33", "normal"));
  });

  it("emphasis modifiers still apply in every regime (muted stays muted while comparing)", () => {
    const normal = readingMarkerStyle("#a33", "muted");
    const comparing = readingMarkerStyle("#a33", "muted", { comparing: true });
    expect(normal.strokeOpacity).toBeLessThan(0.95); // muted dims
    expect(comparing.strokeOpacity).toBe(normal.strokeOpacity); // regime doesn't undo emphasis
    expect(comparing.fillOpacity).toBe(0); // but comparing still kills the fill
    expect(readingMarkerStyle("#a33", "strong").strokeWidth).toBeGreaterThan(2);
  });

  it("highlighted (per-note list hover) boosts presence — fill 0.32, stroke 1, width 3", () => {
    expect(readingMarkerStyle("#a33", "normal", { highlighted: true })).toEqual({
      fill: "#a33", fillOpacity: 0.32, stroke: "#a33", strokeOpacity: 1, strokeWidth: 3,
    });
  });

  it("highlighted beats comparing — the hovered note's fill returns even in outline mode", () => {
    const s = readingMarkerStyle("#a33", "normal", { comparing: true, highlighted: true });
    expect(s.fillOpacity).toBe(0.32);
    expect(s.strokeOpacity).toBe(1);
  });

  it("highlighted still respects emphasis (a muted note brightens proportionally)", () => {
    const muted = readingMarkerStyle("#a33", "muted", { highlighted: true });
    expect(muted.fillOpacity).toBeLessThan(0.32);
    expect(muted.fillOpacity).toBeGreaterThan(0);
  });

  it("opacities clamp to [0,1] whatever the emphasis multiplies to", () => {
    for (const e of ["muted", "normal", "strong"] as const) {
      const s = readingMarkerStyle("#a33", e);
      expect(s.fillOpacity).toBeGreaterThanOrEqual(0);
      expect(s.fillOpacity).toBeLessThanOrEqual(1);
      expect(s.strokeOpacity).toBeLessThanOrEqual(1);
    }
  });
});
