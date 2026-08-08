// ReadOnlyOverlay — a DOM-SVG annotation overlay layer (ADR-0019: read-only, no Annotorious/PixiJS,
// no unsafe-eval). Per-annotation region shapes drawn with `document.createElementNS` + `setAttribute`
// ONLY — NEVER `innerHTML`/`DOMParser` (ADR-0019 §Consequences security bullet; the standing §5.2
// assertion). Donor: frame-overlay.ts (the `*ViewerLike` minimal surface, the createElementNS rect
// build, `viewer.addOverlay({element,location})`, closure-held elements, the `addOnceHandler("open")`
// queue). Phase 0 generalized frame-overlay's ONE whole-object border to PER-annotation region shapes.
//
// Phase 6: the lifecycle is delegated to the ONE overlay core (overlay-core.ts) — open-queue,
// add/remove, OSD-wrapper neutralisation, the wrapper-capture clear, the focus ring, base styling,
// a11y attribute application and the V68 pointer-capture workaround (makeClickable). This module is
// now a CONTENT BUILDER: shape → SVG children + the region-set keyboard wiring (roving tabindex,
// arrow-key navigation), plus the selection state the controller exposes. Every exported name and
// observable behavior is unchanged.
//
// Phase 7: the per-annotation STYLE CHANNEL (`styleFor` on ReadOnlyOverlayOptions) — the seam
// reading-marks.ts's own header asked for ("a `styleFor` option on `createReadOnlyOverlay` would let
// this go away"). Each shape is styled AT DRAW TIME, inside the builder, in the same pass that
// creates it — so the embed's DOM-order pairing + deferred-draw retry post-pass cannot exist, and a
// queued replay (the core re-runs the builder with the SAME input) styles identically to a sync
// draw. The default (no styleFor) is byte-for-byte today's styling: transparent fill,
// `stroke="currentColor"`, width 1.5, no opacity attributes.
//
// Geometry is pure (render-core/geometry/selector.ts): parseFragmentXYWH / parsePolygonPoints /
// polygonBBox / selectorOf — selector VALUES reach the parsers ONLY (they extract numbers), so the raw
// SvgSelector string never touches the DOM as markup. The v1-shape vocab gate (rect+polygon only,
// selector.ts:124) is applied HERE in `overlayShapeFor`: a non-rect/polygon selector → null.

import { createOverlayLayer, makeClickable, overlayBBox, capLabel, NS, type OverlayViewerLike } from "./overlay-core.js";
import { overlayShapeFor, type OverlayShape } from "./overlay-shape.js";
import {
  selectorOf,
  type Box,
  type W3CAnnotation,
  type AnnotationLike,
} from "@render/core";

/** Arrow/Home/End → a step within the roving region set (V45). Both axes move, because the regions
 *  are scattered over an image rather than laid out in a line — a reader pressing Down on a picture
 *  means "the next one", and guessing at spatial order would be worse than honest sequence order. */
const ROVE_KEYS: Record<string, number | undefined> = {
  ArrowRight: 1, ArrowDown: 1,
  ArrowLeft: -1, ArrowUp: -1,
};

// The pure selector → geometry descriptor now lives in overlay-shape.ts (selection-halo.ts draws
// the same vocabulary and must not import a renderer to get it). Re-exported here so every existing
// importer of "./read-overlay.js" — index.ts, read-overlay-geometry.test.ts — keeps resolving.
export { overlayShapeFor, type OverlayShape } from "./overlay-shape.js";

// The ONE shared OSD viewer duck type (overlay-core.ts) — re-exported so every existing importer of
// "./read-overlay.js" (index.ts, the overlay tests) keeps resolving the same name.
export type { OverlayViewerLike } from "./overlay-core.js";

/** A label source for a shape's accessible name (P0-6) — id in, human label out. No DOM read. */
export type LabelFor = (annotationId: string) => string;

/** Concrete per-annotation SVG style numbers, applied at draw time (setAttribute-only, ADR-0019).
 *  The caller decides the grammar (the embed derives these from render-core's readingMarkerStyle via
 *  `readingMarkerStyle(colour, emphasisOf(annotation))`); this module only applies what it is given. */
export interface OverlayShapeStyle {
  /** The mark's hue — lands on the shape svg's `color` so the geometry's `stroke="currentColor"`
   *  and any future descendant (the halo) inherit it. */
  stroke: string;
  fill: string;
  fillOpacity: string;
  strokeOpacity: string;
  strokeWidth: string;
}

/** The per-annotation style channel (Phase 7): annotation id + the annotation itself (per-note
 *  emphasis lives there) → concrete SVG style numbers, or undefined for the overlay's default
 *  styling. Applied inside the builder at draw time — a drawn shape is styled in the SAME pass it is
 *  created, so there is no second pass to forget, pair by DOM order, or retry after a deferred draw.
 *
 *  THE LOUD CONTRACT survives here: a record the overlay cannot style is a record with no v1 region
 *  geometry, which setAnnotations skips with a LOUD warn (below) — the old "silence is better than a
 *  lie" count-mismatch machinery existed to detect a pairing failure that this design cannot have. */
export type StyleFor = (annotationId: string, annotation: W3CAnnotation) => OverlayShapeStyle | undefined;

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
  /** Per-annotation style resolver (Phase 7 — the reading-marks post-pass seam). Absent → today's
   *  identical default styling. See StyleFor for the draw-time contract. */
  styleFor?: StyleFor;
}

/**
 * Create a read-only DOM-SVG overlay bound to an OSD-like `viewer`. State (the drawn shapes, the
 * selection, the subscribers) lives in this closure — ONE writer. `setAnnotations` clears prior
 * shapes, then per annotation: `selectorOf` → `overlayShapeFor`; null is skipped with a LOUD warn
 * (mirroring mount.ts, so a legacy degenerate record diverges visibly, never silently). The draw
 * lifecycle itself is the core's (overlay-core.ts).
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

  // The draw input carries the ANNOTATION (not just its id + shape) so the style resolver can read
  // per-note emphasis — the id alone cannot express it.
  const layer = createOverlayLayer<{ id: string; shape: OverlayShape; annotation: W3CAnnotation }>(viewer, {
    id: "archie-region", // every builder sets a unique `archie-region-<n>` id; this is the fallback
    focusable: true,
    shapeOf: (input) => input.shape,
    a11y: {
      role: "button",
      label: (input) => capLabel(labelFor ? labelFor(input.id) : `annotation ${input.id}`),
    },
    build: (input) => buildOverlaySvg(input.id, input.shape, input.annotation),
  });

  const clear = (): void => {
    layer.clear();
    shapes = [];
    tabbable.clear(); // else the rove set holds detached elements and the tab stop lands on nothing
  };

  /** Build the geometry child for a shape, in the svg's bbox-local user space, and make it the hit
   *  target: transparent fill (the interior stays clickable), currentColor stroke, and the V68
   *  click routing (makeClickable owns the pointer-capture workaround). When a per-annotation style
   *  is in play its numbers override the defaults AT DRAW TIME — the reading-marks post-pass's whole
   *  job, now intrinsic to the draw. `stroke` stays "currentColor" either way (the hue rides the
   *  svg's `color`, set by buildOverlaySvg, so the halo and future descendants inherit it). */
  const buildGeometry = (shape: OverlayShape, bbox: Box, id: string, style?: OverlayShapeStyle): SVGElement => {
    let geom: SVGElement;
    if (shape.kind === "rect") {
      const r = document.createElementNS(NS, "rect");
      r.setAttribute("x", "0");
      r.setAttribute("y", "0");
      r.setAttribute("width", String(bbox.w));
      r.setAttribute("height", String(bbox.h));
      geom = r;
    } else {
      const p = document.createElementNS(NS, "polygon");
      // Points are shifted into the local bbox-origin user space, then joined into the `points`
      // ATTRIBUTE via setAttribute — NEVER innerHTML.
      const pts = shape.points.map((pt) => `${pt.x - bbox.x},${pt.y - bbox.y}`).join(" ");
      p.setAttribute("points", pts);
      geom = p;
    }
    geom.setAttribute("fill", style?.fill ?? "rgba(0,0,0,0)"); // transparent fill keeps the interior a hit target
    geom.setAttribute("stroke", "currentColor");
    geom.setAttribute("stroke-width", style?.strokeWidth ?? "1.5");
    if (style) {
      geom.setAttribute("fill-opacity", style.fillOpacity);
      geom.setAttribute("stroke-opacity", style.strokeOpacity);
    }
    geom.setAttribute("vector-effect", "non-scaling-stroke");
    geom.style.pointerEvents = "all"; // region is the hit target
    geom.style.cursor = "pointer";
    makeClickable(geom, () => emitSelect(id));
    return geom;
  };

  /** Build the <svg> wrapper anchored to a shape's image-space bbox, with the geometry child appended. */
  const buildOverlaySvg = (id: string, shape: OverlayShape, annotation: W3CAnnotation): SVGSVGElement => {
    const bbox = overlayBBox(shape);
    // Phase 7 style channel — resolved at draw time, before the geometry is built. The hue lands on
    // the svg's `color`; the geometry (and any future descendant like the halo) inherits it via
    // `stroke="currentColor"` — the SAME mechanism the old reading-marks post-pass used, now intrinsic.
    const style = options.styleFor?.(id, annotation);
    const svg = document.createElementNS(NS, "svg");
    // A DOM-safe unique id, so OSD's wrapper is named `overlay-wrapper-archie-region-N` instead of
    // colliding on the bare literal. Ordinal, not the annotation id — those are full URLs here.
    svg.id = `archie-region-${seq++}`;
    // A local 0..w / 0..h user space so the geometry's image-pixel coords map directly; OSD stretches
    // the SVG to the bbox's viewport Rect (preserveAspectRatio="none"), so 1 unit == 1 image pixel here.
    svg.setAttribute("viewBox", `0 0 ${bbox.w} ${bbox.h}`);
    svg.setAttribute("preserveAspectRatio", "none");
    // P0-6 + Archie-9413: accessible name AND keyboard operability. role="button" + the aria-label
    // come from the core's a11y options; the tabindex is ROVING (V45) and self-managed here. Label
    // NEVER from the selector value — only from labelFor or the id fallback, capped at the shared
    // chokepoint (overlay-core capLabel), and setAttribute-only (the header's no-markup rule stands).
    svg.setAttribute("tabindex", tabbable.size === 0 ? "0" : "-1");
    tabbable.add(svg);
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
    if (style) svg.style.color = style.stroke;
    svg.append(buildGeometry(shape, bbox, id, style));
    return svg;
  };

  const drawShape = (id: string, shape: OverlayShape, annotation: W3CAnnotation): void => {
    // The core queues the draw until the image opens and replays it (with onDrawn) when it does —
    // so the shapes/roving bookkeeping below records queued draws exactly as sync ones. The style
    // resolver runs inside the BUILDER, so a queued replay styles identically to a sync draw — the
    // old post-pass's "the overlay defers to open, retry in a few frames" race cannot exist.
    layer.draw({ id, shape, annotation }, (svg) => {
      shapes.push({ id, svg });
      applySelectedStyle();
    });
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
          // Degenerate / non-v1 geometry — skip LOUDLY (mirrors the editor mount). This is the ONLY
          // way a style cannot be applied (no shape exists to hold it), and it is the loud contract
          // the old post-pass approximated with its count-mismatch refusal: a visible divergence
          // beats a silent one. The host's list still shows the note (it reads the log).
          console.warn(`[@render/mount] read-only overlay: record ${id} has no v1 region geometry — shape not rendered`, ann);
          continue;
        }
        drawShape(id, shape, ann);
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
