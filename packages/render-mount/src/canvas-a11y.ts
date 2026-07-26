// Canvas keyboard hygiene (Archie-3d55 — V90, and the naming half of V25).
//
// OpenSeadragon makes its canvas div focusable so arrow keys can pan, and Annotorious adds its own
// SVG layer on top. Measured with `[tabindex="0"]` on the reader, dev toolbar filtered:
//
//   div.openseadragon-canvas                          — no role, NO NAME
//   svg  (coverage frame)                    role=button  "View whole object"   ok
//   svg.a9s-annotationlayer.a9s-osd-drawinglayer      — no role, NO NAME
//   div.resize-divider                    role=separator  "Resize notes"        ok
//
// Two of the four stops announce nothing. They are not the same problem and must not get the same
// fix:
//
//   - The OSD canvas IS a control. Arrows pan it, +/- zoom it; that cede is deliberate and correct
//     for a deep-zoom surface. It needs a NAME, not removal — and the name is also where the mode
//     gets said out loud, which is V25's complaint: with focus on the canvas ArrowRight pans the
//     image instead of stepping objects, and nothing told the reader that had happened.
//   - The Annotorious layer is NOT a control. In the shell it paints to WebGL and holds no
//     focusable shapes at all, so a tab stop on it is a stop that can never do anything. It leaves
//     the tab order.
//
// Both are applied post-hoc against the live DOM because both elements are created by libraries we
// do not author. Every write is idempotent and guarded, so a version bump that renames a class
// degrades to a no-op rather than throwing.

/** The OSD canvas's accessible name. States the keys BECAUSE the canvas silently owns them (V25). */
export const CANVAS_LABEL = "Deep-zoom image — arrow keys pan, plus and minus zoom";

/** Annotorious's own layers. Painted, never operable (WebGL: no per-shape node to focus). */
const DECORATIVE_LAYER_SELECTORS = [
  ".a9s-annotationlayer",
  ".a9s-osd-drawinglayer",
];

/** The minimal viewer surface this needs — `element` is OSD's container div. */
export interface A11yViewerLike {
  element?: HTMLElement | null;
  canvas?: HTMLElement | null;
}

/**
 * Name the OSD canvas and drop Annotorious's decorative layers out of the tab order. Safe to call
 * more than once (a redraw can re-add a layer) and safe to call against a viewer that has neither.
 */
export function applyCanvasA11y(viewer: A11yViewerLike, label: string = CANVAS_LABEL): void {
  const canvas = viewer.canvas ?? viewer.element?.querySelector<HTMLElement>(".openseadragon-canvas") ?? null;
  if (canvas && !canvas.getAttribute("aria-label")) {
    canvas.setAttribute("aria-label", label);
    // `role="application"` would tell a screen reader to pass arrow keys straight through, which is
    // what OSD wants — but it also suppresses browse-mode entirely for everything inside, and the
    // overlays underneath ARE browsable controls. `img` is the honest role: this is a picture the
    // reader can move around, and its operable parts carry their own roles.
    if (!canvas.getAttribute("role")) canvas.setAttribute("role", "img");
  }
  const root = viewer.element ?? null;
  if (!root) return;
  for (const sel of DECORATIVE_LAYER_SELECTORS) {
    for (const el of root.querySelectorAll<HTMLElement>(sel)) {
      // Only ever REMOVE a stop here; never add one. If some future Annotorious does expose focusable
      // shapes, this must not be what silently hides them — hence the explicit tabindex check.
      if (el.getAttribute("tabindex") === "0") el.setAttribute("tabindex", "-1");
      if (!el.getAttribute("aria-hidden")) el.setAttribute("aria-hidden", "true");
    }
  }
}
