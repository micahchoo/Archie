// Coverage-border SVG overlay (7e1f) — extracted out of mount.ts (the lifecycle orchestrator) as a
// standalone rendering concern (standard-#0/#2 separation). It frames the WHOLE OBJECT: the SVG is added
// as an OSD overlay anchored to the image's bounds (viewer.world item getBounds), so OSD positions and
// tracks it on the OBJECT through pan/zoom — NOT a fixed border around the viewport (the earlier bug).
//
// A single SVG, held in a closure var so re-drawing replaces it and clearing removes it. Annotorious is
// per-shape only, so this is a NEW mechanism (not a marker style). The SVG ignores pointer events except
// at the 4 corner hit-targets, leaving the centre free for pan/zoom (donor: stroke-over-stroke halo).

import type { FrameOverlay } from "./surface.js";

/** Explicit `:focus-visible` ring (Archie-09a0), duplicated from read-overlay.ts's copy — the two
 * overlay modules are deliberately decoupled (no cross-import), same as their duplicated
 * `*ViewerLike` surfaces and NS constant. The UA default focus outline isn't enough: this overlay
 * sits on a dark deep-zoom surface, and a host embed page may reset outlines globally (`* {
 * outline: none }` and similar are common resets). An inline style on the element beats any
 * selector-based host rule lacking `!important`. A bright ring on a dark halo (same technique as
 * this file's halo-plus-colour-line border below) stays legible over any underlying tile. Gated on
 * `:focus-visible` via `matches()`, fail-OPEN on an environment that can't evaluate the selector —
 * a stray ring for a mouse user is a smaller harm than a keyboard user losing the indicator. */
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

const addFocusRing = (el: SVGSVGElement): void => {
  el.addEventListener("focus", () => {
    if (isFocusVisible(el)) Object.assign(el.style, FOCUS_RING_STYLE);
  });
  el.addEventListener("blur", () => {
    Object.assign(el.style, NO_FOCUS_RING_STYLE);
  });
};

/** The minimal OSD viewer surface this overlay needs — keeps the module decoupled from the full OSD type. */
export interface FrameViewerLike {
  // OSD's own OverlayOptions.element type is HTMLElement-only (@types/openseadragon), even though
  // an SVGElement works fine at runtime — the SVG frame below is cast at its one call site.
  addOverlay(options: { element: HTMLElement; location: unknown }): void;
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
    // Archie-9413: the frame is operable (border click → activate the whole-object note), so expose it
    // as a keyboard-reachable button. Static label — read-mount has no note-name source to thread here,
    // and the note card that opens carries the full text. Enter/Space routes through the SAME
    // onActivate the border click uses. setAttribute-only (no markup ever).
    svg.setAttribute("role", "button");
    svg.setAttribute("aria-label", "View whole object");
    svg.setAttribute("tabindex", "0");
    svg.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault(); // Space must activate, not scroll the host page
      e.stopPropagation();
      frame.onActivate();
    });
    addFocusRing(svg);

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
    viewer.addOverlay({ element: svg as unknown as HTMLElement, location: item.getBounds() });
    frameEl = svg;
  };

  return { draw, clear };
}
