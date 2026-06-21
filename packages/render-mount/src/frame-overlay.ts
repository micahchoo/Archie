// Coverage-border SVG overlay (7e1f) — extracted out of mount.ts (the lifecycle orchestrator) as a
// standalone rendering concern (standard-#0/#2 separation). It frames the WHOLE OBJECT: the SVG is added
// as an OSD overlay anchored to the image's bounds (viewer.world item getBounds), so OSD positions and
// tracks it on the OBJECT through pan/zoom — NOT a fixed border around the viewport (the earlier bug).
//
// A single SVG, held in a closure var so re-drawing replaces it and clearing removes it. Annotorious is
// per-shape only, so this is a NEW mechanism (not a marker style). The SVG ignores pointer events except
// at the 4 corner hit-targets, leaving the centre free for pan/zoom (donor: stroke-over-stroke halo).

import type { FrameOverlay } from "./surface.js";

/** The minimal OSD viewer surface this overlay needs — keeps the module decoupled from the full OSD type. */
export interface FrameViewerLike {
  addOverlay(options: { element: HTMLElement | SVGElement; location: unknown }): void;
  removeOverlay(element: HTMLElement | SVGElement): void;
  world: { getItemAt(i: number): { getBounds(immediately?: boolean): unknown } | undefined };
  addOnceHandler?(name: string, handler: () => void): void;
}

/** A drawable frame layer over the OBJECT: `draw` (re)renders the coverage border, `clear` removes it. */
export interface FrameOverlayController {
  /** Draw (replacing any current frame) the object-spanning coverage border with 4 corner hit-targets. */
  draw(frame: FrameOverlay): void;
  /** Remove the current frame SVG (no-op if none). */
  clear(): void;
}

/**
 * Create a frame-overlay controller bound to an OSD `viewer`. The border traces the IMAGE/OBJECT bounds
 * (added via `viewer.addOverlay` at the world item's viewport Rect), so it pans/zooms with the object.
 */
export function createFrameOverlay(viewer: FrameViewerLike): FrameOverlayController {
  let frameEl: SVGSVGElement | null = null;

  const clear = (): void => {
    if (frameEl) {
      try { viewer.removeOverlay(frameEl); } catch { /* overlay already gone */ }
      frameEl.remove();
      frameEl = null;
    }
  };

  const draw = (frame: FrameOverlay): void => {
    clear();
    const item = viewer.world.getItemAt(0);
    if (!item) {
      // The image isn't open yet — redraw once it is (whole-object notes can be set before first paint).
      viewer.addOnceHandler?.("open", () => draw(frame));
      return;
    }
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("preserveAspectRatio", "none"); // stretch the 100×100 box to the object's rect
    Object.assign(svg.style, {
      width: "100%",
      height: "100%",
      display: "block",
      pointerEvents: "none", // OSD sizes/positions the element to the object's bounds; corners opt back in
    } as Partial<CSSStyleDeclaration>);

    // A QUIET thin border tracing the object — the whole-object indicator. A soft dark halo under the
    // colour line keeps it legible over any media; non-scaling-stroke holds the line weight constant at any
    // zoom. No heavy corner brackets: the centre stays pan/zoom-free (svg pointer-events:none) and only the
    // thin colour line is clickable (→ select the note), so the affordance is light, not clunky.
    const inset = 0.7;
    const side = 100 - inset * 2;
    const rect = (stroke: string, width: string, clickable: boolean): SVGRectElement => {
      const r = document.createElementNS(NS, "rect");
      r.setAttribute("x", String(inset));
      r.setAttribute("y", String(inset));
      r.setAttribute("width", String(side));
      r.setAttribute("height", String(side));
      r.setAttribute("fill", "none");
      r.setAttribute("stroke", stroke);
      r.setAttribute("stroke-width", width);
      r.setAttribute("vector-effect", "non-scaling-stroke");
      if (clickable) {
        r.style.pointerEvents = "stroke";
        r.style.cursor = "pointer";
        r.addEventListener("click", () => frame.onActivate());
      }
      return r;
    };
    svg.append(rect("rgba(0,0,0,0.28)", "3", false)); // soft legibility halo
    svg.append(rect(frame.colour, "1.5", true)); // the quiet colour border — the click target
    // Anchor to the OBJECT: OSD positions + sizes the SVG to the image's viewport Rect every render frame,
    // so the border tracks the object through pan/zoom instead of sticking to the viewport edges.
    viewer.addOverlay({ element: svg, location: item.getBounds() });
    frameEl = svg;
  };

  return { draw, clear };
}
