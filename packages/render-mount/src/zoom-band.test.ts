import { describe, it, expect } from "vitest";
import { zoomBand } from "./zoom-band.js";

describe("zoomBand (worklist 1.1 — the scale-aware marker contract)", () => {
  it("fit-width and below is far (marks need presence)", () => {
    expect(zoomBand(0.5)).toBe("far");
    expect(zoomBand(1)).toBe("far");
    expect(zoomBand(1.25)).toBe("far");
  });
  it("reading distance is mid", () => {
    expect(zoomBand(1.26)).toBe("mid");
    expect(zoomBand(4)).toBe("mid");
  });
  it("inside-a-mark territory is near (outlines recede)", () => {
    expect(zoomBand(4.01)).toBe("near");
    expect(zoomBand(16)).toBe("near");
  });
  it("a degenerate ratio degrades to far, never throws (first paint can race getHomeZoom)", () => {
    expect(zoomBand(NaN)).toBe("far");
    expect(zoomBand(Infinity)).toBe("far"); // homeZoom=0 → ∞ is a degenerate read, not deep zoom
  });
});
