// Archie-52a0 — the selection halo: the ring that answers "which mark is open".
//
// SCOPE, honestly stated. happy-dom has no layout and no compositor, so this suite pins the things
// that ARE checkable off the DOM: the contrast choice, the ring's three-stroke structure, its
// geometry and anchoring, its decorative/inert-ness, and the single-ring lifecycle. It cannot tell
// you the ring is VISIBLE — that it isn't clipped by the SVG viewport, that it reads against the
// tile beneath it, that it doesn't shield the mark's hit target. Those are pointer/paint facts and
// belong to `apps/viewer/e2e` and `recipes/smoke.mjs` (see .claude/rules/osd-overlay-wrapper.md for
// the case where every cheap test passes against code a real mouse can't use).
//
// Fake viewer: the read-overlay.test.ts:11-30 donor, unchanged.
import { describe, it, expect } from "vitest";
import { createSelectionHalo, contrastInk, type HaloViewerLike } from "./selection-halo.js";
import type { OverlayShape } from "./overlay-shape.js";
import type { AnnotationLike } from "@render/core";

type Overlay = { element: SVGElement | HTMLElement; location: unknown };

function fakeViewer(opts: { hasItem?: boolean } = {}): HaloViewerLike & {
  overlays: Overlay[];
  removed: (SVGElement | HTMLElement)[];
  openHandlers: (() => void)[];
} {
  const overlays: Overlay[] = [];
  const removed: (SVGElement | HTMLElement)[] = [];
  const openHandlers: (() => void)[] = [];
  const hasItem = opts.hasItem ?? true;
  return {
    overlays,
    removed,
    openHandlers,
    addOverlay: (o) => overlays.push(o as Overlay),
    removeOverlay: (el) => removed.push(el),
    world: { getItemAt: () => (hasItem ? { getBounds: () => ({ x: 0, y: 0, width: 1, height: 1 }) } : undefined) },
    viewport: { imageToViewportRectangle: (x, y, w, h) => ({ x, y, w, h }) },
    addOnceHandler: (name, handler) => { if (name === "open") openHandlers.push(handler); },
  };
}

const RECT: OverlayShape = { kind: "rect", box: { x: 100, y: 50, w: 200, h: 80 } };
const POLY: OverlayShape = { kind: "polygon", points: [{ x: 10, y: 10 }, { x: 110, y: 10 }, { x: 60, y: 90 }] };

const rectAnn = (id: string, value = "xywh=pixel:100,50,200,80"): AnnotationLike =>
  ({ id, target: { type: "SpecificResource", source: "c1", selector: { type: "FragmentSelector", value } } }) as unknown as AnnotationLike;
const wholeObjectAnn = (id: string): AnnotationLike =>
  ({ id, target: { type: "SpecificResource", source: "c1" } }) as unknown as AnnotationLike;

const svgOf = (v: ReturnType<typeof fakeViewer>): SVGSVGElement => v.overlays[0]!.element as SVGSVGElement;
const strokesOf = (svg: SVGSVGElement): string[] =>
  [...svg.children].map((c) => c.getAttribute("stroke") ?? "");

describe("contrastInk — white on dark, near-black on light (Archie-ed50)", () => {
  it("returns white for a dark mark colour", () => {
    expect(contrastInk("#1a5cb3")).toBe("#ffffff");
    expect(contrastInk("#000")).toBe("#ffffff");
  });

  it("returns near-black for a light mark colour", () => {
    expect(contrastInk("#ffc107")).toBe("#111111");
    expect(contrastInk("#fff")).toBe("#111111");
  });

  it("reads 3-digit hex, 6-digit hex, rgb() and rgba() alike", () => {
    expect(contrastInk("#fc0")).toBe("#111111");
    expect(contrastInk("#ffcc00")).toBe("#111111");
    expect(contrastInk("rgb(255, 204, 0)")).toBe("#111111");
    expect(contrastInk("rgba(255, 204, 0, 0.5)")).toBe("#111111");
  });

  it("degrades to WHITE for a colour it cannot resolve — the embed's `currentColor` case", () => {
    // No computed style to ask here; the dark shadow ring underneath is sized for a white halo,
    // so white is the safe default rather than a guess at the host's accent.
    expect(contrastInk("currentColor")).toBe("#ffffff");
    expect(contrastInk("var(--accent)")).toBe("#ffffff");
    expect(contrastInk(undefined)).toBe("#ffffff");
  });
});

describe("createSelectionHalo.show — the ring's structure", () => {
  it("draws THREE concentric strokes: shadow, contrast ink, then the mark's own colour", () => {
    // The three exist for three different jobs and none is redundant: the shadow makes the ring
    // legible on a tile of the ink's own tone, the ink IS the selection signal, and the colour line
    // keeps "which reading" — which a recolour-the-mark approach would have spent (annomea's
    // viewer.ts:161 swaps to a fixed accent; it can afford to, Archie can't).
    const v = fakeViewer();
    createSelectionHalo(v).show(RECT, "#1a5cb3");
    expect(strokesOf(svgOf(v))).toEqual(["rgba(0,0,0,0.55)", "#ffffff", "#1a5cb3"]);
  });

  it("flips BOTH the ink and its shadow for a light mark colour", () => {
    const v = fakeViewer();
    createSelectionHalo(v).show(RECT, "#ffc107");
    expect(strokesOf(svgOf(v))).toEqual(["rgba(255,255,255,0.65)", "#111111", "#ffc107"]);
  });

  it("falls back to `currentColor` for the inner line when no colour is supplied (embed path)", () => {
    const v = fakeViewer();
    createSelectionHalo(v).show(RECT);
    expect(strokesOf(svgOf(v))).toEqual(["rgba(0,0,0,0.55)", "#ffffff", "currentColor"]);
  });

  it("orders the strokes outermost-first so the colour line paints on top", () => {
    const v = fakeViewer();
    createSelectionHalo(v).show(RECT, "#1a5cb3");
    const widths = [...svgOf(v).children].map((c) => Number(c.getAttribute("stroke-width")));
    expect(widths[0]).toBeGreaterThan(widths[1]!);
    expect(widths[1]).toBeGreaterThan(widths[2]!);
  });

  it("holds ring weight constant at any zoom (non-scaling-stroke on every ring)", () => {
    const v = fakeViewer();
    createSelectionHalo(v).show(RECT, "#1a5cb3");
    for (const c of svgOf(v).children) expect(c.getAttribute("vector-effect")).toBe("non-scaling-stroke");
  });

  it("never fills — a filled ring would hide the very pixels it points at", () => {
    const v = fakeViewer();
    createSelectionHalo(v).show(RECT, "#1a5cb3");
    for (const c of svgOf(v).children) expect(c.getAttribute("fill")).toBe("none");
  });
});

describe("createSelectionHalo.show — geometry and anchoring", () => {
  it("traces a RECT region at its own size", () => {
    const v = fakeViewer();
    createSelectionHalo(v).show(RECT, "#1a5cb3");
    const rects = svgOf(v).querySelectorAll("rect");
    expect(rects).toHaveLength(3);
    expect(rects[0]!.getAttribute("width")).toBe("200");
    expect(rects[0]!.getAttribute("height")).toBe("80");
  });

  it("traces a POLYGON region as a polygon, not its bounding box", () => {
    // The whole point of the ring is to say "this shape". A bbox ring around a triangle would
    // point at pixels the note does not cover.
    const v = fakeViewer();
    createSelectionHalo(v).show(POLY, "#1a5cb3");
    expect(svgOf(v).querySelectorAll("polygon")).toHaveLength(3);
    expect(svgOf(v).querySelectorAll("rect")).toHaveLength(0);
  });

  it("shifts polygon points into the local bbox-origin user space", () => {
    const v = fakeViewer();
    createSelectionHalo(v).show(POLY, "#1a5cb3");
    // bbox = 10,10,100,80 → points relative to (10,10).
    expect(svgOf(v).querySelector("polygon")!.getAttribute("points")).toBe("0,0 100,0 50,80");
  });

  it("anchors the overlay to the region's IMAGE-space bbox", () => {
    const v = fakeViewer();
    createSelectionHalo(v).show(RECT, "#1a5cb3");
    expect(v.overlays[0]!.location).toEqual({ x: 100, y: 50, w: 200, h: 80 });
  });

  it("lets the stroke paint OUTSIDE the viewBox — SVG clips to it by default", () => {
    // A centred stroke puts half its width past the box edge, which is exactly where a halo must
    // read. Without `overflow: visible` the ring is shaved on all four sides and the whole feature
    // silently degrades to a slightly-thicker mark.
    const v = fakeViewer();
    createSelectionHalo(v).show(RECT, "#1a5cb3");
    expect(svgOf(v).style.overflow).toBe("visible");
  });

  it("queues the draw until the image opens when there is no world item yet", () => {
    const v = fakeViewer({ hasItem: false });
    createSelectionHalo(v).show(RECT, "#1a5cb3");
    expect(v.overlays).toHaveLength(0);
    expect(v.openHandlers).toHaveLength(1); // a deep link can select before first paint
  });
});

describe("createSelectionHalo — decorative and inert", () => {
  it("is hidden from assistive tech — the mark underneath carries the name and the role", () => {
    const v = fakeViewer();
    createSelectionHalo(v).show(RECT, "#1a5cb3");
    expect(svgOf(v).getAttribute("aria-hidden")).toBe("true");
    expect(svgOf(v).getAttribute("role")).toBeNull();
    expect(svgOf(v).getAttribute("tabindex")).toBeNull();
  });

  it("takes no pointer events — it must not become a second, invisible click surface", () => {
    // The ring sits directly over the mark's own hit target. If it captured clicks it would
    // reintroduce V68 for the one note the reader is actually looking at.
    const v = fakeViewer();
    createSelectionHalo(v).show(RECT, "#1a5cb3");
    expect(svgOf(v).style.pointerEvents).toBe("none");
  });

  it("carries an id so OSD's wrapper is addressable rather than the bare shared literal", () => {
    const v = fakeViewer();
    createSelectionHalo(v).show(RECT, "#1a5cb3");
    expect(svgOf(v).id).toBe("archie-selection-halo");
  });
});

describe("createSelectionHalo — one ring at a time", () => {
  it("show replaces the previous ring rather than stacking", () => {
    const v = fakeViewer();
    const halo = createSelectionHalo(v);
    halo.show(RECT, "#1a5cb3");
    halo.show(POLY, "#1a5cb3");
    expect(v.overlays).toHaveLength(2); // both were ADDED...
    expect(v.removed).toHaveLength(1); // ...but the first was removed first
    expect(v.removed[0]).toBe(v.overlays[0]!.element);
  });

  it("hide removes the ring", () => {
    const v = fakeViewer();
    const halo = createSelectionHalo(v);
    halo.show(RECT, "#1a5cb3");
    halo.hide();
    expect(v.removed).toEqual([v.overlays[0]!.element]);
  });

  it("hide is a no-op when nothing is drawn (and when called twice)", () => {
    const v = fakeViewer();
    const halo = createSelectionHalo(v);
    halo.hide();
    halo.show(RECT, "#1a5cb3");
    halo.hide();
    halo.hide();
    expect(v.removed).toHaveLength(1);
  });
});

describe("createSelectionHalo.showFor — resolving an id against the annotation list", () => {
  it("rings the annotation with that id", () => {
    const v = fakeViewer();
    expect(createSelectionHalo(v).showFor([rectAnn("a"), rectAnn("b", "xywh=pixel:0,0,10,10")], "b")).toBe(true);
    expect(v.overlays[0]!.location).toEqual({ x: 0, y: 0, w: 10, h: 10 });
  });

  it("returns false and clears for a WHOLE-OBJECT note — that is the frame's job, not the ring's", () => {
    const v = fakeViewer();
    const halo = createSelectionHalo(v);
    halo.show(RECT, "#1a5cb3");
    expect(halo.showFor([wholeObjectAnn("w")], "w")).toBe(false);
    expect(v.removed).toHaveLength(1); // the stale ring went away rather than lingering
    expect(v.overlays).toHaveLength(1); // and nothing new was drawn
  });

  it("returns false and clears for an unknown id", () => {
    const v = fakeViewer();
    expect(createSelectionHalo(v).showFor([rectAnn("a")], "nope")).toBe(false);
    expect(v.overlays).toHaveLength(0);
  });

  it("returns false for a non-v1 shape (the vocabulary gate is overlayShapeFor's, shared)", () => {
    const ellipse = { id: "e", target: { type: "SpecificResource", source: "c1", selector: { type: "SvgSelector", value: "<svg><ellipse cx='10' cy='10' rx='5' ry='5'/></svg>" } } } as unknown as AnnotationLike;
    const v = fakeViewer();
    expect(createSelectionHalo(v).showFor([ellipse], "e")).toBe(false);
  });

  it("passes the mark colour through to the contrast choice", () => {
    const v = fakeViewer();
    createSelectionHalo(v).showFor([rectAnn("a")], "a", "#ffc107");
    expect(strokesOf(svgOf(v))[1]).toBe("#111111");
  });
});
