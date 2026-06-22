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

import {
  parseFragmentXYWH,
  parsePolygonPoints,
  polygonBBox,
  selectorOf,
  isV1Shape,
  type Box,
  type Point,
  type W3CSelector,
  type W3CAnnotation,
  type AnnotationLike,
} from "@render/core";

const NS = "http://www.w3.org/2000/svg";

/** The geometry-only descriptor the SVG layer draws (NO DOM). */
export type OverlayShape =
  | { kind: "rect"; box: Box }
  | { kind: "polygon"; points: Point[] };

/**
 * Pure selector → overlay-geometry descriptor. Applies the v1-shape vocab gate ITSELF (rect+polygon
 * only — `isV1Shape`, selector.ts:124) and returns null for anything else, for a degenerate polygon
 * (NaN/empty), or for an unparseable rect. The SVG layer never has to re-check the vocabulary.
 */
export function overlayShapeFor(selector: W3CSelector): OverlayShape | null {
  if (!isV1Shape(selector)) return null; // ellipse/path/circle/line → not v1 → skip
  if (selector.type === "FragmentSelector") {
    const box = parseFragmentXYWH(selector.value);
    return box ? { kind: "rect", box } : null;
  }
  // SvgSelector → polygon (isV1Shape already restricted to Polygon among SVG shapes).
  const points = parsePolygonPoints(selector.value);
  return points ? { kind: "polygon", points } : null;
}

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
  const selectSubs = new Set<(id: string | null) => void>();

  const emitSelect = (id: string | null): void => {
    selectedId = id;
    for (const cb of selectSubs) cb(id);
  };

  const clear = (): void => {
    for (const s of shapes) {
      try { viewer.removeOverlay(s.svg); } catch { /* overlay already gone */ }
      s.svg.remove();
    }
    shapes = [];
  };

  /** Build the <svg> wrapper anchored to a shape's image-space bbox, with the geometry child appended. */
  const buildOverlaySvg = (id: string, geom: SVGElement, bbox: Box): SVGSVGElement => {
    const svg = document.createElementNS(NS, "svg");
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
    // P0-6: accessible name. role="button" because the shape is clickable (select); label NEVER from
    // the selector value — only from labelFor or the id fallback.
    svg.setAttribute("role", "button");
    svg.setAttribute("aria-label", labelFor ? labelFor(id) : `annotation ${id}`);
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
