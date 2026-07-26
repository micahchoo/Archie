// ReadOnlyOverlay — a DOM-SVG annotation overlay layer (ADR-0019: read-only, no Annotorious/PixiJS,
// no unsafe-eval). Per-annotation region shapes drawn with `document.createElementNS` + `setAttribute`
// ONLY — NEVER `innerHTML`/`DOMParser` (ADR-0019 §Consequences security bullet; the standing §5.2
// assertion). Donor: frame-overlay.ts (the `*ViewerLike` minimal surface, the createElementNS rect
// build, `viewer.addOverlay({element,location})`, closure-held elements, the `addOnceHandler("open")`
// queue). Phase 0 generalizes frame-overlay's ONE whole-object border to PER-annotation region shapes.
//
// Geometry is pure (render-core/geometry/selector.ts): parseFragmentXYWH / parsePolygonPoints /
// polygonBBox / selectorOf — selector VALUES reach the parsers ONLY (they extract numbers), so the raw
// SvgSelector string never touches the DOM as markup. The v1-shape vocab gate (rect+polygon only,
// selector.ts:124) is applied HERE in `overlayShapeFor`: a non-rect/polygon selector → null.

import { neutraliseOverlayWrapper, isOverlayWrapper } from "./overlay-wrapper.js";
import { overlayShapeFor, type OverlayShape } from "./overlay-shape.js";
import {
  polygonBBox,
  selectorOf,
  type Box,
  type W3CAnnotation,
  type AnnotationLike,
} from "@render/core";

const NS = "http://www.w3.org/2000/svg";

/** Arrow/Home/End → a step within the roving region set (V45). Both axes move, because the regions
 *  are scattered over an image rather than laid out in a line — a reader pressing Down on a picture
 *  means "the next one", and guessing at spatial order would be worse than honest sequence order. */
const ROVE_KEYS: Record<string, number | undefined> = {
  ArrowRight: 1, ArrowDown: 1,
  ArrowLeft: -1, ArrowUp: -1,
};

/** Cap for a shape's accessible name (Archie-9413 review): a hostile `.archie.zip` can carry a
 * multi-hundred-KB comment line (bounded only by SRC_MAX_BYTES) or an arbitrarily long id, and an
 * AT reads aria-label IN FULL on every focus. ONE chokepoint — whatever labelFor OR the
 * `annotation <id>` fallback produced is truncated where setAttribute happens. Counted in CODE
 * POINTS (Archie-09a0 review), not UTF-16 units — see capLabel. */
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

/** Explicit `:focus-visible` ring (Archie-09a0): the UA default focus outline is not enough here —
 * the overlay sits on a dark deep-zoom surface, and a host embed page may reset outlines globally
 * (`* { outline: none }` and similar are common resets). An inline style on the element beats any
 * selector-based host rule that lacks `!important`, so painting the ring THIS way survives resets
 * that would defeat a stylesheet rule keyed on `.the-overlay-class:focus-visible`. A bright ring on
 * a dark halo (donor: frame-overlay.ts's halo-plus-colour-line technique, drawShape below) stays
 * legible over any underlying tile, not just dark ones. Keyboard-only: gated on `:focus-visible`,
 * tested via `matches()` with a fail-OPEN catch — an environment that can't evaluate the selector
 * gets the ring on every focus (a stray ring for a mouse user is a smaller harm than a keyboard
 * user silently losing the indicator). */
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

/** Wire the explicit focus ring onto a focusable overlay element (the pattern both overlay modules
 * share — read-overlay's per-shape `svg` and frame-overlay's whole-object `svg`). */
const addFocusRing = (el: SVGSVGElement): void => {
  el.addEventListener("focus", () => {
    if (isFocusVisible(el)) Object.assign(el.style, FOCUS_RING_STYLE);
  });
  el.addEventListener("blur", () => {
    Object.assign(el.style, NO_FOCUS_RING_STYLE);
  });
};

// The pure selector → geometry descriptor now lives in overlay-shape.ts (selection-halo.ts draws
// the same vocabulary and must not import a renderer to get it). Re-exported here so every existing
// importer of "./read-overlay.js" — index.ts, read-overlay-geometry.test.ts — keeps resolving.
export { overlayShapeFor, type OverlayShape } from "./overlay-shape.js";

/**
 * The minimal OSD viewer surface this overlay needs — keeps the module decoupled from the full OSD
 * type (donor: FrameViewerLike) and lets the test drive it with a fake. Adds a `viewport` with
 * `imageToViewportRectangle` so a shape anchors to its IMAGE-space bounding box.
 */
export interface OverlayViewerLike {
  addOverlay(options: { element: HTMLElement | SVGElement; location: unknown }): void;
  removeOverlay(element: HTMLElement | SVGElement): void;
  world: { getItemAt(i: number): { getBounds(immediately?: boolean): unknown } | undefined };
  viewport: { imageToViewportRectangle(x: number, y: number, w: number, h: number): unknown };
  addOnceHandler?(name: string, handler: () => void): void;
}

/** A label source for a shape's accessible name (P0-6) — id in, human label out. No DOM read. */
export type LabelFor = (annotationId: string) => string;

export interface ReadOnlyOverlayController {
  /** Replace the rendered region shapes with those of `annotations` (degenerate → skipped LOUDLY). */
  setAnnotations(annotations: W3CAnnotation[]): void;
  /** Mark one shape selected (visual state), or clear with null. */
  setSelected(id: string | null): void;
  /** Subscribe to a user selection (shape click, or null on background click). Returns unsubscribe. */
  onSelect(cb: (id: string | null) => void): () => void;
  /** Remove all drawn shapes. */
  clear(): void;
}

interface DrawnShape {
  id: string;
  svg: SVGSVGElement;
}

export interface ReadOnlyOverlayOptions {
  /** Accessible-name source for a shape (P0-6). Falls back to `"annotation <id>"` when absent. */
  labelFor?: LabelFor;
}

/**
 * Create a read-only DOM-SVG overlay bound to an OSD-like `viewer`. State (the drawn shapes, the
 * selection, the subscribers) lives in this closure — ONE writer. `setAnnotations` clears prior
 * shapes, then per annotation: `selectorOf` → `overlayShapeFor`; null is skipped with a LOUD warn
 * (mirroring mount.ts:261-265, so a legacy degenerate record diverges visibly, never silently).
 */
export function createReadOnlyOverlay(
  viewer: OverlayViewerLike,
  options: ReadOnlyOverlayOptions = {},
): ReadOnlyOverlayController {
  const labelFor = options.labelFor;
  let shapes: DrawnShape[] = [];
  let selectedId: string | null = null;
  let seq = 0;
  const selectSubs = new Set<(id: string | null) => void>();
  // The roving set, in draw order — insertion-ordered because Set is, so "next" means the next
  // region as authored rather than the next one in DOM paint order.
  const tabbable = new Set<SVGSVGElement>();

  /** Move focus by `step` within the roving set, wrapping, and hand the tab stop to the new element. */
  const rove = (from: SVGSVGElement, step: number): void => {
    const els = [...tabbable];
    if (els.length < 2) return;
    const i = els.indexOf(from);
    if (i < 0) return;
    const next = els[(i + step + els.length) % els.length]!;
    for (const el of els) el.setAttribute("tabindex", el === next ? "0" : "-1");
    next.focus();
  };

  const emitSelect = (id: string | null): void => {
    selectedId = id;
    for (const cb of selectSubs) cb(id);
  };

  const clear = (): void => {
    for (const s of shapes) {
      // Capture the wrapper BEFORE removeOverlay detaches the svg — afterwards `parentElement` is null.
      const wrapper = s.svg.parentElement;
      try { viewer.removeOverlay(s.svg); } catch { /* overlay already gone */ }
      s.svg.remove();
      // `s.svg.remove()` only detaches OUR element; if removeOverlay threw, OSD's injected wrapper
      // would stay behind as an invisible empty div, once per shape, on every setAnnotations.
      if (isOverlayWrapper(wrapper)) wrapper.remove();
    }
    shapes = [];
    tabbable.clear(); // else the rove set holds detached elements and the tab stop lands on nothing
  };

  /** Build the <svg> wrapper anchored to a shape's image-space bbox, with the geometry child appended. */
  const buildOverlaySvg = (id: string, geom: SVGElement, bbox: Box): SVGSVGElement => {
    const svg = document.createElementNS(NS, "svg");
    // A DOM-safe unique id, so OSD's wrapper is named `overlay-wrapper-archie-region-N` instead of
    // colliding on the bare literal. Ordinal, not the annotation id — those are full URLs here.
    svg.id = `archie-region-${seq++}`;
    // A local 0..w / 0..h user space so the geometry's image-pixel coords map directly; OSD stretches
    // the SVG to the bbox's viewport Rect (preserveAspectRatio="none"), so 1 unit == 1 image pixel here.
    svg.setAttribute("viewBox", `0 0 ${bbox.w} ${bbox.h}`);
    svg.setAttribute("preserveAspectRatio", "none");
    Object.assign(svg.style, {
      width: "100%",
      height: "100%",
      display: "block",
      pointerEvents: "none", // only the geometry opts back in (the hit target)
    } as Partial<CSSStyleDeclaration>);
    // P0-6 + Archie-9413: accessible name AND keyboard operability. role="button" because the shape
    // is clickable (select); tabindex=0 puts every region in the tab order; Enter/Space activates
    // through the SAME emitSelect the click path uses. Label NEVER from the selector value — only
    // from labelFor or the id fallback, and setAttribute-only (the header's no-markup rule stands).
    svg.setAttribute("role", "button");
    svg.setAttribute("aria-label", capLabel(labelFor ? labelFor(id) : `annotation ${id}`));
    // V45 (Archie-3d55) — ROVING tabindex, not one stop per region.
    //
    // The audit found the two consumers disagreeing: the shell exposes no individual region (its
    // marks are WebGL, with no per-shape node to focus — that is a hard fact, not a choice), while
    // the embed exposed EVERY region as its own tab stop. Neither extreme is right. N stops does not
    // scale: a 60-note page is 60 presses to tab past the image, which is the same wall V27 found on
    // the filmstrip and the repo already ratified the answer for there — one stop in the sequence,
    // arrows to move within (docs/research/a11y-interactions.md; Filmstrip.svelte, Archie-c831).
    //
    // So both consumers now give the same GUARANTEE by different mechanisms: every note is reachable
    // and named. The shell's route is the notes list (DOM, ordered, named — and per Archie-c982 the
    // list is the INDEX, which is exactly this job). The embed has no list, so the regions carry it.
    svg.setAttribute("tabindex", tabbable.size === 0 ? "0" : "-1");
    tabbable.add(svg);
    svg.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault(); // Space must select, not scroll the host page
        e.stopPropagation();
        emitSelect(id);
        return;
      }
      const step = ROVE_KEYS[e.key];
      if (step === undefined) return;
      e.preventDefault(); // arrows would otherwise pan OSD out from under the reader
      e.stopPropagation();
      rove(svg, step);
    });
    addFocusRing(svg);
    svg.append(geom);
    return svg;
  };

  const styleGeometry = (el: SVGElement, id: string): void => {
    el.setAttribute("fill", "rgba(0,0,0,0)"); // transparent fill keeps the interior a hit target
    el.setAttribute("stroke", "currentColor");
    el.setAttribute("stroke-width", "1.5");
    el.setAttribute("vector-effect", "non-scaling-stroke");
    (el as SVGElement & { style: CSSStyleDeclaration }).style.pointerEvents = "all"; // region is the hit target
    (el as SVGElement & { style: CSSStyleDeclaration }).style.cursor = "pointer";
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      emitSelect(id);
    });
    // V68, HALF TWO — let the `click` above actually happen.
    //
    // OSD binds a MouseTracker to the canvas/container and takes POINTER CAPTURE on pointerdown.
    // Once captured, the rest of the sequence is retargeted to the capturing element, so the browser
    // never dispatches a `click` on this geometry — the listener above is correct and simply never
    // runs. That is why the audit found Enter and a synthetic `click` both working while a real mouse
    // click did nothing at all: neither of those goes through a pointer sequence.
    //
    // Stopping the sequence HERE (on the region, a descendant) means OSD's ancestor listener never
    // sees it, never captures, and `click` dispatches normally. Pan/zoom is unaffected everywhere
    // else on the canvas — this fires only on a region's own pixels.
    //
    // Measured: this alone is NOT sufficient (see the wrapper note in drawShape). Both halves are
    // required, and each was verified to fail on its own.
    for (const type of ["pointerdown", "mousedown"]) {
      el.addEventListener(type, (e) => e.stopPropagation());
    }
  };

  const drawShape = (id: string, shape: OverlayShape): void => {
    const item = viewer.world.getItemAt(0);
    if (!item) {
      // Image not painted yet — redraw this shape once it opens (annotations can be set before paint).
      viewer.addOnceHandler?.("open", () => drawShape(id, shape));
      return;
    }
    let bbox: Box;
    let geom: SVGElement;
    if (shape.kind === "rect") {
      bbox = shape.box;
      const r = document.createElementNS(NS, "rect");
      r.setAttribute("x", "0");
      r.setAttribute("y", "0");
      r.setAttribute("width", String(bbox.w));
      r.setAttribute("height", String(bbox.h));
      geom = r;
    } else {
      const bb = polygonBBox(shape.points);
      if (!bb) return; // unreachable (overlayShapeFor already rejected empty), but keeps bbox non-null
      bbox = bb;
      const p = document.createElementNS(NS, "polygon");
      // Points are shifted into the local bbox-origin user space, then joined into the `points`
      // ATTRIBUTE via setAttribute — NEVER innerHTML.
      const pts = shape.points.map((pt) => `${pt.x - bbox.x},${pt.y - bbox.y}`).join(" ");
      p.setAttribute("points", pts);
      geom = p;
    }
    styleGeometry(geom, id);
    const svg = buildOverlaySvg(id, geom, bbox);
    viewer.addOverlay({ element: svg, location: viewer.viewport.imageToViewportRectangle(bbox.x, bbox.y, bbox.w, bbox.h) });
    neutraliseOverlayWrapper(svg);
    shapes.push({ id, svg });
    applySelectedStyle();
  };

  const applySelectedStyle = (): void => {
    for (const s of shapes) {
      const geom = s.svg.firstElementChild as SVGElement | null;
      if (geom) geom.setAttribute("data-selected", String(s.id === selectedId));
    }
  };

  return {
    setAnnotations(annotations: W3CAnnotation[]): void {
      clear();
      for (const ann of annotations) {
        const id = String((ann as AnnotationLike).id ?? "");
        const sel = selectorOf(ann as AnnotationLike);
        const shape = sel ? overlayShapeFor(sel) : null;
        if (!shape) {
          // Degenerate / non-v1 geometry — skip LOUDLY (mirrors mount.ts:261-265). The host's list
          // still shows the note (it reads the log); a visible divergence beats a silent one.
          console.warn(`[@render/mount] read-only overlay: record ${id} has no v1 region geometry — shape not rendered`, ann);
          continue;
        }
        drawShape(id, shape);
      }
    },
    setSelected(id: string | null): void {
      selectedId = id;
      applySelectedStyle();
    },
    onSelect(cb: (id: string | null) => void): () => void {
      selectSubs.add(cb);
      return () => selectSubs.delete(cb);
    },
    clear,
  };
}
