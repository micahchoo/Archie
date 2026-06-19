// fitBounds region computation (spike-0001 module 1 — the de-duplicated polygon→bbox + the
// sidebar-expansion math, delaminated from anvil EmbeddedReader.svelte:314-337 into pure TS).
//
// Returns the IMAGE-space rectangle to fit. @render/mount feeds it to OSD's
// viewport.imageToViewportRectangle + viewport.fitBounds (P1-2). Kept pure so it is the
// behavioral ORACLE both anvil-stock and the new mount path are held to (the Phase-1 gate).

import { selectorBBox, selectorOf, type Box, type W3CSelector, type AnnotationLike } from "@render/core";

// `selectorOf` + `AnnotationLike` now live in @render/core (the canonical pure selector-extraction
// home both the viewer and @render/mount share) — re-exported here so existing importers of
// "./fitbounds" (gate.test.ts: `type AnnotationLike`) keep resolving from the same module.
export { selectorOf, type AnnotationLike };

export interface FitOptions {
  /** OSD container width in px (0 = unknown → plain fit). */
  containerW: number;
  /** Sidebar width in px (0 = no sidebar). */
  sidebarW: number;
  /** True when the sidebar is an overlay sheet (not a side panel) → plain fit. */
  sidebarIsSheet: boolean;
  /** True when the detail panel is open. */
  detailOpen: boolean;
}

const MAX_SIDEBAR_FRACTION = 0.85; // anvil's Math.min guard (EmbeddedReader.svelte:332)

/**
 * Compute the image-space rect to fit for a selected annotation. When a non-sheet sidebar is
 * open over the right, widen the rect rightward by `w/(1-f)` so the annotation centers in the
 * visible (non-sidebar) region; otherwise fit the annotation's own bounds. Null if the
 * selector has no parseable region.
 */
export function fitBoundsRect(selector: W3CSelector, opts: FitOptions): Box | null {
  const box = selectorBBox(selector);
  if (box === null) return null;
  const sidebarActive = opts.detailOpen && !opts.sidebarIsSheet && opts.sidebarW > 0 && opts.containerW > 0;
  if (!sidebarActive) return box;
  const f = Math.min(MAX_SIDEBAR_FRACTION, opts.sidebarW / opts.containerW);
  return { x: box.x, y: box.y, w: box.w / (1 - f), h: box.h };
}

/**
 * Region-aware fit for a BOUNDED map (ADR-0015). On a bounded slippy basemap, OSD's plain
 * `fitBounds` centers the note — but the `animation-finish` region clamp (createMount) then pans the
 * viewport back inside `region`, yanking the note AWAY from centre on a SECOND move (the "camera
 * shifts off the note" bug). This folds the clamp INTO the fit: it returns the rect to fit so the
 * note lands as-centred-as-the-region-allows in one motion, and the follow-up PAN clamp finds nothing
 * to correct — for any note that fits inside the region. (A note larger than the WHOLE extent can't be
 * centred there and its fit zoom falls below the region floor, so the clamp's zoom branch still nudges
 * it to fit the region — a benign zoom-to-fit, not the off-centre pan yank this fixes.)
 *
 * All boxes are in OSD VIEWPORT coordinates (isotropic: 1 unit x == 1 unit y on screen). `note` is the
 * note's bbox; `viewportAspect` = container width/height (px); `region` is the bounded extent. We first
 * grow `note` to the viewport aspect — the bounds OSD's fitBounds actually settles to — then clamp THAT
 * box's centre inside `region` (the same centre math as the live clamp in mount.ts, so they agree).
 */
export function clampedFitRect(note: Box, viewportAspect: number, region: Box): Box {
  // The viewport bounds OSD settles to when fitting `note`: grow to the container's aspect, centred.
  // note.w/note.h < aspect ⇒ the note is "taller" than the frame, so height is the binding dimension.
  let w: number;
  let h: number;
  if (note.w / note.h < viewportAspect) {
    h = note.h;
    w = note.h * viewportAspect;
  } else {
    w = note.w;
    h = note.w / viewportAspect;
  }
  let cx = note.x + note.w / 2;
  let cy = note.y + note.h / 2;
  // Keep the settled box inside the region when it fits (mirrors clampToRegion in mount.ts). A box
  // wider/taller than the region can't be clamped on that axis — leave the note centred there.
  if (w <= region.w) cx = Math.min(region.x + region.w - w / 2, Math.max(region.x + w / 2, cx));
  if (h <= region.h) cy = Math.min(region.y + region.h - h / 2, Math.max(region.y + h / 2, cy));
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/** The minimal OSD viewport surface fitBounds dispatch needs (mockable; real one is osd.viewport). */
export interface ViewportLike {
  imageToViewportRectangle(x: number, y: number, w: number, h: number): unknown;
  fitBounds(rect: unknown, immediately?: boolean): void;
}

/**
 * Dispatch a fit to an OSD-like viewport: compute the image-space rect (handling polygon→bbox,
 * which OSD's rect-only goToTarget can't), convert to viewport coords, and fitBounds. This is
 * the de-duplicated nav behavior that handles rect AND polygon uniformly (the spike's concern).
 * Returns false (no-op) when the selector has no parseable region. Pure dispatch — testable
 * with a mock viewport, so it is the Phase-1 acceptance ORACLE without needing a real OSD.
 */
export function applyFitBounds(viewport: ViewportLike, selector: W3CSelector, opts: FitOptions): boolean {
  const box = fitBoundsRect(selector, opts);
  if (box === null) return false;
  viewport.fitBounds(viewport.imageToViewportRectangle(box.x, box.y, box.w, box.h), false);
  return true;
}

/**
 * The NEW-PATH fitBounds dispatch (what @render/mount's MountSurface.fitBounds runs): find the
 * annotation by id, extract its selector, and fit the viewport to the oracle's rect. Pure +
 * mockable — this is the Phase-1 GATE: it must produce the same rect as `fitBoundsRect`
 * (the anvil-stock characterization). createMount wires real OSD viewport + getAnnotations() in.
 */
export function dispatchFitBounds(viewport: ViewportLike, annotations: readonly AnnotationLike[], id: string, opts: FitOptions): boolean {
  const ann = annotations.find((a) => a.id === id);
  const sel = selectorOf(ann);
  if (sel === null) return false;
  return applyFitBounds(viewport, sel, opts);
}
