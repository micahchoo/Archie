// SelectionHalo (Archie-52a0, implementing Archie-ed50's decision) — the canvas's answer to
// "WHICH mark is the one I opened?".
//
// WHY AN OVERLAY AND NOT A STYLE. Both renderers' style channels are single-stroke:
// `MarkerStyle` (surface.ts:16-22) is one fill + one stroke, and Annotorious 3 paints marks to a
// WebGL canvas with no per-shape SVG node to add a second ring to. A halo is two strokes by
// definition, so it cannot be a style on either path — it is a THIRD overlay layer, modelled on
// frame-overlay.ts (the existing non-Annotorious OSD overlay) and drawn identically for both
// consumers. One implementation, both renderers, which is what makes it expressible in the poorer
// one by construction.
//
// WHY NOT RECOLOUR THE SELECTED MARK. Prior art: annomea's viewer (`src/viewer/viewer.ts:161-170`)
// signals selection by swapping the mark to a fixed accent (`#ffc107`). That is right for annomea,
// where mark colour carries nothing. Here mark colour IS reading identity (ADR-0007), so a swap
// would trade "which reading" for "which one" — the halo adds the second answer instead of
// spending the first. It is also a SHAPE cue, not a colour one, so it satisfies WCAG 1.4.1 /
// G182 on its own terms (docs/research/a11y-interactions.md:110-133) rather than leaning on hue.
//
// DISTINCT FROM HOVER by construction: hover is `highlighted` in readingMarkerStyle (a brighter
// fill and heavier stroke of the SAME colour); selection is a ring the mark does not otherwise
// have. The two never collapse into "a bit brighter".
//
// Decorative: `aria-hidden`, `pointer-events: none` end to end. The mark underneath keeps the hit
// target and the accessible name — the halo must never become a second, invisible click surface
// (see overlay-wrapper.ts for what that costs).

import { neutraliseOverlayWrapper, isOverlayWrapper } from "./overlay-wrapper.js";
import { overlayShapeFor, type OverlayShape } from "./overlay-shape.js";
import { polygonBBox, selectorOf, type Box, type W3CSelector, type AnnotationLike } from "@render/core";

const NS = "http://www.w3.org/2000/svg";

/** Ring widths in CSS px (non-scaling-stroke, so they hold at any zoom). Outer → inner:
 *  a soft dark shadow for legibility on light tiles, the contrast ink that IS the selection
 *  signal, then the mark's own colour so "which reading" survives the ring. */
const SHADOW_WIDTH = 7;
const HALO_WIDTH = 4.5;
const COLOUR_WIDTH = 2;

/** Relative luminance (WCAG 2.x §relativeluminance) of an sRGB triple in 0..255. */
const relativeLuminance = (r: number, g: number, b: number): number => {
  const lin = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};

/** Parse the colour forms the apps actually hand us: `#rgb`, `#rrggbb`, `rgb()`/`rgba()`. Anything
 *  else (a CSS var, a named colour, `currentColor`) is unresolvable here — we have no computed
 *  style to ask, and guessing would be worse than the neutral default. */
const parseRGB = (colour: string): [number, number, number] | null => {
  const c = colour.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c);
  if (hex) {
    const h = hex[1]!;
    const full = h.length === 3 ? h.split("").map((d) => d + d).join("") : h;
    return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
  }
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(c);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  return null;
};

/** White on a dark mark, near-black on a light one (Archie-ed50). An unparseable colour —
 *  `currentColor` on the embed path, a CSS var — degrades to WHITE, which is what the shadow ring
 *  underneath is sized for; the pair stays legible on any tile either way. */
export function contrastInk(colour: string | undefined): string {
  const rgb = colour ? parseRGB(colour) : null;
  if (!rgb) return "#ffffff";
  return relativeLuminance(rgb[0], rgb[1], rgb[2]) > 0.45 ? "#111111" : "#ffffff";
}

/** The shadow that keeps the halo legible against a tile of the SAME tone as the ink. */
const shadowFor = (ink: string): string => (ink === "#ffffff" ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.65)");

/** The minimal OSD viewer surface the halo needs (donor: OverlayViewerLike, read-overlay.ts). */
export interface HaloViewerLike {
  addOverlay(options: { element: HTMLElement | SVGElement; location: unknown }): void;
  removeOverlay(element: HTMLElement | SVGElement): void;
  world: { getItemAt(i: number): { getBounds(immediately?: boolean): unknown } | undefined };
  viewport: { imageToViewportRectangle(x: number, y: number, w: number, h: number): unknown };
  addOnceHandler?(name: string, handler: () => void): void;
}

export interface SelectionHaloController {
  /** Ring the given geometry (replacing any current ring). `colour` is the mark's own stroke —
   *  omit it when the renderer has none in JS (the embed paints `currentColor`). */
  show(shape: OverlayShape, colour?: string): void;
  /** Ring the annotation with this id, if it has v1 region geometry. Returns false (and clears)
   *  when the id is unknown, whole-object, or non-v1 — a whole-object note is the FRAME's job. */
  showFor(annotations: readonly AnnotationLike[], id: string, colour?: string): boolean;
  /** Remove the ring (no-op if none). */
  hide(): void;
}

/**
 * Create a selection-halo controller bound to an OSD-like `viewer`. One ring at a time, held in a
 * closure var so `show` replaces and `hide` removes — the same single-element lifecycle
 * frame-overlay.ts uses for the object border.
 */
export function createSelectionHalo(viewer: HaloViewerLike): SelectionHaloController {
  let haloEl: SVGSVGElement | null = null;

  const hide = (): void => {
    if (!haloEl) return;
    // Capture the wrapper BEFORE removeOverlay detaches us — afterwards parentElement is null.
    const wrapper = haloEl.parentElement;
    try { viewer.removeOverlay(haloEl); } catch { /* overlay already gone */ }
    haloEl.remove();
    if (isOverlayWrapper(wrapper)) wrapper.remove();
    haloEl = null;
  };

  const show = (shape: OverlayShape, colour?: string): void => {
    hide();
    if (!viewer.world.getItemAt(0)) {
      // Image not painted yet — a selection can arrive from a deep link before first paint.
      viewer.addOnceHandler?.("open", () => show(shape, colour));
      return;
    }
    let bbox: Box;
    const path = (stroke: string, width: number): SVGElement => {
      const el =
        shape.kind === "rect"
          ? document.createElementNS(NS, "rect")
          : document.createElementNS(NS, "polygon");
      if (shape.kind === "rect") {
        el.setAttribute("x", "0");
        el.setAttribute("y", "0");
        el.setAttribute("width", String(bbox.w));
        el.setAttribute("height", String(bbox.h));
      } else {
        // Shifted into the local bbox-origin user space and joined into the `points` ATTRIBUTE
        // via setAttribute — never innerHTML (ADR-0019 §5.2, same rule as read-overlay.ts).
        el.setAttribute("points", shape.points.map((p) => `${p.x - bbox.x},${p.y - bbox.y}`).join(" "));
      }
      el.setAttribute("fill", "none");
      el.setAttribute("stroke", stroke);
      el.setAttribute("stroke-width", String(width));
      el.setAttribute("stroke-linejoin", "round");
      el.setAttribute("vector-effect", "non-scaling-stroke");
      return el;
    };

    if (shape.kind === "rect") {
      bbox = shape.box;
    } else {
      const bb = polygonBBox(shape.points);
      if (!bb) return; // unreachable — overlayShapeFor already rejected the empty/NaN case
      bbox = bb;
    }

    const svg = document.createElementNS(NS, "svg");
    // Named so OSD's injected wrapper is `overlay-wrapper-archie-selection-halo` rather than the
    // bare literal every unnamed overlay collides on (openseadragon.js:19051).
    svg.id = "archie-selection-halo";
    svg.setAttribute("viewBox", `0 0 ${bbox.w} ${bbox.h}`);
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("aria-hidden", "true"); // decorative — the mark underneath is the operable thing
    Object.assign(svg.style, {
      width: "100%",
      height: "100%",
      display: "block",
      // A centred stroke puts half its width OUTSIDE the viewBox, and SVG clips to it by default —
      // without this the ring is shaved on every edge, which is precisely where it must read.
      overflow: "visible",
      pointerEvents: "none",
    } as Partial<CSSStyleDeclaration>);

    const ink = contrastInk(colour);
    svg.append(path(shadowFor(ink), SHADOW_WIDTH));
    svg.append(path(ink, HALO_WIDTH));
    svg.append(path(colour ?? "currentColor", COLOUR_WIDTH));

    viewer.addOverlay({ element: svg, location: viewer.viewport.imageToViewportRectangle(bbox.x, bbox.y, bbox.w, bbox.h) });
    // OSD wraps the element in a div at the default `pointer-events: auto` — over a REGION that
    // would shield the mark's own hit target and re-break V68 for the selected note specifically.
    neutraliseOverlayWrapper(svg);
    haloEl = svg;
  };

  return {
    show,
    hide,
    showFor(annotations, id, colour) {
      const sel: W3CSelector | null = selectorOf(annotations.find((a) => a.id === id));
      const shape = sel ? overlayShapeFor(sel) : null;
      if (!shape) {
        hide();
        return false;
      }
      show(shape, colour);
      return true;
    },
  };
}
