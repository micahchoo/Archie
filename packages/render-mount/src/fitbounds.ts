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
