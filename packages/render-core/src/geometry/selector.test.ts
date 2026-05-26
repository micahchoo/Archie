import { describe, it, expect } from "vitest";
import {
  parseFragmentXYWH,
  parsePolygonPoints,
  polygonBBox,
  selectorBBox,
  isDegenerateSelectorValue,
  shapeLabel,
  isV1Shape,
} from "./selector.js";
import type { W3CFragmentSelector, W3CSvgSelector } from "../wadm/types.js";

// Pure selector parsing + geometry (spike-0001 module 5, CLEAN-LIFT from anvil
// storage/annotations.ts:19 + annotation-fields.ts:67). polygon->bbox is the piece the
// fitBounds nav contract needs (goToTarget is rect-only); the OSD wiring is Phase 1.

describe("parseFragmentXYWH", () => {
  it("parses the pixel: media-fragment form", () => {
    expect(parseFragmentXYWH("xywh=pixel:10,20,30,40")).toEqual({ x: 10, y: 20, w: 30, h: 40 });
  });
  it("parses the bare xywh form", () => {
    expect(parseFragmentXYWH("xywh=10,20,30,40")).toEqual({ x: 10, y: 20, w: 30, h: 40 });
  });
  it("returns null for non-rect / malformed values", () => {
    expect(parseFragmentXYWH("t=0,5")).toBeNull();
    expect(parseFragmentXYWH("xywh=pixel:1,2,NaN,4")).toBeNull();
    expect(parseFragmentXYWH("garbage")).toBeNull();
  });
});

describe("parsePolygonPoints + polygonBBox", () => {
  it("extracts polygon points from an SVG selector value", () => {
    expect(parsePolygonPoints("<svg><polygon points='0,0 10,0 10,10 0,10'/></svg>")).toEqual([
      { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 },
    ]);
  });
  it("returns null for a degenerate (NaN / empty) polygon", () => {
    expect(parsePolygonPoints("<svg><polygon points='NaN'/></svg>")).toBeNull();
    expect(parsePolygonPoints("<svg><polygon points=''/></svg>")).toBeNull();
  });
  it("computes the bounding box of a point set", () => {
    expect(polygonBBox([{ x: 2, y: 3 }, { x: 12, y: 3 }, { x: 7, y: 9 }])).toEqual({ x: 2, y: 3, w: 10, h: 6 });
  });
  it("returns null for an empty point set", () => {
    expect(polygonBBox([])).toBeNull();
  });
});

describe("selectorBBox — unifies rect + polygon to a box (fitBounds input)", () => {
  it("rect selector -> its xywh box", () => {
    const sel: W3CFragmentSelector = { type: "FragmentSelector", value: "xywh=pixel:5,5,20,10" };
    expect(selectorBBox(sel)).toEqual({ x: 5, y: 5, w: 20, h: 10 });
  });
  it("polygon selector -> the polygon bounding box", () => {
    const sel: W3CSvgSelector = { type: "SvgSelector", value: "<svg><polygon points='0,0 100,0 50,40'/></svg>" };
    expect(selectorBBox(sel)).toEqual({ x: 0, y: 0, w: 100, h: 40 });
  });
});

describe("isDegenerateSelectorValue (the rect+polygon safety guard, anvil annotations.ts:19)", () => {
  it("flags NaN polygons, empty paths, empty polygons", () => {
    expect(isDegenerateSelectorValue("<polygon points='NaN'/>")).toBe(true);
    expect(isDegenerateSelectorValue('<path d=""/>')).toBe(true);
    expect(isDegenerateSelectorValue("<polygon points=''/>")).toBe(true);
  });
  it("passes valid rect and polygon selectors", () => {
    expect(isDegenerateSelectorValue("xywh=pixel:1,2,3,4")).toBe(false);
    expect(isDegenerateSelectorValue("<polygon points='0,0 1,1 2,0'/>")).toBe(false);
  });
});

describe("shapeLabel + isV1Shape (v1 vocab = rect + polygon only, Q-1 shape decision)", () => {
  it("labels the two v1 shapes", () => {
    expect(shapeLabel({ type: "FragmentSelector", value: "xywh=pixel:0,0,1,1" })).toBe("Rect");
    expect(shapeLabel({ type: "SvgSelector", value: "<polygon points='0,0 1,1 2,0'/>" })).toBe("Polygon");
  });
  it("labels deferred (v1.1) shapes so they can be detected and rejected", () => {
    expect(shapeLabel({ type: "SvgSelector", value: "<ellipse cx='1' cy='1' rx='2' ry='2'/>" })).toBe("Ellipse");
    expect(shapeLabel({ type: "SvgSelector", value: "<path d='M0 0 L1 1'/>" })).toBe("Path");
  });
  it("isV1Shape accepts only rect + polygon", () => {
    expect(isV1Shape({ type: "FragmentSelector", value: "xywh=pixel:0,0,1,1" })).toBe(true);
    expect(isV1Shape({ type: "SvgSelector", value: "<polygon points='0,0 1,1 2,0'/>" })).toBe(true);
    expect(isV1Shape({ type: "SvgSelector", value: "<ellipse cx='1' cy='1' rx='2' ry='2'/>" })).toBe(false);
  });
});
