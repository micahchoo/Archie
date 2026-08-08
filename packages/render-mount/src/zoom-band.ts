// Zoom bands (worklist 1.1 — scale-aware marks). The canvas exposes WHERE the reader is on the
// zoom axis as a coarse band, so CSS can weight markers by distance: at fit-width a mark is a few
// pixels and needs presence (far); inside a mark its outline should recede (near). Pure function —
// the thresholds are the tested contract; the mount stamps the band on the container dataset.
//
// The ONE definition moved to @render/core (query/marker-style.ts — beside withZoomBand, which
// always needed the band type): the studio's editor-model derives the band from the live zoom ratio,
// and importing it through this barrel dragged the mount's OSD graph into a headless test
// environment. Re-exported here so every existing `@render/mount` consumer (mount.ts's dataset
// stamp, render-svelte's Canvas, the viewer's styleOf composition) keeps resolving unchanged.

export { zoomBand, type ZoomBand } from "@render/core";
