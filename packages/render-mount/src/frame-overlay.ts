// Coverage-border SVG overlay (7e1f) — extracted out of mount.ts (the lifecycle orchestrator) as a
// standalone rendering concern (standard-#0/#2 separation). ZERO coupling to OSD internals: it only
// needs a host element to append the SVG over (mount passes `viewer.element`), `document`, and a
// FrameOverlay descriptor. The SVG output is byte-identical to the former inline drawFrame/clearFrame.
//
// A single canvas-wide SVG appended over the OSD container, held in a closure var so re-drawing
// replaces it and clearing removes it. Annotorious is per-shape only, so this is a NEW mechanism (not
// a marker style). The SVG ignores pointer events except at the 4 corner hit-targets, leaving the
// centre free for pan/zoom (donor legibility: stroke-over-stroke halo).

import type { FrameOverlay } from "./surface.js";

/** A drawable frame layer over `host`: `draw` (re)renders the coverage border, `clear` removes it. */
export interface FrameOverlayController {
  /** Draw (replacing any current frame) the canvas-wide coverage border with 4 corner hit-targets. */
  draw(frame: FrameOverlay): void;
  /** Remove the current frame SVG (no-op if none). */
  clear(): void;
}

/**
 * Create a frame-overlay controller bound to `host` (the OSD `viewer.element`). The drawn SVG is
 * byte-identical to the prior inline renderer — same viewBox/inset, halo+border strokes, corner
 * L-bracket hit-targets, and pointer-events policy (centre untouched, corners clickable).
 */
export function createFrameOverlay(host: HTMLElement): FrameOverlayController {
  let frameEl: SVGSVGElement | null = null;

  const clear = (): void => {
    frameEl?.remove();
    frameEl = null;
  };

  const draw = (frame: FrameOverlay): void => {
    clear();
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("preserveAspectRatio", "none");
    Object.assign(svg.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      pointerEvents: "none",
      zIndex: "20",
    } as Partial<CSSStyleDeclaration>);

    // The border: a dark halo stroke under the colour stroke so it stays legible over any media
    // (stroke-over-stroke, matching the marker drop-shadow note). vector-effect keeps width constant.
    const inset = 1.2;
    const side = 100 - inset * 2;
    const halo = document.createElementNS(NS, "rect");
    const border = document.createElementNS(NS, "rect");
    for (const r of [halo, border]) {
      r.setAttribute("x", String(inset));
      r.setAttribute("y", String(inset));
      r.setAttribute("width", String(side));
      r.setAttribute("height", String(side));
      r.setAttribute("fill", "none");
      r.setAttribute("vector-effect", "non-scaling-stroke");
    }
    halo.setAttribute("stroke", "rgba(0,0,0,0.55)");
    halo.setAttribute("stroke-width", "5");
    border.setAttribute("stroke", frame.colour);
    border.setAttribute("stroke-width", "3");
    svg.append(halo, border);

    // 4 corner hit-targets — clickable L-brackets, centre untouched. pointer-events:auto only here.
    const arm = 14;
    const corners: Array<[number, number, number, number]> = [
      [inset, inset, 1, 1], // TL
      [100 - inset, inset, -1, 1], // TR
      [inset, 100 - inset, 1, -1], // BL
      [100 - inset, 100 - inset, -1, -1], // BR
    ];
    for (const [cx, cy, sx, sy] of corners) {
      const path = document.createElementNS(NS, "path");
      path.setAttribute("d", `M ${cx} ${cy + sy * arm} L ${cx} ${cy} L ${cx + sx * arm} ${cy}`);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", frame.colour);
      path.setAttribute("stroke-width", "6");
      path.setAttribute("vector-effect", "non-scaling-stroke");
      path.setAttribute("stroke-linecap", "round");
      path.style.pointerEvents = "stroke";
      path.style.cursor = "pointer";
      path.addEventListener("click", () => frame.onActivate());
      svg.append(path);
    }
    host.appendChild(svg);
    frameEl = svg;
  };

  return { draw, clear };
}
