// V56, canvas half: paint the drawn region marks in their Reading's colour.
//
// LAZY — imported only by reader.ts, which is itself behind `await import("./reader.js")`. It pulls
// `@render/mount` (for `overlayShapeFor`), so it must never be reachable from index.ts's static graph;
// see .claude/rules/archie-viewer-eager-closure.md.
//
// WHY A POST-PASS AND NOT A STYLE CHANNEL. The read-only DOM-SVG overlay has no per-annotation style
// seam: `read-overlay.ts` styles every geometry identically (`stroke="currentColor"`, width 1.5) and
// `ReadOnlyMountSurface.setAnnotations` takes annotations only. Adding that seam means changing
// `@render/mount`, which is another agent's territory this cycle. So the embed styles the shapes the
// overlay drew — and it takes the NUMBERS from `readingMarkerStyle`, the one render-core function the
// shell's canvas and the legend swatch both call. No third copy of 0.18 / 0.95 / 2 exists.
// (Follow-up worth filing: a `styleFor` option on `createReadOnlyOverlay` would let this go away.)
//
// THE PAIRING, AND WHY IT IS SAFE. `setAnnotations` iterates its argument in order and draws exactly
// those records whose selector yields a shape, appending each overlay in call order — so the region
// `<svg>`s in DOM order correspond 1:1 with `annotations.filter(hasShape)`. That predicate is not
// re-implemented here: it is `selectorOf` (render-core) composed with `overlayShapeFor` (render-mount),
// the same two exported functions the overlay itself calls. If the two lengths ever disagree the pass
// REFUSES rather than colouring by an off-by-one — a wrong colour is a false claim about which reading
// a note belongs to, and silence is better than a lie.

import { selectorOf, emphasisOf, readingMarkerStyle, type AnnotationLike, type W3CAnnotation } from "@render/core";
import { overlayShapeFor } from "@render/mount";
import { BASE_MARK_COLOUR } from "./reader-chrome.js";

/** The overlay's own id prefix (`read-overlay.ts` buildOverlaySvg: `archie-region-<n>`). */
const REGION_SELECTOR = 'svg[id^="archie-region-"]';

/** The records the read-only overlay will actually DRAW, in draw order. */
export function drawableAnnotations(annotations: readonly W3CAnnotation[]): W3CAnnotation[] {
  return annotations.filter((a) => {
    const sel = selectorOf(a as AnnotationLike);
    return sel ? overlayShapeFor(sel) !== null : false;
  });
}

/**
 * Colour every drawn mark by its Reading. `colourOf` returns the reading colour for an annotation id,
 * or undefined for a base note (which takes the neutral base colour the legend's "General notes" row
 * shows, so the two agree). Returns the number of marks painted — 0 means the pass refused.
 */
export function paintReadingMarks(
  host: HTMLElement,
  annotations: readonly W3CAnnotation[],
  colourOf: (id: string) => string | undefined,
): number {
  const drawn = drawableAnnotations(annotations);
  const svgs = [...host.querySelectorAll<SVGSVGElement>(REGION_SELECTOR)];
  if (svgs.length !== drawn.length) {
    // Not an error: the overlay defers a shape to OSD's `open` event when the image has not painted
    // yet, so an early call legitimately sees fewer. The caller retries; a persistent mismatch is
    // reported by the retry's final attempt.
    return 0;
  }
  for (let i = 0; i < drawn.length; i++) {
    const ann = drawn[i]!;
    const svg = svgs[i]!;
    const colour = colourOf(String(ann.id ?? "")) ?? BASE_MARK_COLOUR;
    const spec = readingMarkerStyle(colour, emphasisOf(ann));
    // `stroke="currentColor"` on the geometry (read-overlay styleGeometry) means the svg's own `color`
    // is the one place the hue has to land; the halo and any future descendant inherit it too.
    svg.style.color = spec.stroke;
    const geom = svg.firstElementChild;
    if (!geom) continue;
    geom.setAttribute("fill", spec.fill);
    geom.setAttribute("fill-opacity", String(spec.fillOpacity));
    geom.setAttribute("stroke-opacity", String(spec.strokeOpacity));
    geom.setAttribute("stroke-width", String(spec.strokeWidth));
  }
  return drawn.length;
}

/**
 * `paintReadingMarks` with the deferred-draw retry. The overlay may postpone shapes to OSD's `open`
 * handler, so the first pass can legitimately find nothing; retry on a few frames before giving up
 * loudly. Loud, because a silent no-op here is precisely the "capability quietly absent" failure
 * ADR-0019's contract exists to make impossible.
 */
export function paintReadingMarksWhenDrawn(
  host: HTMLElement,
  annotations: readonly W3CAnnotation[],
  colourOf: (id: string) => string | undefined,
  attempts = 12,
): void {
  const tick = (left: number): void => {
    if (paintReadingMarks(host, annotations, colourOf) > 0) return;
    if (drawableAnnotations(annotations).length === 0) return; // nothing to paint — not a failure
    if (left <= 0) {
      console.warn("[archie-viewer] reading marks: drawn region count never matched the annotation list — marks left uncoloured");
      return;
    }
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => tick(left - 1));
    else setTimeout(() => tick(left - 1), 16);
  };
  tick(attempts);
}
