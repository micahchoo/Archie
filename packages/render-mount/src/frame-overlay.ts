// Coverage-border SVG overlay (7e1f) — extracted out of mount.ts (the lifecycle orchestrator) as a
// standalone rendering concern (standard-#0/#2 separation). It frames the WHOLE OBJECT: the SVG is added
// as an OSD overlay anchored to the image's bounds (viewer.world item getBounds), so OSD positions and
// tracks it on the OBJECT through pan/zoom — NOT a fixed border around the viewport (the earlier bug).
//
// A single SVG, held in a closure var so re-drawing replaces it and clearing removes it. Annotorious is
// per-shape only, so this is a NEW mechanism (not a marker style). The SVG ignores pointer events except
// at the 4 corner hit-targets, leaving the centre free for pan/zoom (donor: stroke-over-stroke halo).
//
// Phase 6: the lifecycle is delegated to the ONE overlay core (overlay-core.ts) — open-queue,
// add/remove, OSD-wrapper neutralisation, the wrapper-capture clear, the focus ring, base styling,
// a11y attributes and the V68 pointer-capture workaround (makeClickable, which the hit rect now
// shares with the region geometry). This module is a CONTENT BUILDER: a FrameOverlay descriptor →
// the three-rect SVG (halo + colour line + transparent hit target) + Enter/Space activation wiring.

import type { FrameOverlay } from "./surface.js";
import { createOverlayLayer, makeClickable, NS, type OverlayViewerLike } from "./overlay-core.js";

// The ONE shared OSD viewer duck type (overlay-core.ts). The old per-module FrameViewerLike is
// gone — every overlay layer speaks the same surface now.

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
export function createFrameOverlay(viewer: OverlayViewerLike): FrameOverlayController {
  const layer = createOverlayLayer<FrameOverlay>(viewer, {
    id: "archie-object-frame",
    // One frame at a time — draw replaces (even across a queued wait for first paint).
    single: true,
    focusable: true,
    a11y: { role: "button", label: "View whole object", tabindex: "0" },
    // Anchor to the OBJECT: OSD positions + sizes the SVG to the image's viewport Rect every render
    // frame, so the border tracks the object through pan/zoom instead of sticking to the viewport
    // edges. (Not shape-driven — the frame has no region geometry — so no `shapeOf`.)
    locationFor: (_frame, v) => v.world.getItemAt(0)!.getBounds(),
    build: (frame) => {
      const svg = document.createElementNS(NS, "svg");
      // Named so OSD's wrapper becomes `overlay-wrapper-archie-object-frame` rather than the bare
      // literal every unnamed overlay shares (openseadragon.js:19051).
      svg.id = "archie-object-frame";
      svg.setAttribute("viewBox", "0 0 100 100");
      svg.setAttribute("preserveAspectRatio", "none"); // stretch the 100×100 box to the object's rect
      // Archie-9413: the frame is operable (border click → activate the whole-object note), so the
      // core exposes it as a keyboard-reachable button (role/label/tabindex via the a11y options).
      // Static label — read-mount has no note-name source to thread here, and the note card that
      // opens carries the full text. Enter/Space routes through the SAME onActivate the border
      // click uses. setAttribute-only (no markup ever).
      svg.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault(); // Space must activate, not scroll the host page
        e.stopPropagation();
        frame.onActivate();
      });

      // A QUIET thin border tracing the object — the whole-object indicator. A soft dark halo under the
      // colour line keeps it legible over any media; non-scaling-stroke holds the line weight constant at any
      // zoom. No heavy corner brackets: the centre stays pan/zoom-free (svg pointer-events:none) and only the
      // thin colour line is clickable (→ select the note), so the affordance is light, not clunky.
      const inset = 0.7;
      const side = 100 - inset * 2;
      const rect = (stroke: string, width: string, opts: { dashed?: boolean; clickable?: boolean } = {}): SVGRectElement => {
        const r = document.createElementNS(NS, "rect");
        r.setAttribute("x", String(inset));
        r.setAttribute("y", String(inset));
        r.setAttribute("width", String(side));
        r.setAttribute("height", String(side));
        r.setAttribute("fill", "none");
        r.setAttribute("stroke", stroke);
        r.setAttribute("stroke-width", width);
        // V41 (Archie-52a0) — DASHED, where a region mark is solid. Before this, a whole-object note
        // and a region note covering most of the image drew two nested rectangles in the same colour
        // at the same weight, and nothing told the reader they meant different things. A dash is a
        // SHAPE cue, so it survives colour-blindness and any author-picked hue (WCAG 1.4.1 / G182,
        // docs/research/a11y-interactions.md:110-133) — and unlike the corner brackets this file's
        // header rejected, it adds no visual weight.
        if (opts.dashed === true) r.setAttribute("stroke-dasharray", "6 4");
        r.setAttribute("vector-effect", "non-scaling-stroke");
        if (opts.clickable === true) {
          r.style.pointerEvents = "stroke";
          r.style.cursor = "pointer";
          // V68's half two, which the region overlay already does (makeClickable, overlay-core.ts)
          // and this file did not: OSD takes POINTER CAPTURE on pointerdown, after which the browser
          // never dispatches `click` here. The listener above is correct and simply never runs
          // without this. makeClickable is the ONE home of the workaround now.
          makeClickable(r, () => frame.onActivate());
        }
        return r;
      };
      svg.append(rect("rgba(0,0,0,0.28)", "3", { dashed: true })); // soft legibility halo
      svg.append(rect(frame.colour, "1.5", { dashed: true })); // the quiet colour border
      // The HIT target: solid and wider than the visible line, drawn last (on top) and invisible.
      // It is separate for two reasons — a dashed stroke's GAPS are not hit-testable, so making the
      // visible line the target would leave the border clickable only 60% of its length; and a 1.5px
      // line is a punishing target for a real pointer regardless. Transparent stroke, so it is a hit
      // surface only, and `pointer-events: stroke` keeps the frame's whole interior free for pan/zoom.
      svg.append(rect("rgba(0,0,0,0)", "10", { clickable: true }));
      return svg;
    },
  });

  return {
    draw(frame: FrameOverlay): void {
      // Replace semantics: the core clears any current frame first (single-slot), and queues the
      // draw until the image opens when it isn't painted yet — a whole-object note can be set
      // before first paint. A queued draw replaces an earlier queued one, exactly as the
      // pre-consolidation code's clear-inside-the-queued-callback did.
      layer.draw(frame);
    },
    clear(): void {
      layer.clear();
    },
  };
}
