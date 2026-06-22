// P0-4/P0-5 — createReadOnlyMount keeps OSD (deep-zoom tiles) but NO annotator (no @annotorious/*,
// no pixi in this module's graph). A live OSD can't run under happy-dom, so the test drives the PURE
// seam `wireReadOnlySurface(viewer, overlay)` directly with a fake viewer + fake overlay — mirroring
// gate.test.ts's mock viewport idiom. Asserts: setAnnotations reaches the overlay; onSelect round-trips
// an id; fitBounds routes through the SAME dispatchFitBounds oracle createMount uses; select-then-fit;
// destroy clears.
import { describe, it, expect, vi } from "vitest";
import { wireReadOnlySurface, guardOpenedImageSource, partitionWholeObject, type ReadOnlyOverlayLike } from "./read-mount.js";
import { MAX_DECODE_DIM } from "./image-cap.js";
import { fitBoundsRect, type ViewportLike, type FitOptions } from "./fitbounds.js";
import { ARCHIE_WHOLE_OBJECT } from "@render/core";
import type { W3CAnnotation, W3CSelector } from "@render/core";

// gate.test.ts mock viewport: imageToViewportRectangle is identity, fitBounds records the rect.
function mockViewport() {
  const calls: Array<{ x: number; y: number; w: number; h: number }> = [];
  const viewport: ViewportLike = {
    imageToViewportRectangle: (x, y, w, h) => ({ x, y, w, h }),
    fitBounds: (rect) => calls.push(rect as { x: number; y: number; w: number; h: number }),
  };
  return { viewport, calls };
}

function fakeOverlay(): ReadOnlyOverlayLike & {
  annotations: W3CAnnotation[] | null;
  selected: string | null;
  cleared: number;
  fireSelect: (id: string | null) => void;
} {
  let sub: ((id: string | null) => void) | null = null;
  const state = {
    annotations: null as W3CAnnotation[] | null,
    selected: null as string | null,
    cleared: 0,
    setAnnotations(anns: W3CAnnotation[]) { this.annotations = anns; },
    setSelected(id: string | null) { this.selected = id; },
    onSelect(cb: (id: string | null) => void) { sub = cb; return () => { sub = null; }; },
    clear() { this.cleared++; },
    fireSelect(id: string | null) { sub?.(id); },
  };
  return state;
}

const rectSel: W3CSelector = { type: "FragmentSelector", value: "xywh=pixel:100,50,200,80" };
const polySel: W3CSelector = { type: "SvgSelector", value: "<svg><polygon points='10,10 110,10 60,90'/></svg>" };
const annotations: W3CAnnotation[] = [
  { id: "rect-note", target: { type: "SpecificResource", source: "c1", selector: rectSel } },
  { id: "poly-note", target: { type: "SpecificResource", source: "c1", selector: [polySel] } },
] as unknown as W3CAnnotation[];
const PLAIN: FitOptions = { containerW: 0, sidebarW: 0, sidebarIsSheet: true, detailOpen: false };

describe("wireReadOnlySurface — setAnnotations / onSelect / destroy", () => {
  it("setAnnotations reaches the overlay", () => {
    const { viewport } = mockViewport();
    const overlay = fakeOverlay();
    const s = wireReadOnlySurface(viewport, overlay, () => annotations);
    s.setAnnotations(annotations);
    expect(overlay.annotations).toBe(annotations);
  });

  it("onSelect round-trips an id from the overlay to the surface subscriber", () => {
    const { viewport } = mockViewport();
    const overlay = fakeOverlay();
    const s = wireReadOnlySurface(viewport, overlay, () => annotations);
    const cb = vi.fn();
    s.onSelect(cb);
    overlay.fireSelect("rect-note");
    expect(cb).toHaveBeenCalledWith("rect-note");
  });

  it("destroy clears the overlay", () => {
    const { viewport } = mockViewport();
    const overlay = fakeOverlay();
    const s = wireReadOnlySurface(viewport, overlay, () => annotations);
    s.destroy();
    expect(overlay.cleared).toBe(1);
  });

  it("setSelected forwards to the overlay", () => {
    const { viewport } = mockViewport();
    const overlay = fakeOverlay();
    const s = wireReadOnlySurface(viewport, overlay, () => annotations);
    s.setSelected("poly-note");
    expect(overlay.selected).toBe("poly-note");
  });
});

describe("guardOpenedImageSource — non-tiled decode cap (image-cap wiring)", () => {
  // OSD's opened world item exposes getContentSize() → source pixel dims (a Point with x/y).
  const item = (w: number, h: number) => ({ getContentSize: () => ({ x: w, y: h }) });

  it("oversized NON-TILED source is guarded (not ok)", () => {
    const r = guardOpenedImageSource(item(MAX_DECODE_DIM + 1, 10), false);
    expect(r.ok).toBe(false);
  });

  it("in-cap NON-TILED source passes", () => {
    const r = guardOpenedImageSource(item(MAX_DECODE_DIM, MAX_DECODE_DIM), false);
    expect(r.ok).toBe(true);
  });

  it("oversized TILED source is NEVER capped (pyramid)", () => {
    const r = guardOpenedImageSource(item(MAX_DECODE_DIM * 10, MAX_DECODE_DIM * 10), true);
    expect(r.ok).toBe(true);
  });

  it("unknown dims (0) degrade upward — pass", () => {
    const r = guardOpenedImageSource(item(0, 0), false);
    expect(r.ok).toBe(true);
  });
});

describe("wireReadOnlySurface.fitBounds — the SHARED dispatchFitBounds oracle (P0-5)", () => {
  it("rect note → the oracle's rect (same as the gate)", () => {
    const { viewport, calls } = mockViewport();
    const s = wireReadOnlySurface(viewport, fakeOverlay(), () => annotations);
    s.fitBounds("rect-note");
    expect(calls[0]).toEqual(fitBoundsRect(rectSel, PLAIN)!);
  });

  it("polygon note (selector-as-array) → the oracle's polygon bbox", () => {
    const { viewport, calls } = mockViewport();
    const s = wireReadOnlySurface(viewport, fakeOverlay(), () => annotations);
    s.fitBounds("poly-note");
    expect(calls[0]).toEqual(fitBoundsRect(polySel, PLAIN)!);
  });

  it("unknown id → no fit", () => {
    const { viewport, calls } = mockViewport();
    const s = wireReadOnlySurface(viewport, fakeOverlay(), () => annotations);
    s.fitBounds("nope");
    expect(calls).toHaveLength(0);
  });

  it("select-then-fit: a user select via the overlay fits that annotation (ADR-0006 nav contract)", () => {
    const { viewport, calls } = mockViewport();
    const overlay = fakeOverlay();
    const s = wireReadOnlySurface(viewport, overlay, () => annotations);
    s.onSelect(() => {});
    overlay.fireSelect("rect-note");
    expect(calls[0]).toEqual(fitBoundsRect(rectSel, PLAIN)!);
  });

  it("select null fits nothing", () => {
    const { viewport, calls } = mockViewport();
    const overlay = fakeOverlay();
    const s = wireReadOnlySurface(viewport, overlay, () => annotations);
    overlay.fireSelect(null);
    expect(calls).toHaveLength(0);
  });

  it("uses adapter-supplied fit options when present", () => {
    const { viewport, calls } = mockViewport();
    const sidebar: FitOptions = { containerW: 1000, sidebarW: 300, sidebarIsSheet: false, detailOpen: true };
    const s = wireReadOnlySurface(viewport, fakeOverlay(), () => annotations, () => sidebar);
    s.fitBounds("rect-note");
    expect(calls[0]).toEqual(fitBoundsRect(rectSel, sidebar)!);
  });
});

// FIX 1 — whole-object notes get a clickable frame instead of being warn-and-dropped (the voynich/o1
// case: a bare-canvas-target note with no region geometry). The partition is pure; the frame routing
// is exercised through the same emitSelect path region clicks use.
const wholeObjBareTarget: W3CAnnotation =
  ({ id: "whole-note", target: { type: "SpecificResource", source: "c1" } }) as unknown as W3CAnnotation;
const wholeObjFlagged: W3CAnnotation =
  ({ id: "flagged-note", [ARCHIE_WHOLE_OBJECT]: true, target: { type: "SpecificResource", source: "c1", selector: rectSel } }) as unknown as W3CAnnotation;

describe("partitionWholeObject — region vs whole-object split (FIX 1)", () => {
  it("a bare-canvas-target note (null selector) → whole-object, not a region", () => {
    const { regions, wholeObjects } = partitionWholeObject([annotations[0]!, wholeObjBareTarget]);
    expect(regions.map((a) => (a as { id: string }).id)).toEqual(["rect-note"]);
    expect(wholeObjects.map((a) => (a as { id: string }).id)).toEqual(["whole-note"]);
  });

  it("an archie:wholeObject:true override → whole-object even WITH a region selector", () => {
    const { regions, wholeObjects } = partitionWholeObject([wholeObjFlagged]);
    expect(regions).toHaveLength(0);
    expect(wholeObjects.map((a) => (a as { id: string }).id)).toEqual(["flagged-note"]);
  });

  it("a plain region note stays a region", () => {
    const { regions, wholeObjects } = partitionWholeObject([annotations[0]!, annotations[1]!]);
    expect(regions).toHaveLength(2);
    expect(wholeObjects).toHaveLength(0);
  });
});

describe("wireReadOnlySurface.emitSelect — the shared select path the frame reuses (FIX 1)", () => {
  it("emitSelect notifies onSelect subscribers (so the note-card opens like a region click)", () => {
    const { viewport } = mockViewport();
    const overlay = fakeOverlay();
    const s = wireReadOnlySurface(viewport, overlay, () => [wholeObjBareTarget]);
    const cb = vi.fn();
    s.onSelect(cb);
    s.emitSelect("whole-note");
    expect(cb).toHaveBeenCalledWith("whole-note");
  });

  it("a whole-object emit fits nothing (no region geometry to frame)", () => {
    const { viewport, calls } = mockViewport();
    const s = wireReadOnlySurface(viewport, fakeOverlay(), () => [wholeObjBareTarget]);
    s.emitSelect("whole-note");
    expect(calls).toHaveLength(0); // dispatchFitBounds finds the record but its null selector → no rect
  });
});
