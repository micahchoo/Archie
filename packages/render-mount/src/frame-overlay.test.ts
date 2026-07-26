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
    const svg = v.overlays[0]!.element as SVGSVGElement;
    expect(svg.tagName.toLowerCase()).toBe("svg");
    expect(svg.getAttribute("viewBox")).toBe("0 0 100 100");
    expect(svg.style.pointerEvents).toBe("none"); // centre stays pan/zoom-free
  });

  it("draws a halo rect, a colour rect, and a separate invisible hit rect", () => {
    const v = fakeViewer();
    createFrameOverlay(v).draw(frame());
    const rects = (v.overlays[0]!.element as SVGSVGElement).querySelectorAll("rect");
    expect(rects).toHaveLength(3);
    const colour = rects[1]!;
    expect(colour.getAttribute("stroke")).toBe("#c83");
    expect(colour.getAttribute("vector-effect")).toBe("non-scaling-stroke");
    // The visible line is NOT the hit target any more — see the hit-rect test below for why.
    expect((colour as SVGElement).style.pointerEvents).toBe("");
  });

  it("V41: the visible border is DASHED, so it cannot be mistaken for a solid region mark", () => {
    const v = fakeViewer();
    createFrameOverlay(v).draw(frame());
    const rects = (v.overlays[0]!.element as SVGSVGElement).querySelectorAll("rect");
    expect(rects[0]!.getAttribute("stroke-dasharray")).toBe("6 4"); // halo
    expect(rects[1]!.getAttribute("stroke-dasharray")).toBe("6 4"); // colour line
  });

  it("the hit rect is solid, wide, transparent, and the only pointer surface", () => {
    // Solid because a dashed stroke's GAPS are not hit-testable — targeting the visible line would
    // leave the border clickable along only ~60% of its length. Wide because 1.5px is a punishing
    // target for a real pointer. Transparent so it is a hit surface and nothing else.
    const v = fakeViewer();
    createFrameOverlay(v).draw(frame());
    const hit = (v.overlays[0]!.element as SVGSVGElement).querySelectorAll("rect")[2]!;
    expect(hit.getAttribute("stroke-dasharray")).toBeNull();
    expect(hit.getAttribute("stroke")).toBe("rgba(0,0,0,0)");
    expect(Number(hit.getAttribute("stroke-width"))).toBeGreaterThan(1.5);
    expect((hit as SVGElement).style.pointerEvents).toBe("stroke"); // interior stays free for pan/zoom
  });

  it("clicking the hit rect activates the note", () => {
    const v = fakeViewer();
    const onActivate = vi.fn();
    createFrameOverlay(v).draw(frame(onActivate));
    const hit = (v.overlays[0]!.element as SVGSVGElement).querySelectorAll("rect")[2]!;
    hit.dispatchEvent(new Event("click"));
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it("the hit rect stops the pointer sequence so OSD's capture cannot swallow the click (V68)", () => {
    // The region overlay has done this since V68 (read-overlay.ts styleGeometry); the frame did not,
    // which meant a real mouse click on the border could be captured by OSD's MouseTracker and never
    // dispatch `click` at all. A synthetic dispatch — like the test above — cannot see that.
    const v = fakeViewer();
    createFrameOverlay(v).draw(frame());
    const hit = (v.overlays[0]!.element as SVGSVGElement).querySelectorAll("rect")[2]!;
    const down = new Event("pointerdown", { bubbles: true, cancelable: true });
    const seen = vi.fn();
    (v.overlays[0]!.element as SVGSVGElement).addEventListener("pointerdown", seen);
    hit.dispatchEvent(down);
    expect(seen).not.toHaveBeenCalled(); // stopped before it could reach an ancestor
  });

  it("queues on the 'open' event when the image isn't painted yet, then draws", () => {
    const v = fakeViewer({ hasItem: false });
    createFrameOverlay(v).draw(frame());
    expect(v.overlays).toHaveLength(0);
    expect(v.openHandlers).toHaveLength(1);
    // simulate the image opening — but it still has no item in this fake, so re-queues; flip to ready:
    const ready = fakeViewer();
    Object.assign(v.world, ready.world);
    v.openHandlers[0]!();
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

describe("createFrameOverlay — keyboard/screen-reader access (Archie-9413)", () => {
  it("the frame is a focusable, labelled button", () => {
    const v = fakeViewer();
    createFrameOverlay(v).draw(frame());
    const svg = v.overlays[0]!.element as SVGSVGElement;
    expect(svg.getAttribute("role")).toBe("button");
    expect(svg.getAttribute("aria-label")).toBe("View whole object");
    expect(svg.getAttribute("tabindex")).toBe("0");
  });

  it("Enter activates the note — same path as the border click", () => {
    const v = fakeViewer();
    const onActivate = vi.fn();
    createFrameOverlay(v).draw(frame(onActivate));
    (v.overlays[0]!.element as SVGSVGElement).dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it("Space activates and prevents the default (no host-page scroll)", () => {
    const v = fakeViewer();
    const onActivate = vi.fn();
    createFrameOverlay(v).draw(frame(onActivate));
    const e = new KeyboardEvent("keydown", { key: " ", cancelable: true });
    (v.overlays[0]!.element as SVGSVGElement).dispatchEvent(e);
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(e.defaultPrevented).toBe(true);
  });

  it("a non-activation key does NOT activate", () => {
    const v = fakeViewer();
    const onActivate = vi.fn();
    createFrameOverlay(v).draw(frame(onActivate));
    (v.overlays[0]!.element as SVGSVGElement).dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onActivate).not.toHaveBeenCalled();
  });
});

describe("createFrameOverlay — explicit focus-visible ring (Archie-09a0)", () => {
  it("keyboard-focusing the frame paints an explicit ring beyond the UA default outline", () => {
    const v = fakeViewer();
    createFrameOverlay(v).draw(frame());
    const svg = v.overlays[0]!.element as SVGSVGElement;
    document.body.appendChild(svg); // happy-dom only flips real focus state for an attached node
    try {
      svg.focus();
      expect(svg.style.outline).not.toBe("");
      expect(svg.style.boxShadow).not.toBe("");
    } finally {
      svg.remove();
    }
  });

  it("blur clears the explicit ring", () => {
    const v = fakeViewer();
    createFrameOverlay(v).draw(frame());
    const svg = v.overlays[0]!.element as SVGSVGElement;
    document.body.appendChild(svg);
    try {
      svg.focus();
      svg.blur();
      expect(svg.style.outline).toBe("");
      expect(svg.style.boxShadow).toBe("");
    } finally {
      svg.remove();
    }
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
