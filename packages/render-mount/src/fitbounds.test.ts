import { describe, it, expect } from "vitest";
import { fitBoundsRect, applyFitBounds, clampedFitRect, type FitOptions, type ViewportLike } from "./fitbounds.js";
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

const sidebarOpen: FitOptions = { containerW: 1000, sidebarW: 300, sidebarIsSheet: false, detailOpen: true };
const sheet: FitOptions = { containerW: 1000, sidebarW: 300, sidebarIsSheet: true, detailOpen: true };
const closed: FitOptions = { containerW: 1000, sidebarW: 0, sidebarIsSheet: false, detailOpen: false };

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
    const r = fitBoundsRect(rect, { containerW: 1000, sidebarW: 950, sidebarIsSheet: false, detailOpen: true })!;
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
    expect(fitBoundsRect(rect, { containerW: 0, sidebarW: 300, sidebarIsSheet: false, detailOpen: true })).toEqual({ x: 100, y: 50, w: 200, h: 80 });
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
