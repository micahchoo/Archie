// @render/svelte — thin Svelte adapter over @render/mount (ADR-0002 / Q-2).
// Owns reactivity; binds Svelte state to the imperative MountSurface. <500 LOC budget =
// logic-leak detector: anything non-trivial belongs in @render/core or @render/mount.
//
// The Canvas.svelte component is imported directly: `import Canvas from "@render/svelte/Canvas.svelte"`
// (tsc can't resolve .svelte; the app's svelte toolchain handles it). The binding LOGIC lives
// in createCanvasController (plain TS, tested).

export { createCanvasController, type CanvasController } from "./controller.js";
// Re-exported from @render/core (canonical home; impl + deps live there). Kept here for adapter-consumer back-compat.
export { sanitizeHtml, renderMarkdown, stripMarkdown } from "@render/core";
// Re-export the marker-style type so adapter consumers (the viewer) needn't depend on @render/mount directly.
// FitOptions rides along because the APPS now supply it: Reader/NarrativeReader measure the chrome
// occluding the canvas's left flank and hand it to Canvas's `getFitOptions` (Archie-40fe / V48).
export type { MarkerStyle, FrameOverlay, FitOptions } from "@render/mount";
// Scale cue (Archie-93fd) — same re-export boundary as above: the viewer formats Canvas's `onzoom`
// ratio with the SAME function studio imports straight from @render/mount, without adding that
// package as a direct viewer dependency.
export { formatZoomRatio } from "@render/mount";
// Zoom band (Archie-a6fb / Archie-c1d9): same re-export boundary — the viewer weights its marks by
// scale (withZoomBand, from @render/core) using the SAME ratio→band thresholds studio imports straight
// from @render/mount, without adding that package as a direct viewer dependency.
export { zoomBand, type ZoomBand } from "@render/mount";
