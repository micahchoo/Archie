import { describe, it, expect } from "vitest";
import { dispatchFitBounds, fitBoundsRect, type FitOptions, type ViewportLike, type AnnotationLike } from "./fitbounds.js";
import type { W3CSelector } from "@render/core";

// ════════════════════════════════════════════════════════════════════════════════════
// THE PHASE-1 GATE (spike-0001 acceptance criterion).
//
// "anvil's editor mounted via the new @render/mount path passes the SAME fitBounds-on-select
// behavioral test as anvil-stock." anvil-stock's behavior is characterized by `fitBoundsRect`
// (the P1-1 oracle, lifted from anvil fitForSidebar). This test proves the NEW PATH —
// dispatchFitBounds, exactly what createMount's MountSurface.fitBounds runs — fits the viewport
// to the SAME rect, for rect AND polygon, given Annotorious-shaped W3C annotations. No real OSD:
// the viewport is mocked, so the gate is deterministic and headless.
// ════════════════════════════════════════════════════════════════════════════════════

function mockViewport() {
  const calls: Array<{ x: number; y: number; w: number; h: number }> = [];
  const vp: ViewportLike = {
    imageToViewportRectangle: (x, y, w, h) => ({ x, y, w, h }),
    fitBounds: (rect) => calls.push(rect as { x: number; y: number; w: number; h: number }),
  };
  return { vp, calls };
}

// Annotorious emits W3C annotations with a SpecificResource target + selector.
const rectSel: W3CSelector = { type: "FragmentSelector", value: "xywh=pixel:100,50,200,80" };
const polySel: W3CSelector = { type: "SvgSelector", value: "<svg><polygon points='10,10 110,10 60,90'/></svg>" };
const annotations: AnnotationLike[] = [
  { id: "rect-note", target: { type: "SpecificResource", source: "c1", selector: rectSel } },
  // selector-as-array variant (Annotorious sometimes wraps): the new path must still cope.
  { id: "poly-note", target: { type: "SpecificResource", source: "c1", selector: [polySel] } },
];

const sheet: FitOptions = { containerW: 1000, sidebarW: 300, sidebarIsSheet: true, detailOpen: true };
const sidebarOpen: FitOptions = { containerW: 1000, sidebarW: 300, sidebarIsSheet: false, detailOpen: true };

describe("GATE — the new @render/mount fitBounds path matches the anvil-stock oracle", () => {
  it("rect note: new path fits the exact rect the oracle (fitBoundsRect) computes", () => {
    const { vp, calls } = mockViewport();
    expect(dispatchFitBounds(vp, annotations, "rect-note", sheet)).toBe(true);
    expect(calls[0]).toEqual(fitBoundsRect(rectSel, sheet)); // SAME as the characterization
  });

  it("polygon note (selector-as-array): new path fits the oracle's polygon bbox rect", () => {
    const { vp, calls } = mockViewport();
    expect(dispatchFitBounds(vp, annotations, "poly-note", sheet)).toBe(true);
    expect(calls[0]).toEqual(fitBoundsRect(polySel, sheet));
  });

  it("sidebar-open: new path applies the SAME w/(1-f) expansion as the oracle", () => {
    const { vp, calls } = mockViewport();
    dispatchFitBounds(vp, annotations, "rect-note", sidebarOpen);
    expect(calls[0]).toEqual(fitBoundsRect(rectSel, sidebarOpen));
  });

  it("unknown id: no fit (the new path no-ops on a missing annotation)", () => {
    const { vp, calls } = mockViewport();
    expect(dispatchFitBounds(vp, annotations, "nope", sheet)).toBe(false);
    expect(calls).toHaveLength(0);
  });
});
