// @render/svelte — thin Svelte adapter over @render/mount (ADR-0002 / Q-2).
// Owns reactivity; binds Svelte state to the imperative MountSurface. <500 LOC budget =
// logic-leak detector: anything non-trivial belongs in @render/core or @render/mount.
//
// The Canvas.svelte component is imported directly: `import Canvas from "@render/svelte/Canvas.svelte"`
// (tsc can't resolve .svelte; the app's svelte toolchain handles it). The binding + far-band dot
// LOGIC lives in createCanvasController + createDotLayer (plain TS, tested).
//
// The re-exports below are DEPENDENCY HYGIENE, not bundle deferral: the viewer depends on
// @render/core + @render/svelte but NOT @render/mount directly (pinned by apps/viewer/fixtures/
// fixture-reach.test.ts — a direct dep would need an optimizeDeps.include entry), so it reaches
// mount's named pieces through this barrel. Keep only what consumers actually import — a re-export
// with no live importer is fiction (the @render/core text fns used to ride here; every app imports
// them straight from @render/core, so they were pruned 2026-08-07).

export { createCanvasController, createDotLayer, type CanvasController, type DotLayer, type DotLayerSolved } from "./controller.js";
// Re-export the marker-style type so adapter consumers (the viewer) needn't depend on @render/mount directly.
// `FitOptions` used to ride along because the apps supplied Archie-40fe/V48's chrome reservation through
// Canvas's `getFitOptions`. Both retired with the dock contract (ADR-0019's layout row) — nothing
// overlays the canvas, so no app has a reservation to hand down.
export type { MarkerStyle, FrameOverlay } from "@render/mount";
// Scale cue (Archie-93fd) — same re-export boundary as above: the viewer formats Canvas's `onzoom`
// ratio with the SAME function studio imports straight from @render/mount, without adding that
// package as a direct viewer dependency.
export { formatZoomRatio } from "@render/mount";
// Zoom band (Archie-a6fb / Archie-c1d9): same re-export boundary — the viewer weights its marks by
// scale (withZoomBand, from @render/core) using the SAME ratio→band thresholds studio imports straight
// from @render/mount, without adding that package as a direct viewer dependency.
export { zoomBand, type ZoomBand } from "@render/mount";
