// P0-7 — STANDING security assertion (strategy §5.2 / ADR-0019 §Consequences security bullet).
// This test lives FOREVER (not a one-shot): a hostile SvgSelector.value must NEVER reach innerHTML or
// DOMParser. The only code that touches the raw value is parsePolygonPoints (selector.ts:31-40), which
// extracts NUMBERS — so the data path is geometry-only. A failure here is a Red Line (security
// exposure), not a test to relax.
import { describe, it, expect, vi } from "vitest";
import { createReadOnlyOverlay, type OverlayViewerLike } from "./read-overlay.js";
import type { W3CAnnotation } from "@render/core";

type Overlay = { element: SVGElement | HTMLElement; location: unknown };

function fakeViewer(): OverlayViewerLike & { overlays: Overlay[] } {
  const overlays: Overlay[] = [];
  return {
    overlays,
    addOverlay: (o) => overlays.push(o as Overlay),
    removeOverlay: () => {},
    world: { getItemAt: () => ({ getBounds: () => ({ x: 0, y: 0, width: 1, height: 1 }) }) },
    viewport: { imageToViewportRectangle: (x, y, w, h) => ({ x, y, w, h }) },
    addOnceHandler: () => {},
  };
}

// A hostile SvgSelector: a valid <polygon> PLUS injected <script>/<image onerror> payloads.
const HOSTILE =
  "<svg><polygon points='10,10 110,10 60,90'/><script>window.__x=1</script><image href='x' onerror='window.__x=1'/></svg>";
const hostileAnn: W3CAnnotation =
  ({ id: "evil", target: { type: "SpecificResource", source: "c1", selector: { type: "SvgSelector", value: HOSTILE } } }) as unknown as W3CAnnotation;

describe("STANDING: hostile SvgSelector renders as geometry only — never innerHTML/DOMParser", () => {
  it("(c) nothing injected executes — window.__x stays undefined", () => {
    delete (globalThis as Record<string, unknown>).__x;
    createReadOnlyOverlay(fakeViewer()).setAnnotations([hostileAnn]);
    expect((globalThis as Record<string, unknown>).__x).toBeUndefined();
  });

  it("(b) the drawn <polygon> points attribute = ONLY the parsed numeric coords", () => {
    const v = fakeViewer();
    createReadOnlyOverlay(v).setAnnotations([hostileAnn]);
    const svg = v.overlays[0].element as SVGSVGElement;
    const poly = svg.querySelector("polygon")!;
    expect(poly.getAttribute("points")).toBe("0,0 100,0 50,80"); // bbox-local of the 3 valid points
  });

  it("(a) no overlay node's innerHTML contains <script or onerror", () => {
    const v = fakeViewer();
    createReadOnlyOverlay(v).setAnnotations([hostileAnn]);
    const svg = v.overlays[0].element as SVGSVGElement;
    expect(svg.innerHTML).not.toContain("<script");
    expect(svg.innerHTML).not.toContain("onerror");
    // No <script>/<image> nodes ever entered the tree — only createElementNS geometry did.
    expect(svg.querySelectorAll("script, image")).toHaveLength(0);
  });

  it("(d) the overlay path calls NEITHER the innerHTML setter NOR DOMParser", () => {
    // Spy on the Element.innerHTML setter + DOMParser.parseFromString — the overlay must touch neither.
    const innerHTMLDesc = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML");
    const innerHTMLSetter = vi.fn();
    Object.defineProperty(Element.prototype, "innerHTML", {
      configurable: true,
      get: innerHTMLDesc?.get,
      set(this: Element, v: string) { innerHTMLSetter(); innerHTMLDesc?.set?.call(this, v); },
    });
    const parseSpy = vi.spyOn(DOMParser.prototype, "parseFromString");
    try {
      createReadOnlyOverlay(fakeViewer()).setAnnotations([hostileAnn]);
      expect(innerHTMLSetter).not.toHaveBeenCalled();
      expect(parseSpy).not.toHaveBeenCalled();
    } finally {
      if (innerHTMLDesc) Object.defineProperty(Element.prototype, "innerHTML", innerHTMLDesc);
      parseSpy.mockRestore();
    }
  });

  it("(d') the produced subtree is exactly the geometry nodes built by createElementNS (svg + polygon)", () => {
    const v = fakeViewer();
    createReadOnlyOverlay(v).setAnnotations([hostileAnn]);
    const svg = v.overlays[0].element as SVGSVGElement;
    // The whole subtree: the <svg> root + exactly one <polygon> child. No injected nodes.
    expect(svg.querySelectorAll("*")).toHaveLength(1); // just the polygon
  });
});
