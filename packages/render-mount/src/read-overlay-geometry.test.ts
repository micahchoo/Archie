// P0-1 — selector → overlay-geometry corpus (test-first; RED until read-overlay.ts exists).
//
// `overlayShapeFor` is the PURE geometry descriptor the DOM-SVG layer will draw — no DOM here.
// It applies the v1-shape vocab gate ITSELF (rect/polygon only) and returns null for anything
// else, so the SVG layer never has to (MUST-FIX from review: isV1Shape is a BOOLEAN; the filter
// lives in overlayShapeFor). Corpus mirrors fitbounds.test.ts:14-18 + selector.ts:19-53.
import { describe, it, expect } from "vitest";
import type { W3CSelector } from "@render/core";
import { selectorOf } from "@render/core";
import { overlayShapeFor } from "./read-overlay.js";

const rect = (value: string): W3CSelector => ({ type: "FragmentSelector", value });
const poly = (value: string): W3CSelector => ({ type: "SvgSelector", value });

describe("overlayShapeFor — selector → geometry-only descriptor", () => {
  it("(a) xywh=pixel rect → rect box", () => {
    expect(overlayShapeFor(rect("xywh=pixel:100,50,200,80"))).toEqual({
      kind: "rect",
      box: { x: 100, y: 50, w: 200, h: 80 },
    });
  });

  it("(b) bare xywh rect → rect box", () => {
    expect(overlayShapeFor(rect("xywh=10,20,30,40"))).toEqual({
      kind: "rect",
      box: { x: 10, y: 20, w: 30, h: 40 },
    });
  });

  it("(c) polygon → polygon points", () => {
    expect(overlayShapeFor(poly("<svg><polygon points='10,10 110,10 60,90'/></svg>"))).toEqual({
      kind: "polygon",
      points: [
        { x: 10, y: 10 },
        { x: 110, y: 10 },
        { x: 60, y: 90 },
      ],
    });
  });

  it("(d) degenerate polygon (NaN) → null", () => {
    expect(overlayShapeFor(poly("<svg><polygon points='NaN'/></svg>"))).toBeNull();
  });

  it("(e) empty points → null", () => {
    expect(overlayShapeFor(poly("<svg><polygon points=''/></svg>"))).toBeNull();
  });

  it("(f) non-rect/non-polygon (ellipse) → null (v1 vocab gate, selector.ts:124)", () => {
    expect(overlayShapeFor(poly("<svg><ellipse cx='10' cy='10' rx='5' ry='5'/></svg>"))).toBeNull();
  });

  it("(g) selectorOf resolves an Annotorious array-wrapped target's [0] selector", () => {
    const ann = {
      id: "poly-note",
      target: { type: "SpecificResource", source: "c1", selector: [poly("<svg><polygon points='10,10 110,10 60,90'/></svg>")] },
    };
    const sel = selectorOf(ann);
    expect(sel).not.toBeNull();
    expect(overlayShapeFor(sel!)).toEqual({
      kind: "polygon",
      points: [
        { x: 10, y: 10 },
        { x: 110, y: 10 },
        { x: 60, y: 90 },
      ],
    });
  });
});
