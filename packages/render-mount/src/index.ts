// @render/mount — framework-free vanilla mount layer (ADR-0002 / Q-2).
//
// Wires OpenSeadragon + Annotorious headless into the imperative MountSurface contract; a
// framework adapter (@render/svelte) drives it. The spike-0001 module-1 delamination: anvil's
// $effect/$state selection reactivity is inverted into setSelected + onSelect here.

// The imperative mount-surface contract (declared in ./surface to avoid a circular import).
export type { MountSurface, SelectionId, DrawTool, MarkerStyle, FrameOverlay } from "./surface.js";

// fitBounds region computation + viewport dispatch (the delaminated oracle, P1-1).
export { fitBoundsRect, applyFitBounds, type FitOptions, type ViewportLike } from "./fitbounds.js";

// Real OSD + Annotorious wiring (P1-2).
export { createMount, type MountOptions } from "./mount.js";
