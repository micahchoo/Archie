// overlay-core — the ONE overlay lifecycle owner (Phase 6). The migrated per-overlay suites pin the
// CONTENT (shape structure, keyboard wiring, selection); this suite pins what their fakes cannot:
// the OSD injected-wrapper hazard (neutralise + wrapper-capture clear — their addOverlay never
// wraps), the V68 click routing (makeClickable), the open-queue replay carrying onDrawn, and the
// core's shared base style / a11y / focus-ring application.
import { describe, it, expect, vi } from "vitest";
import { createOverlayLayer, makeClickable, capLabel, NS, type OverlayViewerLike } from "./overlay-core.js";
import type { OverlayShape } from "./overlay-shape.js";

type Overlay = { element: SVGElement | HTMLElement; location: unknown };

const RECT: OverlayShape = { kind: "rect", box: { x: 10, y: 20, w: 30, h: 40 } };

const makeSvg = (id: string): SVGSVGElement => {
  const svg = document.createElementNS(NS, "svg");
  svg.id = id;
  return svg;
};

/** A fake viewer that mimics OSD's addOverlay wrapping (openseadragon.js:19044): the element gets a
 *  wrapper div named `overlay-wrapper-<id>` at the default `pointer-events: auto` — the shared
 *  hazard the core neutralises and cleans up. */
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
    addOverlay(o) {
      const wrapper = document.createElement("div");
      wrapper.id = `overlay-wrapper-${o.element.id}`;
      wrapper.style.pointerEvents = "auto"; // OSD's default — an opaque div over the whole box
      wrapper.append(o.element);
      document.body.append(wrapper);
      overlays.push({ element: o.element, location: o.location });
    },
    removeOverlay(el) {
      removed.push(el);
      el.parentElement?.remove(); // OSD detaches the wrapper
    },
    world: { getItemAt: () => (hasItem ? { getBounds: () => ({ x: 0, y: 0, width: 1, height: 1 }) } : undefined) },
    viewport: { imageToViewportRectangle: (x, y, w, h) => ({ x, y, w, h }) },
    addOnceHandler: (name, handler) => { if (name === "open") openHandlers.push(handler); },
  };
}

describe("createOverlayLayer — the OSD injected-wrapper hazard (V68)", () => {
  it("neutralises the wrapper so the overlay's own pointer-events declarations decide", () => {
    const v = fakeViewer();
    createOverlayLayer<OverlayShape>(v, { id: "x", build: () => makeSvg("x") }).draw(RECT);
    const wrapper = v.overlays[0]!.element.parentElement!;
    expect(wrapper.id).toBe("overlay-wrapper-x");
    expect(wrapper.style.pointerEvents).toBe("none");
  });

  it("clear removes the wrapper too (capture-wrapper → removeOverlay → remove → wrapper-remove)", () => {
    const v = fakeViewer();
    const layer = createOverlayLayer<OverlayShape>(v, { id: "x", build: () => makeSvg("x") });
    layer.draw(RECT);
    const wrapper = v.overlays[0]!.element.parentElement!;
    layer.clear();
    expect(v.removed).toHaveLength(1);
    expect(wrapper.parentElement).toBeNull(); // no invisible empty div left behind
  });

  it("remove is a no-op for an element this layer did not draw", () => {
    const v = fakeViewer();
    const layer = createOverlayLayer<OverlayShape>(v, { id: "x", build: () => makeSvg("x") });
    layer.draw(RECT);
    const before = v.removed.length;
    layer.remove(makeSvg("foreign"));
    expect(v.removed).toHaveLength(before);
  });
});

describe("makeClickable — the V68 pointer-capture workaround (ONE home)", () => {
  it("routes click to the callback, stopping the click's own propagation", () => {
    const onClick = vi.fn();
    const el = document.createElementNS(NS, "rect");
    const seen = vi.fn();
    document.body.addEventListener("click", seen);
    makeClickable(el, onClick);
    el.dispatchEvent(new Event("click", { bubbles: true }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(seen).not.toHaveBeenCalled(); // stopped before an ancestor could see it
    document.body.removeEventListener("click", seen);
  });

  it("stops the pointer sequence so OSD's capture cannot swallow the click", () => {
    const el = document.createElementNS(NS, "rect");
    makeClickable(el, () => {});
    for (const type of ["pointerdown", "mousedown"]) {
      const seen = vi.fn();
      document.body.addEventListener(type, seen);
      el.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
      expect(seen).not.toHaveBeenCalled();
      document.body.removeEventListener(type, seen);
    }
  });
});

describe("createOverlayLayer — the open queue", () => {
  it("queues until the image opens, then replays the draw WITH onDrawn", () => {
    const v = fakeViewer({ hasItem: false });
    const layer = createOverlayLayer<OverlayShape>(v, { id: "x", build: () => makeSvg("x") });
    const onDrawn = vi.fn();
    expect(layer.draw(RECT, onDrawn)).toBeNull(); // queued, nothing drawn yet
    expect(v.overlays).toHaveLength(0);
    expect(v.openHandlers).toHaveLength(1);
    const ready = fakeViewer();
    Object.assign(v.world, ready.world);
    v.openHandlers[0]!();
    expect(v.overlays).toHaveLength(1);
    expect(onDrawn).toHaveBeenCalledTimes(1);
    expect(onDrawn).toHaveBeenCalledWith(v.overlays[0]!.element);
  });

  it("a queued replay redraws the ORIGINAL input — a later draw cannot pollute it", () => {
    const v = fakeViewer({ hasItem: false });
    const built: string[] = [];
    const layer = createOverlayLayer<{ tag: string }>(v, {
      id: "x",
      build: (input) => { built.push(input.tag); return makeSvg(input.tag); },
      // No shape geometry in this fixture — anchor at a fixed location (the frame pattern) so the
      // core's default shape-bbox anchor is not invoked on the `{tag}` input.
      locationFor: () => ({}),
    });
    layer.draw({ tag: "first" });
    layer.draw({ tag: "second" });
    expect(v.openHandlers).toHaveLength(2);
    const ready = fakeViewer();
    Object.assign(v.world, ready.world);
    v.openHandlers[0]!();
    v.openHandlers[1]!();
    expect(built).toEqual(["first", "second"]);
  });

  it("single-slot: a draw before the image opens REPLACES an earlier queued draw at open time", () => {
    // The frame + halo are single-element layers; their pre-consolidation code re-ran the clear
    // inside each queued `open` callback, so only the LAST draw survives a queued wait. The core's
    // single-slot mode preserves that (an accumulating layer would stack both).
    const v = fakeViewer({ hasItem: false });
    const built: string[] = [];
    const layer = createOverlayLayer<{ tag: string }>(v, {
      id: "x",
      single: true,
      build: (input) => { built.push(input.tag); return makeSvg(input.tag); },
      locationFor: () => ({}),
    });
    layer.draw({ tag: "first" });
    layer.draw({ tag: "second" });
    expect(v.overlays).toHaveLength(0);
    const ready = fakeViewer();
    Object.assign(v.world, ready.world);
    v.openHandlers[0]!(); // replays draw(first)...
    expect(v.overlays).toHaveLength(1);
    v.openHandlers[1]!(); // ...whose replay is then cleared by draw(second)'s replay
    // Same fake semantics as the sync single-slot test: overlays accumulates ADDED elements, `removed`
    // records the removal — so the first element was added then removed, and only it was cleared.
    expect(v.overlays).toHaveLength(2);
    expect(v.removed).toHaveLength(1);
    expect(v.removed[0]).toBe(v.overlays[0]!.element);
    expect(built).toEqual(["first", "second"]);
  });

  it("single-slot: a sync draw replaces the previous element", () => {
    const v = fakeViewer();
    const layer = createOverlayLayer<{ tag: string }>(v, {
      id: "x",
      single: true,
      build: (input) => makeSvg(input.tag),
      locationFor: () => ({}),
    });
    layer.draw({ tag: "a" });
    layer.draw({ tag: "b" });
    expect(v.overlays).toHaveLength(2); // both were ADDED...
    expect(v.removed).toHaveLength(1); // ...but the first was removed first
    expect(v.removed[0]).toBe(v.overlays[0]!.element);
  });
});

describe("createOverlayLayer — shared base style, a11y attributes, focus ring", () => {
  it("applies the common base svg style (width/height/display, pointerEvents none)", () => {
    const v = fakeViewer();
    createOverlayLayer<OverlayShape>(v, { id: "x", build: () => makeSvg("x") }).draw(RECT);
    const el = v.overlays[0]!.element as SVGSVGElement;
    expect(el.style.width).toBe("100%");
    expect(el.style.height).toBe("100%");
    expect(el.style.display).toBe("block");
    expect(el.style.pointerEvents).toBe("none");
  });

  it("applies role/aria-label/tabindex/aria-hidden from the a11y options (setAttribute-only)", () => {
    const v = fakeViewer();
    createOverlayLayer<OverlayShape>(v, {
      id: "x",
      build: () => makeSvg("x"),
      a11y: { role: "button", label: "View whole object", tabindex: "0" },
    }).draw(RECT);
    const el = v.overlays[0]!.element as SVGSVGElement;
    expect(el.getAttribute("role")).toBe("button");
    expect(el.getAttribute("aria-label")).toBe("View whole object");
    expect(el.getAttribute("tabindex")).toBe("0");
    expect(el.getAttribute("aria-hidden")).toBeNull();
  });

  it("a label function of the draw input supports per-draw naming (the region's aria-label)", () => {
    const v = fakeViewer();
    createOverlayLayer<{ name: string }>(v, {
      id: "x",
      build: () => makeSvg("x"),
      locationFor: () => ({}),
      a11y: { role: "button", label: (input) => `annotation ${input.name}` },
    }).draw({ name: "r1" });
    expect((v.overlays[0]!.element as SVGSVGElement).getAttribute("aria-label")).toBe("annotation r1");
  });

  it("a decorative layer (no a11y, no focusable) gets neither role nor focus ring", () => {
    const v = fakeViewer();
    createOverlayLayer<OverlayShape>(v, { id: "x", build: () => makeSvg("x") }).draw(RECT);
    const el = v.overlays[0]!.element as SVGSVGElement;
    expect(el.getAttribute("role")).toBeNull();
    expect(el.getAttribute("aria-hidden")).toBeNull();
    document.body.appendChild(el);
    try {
      el.focus();
      expect(el.style.outline).toBe(""); // no focus ring on a decorative layer
    } finally {
      el.remove();
    }
  });

  it("a focusable layer paints the explicit ring on :focus-visible focus and clears it on blur", () => {
    const v = fakeViewer();
    createOverlayLayer<OverlayShape>(v, { id: "x", focusable: true, build: () => makeSvg("x") }).draw(RECT);
    const el = v.overlays[0]!.element as SVGSVGElement;
    document.body.appendChild(el);
    try {
      el.focus();
      expect(el.style.outline).not.toBe("");
      expect(el.style.boxShadow).not.toBe("");
      el.blur();
      expect(el.style.outline).toBe("");
      expect(el.style.boxShadow).toBe("");
    } finally {
      el.remove();
    }
  });

  it("a builder that sets no id gets the layer id (so OSD's wrapper is addressable)", () => {
    const v = fakeViewer();
    const bare = document.createElementNS(NS, "svg"); // no id set by the builder
    createOverlayLayer<OverlayShape>(v, { id: "archie-layer", build: () => bare }).draw(RECT);
    expect(bare.id).toBe("archie-layer");
    expect(bare.parentElement!.id).toBe("overlay-wrapper-archie-layer");
  });
});

describe("capLabel — the shared accessible-name cap (Archie-9413)", () => {
  it("passes a short label through untruncated", () => {
    expect(capLabel("Note: r")).toBe("Note: r");
  });

  it("truncates at 160 code points with an ellipsis", () => {
    const label = capLabel("x".repeat(5000));
    expect(label).toHaveLength(161);
    expect(label.endsWith("…")).toBe(true);
  });

  it("keeps a surrogate pair whole at the truncation boundary (Archie-09a0)", () => {
    const label = `${"a".repeat(159)}🎉b`;
    const capped = capLabel(label);
    expect(capped.endsWith("🎉…")).toBe(true);
    expect(Array.from(capped)).toHaveLength(161);
  });
});
