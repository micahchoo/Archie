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
export type { MarkerStyle, FrameOverlay } from "@render/mount";
