// @render/svelte — thin Svelte adapter over @render/mount (ADR-0002 / Q-2).
// Owns reactivity; binds Svelte state to the imperative MountSurface. <500 LOC budget =
// logic-leak detector: anything non-trivial belongs in @render/core or @render/mount.
//
// The Canvas.svelte component is imported directly: `import Canvas from "@render/svelte/Canvas.svelte"`
// (tsc can't resolve .svelte; the app's svelte toolchain handles it). The binding LOGIC lives
// in createCanvasController (plain TS, tested).

export const RENDER_SVELTE = "@render/svelte" as const;

export { createCanvasController, type CanvasController } from "./controller.js";
export { sanitizeHtml, renderMarkdown, stripMarkdown } from "./sanitize.js";
