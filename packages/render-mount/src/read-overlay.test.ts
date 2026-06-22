// P0-2/P0-3/P0-6 — createReadOnlyOverlay draws per-annotation region shapes as DOM-SVG overlays
// (createElementNS only), hit-tests them to onSelect, and labels them for a11y. happy-dom gives a
// real createElementNS; a fake viewer (donor: frame-overlay.test.ts:10-28) captures overlays/removed/
// openHandlers + a fake viewport. No live OSD (memory: leave real-render visuals to the human).
import { describe, it, expect, vi } from "vitest";
import { createReadOnlyOverlay, type OverlayViewerLike } from "./read-overlay.js";
import type { W3CAnnotation } from "@render/core";

type Overlay = { element: SVGElement | HTMLElement; location: unknown };

function fakeViewer(opts: { hasItem?: boolean } = {}): OverlayViewerLike & {
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
    // Identity rect — the gate.test.ts idiom (imageToViewportRectangle(x,y,w,h) → {x,y,w,h}).
    viewport: { imageToViewportRectangle: (x, y, w, h) => ({ x, y, w, h }) },
    addOnceHandler: (name, handler) => { if (name === "open") openHandlers.push(handler); },
  };
}

const rectAnn = (id: string, value = "xywh=pixel:100,50,200,80"): W3CAnnotation =>
  ({ id, target: { type: "SpecificResource", source: "c1", selector: { type: "FragmentSelector", value } } }) as unknown as W3CAnnotation;
const polyAnn = (id: string, value = "<svg><polygon points='10,10 110,10 60,90'/></svg>"): W3CAnnotation =>
  ({ id, target: { type: "SpecificResource", source: "c1", selector: { type: "SvgSelector", value } } }) as unknown as W3CAnnotation;
const degenerateAnn = (id: string): W3CAnnotation =>
  ({ id, target: { type: "SpecificResource", source: "c1", selector: { type: "SvgSelector", value: "<svg><polygon points='NaN'/></svg>" } } }) as unknown as W3CAnnotation;

describe("createReadOnlyOverlay.setAnnotations — draw", () => {
  it("draws one overlay per renderable annotation", () => {
    const v = fakeViewer();
    createReadOnlyOverlay(v).setAnnotations([rectAnn("r"), polyAnn("p")]);
    expect(v.overlays).toHaveLength(2);
  });

  it("a rect annotation → one <rect> with width/height of the box", () => {
    const v = fakeViewer();
    createReadOnlyOverlay(v).setAnnotations([rectAnn("r")]);
    const svg = v.overlays[0].element as SVGSVGElement;
    const rects = svg.querySelectorAll("rect");
    expect(rects).toHaveLength(1);
    expect(rects[0].getAttribute("width")).toBe("200");
    expect(rects[0].getAttribute("height")).toBe("80");
    expect(rects[0].getAttribute("vector-effect")).toBe("non-scaling-stroke");
    // Anchored to the box's image-space bbox via the viewport.
    expect(v.overlays[0].location).toEqual({ x: 100, y: 50, w: 200, h: 80 });
  });

  it("a polygon annotation → one <polygon> whose points attribute = bbox-local coords", () => {
    const v = fakeViewer();
    createReadOnlyOverlay(v).setAnnotations([polyAnn("p")]);
    const svg = v.overlays[0].element as SVGSVGElement;
    const polys = svg.querySelectorAll("polygon");
    expect(polys).toHaveLength(1);
    // bbox of (10,10),(110,10),(60,90) = x10 y10 w100 h80 → local: (0,0),(100,0),(50,80)
    expect(polys[0].getAttribute("points")).toBe("0,0 100,0 50,80");
    expect(v.overlays[0].location).toEqual({ x: 10, y: 10, w: 100, h: 80 });
  });

  it("a degenerate annotation is skipped (excluded from overlay count) and warns LOUDLY", () => {
    const v = fakeViewer();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    createReadOnlyOverlay(v).setAnnotations([rectAnn("r"), degenerateAnn("bad")]);
    expect(v.overlays).toHaveLength(1);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("setAnnotations replaces: a second call clears the first set", () => {
    const v = fakeViewer();
    const o = createReadOnlyOverlay(v);
    o.setAnnotations([rectAnn("r")]);
    o.setAnnotations([polyAnn("p"), rectAnn("r2")]);
    expect(v.removed).toHaveLength(1); // first rect removed
    expect(v.overlays).toHaveLength(3); // 1 + 2 added
  });

  it("queues on 'open' when the image isn't painted, then draws", () => {
    const v = fakeViewer({ hasItem: false });
    createReadOnlyOverlay(v).setAnnotations([rectAnn("r")]);
    expect(v.overlays).toHaveLength(0);
    expect(v.openHandlers).toHaveLength(1);
    Object.assign(v.world, fakeViewer().world);
    v.openHandlers[0]();
    expect(v.overlays).toHaveLength(1);
  });
});

describe("createReadOnlyOverlay.clear", () => {
  it("removes all shapes; no-op when nothing drawn", () => {
    const v = fakeViewer();
    const o = createReadOnlyOverlay(v);
    o.clear();
    expect(v.removed).toHaveLength(0);
    o.setAnnotations([rectAnn("r"), polyAnn("p")]);
    o.clear();
    expect(v.removed).toHaveLength(2);
  });
});

describe("createReadOnlyOverlay.onSelect — hit-test (P0-3)", () => {
  it("clicking a rect shape fires onSelect once with its id", () => {
    const v = fakeViewer();
    const o = createReadOnlyOverlay(v);
    const cb = vi.fn();
    o.onSelect(cb);
    o.setAnnotations([rectAnn("r")]);
    const geom = (v.overlays[0].element as SVGSVGElement).querySelector("rect")!;
    geom.dispatchEvent(new Event("click"));
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith("r");
  });

  it("clicking the second shape selects the second id", () => {
    const v = fakeViewer();
    const o = createReadOnlyOverlay(v);
    const cb = vi.fn();
    o.onSelect(cb);
    o.setAnnotations([rectAnn("r"), polyAnn("p")]);
    const geom = (v.overlays[1].element as SVGSVGElement).querySelector("polygon")!;
    geom.dispatchEvent(new Event("click"));
    expect(cb).toHaveBeenLastCalledWith("p");
  });

  it("unsubscribe stops further calls", () => {
    const v = fakeViewer();
    const o = createReadOnlyOverlay(v);
    const cb = vi.fn();
    const off = o.onSelect(cb);
    o.setAnnotations([rectAnn("r")]);
    off();
    (v.overlays[0].element as SVGSVGElement).querySelector("rect")!.dispatchEvent(new Event("click"));
    expect(cb).not.toHaveBeenCalled();
  });
});

describe("createReadOnlyOverlay — a11y marker-label (P0-6)", () => {
  it("a drawn shape carries role + the aria-label from labelFor", () => {
    const v = fakeViewer();
    createReadOnlyOverlay(v, { labelFor: (id) => `Note: ${id}` }).setAnnotations([rectAnn("r")]);
    const svg = v.overlays[0].element as SVGSVGElement;
    expect(svg.getAttribute("role")).toBe("button");
    expect(svg.getAttribute("aria-label")).toBe("Note: r");
  });

  it("absent labelFor → the fallback label", () => {
    const v = fakeViewer();
    createReadOnlyOverlay(v).setAnnotations([rectAnn("r")]);
    expect((v.overlays[0].element as SVGSVGElement).getAttribute("aria-label")).toBe("annotation r");
  });

  it("the label NEVER comes from the selector value (hostile-string proof)", () => {
    const v = fakeViewer();
    createReadOnlyOverlay(v).setAnnotations([polyAnn("p", "<svg><polygon points='10,10 110,10 60,90'/><script>x</script></svg>")]);
    const label = (v.overlays[0].element as SVGSVGElement).getAttribute("aria-label")!;
    expect(label).toBe("annotation p");
    expect(label).not.toContain("<");
  });
});
