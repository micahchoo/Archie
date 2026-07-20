import { describe, it, expect } from "vitest";
import {
  readingMarkerStyle,
  withZoomBand,
  arrivalPulseIntensity,
  withArrivalPulse,
  ARRIVAL_PULSE_MS,
} from "./marker-style.js";

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

// Archie-a6fb — the screen-space modulations that replaced the inert `.a9s-annotation` CSS.

describe("withZoomBand", () => {
  const base = readingMarkerStyle("#a33", "normal"); // width 2, strokeOpacity .95, fillOpacity .18

  it("mid = the authored resting weight (no change)", () => {
    expect(withZoomBand(base, "mid")).toEqual(base);
  });

  it("far = presence boost: heavier stroke, colour/opacity untouched", () => {
    const s = withZoomBand(base, "far");
    expect(s.strokeWidth).toBeGreaterThan(base.strokeWidth); // 2 → 3
    expect(s.strokeOpacity).toBe(base.strokeOpacity);
    expect(s.fillOpacity).toBe(base.fillOpacity);
    expect(s.stroke).toBe(base.stroke);
  });

  it("near = recede: stroke + fill opacity halve, width unchanged", () => {
    const s = withZoomBand(base, "near");
    expect(s.strokeOpacity).toBeCloseTo(base.strokeOpacity * 0.5);
    expect(s.fillOpacity).toBeCloseTo(base.fillOpacity * 0.5);
    expect(s.strokeWidth).toBe(base.strokeWidth);
  });

  it("composes with the comparing regime (outline-only stays fill-zero at every band)", () => {
    const comparing = readingMarkerStyle("#a33", "normal", { comparing: true }); // fillOpacity 0
    for (const band of ["far", "mid", "near"] as const) {
      expect(withZoomBand(comparing, band).fillOpacity).toBe(0);
    }
  });

  it("never produces an out-of-range opacity", () => {
    const bright = readingMarkerStyle("#a33", "strong", { highlighted: true });
    for (const band of ["far", "mid", "near"] as const) {
      const s = withZoomBand(bright, band);
      expect(s.strokeOpacity).toBeLessThanOrEqual(1);
      expect(s.fillOpacity).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("arrivalPulseIntensity", () => {
  it("is full (1) at the moment of arrival and before it", () => {
    expect(arrivalPulseIntensity(0)).toBe(1);
    expect(arrivalPulseIntensity(-50)).toBe(1); // clamps below 0
  });

  it("has decayed to 0 by the duration and stays there after", () => {
    expect(arrivalPulseIntensity(ARRIVAL_PULSE_MS)).toBe(0);
    expect(arrivalPulseIntensity(ARRIVAL_PULSE_MS * 2)).toBe(0);
  });

  it("decays monotonically and eases out (steeper early)", () => {
    const q1 = arrivalPulseIntensity(ARRIVAL_PULSE_MS * 0.25);
    const q2 = arrivalPulseIntensity(ARRIVAL_PULSE_MS * 0.5);
    const q3 = arrivalPulseIntensity(ARRIVAL_PULSE_MS * 0.75);
    expect(q1).toBeGreaterThan(q2);
    expect(q2).toBeGreaterThan(q3);
    // ease-out: the first quarter sheds more intensity than the third
    expect(1 - q1).toBeGreaterThan(q2 - q3);
  });

  it("a zero/negative duration is an instant no-pulse", () => {
    expect(arrivalPulseIntensity(0, 0)).toBe(0);
  });
});

describe("withArrivalPulse", () => {
  const base = readingMarkerStyle("#a33", "normal");

  it("intensity 0 leaves the resting spec untouched", () => {
    expect(withArrivalPulse(base, 0)).toEqual(base);
  });

  it("peak intensity emphasizes: heavier stroke, full stroke opacity, fuller fill", () => {
    const s = withArrivalPulse(base, 1);
    expect(s.strokeWidth).toBe(base.strokeWidth * 2);
    expect(s.strokeOpacity).toBe(1);
    expect(s.fillOpacity).toBeGreaterThan(base.fillOpacity);
  });

  it("mid intensity lands between resting and peak", () => {
    const mid = withArrivalPulse(base, 0.5);
    expect(mid.strokeWidth).toBeGreaterThan(base.strokeWidth);
    expect(mid.strokeWidth).toBeLessThan(base.strokeWidth * 2);
  });

  it("keeps opacities in range and preserves colour (composes with reading style)", () => {
    const s = withArrivalPulse(readingMarkerStyle("#0af", "strong"), 1);
    expect(s.stroke).toBe("#0af");
    expect(s.fill).toBe("#0af");
    expect(s.strokeOpacity).toBeLessThanOrEqual(1);
    expect(s.fillOpacity).toBeLessThanOrEqual(1);
  });
});

// The viewer's styleOf composition order (Archie-c1d9): withArrivalPulse(withZoomBand(base, band), k).
// withZoomBand is the resting scale modulation; the arrival pulse rides LAST. Pinned here because the
// composition itself lives in Reader.svelte (untestable) and the ticket flags the fillOpacity-on-
// comparing transient as a thing not to make worse.
describe("viewer compose order — withArrivalPulse(withZoomBand(base, band), k)", () => {
  const compose = (band: "far" | "mid" | "near", k: number, state = {}) =>
    withArrivalPulse(withZoomBand(readingMarkerStyle("#a33", "normal", state), band), k);

  it("at rest (k=0), the comparing outline stays fill-zero at every band — no transient", () => {
    for (const band of ["far", "mid", "near"] as const) {
      expect(compose(band, 0, { comparing: true }).fillOpacity).toBe(0);
    }
  });

  it("during the pulse (k>0), the comparing mark's fill lifts toward 0.3 — the EXISTING transient, unchanged by the band wrap", () => {
    // withZoomBand leaves an outline mark's fill at 0; withArrivalPulse then lerps it toward max(0,0.3).
    // The transient is identical whether or not withZoomBand ran first (it doesn't touch a zero fill at
    // far, and halves a zero to zero at near) — so wiring the band in did not worsen it.
    expect(compose("far", 1, { comparing: true }).fillOpacity).toBeCloseTo(0.3, 5);
    expect(compose("near", 1, { comparing: true }).fillOpacity).toBeCloseTo(0.3, 5);
    expect(compose("mid", 1, { comparing: true }).fillOpacity).toBeCloseTo(0.3, 5);
  });

  it("far band still thickens the stroke under the resting pulse (presence at fit-width survives composition)", () => {
    const restingFar = withZoomBand(readingMarkerStyle("#a33", "normal"), "far");
    expect(compose("far", 0).strokeWidth).toBe(restingFar.strokeWidth); // k=0 → pulse is a no-op over the band weight
    expect(restingFar.strokeWidth).toBeGreaterThan(2);
  });
});
