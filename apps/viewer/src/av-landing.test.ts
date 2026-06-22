// Phase 3 / 4.7 — AV seek-paused landing. The clamp resolves a route `t=` to a safe initial-seek offset
// (paused — section-142). Garbage → 0; out-of-range clamps to the loaded duration; never NaN/negative.
import { describe, it, expect } from "vitest";
import { clampSeekStart } from "./av-landing.js";

describe("clampSeekStart — route t= → paused initial-seek offset (4.7)", () => {
  it("returns the parsed start for an in-range t=", () => {
    expect(clampSeekStart("t=12", 300)).toBe(12);
    expect(clampSeekStart("t=12,15.5", 300)).toBe(12); // range start, not end
    expect(clampSeekStart("12", 300)).toBe(12); // bare RFC form
  });

  it("clamps a start past the duration down to the duration", () => {
    expect(clampSeekStart("t=500", 300)).toBe(300);
  });

  it("garbage / missing t → 0 (land at the head, paused)", () => {
    expect(clampSeekStart("t=abc", 300)).toBe(0);
    expect(clampSeekStart("", 300)).toBe(0);
    expect(clampSeekStart(undefined, 300)).toBe(0);
    expect(clampSeekStart(null, 300)).toBe(0);
    expect(clampSeekStart("t=-5", 300)).toBe(0); // parseTimeFragment rejects negative → 0
  });

  it("never returns NaN or negative for any input", () => {
    for (const t of ["t=NaN", "t=", "t=,", "t=1,2,3", "nonsense"]) {
      const r = clampSeekStart(t, 300);
      expect(Number.isNaN(r)).toBe(false);
      expect(r).toBeGreaterThanOrEqual(0);
    }
  });

  it("with unknown duration (≤0 / non-finite) clamps only at the floor of 0", () => {
    expect(clampSeekStart("t=42", 0)).toBe(42); // metadata not yet known → no upper clamp
    expect(clampSeekStart("t=42", NaN)).toBe(42);
    expect(clampSeekStart("t=abc", 0)).toBe(0);
  });
});
