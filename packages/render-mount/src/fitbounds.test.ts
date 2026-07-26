import { describe, it, expect } from "vitest";
import { fitBoundsRect, applyFitBounds, clampedFitRect, clampToContentBounds, type FitOptions, type ViewportLike } from "./fitbounds.js";
import type { W3CFragmentSelector, W3CSvgSelector } from "@render/core";

// Characterization test (the Phase-1 acceptance ORACLE). Pins anvil's fitForSidebar behavior
// (EmbeddedReader.svelte:314-337) as a PURE image-space-rect computation, so the new
// @render/mount path can be held to the SAME spec as anvil-stock (the spike's gate).
//
// anvil's rule: if the sidebar is a non-sheet open panel with a known width, expand the
// annotation's bounds rightward so the visible (non-sidebar) region centers it:
//   f = min(0.85, sidebarW / containerW);  expandedW = w / (1 - f)
// Otherwise fit the annotation's plain bounds (Annotorious fitBounds(id), centered).

const rect: W3CFragmentSelector = { type: "FragmentSelector", value: "xywh=pixel:100,50,200,80" };
const poly: W3CSvgSelector = { type: "SvgSelector", value: "<svg><polygon points='10,10 110,10 60,90'/></svg>" };

// `margin: 0` on all three fixtures ON PURPOSE. These pin the ANVIL characterization — the sidebar
// reservation math and nothing else — so they must keep asserting the region's own bounds. Archie's
// breathing-room margin (Archie-52a0 / V44) is a deliberate addition ON TOP of that oracle and has
// its own describe block below; folding it into these fixtures would quietly restate the anvil spec
// as something anvil never did, and leave the margin itself unpinned.
const sidebarOpen: FitOptions = { containerW: 1000, sidebarW: 300, sidebarIsSheet: false, detailOpen: true, margin: 0 };
const sheet: FitOptions = { containerW: 1000, sidebarW: 300, sidebarIsSheet: true, detailOpen: true, margin: 0 };
const closed: FitOptions = { containerW: 1000, sidebarW: 0, sidebarIsSheet: false, detailOpen: false, margin: 0 };

describe("fitBoundsRect — anvil fitForSidebar characterization (the gate oracle)", () => {
  it("plain fit (sidebar is a sheet) returns the annotation's own bounds", () => {
    expect(fitBoundsRect(rect, sheet)).toEqual({ x: 100, y: 50, w: 200, h: 80 });
  });

  it("plain fit (detail closed / no sidebar) returns the annotation's own bounds", () => {
    expect(fitBoundsRect(rect, closed)).toEqual({ x: 100, y: 50, w: 200, h: 80 });
  });

  it("sidebar-open expands width by w/(1-f) keeping x,y,h (reserves room for the panel)", () => {
    // f = 300/1000 = 0.3; expandedW = 200 / 0.7 = 285.714...
    const r = fitBoundsRect(rect, sidebarOpen)!;
    expect(r.x).toBe(100);
    expect(r.y).toBe(50);
    expect(r.h).toBe(80);
    expect(r.w).toBeCloseTo(200 / 0.7, 6);
  });

  it("caps the sidebar fraction at 0.85 (anvil's Math.min guard)", () => {
    // sidebarW 950 of 1000 would be f=0.95; capped to 0.85 -> expandedW = 200/0.15
    const r = fitBoundsRect(rect, { containerW: 1000, sidebarW: 950, sidebarIsSheet: false, detailOpen: true, margin: 0 })!;
    expect(r.w).toBeCloseTo(200 / 0.15, 6);
  });

  it("works for a polygon selector via its bounding box", () => {
    // polygon bbox = {x:10,y:10,w:100,h:80}; plain fit (sheet)
    expect(fitBoundsRect(poly, sheet)).toEqual({ x: 10, y: 10, w: 100, h: 80 });
  });

  it("returns null for a degenerate / unparseable selector", () => {
    expect(fitBoundsRect({ type: "SvgSelector", value: "<polygon points='NaN'/>" }, sheet)).toBeNull();
  });

  it("falls back to plain bounds when containerW is unknown (0), even if detail is open", () => {
    expect(fitBoundsRect(rect, { containerW: 0, sidebarW: 300, sidebarIsSheet: false, detailOpen: true, margin: 0 })).toEqual({ x: 100, y: 50, w: 200, h: 80 });
  });
});

// The breathing-room margin (Archie-52a0 / V44) — Archie's addition on top of the anvil oracle
// above. Before it, arriving at a note pinned the region's edges to the viewport's: the reader saw
// the region and nothing it sits in, and the selection ring (drawn OUTSIDE the geometry) was itself
// half off-screen at the exact moment of closest looking.
describe("fitBoundsRect — breathing-room margin (V44)", () => {
  const plain: Omit<FitOptions, "margin"> = { containerW: 1000, sidebarW: 300, sidebarIsSheet: true, detailOpen: true };

  it("DEFAULTS to a 15%-larger rect — an omitted margin is not a zero margin", () => {
    // 200×80 grown by 0.15 → 230×92, centred on the same point (100,50 → 85,44).
    expect(fitBoundsRect(rect, plain)).toEqual({ x: 85, y: 44, w: 230, h: 92 });
  });

  it("keeps the region's CENTRE fixed while growing it (the fit still lands on the note)", () => {
    const r = fitBoundsRect(rect, plain)!;
    expect(r.x + r.w / 2).toBeCloseTo(100 + 200 / 2, 6);
    expect(r.y + r.h / 2).toBeCloseTo(50 + 80 / 2, 6);
  });

  it("is a FRACTION, so a tiny region and a huge one get the same proportional room", () => {
    const tiny: W3CFragmentSelector = { type: "FragmentSelector", value: "xywh=pixel:0,0,10,10" };
    const huge: W3CFragmentSelector = { type: "FragmentSelector", value: "xywh=pixel:0,0,1000,1000" };
    expect(fitBoundsRect(tiny, plain)!.w / 10).toBeCloseTo(1.15, 6);
    expect(fitBoundsRect(huge, plain)!.w / 1000).toBeCloseTo(1.15, 6);
  });

  it("applies to a polygon via its bbox, like every other fit path", () => {
    // polygon bbox = 10,10,100,80 → grown 15% about its centre.
    expect(fitBoundsRect(poly, plain)).toEqual({ x: 2.5, y: 4, w: 115, h: 92 });
  });

  it("runs BEFORE the sidebar reservation, so the panel reserves room around a breathing region", () => {
    const r = fitBoundsRect(rect, { ...plain, sidebarIsSheet: false })!;
    expect(r.w).toBeCloseTo(230 / 0.7, 6); // the INFLATED width widened, not the raw 200
  });

  it("an explicit margin of 0 restores the historical edge-to-edge fit", () => {
    expect(fitBoundsRect(rect, { ...plain, margin: 0 })).toEqual({ x: 100, y: 50, w: 200, h: 80 });
  });

  it("a negative or non-finite margin degrades to no margin rather than inverting the rect", () => {
    expect(fitBoundsRect(rect, { ...plain, margin: -0.5 })).toEqual({ x: 100, y: 50, w: 200, h: 80 });
    expect(fitBoundsRect(rect, { ...plain, margin: Number.NaN })).toEqual({ x: 100, y: 50, w: 200, h: 80 });
  });

  it("margin overshoot off the image is the CONTENT clamp's job, not the margin's", () => {
    // A region flush to the origin grows to negative x/y; clampToContentBounds owns that, and the
    // fit path runs it after. The margin must not silently pre-clamp, or the two would disagree.
    const flush: W3CFragmentSelector = { type: "FragmentSelector", value: "xywh=pixel:0,0,100,100" };
    const r = fitBoundsRect(flush, plain)!;
    expect(r.x).toBeLessThan(0);
    expect(clampToContentBounds(r, { width: 1000, height: 800 })).toEqual({ x: 0, y: 0, w: 107.5, h: 107.5 });
  });
});

// The LEFT-flank reservation (Archie-40fe / V48). The right-hand sidebar is a panel the canvas ends
// BEFORE; the legend and the note card are chrome the canvas continues UNDERNEATH. Measured in the
// viewer, they stacked into a contiguous 502px column — ~22% of a 924x800 canvas, down its whole left
// edge — at the moment the reader had just asked to zoom in on a detail.
describe("fitBoundsRect — left-flank reservation for floating chrome (V48)", () => {
  const base: FitOptions = { containerW: 1000, sidebarW: 0, sidebarIsSheet: true, detailOpen: false, margin: 0 };

  it("widens LEFTWARD so the region sits clear of the occluding column", () => {
    // f = 300/1000 = 0.3 → w = 200/0.7 = 285.71, and x slides left by the occluded share (w*0.3).
    const r = fitBoundsRect(rect, { ...base, leftInsetW: 300 })!;
    expect(r.w).toBeCloseTo(200 / 0.7, 6);
    expect(r.x).toBeCloseTo(100 - (200 / 0.7) * 0.3, 6);
    expect(r.y).toBe(50);
    expect(r.h).toBe(80);
  });

  it("leaves the region exactly inside the VISIBLE window, which is the whole point", () => {
    // The invariant worth asserting: whatever the reservation, the visible sub-rect must be the
    // region itself. Anything else means the camera framed something the reader cannot see.
    const r = fitBoundsRect(rect, { ...base, leftInsetW: 300 })!;
    const visibleLeft = r.x + r.w * 0.3;
    expect(visibleLeft).toBeCloseTo(100, 6);
    expect(visibleLeft + r.w * 0.7).toBeCloseTo(300, 6); // 100 + 200
  });

  it("reserves BOTH flanks at once when a sidebar is open too", () => {
    // fL 0.2 + fR 0.3 → visible 0.5 → w = 400; region starts 0.2*400 = 80 in.
    const r = fitBoundsRect(rect, { containerW: 1000, sidebarW: 300, sidebarIsSheet: false, detailOpen: true, margin: 0, leftInsetW: 200 })!;
    expect(r.w).toBeCloseTo(400, 6);
    expect(r.x).toBeCloseTo(100 - 80, 6);
    expect(r.x + r.w * 0.2).toBeCloseTo(100, 6); // region's left edge is where the chrome ends
  });

  it("caps the TOTAL reservation, not each side — two greedy flanks can't invert the rect", () => {
    // 600 + 600 of 1000 would be 1.2 → a NEGATIVE visible width. The cap is over the sum.
    const r = fitBoundsRect(rect, { containerW: 1000, sidebarW: 600, sidebarIsSheet: false, detailOpen: true, margin: 0, leftInsetW: 600 })!;
    expect(r.w).toBeGreaterThan(0);
    expect(r.w).toBeCloseTo(200 / 0.15, 6); // MAX_SIDEBAR_FRACTION 0.85
  });

  it("scales a capped pair proportionally, so the region lands BETWEEN them", () => {
    // Equal greedy flanks stay equal after the cap: half the 0.85 each, so the region is centred.
    const r = fitBoundsRect(rect, { containerW: 1000, sidebarW: 600, sidebarIsSheet: false, detailOpen: true, margin: 0, leftInsetW: 600 })!;
    expect(r.x + r.w * 0.425).toBeCloseTo(100, 6);
  });

  it("is inert when nothing is occluding (the overwhelmingly common case)", () => {
    expect(fitBoundsRect(rect, base)).toEqual({ x: 100, y: 50, w: 200, h: 80 });
    expect(fitBoundsRect(rect, { ...base, leftInsetW: 0 })).toEqual({ x: 100, y: 50, w: 200, h: 80 });
  });

  it("composes with the breathing-room margin rather than replacing it", () => {
    // The margin applies to the REGION first, then the flanks reserve around the breathing region.
    const r = fitBoundsRect(rect, { ...base, margin: 0.15, leftInsetW: 300 })!;
    expect(r.w).toBeCloseTo(230 / 0.7, 6); // 230 = the inflated width
  });
});

describe("applyFitBounds — dispatch to an OSD-like viewport (the mockable gate seam)", () => {
  function mockViewport() {
    const calls: Array<{ rect: unknown; immediately: boolean | undefined }> = [];
    const vp: ViewportLike = {
      // fake mapping: tag the image rect so we can assert it round-trips to fitBounds
      imageToViewportRectangle: (x, y, w, h) => ({ vx: x, vy: y, vw: w, vh: h }),
      fitBounds: (rect, immediately) => calls.push({ rect, immediately }),
    };
    return { vp, calls };
  }

  // applyFitBounds fits the viewport to the oracle's image rect (round-tripped through the identity mock).
  it("computes the image rect and fits the viewport to it (rect selector, plain)", () => {
    const { vp, calls } = mockViewport();
    expect(applyFitBounds(vp, rect, sheet)).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.rect).toEqual({ vx: 100, vy: 50, vw: 200, vh: 80 });
    expect(calls[0]!.immediately).toBe(false);
  });

  it("handles a polygon selector uniformly (the de-dup the spike wanted; OSD goToTarget is rect-only)", () => {
    const { vp, calls } = mockViewport();
    expect(applyFitBounds(vp, poly, sheet)).toBe(true);
    expect(calls[0]!.rect).toEqual({ vx: 10, vy: 10, vw: 100, vh: 80 });
  });

  it("widens the rect for an open sidebar before fitting", () => {
    const { vp, calls } = mockViewport();
    applyFitBounds(vp, rect, sidebarOpen);
    expect((calls[0]!.rect as { vw: number }).vw).toBeCloseTo(200 / 0.7, 6);
  });

  it("no-ops (returns false, no fitBounds call) on a degenerate selector", () => {
    const { vp, calls } = mockViewport();
    expect(applyFitBounds(vp, { type: "SvgSelector", value: "<polygon points='NaN'/>" }, sheet)).toBe(false);
    expect(calls).toHaveLength(0);
  });
});

// clampToContentBounds — image-pixel out-of-bounds clamp (strategy 4.5). A hand-edited zip can swap
// a smaller image under an annotation whose xywh now lies partly or wholly off the image. We intersect
// the region rect with the image content bounds (0,0..width,height); an EMPTY intersection degrades to
// the WHOLE-image fit instead of panning to a blank/edge view. NOT the bounded-MAP clamp (clampedFitRect).
describe("clampToContentBounds (image-pixel out-of-bounds clamp, strategy 4.5)", () => {
  const content = { width: 1000, height: 800 };

  it("leaves a fully in-bounds rect unchanged (no regression to the oracle's rect)", () => {
    const rect = { x: 100, y: 50, w: 200, h: 80 };
    expect(clampToContentBounds(rect, content)).toEqual(rect);
  });

  it("an in-bounds rect flush to the image edge is unchanged", () => {
    const rect = { x: 0, y: 0, w: 1000, h: 800 };
    expect(clampToContentBounds(rect, content)).toEqual(rect);
  });

  it("a wholly off-image rect degrades to the whole-image fit", () => {
    const rect = { x: 5000, y: 5000, w: 100, h: 100 }; // entirely past a 1000×800 image
    expect(clampToContentBounds(rect, content)).toEqual({ x: 0, y: 0, w: 1000, h: 800 });
  });

  it("a negative-origin rect that misses the image entirely degrades to whole-image", () => {
    const rect = { x: -500, y: -500, w: 100, h: 100 };
    expect(clampToContentBounds(rect, content)).toEqual({ x: 0, y: 0, w: 1000, h: 800 });
  });

  it("a rect spilling off the right edge is intersected to the on-image part", () => {
    const rect = { x: 900, y: 100, w: 400, h: 100 }; // 900..1300, image ends at 1000
    expect(clampToContentBounds(rect, content)).toEqual({ x: 900, y: 100, w: 100, h: 100 });
  });

  it("a rect straddling the top-left origin is clipped to the visible quadrant", () => {
    const rect = { x: -50, y: -50, w: 200, h: 200 }; // -50..150 → 0..150
    expect(clampToContentBounds(rect, content)).toEqual({ x: 0, y: 0, w: 150, h: 150 });
  });

  it("an unknown content size (0×0) leaves the rect untouched (no info to clamp against)", () => {
    const rect = { x: 100, y: 50, w: 200, h: 80 };
    expect(clampToContentBounds(rect, { width: 0, height: 0 })).toEqual(rect);
  });
});

// applyFitBounds wired with content bounds — the clamp at the fit seam (strategy 4.5).
describe("applyFitBounds + content bounds (the wired out-of-bounds clamp)", () => {
  function mockViewport() {
    const calls: Array<{ x: number; y: number; w: number; h: number }> = [];
    const vp: ViewportLike = {
      imageToViewportRectangle: (x, y, w, h) => ({ x, y, w, h }),
      fitBounds: (rect) => calls.push(rect as { x: number; y: number; w: number; h: number }),
    };
    return { vp, calls };
  }

  it("an in-bounds annotation is unchanged when content is supplied (no regression)", () => {
    const { vp, calls } = mockViewport();
    // rect selector = xywh=pixel:100,50,200,80; image 1000×800 fully contains it.
    expect(applyFitBounds(vp, rect, sheet, { width: 1000, height: 800 })).toBe(true);
    expect(calls[0]).toEqual({ x: 100, y: 50, w: 200, h: 80 });
  });

  it("an off-image annotation (smaller swapped image) degrades to the whole-image fit", () => {
    const { vp, calls } = mockViewport();
    // The same rect (x=100..300) lies entirely past a 50×50 image → whole-image fit.
    expect(applyFitBounds(vp, rect, sheet, { width: 50, height: 50 })).toBe(true);
    expect(calls[0]).toEqual({ x: 0, y: 0, w: 50, h: 50 });
  });

  it("omitting content matches the legacy oracle exactly (additive, no behavior change)", () => {
    const { vp, calls } = mockViewport();
    applyFitBounds(vp, rect, sheet);
    expect(calls[0]).toEqual(fitBoundsRect(rect, sheet)!);
  });
});

// clampedFitRect — the bounded-map fit (ADR-0015). Pins the property that fixes the "camera shifts off
// the note" bug: the returned fit box stays inside the region (when it fits), so the live
// animation-finish clamp has nothing to correct. All boxes are in OSD viewport coords; region = 0,0..100,100.
describe("clampedFitRect (bounded-map note fit)", () => {
  const region = { x: 0, y: 0, w: 100, h: 100 };

  it("leaves an interior note centred (square viewport, no clamp needed)", () => {
    const note = { x: 40, y: 40, w: 20, h: 20 }; // centre 50,50 — comfortably inside
    expect(clampedFitRect(note, 1, region)).toEqual({ x: 40, y: 40, w: 20, h: 20 });
  });

  it("clamps an edge note inward so the viewport stays in-region (the yank it prevents)", () => {
    const note = { x: 0, y: 40, w: 10, h: 20 }; // wants centre x=5, but a 20-wide box would spill left
    const fit = clampedFitRect(note, 1, region);
    // Grown to the square aspect (20×20), centre pushed to x=10 so the left edge sits exactly on region.x=0.
    expect(fit).toEqual({ x: 0, y: 40, w: 20, h: 20 });
    expect(fit.x).toBeGreaterThanOrEqual(region.x); // never spills past the bound
  });

  it("grows the note to the viewport aspect before clamping (landscape frame widens the box)", () => {
    const note = { x: 40, y: 40, w: 20, h: 20 };
    // aspect 2 (W=2H): a square note becomes a 40×20 viewport box, still centred at 50,50.
    expect(clampedFitRect(note, 2, region)).toEqual({ x: 30, y: 40, w: 40, h: 20 });
  });

  it("does NOT clamp an axis where the box is larger than the region (can't centre an oversize fit)", () => {
    const note = { x: -10, y: 40, w: 200, h: 20 }; // centre x=90; grown box (200 wide) exceeds region.w
    const fit = clampedFitRect(note, 1, region);
    expect(fit.x + fit.w / 2).toBe(90); // centre untouched on the oversize (x) axis
  });
});
