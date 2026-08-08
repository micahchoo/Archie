// overlay-core — the ONE deep overlay lifecycle owner (Phase 6 of the architecture deepening).
//
// Replaces the three near-identical OSD overlay controllers (read-overlay / frame-overlay /
// selection-halo) with one core + content builders. The core owns what the three used to
// duplicate:
//
//   - the open-queue (`addOnceHandler("open")` redraw — shapes can be set before first paint),
//   - add / remove + OSD injected-wrapper neutralisation (overlay-wrapper.ts, V68),
//   - the wrapper-capture clear lifecycle (capture-wrapper → removeOverlay → remove → wrapper-remove),
//   - the explicit `:focus-visible` ring (Archie-09a0) for focusable layers,
//   - the common base svg style (width/height/display/pointerEvents — the per-overlay extras
//     stay in the builders),
//   - a11y attribute application (role / aria-label / tabindex / aria-hidden) and the shared
//     accessible-name cap (Archie-9413), and
//   - makeClickable — the V68 pointer-capture workaround, existing ONCE.
//
// The three controllers shrink to CONTENT BUILDERS over `createOverlayLayer`: they map their
// input (a shape, an id+shape pair, a frame descriptor) to an SVG element + an anchor; the core
// handles the lifecycle around it. `overlay-shape.ts` (the pure selector→geometry gate) and
// `overlay-wrapper.ts` (wrapper neutralisation) are the core's dependencies, kept as-is.
//
// ADR-0019 is honoured here and in every builder: DOM is built with createElementNS + setAttribute
// ONLY — never innerHTML/DOMParser (the standing §5.2 assertion, read-overlay-security.test.ts).

import { neutraliseOverlayWrapper, isOverlayWrapper } from "./overlay-wrapper.js";
import { polygonBBox, type Box } from "@render/core";
import type { OverlayShape } from "./overlay-shape.js";

/** SVG namespace — the ONE constant (was duplicated across all three overlay modules). */
export const NS = "http://www.w3.org/2000/svg";

/** Cap for a shape's accessible name (Archie-9413 review): a hostile `.archie.zip` can carry a
 *  multi-hundred-KB comment line (bounded only by SRC_MAX_BYTES) or an arbitrarily long id, and an
 *  AT reads aria-label IN FULL on every focus. ONE chokepoint — whatever labelFor OR the
 *  `annotation <id>` fallback produced is truncated where setAttribute happens. Counted in CODE
 *  POINTS (Archie-09a0 review), not UTF-16 units — see capLabel. */
const MAX_LABEL_CHARS = 160;

const capLabel = (s: string): string => {
  // `Array.from` iterates a string by CODE POINT (surrogate-pair aware); `String#slice` counts
  // UTF-16 units. A plain `s.slice(0, 160)` can land mid-surrogate-pair — an emoji or other
  // outside-BMP character straddling the cut — and emit a lone surrogate right before the "…",
  // which serializes as U+FFFD / reads as mangled to an AT. Slicing the code-point array instead
  // keeps every character whole; ASCII/BMP-only strings (the common case) are unaffected.
  const codePoints = Array.from(s);
  return codePoints.length > MAX_LABEL_CHARS ? `${codePoints.slice(0, MAX_LABEL_CHARS).join("")}…` : s;
};

/** The shared accessible-name cap (Archie-9413). Exported so the builders' aria-label paths
 *  (labelFor / id fallback) all truncate at the same chokepoint. */
export { capLabel };

/** Explicit `:focus-visible` ring (Archie-09a0): the UA default focus outline is not enough here —
 *  the overlay sits on a dark deep-zoom surface, and a host embed page may reset outlines globally
 *  (`* { outline: none }` and similar are common resets). An inline style on the element beats any
 *  selector-based host rule that lacks `!important`, so painting the ring THIS way survives resets
 *  that would defeat a stylesheet rule keyed on `.the-overlay-class:focus-visible`. A bright ring on
 *  a dark halo (donor: frame-overlay.ts's halo-plus-colour-line technique) stays legible over any
 *  underlying tile, not just dark ones. Keyboard-only: gated on `:focus-visible`, tested via
 *  `matches()` with a fail-OPEN catch — an environment that can't evaluate the selector gets the
 *  ring on every focus (a stray ring for a mouse user is a smaller harm than a keyboard user
 *  silently losing the indicator). */
const FOCUS_RING_STYLE: Partial<CSSStyleDeclaration> = {
  outline: "2px solid #fff",
  outlineOffset: "2px",
  boxShadow: "0 0 0 4px rgba(0,0,0,0.55)",
};
const NO_FOCUS_RING_STYLE: Partial<CSSStyleDeclaration> = {
  outline: "",
  outlineOffset: "",
  boxShadow: "",
};

const isFocusVisible = (el: Element): boolean => {
  try {
    return el.matches(":focus-visible");
  } catch {
    return true; // selector unsupported here → fail open, keep the ring for keyboard users
  }
};

/** Wire the explicit focus ring onto a focusable overlay element (applied by the core for
 *  `focusable` layers — read-overlay's per-shape `svg` and frame-overlay's whole-object `svg`). */
const addFocusRing = (el: SVGSVGElement): void => {
  el.addEventListener("focus", () => {
    if (isFocusVisible(el)) Object.assign(el.style, FOCUS_RING_STYLE);
  });
  el.addEventListener("blur", () => {
    Object.assign(el.style, NO_FOCUS_RING_STYLE);
  });
};

/**
 * V68, HALF TWO — the ONE home of the pointer-capture workaround (was duplicated in read-overlay's
 * styleGeometry and frame-overlay's hit rect).
 *
 * OSD binds a MouseTracker to the canvas/container and takes POINTER CAPTURE on pointerdown. Once
 * captured, the rest of the sequence is retargeted to the capturing element, so the browser never
 * dispatches a `click` on the hit surface — a listener that is otherwise correct simply never runs
 * for a real mouse (which is why the audits found Enter and a synthetic `click` working while a
 * real click did nothing at all: neither goes through a pointer sequence).
 *
 * Stopping the sequence HERE (on the hit surface, a descendant) means OSD's ancestor listener
 * never sees it, never captures, and `click` dispatches normally. Pan/zoom is unaffected everywhere
 * else on the canvas — this fires only on a hit surface's own pixels.
 *
 * Measured: this alone is NOT sufficient (the wrapper note in overlay-wrapper.ts is the other
 * half). Both halves are required, and each was verified to fail on its own.
 *
 * The `click` is also stopPropagation'd — the region overlay has always done that, and the frame's
 * hit rect joining it keeps OSD's canvas (clickToZoom disabled) from ever seeing a border click.
 */
export function makeClickable(el: SVGElement, onClick: () => void): void {
  el.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick();
  });
  for (const type of ["pointerdown", "mousedown"]) {
    el.addEventListener(type, (e) => e.stopPropagation());
  }
}

/** Pure shape → image-space bounding box (the rect's own box, or the polygon's bbox). Shared by
 *  the builders' viewBox + local-coords math and the core's default anchor. The `!` is safe:
 *  overlayShapeFor (overlay-shape.ts) already rejected the empty/NaN polygon case, so a polygon
 *  reaching a builder always has a parseable bbox. */
export function overlayBBox(shape: OverlayShape): Box {
  return shape.kind === "rect" ? shape.box : polygonBBox(shape.points)!;
}

/**
 * The minimal OSD viewer surface every overlay layer needs — ONE duck type replacing the three
 * near-identical `*ViewerLike` surfaces (donor: read-overlay.ts's OverlayViewerLike, which
 * frame-overlay.ts and selection-halo.ts each copied minus the `viewport`). OSD's real Viewer
 * satisfies it at runtime; the mounts assert the cast once, at their wiring points.
 */
export interface OverlayViewerLike {
  addOverlay(options: { element: HTMLElement | SVGElement; location: unknown }): void;
  removeOverlay(element: HTMLElement | SVGElement): void;
  world: { getItemAt(i: number): { getBounds(immediately?: boolean): unknown } | undefined };
  viewport: { imageToViewportRectangle(x: number, y: number, w: number, h: number): unknown };
  addOnceHandler?(name: string, handler: () => void): void;
}

/** A11y attributes the core applies to a layer's element (setAttribute-only, ADR-0019). `label`
 *  may be a function of the draw input — read-overlay's per-annotation names come from labelFor /
 *  the id fallback, which only exist at draw time. Dynamic tabindex (the region roving set) is
 *  NOT expressible here — the region builder sets its own. */
export interface OverlayLayerA11y<T> {
  role?: string;
  label?: string | ((input: T) => string);
  tabindex?: string;
  ariaHidden?: boolean;
}

/** A layer controller — the core's lifecycle surface, owned once. */
export interface OverlayLayer<T> {
  /** Draw the layer for `input`. Returns the drawn element, or null when the image isn't painted
   *  yet (the draw is queued on `open` and replayed with the SAME input + onDrawn when it fires).
   *  `onDrawn` runs after a successful draw, sync or replayed — the builders' bookkeeping (track
   *  the element for selection/clear) must live there so a replayed draw records itself too. */
  draw(input: T, onDrawn?: (el: SVGSVGElement) => void): SVGSVGElement | null;
  /** Remove one drawn element via the full clear lifecycle: capture the wrapper BEFORE
   *  removeOverlay detaches the element, remove the element, then remove the wrapper if it is
   *  OSD's (an empty overlay-wrapper div would otherwise shield the layers beneath it). */
  remove(el: SVGSVGElement): void;
  /** Remove every element this layer drew (no-op when none). */
  clear(): void;
}

export interface OverlayLayerOptions<T> {
  /** Layer identity — the element's id when the builder didn't set one (OSD names its injected
   *  wrapper after the element's id; see overlay-wrapper.ts). */
  id: string;
  /** Content builder: input → fully-built SVG element (children, per-overlay styles, keyboard
   *  wiring). The core applies the base style, focus ring, a11y attributes and the id fallback on
   *  top, then adds it to OSD and neutralises the wrapper. */
  build(input: T, viewer: OverlayViewerLike): SVGSVGElement;
  /** The input's geometry, for the default anchor (the shape's image-space bbox → viewport rect).
   *  The region + halo layers pass it; the frame is not shape-driven and supplies `locationFor`
   *  instead. */
  shapeOf?: (input: T) => OverlayShape;
  /** Custom anchor (overrides the default shape-bbox anchor). The frame anchors at the whole
   *  world item's viewport bounds — a different coordinate space from a region's image bbox. */
  locationFor?: (input: T, viewer: OverlayViewerLike) => unknown;
  /** Single-slot replace semantics: every draw — sync or replayed after a queued wait — first
   *  clears what this layer already drew. The frame and halo are single-element layers, and their
   *  pre-consolidation code re-ran the clear inside each queued `open` callback (so a draw issued
   *  before the image opened REPLACED an earlier queued one instead of stacking next to it); this
   *  preserves that. Omit for accumulating layers (the region overlay draws many shapes at once). */
  single?: boolean;
  /** Apply the explicit `:focus-visible` ring (operable layers — region + frame). The halo is
   *  decorative and opts out. */
  focusable?: boolean;
  /** A11y attributes to apply (role/aria-label/tabindex/aria-hidden), setAttribute-only. */
  a11y?: OverlayLayerA11y<T>;
}

/** The common base svg style the core applies to every layer (all three overlays set exactly
 *  these); per-overlay extras (the halo's `overflow: visible`) stay in the builders. */
const BASE_SVG_STYLE: Partial<CSSStyleDeclaration> = {
  width: "100%",
  height: "100%",
  display: "block",
  pointerEvents: "none", // only the layer's own opt-in hit surfaces take events (V68 discipline)
};

function defaultLocation<T>(
  input: T,
  viewer: OverlayViewerLike,
  shapeOf: ((input: T) => OverlayShape) | undefined,
): unknown {
  // `shapeOf` is the region/halo contract; the cast handles a bare OverlayShape input (no current
  // caller — kept so the layer is usable shape-driven without ceremony).
  const shape = shapeOf ? shapeOf(input) : (input as unknown as OverlayShape);
  const box = overlayBBox(shape);
  return viewer.viewport.imageToViewportRectangle(box.x, box.y, box.w, box.h);
}

function applyA11y<T>(el: SVGSVGElement, input: T, a11y: OverlayLayerA11y<T> | undefined): void {
  if (!a11y) return;
  if (a11y.role !== undefined) el.setAttribute("role", a11y.role);
  if (a11y.label !== undefined) {
    const label = typeof a11y.label === "function" ? a11y.label(input) : a11y.label;
    el.setAttribute("aria-label", label);
  }
  if (a11y.tabindex !== undefined) el.setAttribute("tabindex", a11y.tabindex);
  if (a11y.ariaHidden === true) el.setAttribute("aria-hidden", "true");
}

/**
 * Create an OSD overlay layer bound to an OSD-like `viewer`: the single home of the lifecycle the
 * three overlay controllers used to duplicate. `draw` queues until the image opens, builds the
 * content, applies the base style + focus ring + a11y attributes, anchors it (shape bbox by
 * default, `locationFor` when given), neutralises OSD's injected wrapper, and reports the element
 * through `onDrawn` — sync or after the queued replay. `remove`/`clear` own the wrapper-capture
 * teardown. Decoupled from the full OSD type, so the tests drive it with a fake.
 */
export function createOverlayLayer<T>(
  viewer: OverlayViewerLike,
  opts: OverlayLayerOptions<T>,
): OverlayLayer<T> {
  const drawn = new Set<SVGSVGElement>();

  const draw = (input: T, onDrawn?: (el: SVGSVGElement) => void): SVGSVGElement | null => {
    // Single-slot layers replace on every draw — INCLUDING the queued replay, so a draw issued
    // before the image opened wipes an earlier queued one at open time (the frame/halo contract).
    if (opts.single) clear();
    if (!viewer.world.getItemAt(0)) {
      // Image not painted yet — redraw once it opens (annotations / a deep-link selection can
      // arrive before first paint). Replays with the SAME input, so a builder's per-draw state
      // (the region id, the halo colour) can never go stale.
      viewer.addOnceHandler?.("open", () => {
        draw(input, onDrawn);
      });
      return null;
    }
    const el = opts.build(input, viewer);
    Object.assign(el.style, BASE_SVG_STYLE);
    if (opts.focusable) addFocusRing(el);
    applyA11y(el, input, opts.a11y);
    if (!el.id) el.id = opts.id;
    const location = opts.locationFor ? opts.locationFor(input, viewer) : defaultLocation(input, viewer, opts.shapeOf);
    viewer.addOverlay({ element: el, location });
    // OSD's injected wrapper is an opaque div at the default pointer-events:auto — an invisible
    // rectangle over the layer's whole box. Put it back out of the hit path so the overlay's own
    // pointer-events declarations mean what they say (V68; overlay-wrapper.ts).
    neutraliseOverlayWrapper(el);
    drawn.add(el);
    onDrawn?.(el);
    return el;
  };

  const remove = (el: SVGSVGElement): void => {
    if (!drawn.delete(el)) return;
    // Capture the wrapper BEFORE removeOverlay detaches the element — afterwards parentElement is
    // null. Then remove the element, and the wrapper if it is OSD's: `el.remove()` only detaches
    // OUR element, and if removeOverlay threw, OSD's injected wrapper would stay behind as an
    // invisible empty div (once per layer, on every clear) shielding what is beneath it.
    const wrapper = el.parentElement;
    try {
      viewer.removeOverlay(el);
    } catch {
      /* overlay already gone */
    }
    el.remove();
    if (isOverlayWrapper(wrapper)) wrapper.remove();
  };

  const clear = (): void => {
    for (const el of [...drawn]) remove(el);
  };

  return { draw, remove, clear };
}
