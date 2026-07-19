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

// Read-only OSD mount (ADR-0019 keystone): OSD kept, NO Annotorious/PixiJS, DOM-SVG overlay, no
// unsafe-eval. Additive — the editor `createMount` seam above is untouched (Phase 0 boundary).
export { createReadOnlyMount, wireReadOnlySurface, type ReadOnlyMountSurface, type ReadOnlyMountOptions } from "./read-mount.js";
export { createReadOnlyOverlay, overlayShapeFor, type OverlayShape, type ReadOnlyOverlayController, type OverlayViewerLike } from "./read-overlay.js";

// Viewer-side image-decode dimension cap (EMBED 5.5): rejects an oversized NON-TILED bitmap before
// OSD decodes it. The mount wires it via guardOpenedImageSource (read-mount.ts) at the open seam.
export { guardImageDimensions, MAX_DECODE_DIM, type DeclaredImageSource, type ImageGuardResult } from "./image-cap.js";

// Custom XYZ/slippy-map OSD tile source (geo-annotation extension; DESIGN.md T1).
export { xyzTileSource, type OsdXyzConfig } from "./xyz.js";

// Scale cue (Archie-93fd): the "3.2×" zoom-magnitude formatter, paired with MountSurface.getZoomRatio
// (surface.ts) — the ONE place both apps' canvas chrome derive the SAME text for the SAME ratio.
export { formatZoomRatio } from "./zoom-cue.js";

// Zoom band (worklist 1.1): the ratio→coarse-band thresholds. The mount stamps the band on the
// container dataset AND a host can call this to weight marks by band through the style channel
// (Archie-a6fb — the CSS that read the dataset was inert against the WebGL mark layer).
export { zoomBand, type ZoomBand } from "./zoom-band.js";
