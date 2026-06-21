// QA(render-frame-overlay-coverage-border): createFrameOverlay draws the whole-object coverage border as an
// SVG OSD overlay anchored to the image bounds. happy-dom gives us real createElementNS, so we can assert the
// SVG structure, the click-to-activate seam, the open-event queueing, and replace/clear semantics — WITHOUT a
// live OSD (the module is decoupled behind FrameViewerLike). Real-render visuals stay with the human.
import { describe, it, expect, vi } from "vitest";
import { createFrameOverlay, type FrameViewerLike } from "./frame-overlay.js";

type Overlay = { element: SVGElement | HTMLElement; location: unknown };

function fakeViewer(opts: { hasItem?: boolean } = {}): FrameViewerLike & {
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
    addOnceHandler: (name, handler) => { if (name === "open") openHandlers.push(handler); },
  };
}

const frame = (onActivate = vi.fn()) => ({ colour: "#c83", onActivate });

describe("createFrameOverlay.draw", () => {
  it("adds one SVG overlay anchored at the world item's bounds", () => {
    const v = fakeViewer();
    createFrameOverlay(v).draw(frame());
    expect(v.overlays).toHaveLength(1);
    const svg = v.overlays[0].element as SVGSVGElement;
    expect(svg.tagName.toLowerCase()).toBe("svg");
    expect(svg.getAttribute("viewBox")).toBe("0 0 100 100");
    expect(svg.style.pointerEvents).toBe("none"); // centre stays pan/zoom-free
  });

  it("draws a halo rect + a clickable colour rect carrying the frame colour", () => {
    const v = fakeViewer();
    createFrameOverlay(v).draw(frame());
    const rects = (v.overlays[0].element as SVGSVGElement).querySelectorAll("rect");
    expect(rects).toHaveLength(2);
    const colour = rects[1];
    expect(colour.getAttribute("stroke")).toBe("#c83");
    expect((colour as SVGElement).style.pointerEvents).toBe("stroke"); // only the line is the hit target
    expect(colour.getAttribute("vector-effect")).toBe("non-scaling-stroke");
  });

  it("clicking the colour border activates the note", () => {
    const v = fakeViewer();
    const onActivate = vi.fn();
    createFrameOverlay(v).draw(frame(onActivate));
    const colour = (v.overlays[0].element as SVGSVGElement).querySelectorAll("rect")[1];
    colour.dispatchEvent(new Event("click"));
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it("queues on the 'open' event when the image isn't painted yet, then draws", () => {
    const v = fakeViewer({ hasItem: false });
    createFrameOverlay(v).draw(frame());
    expect(v.overlays).toHaveLength(0);
    expect(v.openHandlers).toHaveLength(1);
    // simulate the image opening — but it still has no item in this fake, so re-queues; flip to ready:
    const ready = fakeViewer();
    Object.assign(v.world, ready.world);
    v.openHandlers[0]();
    expect(v.overlays).toHaveLength(1);
  });

  it("a second draw replaces the first (clear before redraw)", () => {
    const v = fakeViewer();
    const c = createFrameOverlay(v);
    c.draw(frame());
    c.draw(frame());
    expect(v.removed).toHaveLength(1); // first frame removed
    expect(v.overlays).toHaveLength(2); // and a fresh one added
  });
});

describe("createFrameOverlay.clear", () => {
  it("removes the current frame and is a no-op when nothing is drawn", () => {
    const v = fakeViewer();
    const c = createFrameOverlay(v);
    c.clear(); // no frame yet
    expect(v.removed).toHaveLength(0);
    c.draw(frame());
    c.clear();
    expect(v.removed).toHaveLength(1);
  });
});
