// Archie-4b0a — the pure selector rescaler. The web quality tier serves a 6000 px master at 2400 px;
// selectors are absolute master pixels, so the publish projection has to move them by the same factor
// or every region lands 2.5x out of place.
//
// The four axes this suite has to hold, because each is a different way to be wrong:
//   1. identity is byte-identical (the archival tier's guarantee, and the seam's absent case);
//   2. every SHAPE the vocabulary carries scales, not just the rect that was easiest to notice;
//   3. the coordinate spaces that are NOT image pixels — percent, time, geo — survive untouched;
//   4. anything that cannot be scaled exactly comes back with a REASON, never half-scaled.
import { describe, it, expect } from "vitest";
import {
  isIdentityScale,
  scaleMediaFragmentValue,
  scaleSvgSelectorValue,
  scaleSelector,
  scaleTarget,
  type SelectorScale,
} from "./rescale.js";
import { parseFragmentXYWH, parsePolygonPoints } from "./selector.js";
import type { W3CSelector } from "../wadm/types.js";

/** The tier's real shape: a 6000x4000 master published at 2400x1600 (WEB_TIER.maxDim 2400). */
const WEB: SelectorScale = { sx: 2400 / 6000, sy: 1600 / 4000 }; // 0.4, 0.4
const ONE: SelectorScale = { sx: 1, sy: 1 };
/** Deliberately NON-uniform, so an axis swap cannot pass: 0.4 on x, 0.5 on y. */
const SKEW: SelectorScale = { sx: 0.4, sy: 0.5 };

describe("isIdentityScale", () => {
  it("is the archival tier's answer, and only for an exact 1", () => {
    expect(isIdentityScale(ONE)).toBe(true);
    expect(isIdentityScale({ sx: 1, sy: 0.9999 })).toBe(false);
    expect(isIdentityScale(WEB)).toBe(false);
  });
});

describe("scaleMediaFragmentValue — xywh", () => {
  it("returns the identical STRING at scale 1 (byte identity, not merely equality)", () => {
    const v = "xywh=pixel:1200,800,600,400";
    const r = scaleMediaFragmentValue(v, ONE);
    expect(r.value).toBe(v);
    expect(r.unscalable).toBeUndefined();
  });

  it("scales a pixel rect exactly at 0.4", () => {
    expect(scaleMediaFragmentValue("xywh=pixel:1200,800,600,400", WEB).value).toBe("xywh=pixel:480,320,240,160");
  });

  it("scales the two axes INDEPENDENTLY (a non-uniform factor cannot pass by symmetry)", () => {
    expect(scaleMediaFragmentValue("xywh=pixel:1000,1000,500,500", SKEW).value).toBe("xywh=pixel:400,500,200,250");
  });

  it("keeps a bare `xywh=` bare and a `pixel:` prefixed one prefixed", () => {
    expect(scaleMediaFragmentValue("xywh=100,200,50,60", WEB).value).toBe("xywh=40,80,20,24");
    expect(scaleMediaFragmentValue("xywh=pixel:100,200,50,60", WEB).value).toBe("xywh=pixel:40,80,20,24");
  });

  it("PRESERVES THE FAR EDGE — the reason edges are scaled rather than (origin, extent)", () => {
    // x=5, w=5 ⇒ right edge 10. At 0.5: left 2.5→round 3 (half-up), right 5. Rounding x and w
    // independently would give w=round(2.5)=3 and a right edge of 6; scaling the EDGES gives w=2.
    const r = scaleMediaFragmentValue("xywh=pixel:5,5,5,5", { sx: 0.5, sy: 0.5 });
    const box = parseFragmentXYWH(r.value)!;
    expect(box).toEqual({ x: 3, y: 3, w: 2, h: 2 });
    expect(box.x + box.w).toBe(5); // == round((5+5)*0.5); the far edge did not drift
  });

  it("rounds HALF-UP, and the boundary is pinned from both sides", () => {
    // 5 * 0.5 = 2.5 → 3;   7 * 0.5 = 3.5 → 4;   9*0.5 = 4.5 → 5;   the just-below case stays down
    expect(scaleMediaFragmentValue("xywh=pixel:5,7,0,0", { sx: 0.5, sy: 0.5 }).value).toBe("xywh=pixel:3,4,0,0");
    expect(scaleMediaFragmentValue("xywh=pixel:4,6,0,0", { sx: 0.5, sy: 0.5 }).value).toBe("xywh=pixel:2,3,0,0");
    // 4.9*0.5 = 2.45 → 2 (below the half), 5.1*0.5 = 2.55 → 3 (above it)
    expect(scaleMediaFragmentValue("xywh=pixel:4.9,5.1,0,0", { sx: 0.5, sy: 0.5 }).value).toBe("xywh=pixel:2,3,0,0");
  });

  it("emits INTEGER pixels even from a fractional authored rect", () => {
    // Working, because the extent is DERIVED and so is not the naive round(w*sx):
    //   x  round(100.4*.4)=round(40.16)=40      y  round(200.6*.4)=round(80.24)=80
    //   x2 round(150.9*.4)=round(60.36)=60 ⇒ w=20   y2 round(261.1*.4)=round(104.44)=104 ⇒ h=24
    // (round(50.5*.4)=round(20.2)=20 and round(60.5*.4)=round(24.2)=24 agree here; the case where
    // they would NOT is the far-edge test above.)
    expect(scaleMediaFragmentValue("xywh=pixel:100.4,200.6,50.5,60.5", WEB).value).toBe("xywh=pixel:40,80,20,24");
  });
});

describe("scaleMediaFragmentValue — the spaces that are NOT image pixels", () => {
  it("NEVER touches a percent fragment (frame-size-independent by construction)", () => {
    const v = "xywh=percent:10,20,30,40";
    const r = scaleMediaFragmentValue(v, WEB);
    expect(r.value).toBe(v);
    expect(r.unscalable).toBeUndefined(); // and it is not a finding: untouched is CORRECT here
  });

  it("NEVER touches a time fragment", () => {
    const v = "t=12.5,30";
    expect(scaleMediaFragmentValue(v, WEB).value).toBe(v);
  });

  it("scales only the spatial half of a spatiotemporal fragment, preserving dimension ORDER", () => {
    expect(scaleMediaFragmentValue("t=5,10&xywh=pixel:1200,800,600,400", WEB).value).toBe("t=5,10&xywh=pixel:480,320,240,160");
    expect(scaleMediaFragmentValue("xywh=pixel:1200,800,600,400&t=5,10", WEB).value).toBe("xywh=pixel:480,320,240,160&t=5,10");
  });

  it("REPORTS a torn spatial fragment instead of shipping it", () => {
    const v = "xywh=pixel:1200,800,600";
    const r = scaleMediaFragmentValue(v, WEB);
    expect(r.value).toBe(v);
    expect(r.unscalable).toMatch(/unparseable spatial fragment/);
  });
});

describe("scaleSvgSelectorValue", () => {
  const poly = `<svg><polygon points="1200,800 1800,800 1500,1600" /></svg>`;

  it("returns the identical STRING at scale 1", () => {
    expect(scaleSvgSelectorValue(poly, ONE).value).toBe(poly);
  });

  it("scales polygon vertices exactly, keeping the authored separators", () => {
    expect(scaleSvgSelectorValue(poly, WEB).value).toBe(`<svg><polygon points="480,320 720,320 600,640" /></svg>`);
  });

  it("scales x and y independently in a points list", () => {
    expect(scaleSvgSelectorValue(`<svg><polygon points="100,100 200,100 150,300" /></svg>`, SKEW).value)
      .toBe(`<svg><polygon points="40,50 80,50 60,150" /></svg>`);
  });

  it("keeps TWO DECIMALS on a vertex rather than snapping to an integer", () => {
    const r = scaleSvgSelectorValue(`<svg><polygon points="101,203 305,407 509,601" /></svg>`, { sx: 0.333, sy: 0.333 });
    const pts = parsePolygonPoints(r.value)!;
    expect(pts[0]).toEqual({ x: 33.63, y: 67.6 }); // 101*.333 = 33.633 → 33.63; 203*.333 = 67.599 → 67.6
    expect(r.value).toContain("33.63,67.6");
  });

  it("scales polyline, rect, circle, ellipse and line — every attribute-borne shape", () => {
    expect(scaleSvgSelectorValue(`<svg><polyline points="10,20 30,40 50,60" /></svg>`, WEB).value)
      .toBe(`<svg><polyline points="4,8 12,16 20,24" /></svg>`);
    expect(scaleSvgSelectorValue(`<svg><rect x="100" y="200" width="50" height="80" /></svg>`, SKEW).value)
      .toBe(`<svg><rect x="40" y="100" width="20" height="40" /></svg>`);
    // circle: cx/cy per axis, r by the geometric mean (a circle has no single axis) — sqrt(.4*.4)=.4
    expect(scaleSvgSelectorValue(`<svg><circle cx="100" cy="200" r="50" /></svg>`, WEB).value)
      .toBe(`<svg><circle cx="40" cy="80" r="20" /></svg>`);
    expect(scaleSvgSelectorValue(`<svg><ellipse cx="100" cy="200" rx="50" ry="80" /></svg>`, SKEW).value)
      .toBe(`<svg><ellipse cx="40" cy="100" rx="20" ry="40" /></svg>`);
    expect(scaleSvgSelectorValue(`<svg><line x1="10" y1="20" x2="30" y2="40" /></svg>`, SKEW).value)
      .toBe(`<svg><line x1="4" y1="10" x2="12" y2="20" /></svg>`);
  });

  it("scales EVERY shape in a multi-shape selector, not just the first", () => {
    const v = `<svg><polygon points="10,10 20,10 15,20" /><rect x="100" y="100" width="10" height="10" /></svg>`;
    expect(scaleSvgSelectorValue(v, WEB).value)
      .toBe(`<svg><polygon points="4,4 8,4 6,8" /><rect x="40" y="40" width="4" height="4" /></svg>`);
  });

  it("REPORTS a <path> rather than rewriting arc geometry it cannot scale", () => {
    const v = `<svg><path d="M10 10 A 20 20 0 0 1 30 30 Z" /></svg>`;
    const r = scaleSvgSelectorValue(v, WEB);
    expect(r.value).toBe(v);
    expect(r.unscalable).toMatch(/path/);
  });

  it("REPORTS a transform — it re-parents the coordinate system the attributes live in", () => {
    const v = `<svg><g transform="translate(50,50)"><polygon points="10,10 20,10 15,20" /></g></svg>`;
    const r = scaleSvgSelectorValue(v, WEB);
    expect(r.value).toBe(v);
    expect(r.unscalable).toMatch(/transform/);
  });

  it("REPORTS an SVG carrying no geometry at all rather than calling it done", () => {
    expect(scaleSvgSelectorValue(`<svg></svg>`, WEB).unscalable).toMatch(/no scalable geometry/);
  });

  it("REPORTS a degenerate points list (the NaN/empty class the log guard already refuses)", () => {
    expect(scaleSvgSelectorValue(`<svg><polygon points="" /></svg>`, WEB).unscalable).toBeDefined();
    expect(scaleSvgSelectorValue(`<svg><polygon points="NaN,NaN 1,2 3,4" /></svg>`, WEB).unscalable).toBeDefined();
  });
});

describe("scaleSelector / scaleTarget", () => {
  const rect: W3CSelector = { type: "FragmentSelector", conformsTo: "http://www.w3.org/TR/media-frags/", value: "xywh=pixel:1200,800,600,400" };

  it("keeps the selector's other fields (conformsTo) across the rescale", () => {
    const r = scaleSelector(rect, WEB);
    expect(r.value).toEqual({ type: "FragmentSelector", conformsTo: "http://www.w3.org/TR/media-frags/", value: "xywh=pixel:480,320,240,160" });
  });

  it("returns the SAME OBJECT when nothing moved, so an unchanged record stays identical by reference", () => {
    expect(scaleSelector(rect, ONE).value).toBe(rect);
    const time: W3CSelector = { type: "FragmentSelector", value: "t=1,2" };
    expect(scaleSelector(time, WEB).value).toBe(time);
  });

  it("scales EVERY selector when a target carries an array of them", () => {
    const t = { type: "SpecificResource" as const, source: "https://h/x/canvas/o1", selector: [rect, { type: "SvgSelector" as const, value: `<svg><polygon points="100,100 200,100 150,300" /></svg>` }] };
    const r = scaleTarget(t, WEB);
    const sels = (r.value as { selector: W3CSelector[] }).selector;
    expect(sels[0]!.value).toBe("xywh=pixel:480,320,240,160");
    expect(sels[1]!.value).toBe(`<svg><polygon points="40,40 80,40 60,120" /></svg>`);
    expect((r.value as { source: string }).source).toBe("https://h/x/canvas/o1"); // the IRI is not geometry
  });

  it("leaves a BARE-STRING target untouched — see scaleTarget's note on why that is reachable-by-nothing", () => {
    const t = "https://h/x/canvas/o1#xywh=pixel:100,100,50,50";
    expect(scaleTarget(t, WEB).value).toBe(t);
  });

  it("a target with NO selector (an ADR-0018 whole-object note) is untouched and not a finding", () => {
    const t = { type: "SpecificResource" as const, source: "https://h/x/canvas/o1" };
    const r = scaleTarget(t, WEB);
    expect(r.value).toBe(t);
    expect(r.unscalable).toBeUndefined();
  });

  it("refuses the WHOLE target when one of its selectors is unscalable — never half-scaled", () => {
    const t = { type: "SpecificResource" as const, source: "s", selector: [rect, { type: "SvgSelector" as const, value: `<svg><path d="M0 0 L1 1" /></svg>` }] };
    const r = scaleTarget(t, WEB);
    expect(r.value).toBe(t); // the rect did NOT come back scaled beside an unscaled path
    expect(r.unscalable).toMatch(/path/);
  });
});
