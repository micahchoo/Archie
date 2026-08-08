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
//
// Phase 6: the lifecycle is delegated to the ONE overlay core (overlay-core.ts) — open-queue,
// add/remove, OSD-wrapper neutralisation, the wrapper-capture clear, base styling and aria-hidden.
// This module is a CONTENT BUILDER: a shape + colour → the three-stroke ring SVG. It stays
// decorative on purpose: no focusable option, no role/label/tabindex, no focus ring, and the
// builders never call makeClickable — the ring must not become a second click surface.

import { createOverlayLayer, overlayBBox, NS, type OverlayViewerLike } from "./overlay-core.js";
import { overlayShapeFor, type OverlayShape } from "./overlay-shape.js";
import { selectorOf, type W3CSelector, type AnnotationLike } from "@render/core";

// The ONE shared OSD viewer duck type (overlay-core.ts). Kept under its old public name so every
// existing importer — index.ts, selection-halo.test.ts — keeps resolving.
export type { OverlayViewerLike as HaloViewerLike } from "./overlay-core.js";

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
 * frame-overlay.ts uses for the object border, now owned by the core.
 */
export function createSelectionHalo(viewer: OverlayViewerLike): SelectionHaloController {
  const layer = createOverlayLayer<{ shape: OverlayShape; colour?: string | undefined }>(viewer, {
    id: "archie-selection-halo", // the builder sets the same id; the wrapper names after it
    // One ring at a time — show replaces (even across a queued wait for first paint).
    single: true,
    shapeOf: (input) => input.shape,
    // Decorative: no focusable, no role/label/tabindex — the mark underneath is the operable thing.
    a11y: { ariaHidden: true },
    build: (input) => {
      const { shape, colour } = input;
      const bbox = overlayBBox(shape);
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

      const svg = document.createElementNS(NS, "svg");
      // Named so OSD's injected wrapper is `overlay-wrapper-archie-selection-halo` rather than the
      // bare literal every unnamed overlay collides on (openseadragon.js:19051).
      svg.id = "archie-selection-halo";
      svg.setAttribute("viewBox", `0 0 ${bbox.w} ${bbox.h}`);
      svg.setAttribute("preserveAspectRatio", "none");
      // A centred stroke puts half its width OUTSIDE the viewBox, and SVG clips to it by default —
      // without this the ring is shaved on every edge, which is precisely where it must read.
      // (The core's base style supplies width/height/display/pointerEvents:none.)
      svg.style.overflow = "visible";

      const ink = contrastInk(colour);
      svg.append(path(shadowFor(ink), SHADOW_WIDTH));
      svg.append(path(ink, HALO_WIDTH));
      svg.append(path(colour ?? "currentColor", COLOUR_WIDTH));
      return svg;
    },
  });

  let haloEl: SVGSVGElement | null = null;

  const hide = (): void => {
    if (!haloEl) return;
    layer.remove(haloEl); // the core's wrapper-capture clear lifecycle
    haloEl = null;
  };

  const show = (shape: OverlayShape, colour?: string): void => {
    hide();
    // The input carries the colour, so a queued replay (deep link select before first paint) can
    // never pick up a later show's colour. onDrawn records the element for hide/replace.
    layer.draw({ shape, colour }, (el) => {
      haloEl = el;
    });
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
