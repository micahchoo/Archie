// @render/core — pure-TS rendering core (ADR-0002 / Q-2).
// The annotation spine (ADR-0003 / Q-3) is the keystone source every projection depends on.
// Surface is filled across Phase 0 tasks P0-2..P0-9; this file re-exports the public API.

export const RENDER_CORE = "@render/core" as const;

// WADM branded ids + structural types — the data-model vocabulary (ADR-0003 / Q-3).
export * from "./wadm/index.js";

// The annotation spine: append-only log (source) + projections (merge / heads / serialize).
export * from "./spine/index.js";

// The Studio editor session (authoring loop over the log + persistence).
export * from "./session/session.js";

// Publish primitive: assemble the full site data tree + the architectural zip (CONTEXT publish).
export * from "./publish/site.js";
export * from "./publish/ghpages.js";
// Portable read seam (ADR-0010): read a published tree out of an opened `.archie.zip`, media → blob URLs.
export * from "./publish/portable.js";
// Working-store read seam (Q-3 archie-persistence): cold-read the Studio's working copy — the Viewer's live source.
export * from "./publish/working.js";
// Merge-preserving regen (Archie-9b93): regenerate owned exhibits, CARRY committed ones — index merge.
export * from "./publish/merge.js";
// The library landing page builder (ADR-0014) — the merge regen rebuilds it over the merged card set.
export { libraryPageHtml } from "./publish/static-pages.js";

// AV transcript adapter (CONTEXT AV): WebVTT/SRT -> supplementing time-range Notes (import-only v1).
export * from "./av/transcript.js";
export * from "./av/time.js";

// Layer + tag filtering over Notes (CONTEXT Layers v1 / Tags). Archie filters; pure shows all.
export * from "./query/filter.js";
export * from "./query/marker-style.js";
// Published-shape (W3CAnnotation) accessors — the canonical home for the viewer's body/reading/overlay reads.
export * from "./query/published.js";
// The source-parameterized published-tree reader (the domino) — site/portable/viewer adapt over it.
export { readExhibitTree, fsJsonSource, type JsonSource, type NoteTransform } from "./publish/read.js";

// Schema migration runner + version stamping (CONTEXT orphan gap; strategy §39).
export * from "./migrate/migrate.js";

// Linkability resolution (CONTEXT linkability v1): structured refs -> published URLs + validation.
export * from "./link/link.js";

// EXIF orientation -> transform mapping (CONTEXT EXIF display-master; orphan gate §39).
export * from "./exif/orientation.js";
export * from "./exif/read.js";

// Authoring domain model (Library / Exhibit / Object) — the IIIF projections derive from it.
export * from "./model/model.js";
export * from "./model/layout.js";

// CLEAN-LIFT pure modules (spike-0001): selector geometry, URL/deep-link, IIIF resolution.
export * from "./geometry/selector.js";
export * from "./geometry/geo.js";
export * from "./geometry/marginalia.js";
export * from "./geometry/panel-resize.js";
export * from "./geometry/mediafragment.js";
export * from "./geometry/coverage.js";
export * from "./geometry/downscale.js";
// DZI (Deep Zoom) descriptor + pyramid math (Phase B tiling; Q-9). Pure geometry/string assembly — the
// author-side slicer worker and the viewer's OSD tile-source both build on this; no pixel encode here.
export * from "./geometry/dzi.js";
export * from "./url/deeplink.js";
export * from "./url/route.js";
export * from "./url/breadcrumb.js";
export * from "./note/media.js";
export * from "./iiif/resolve.js";
// IIIF Image API region/thumb URLs — the free build-time crop path for IIIF-backed objects (ADR-0018 cites).
export * from "./iiif/image.js";

// Body sanitization (CONTEXT §151 XSS): HTML/markdown note bodies → safe HTML/plain text. Framework-agnostic.
export * from "./text/sanitize.js";

// IIIF Presentation 3 projections (Q-1 exhibit-nested): Manifest / Collection / exhibits.json.
export * from "./iiif/presentation.js";
export * from "./iiif/canvasid.js";
export * from "./iiif/manifest.js";
export * from "./iiif/collection.js";
export * from "./iiif/exhibits.js";
export * from "./iiif/rights.js";

// The Filesystem seam (source interface) + its backend projections (Q-5):
// memory (tests/Playground), zip (DownloadFilesystem core), fsa (Chromium folder, browser).
export * from "./fs/seam.js";
export * from "./fs/memory.js";
export * from "./fs/zip.js";
export * from "./fs/fsa.js";
// tauri (TauriFilesystem, desktop folder backend). Pure over a path-based TauriFsBridge; the real
// @tauri-apps/plugin-fs binding lives in apps/studio/src/tauri-fs.ts (headless-core / app-glue split).
export * from "./fs/tauri.js";
// Library-binding model (CONTEXT three-configs persistence, invention #3): pure shapes + recent-projects
// algebra + tolerant localStorage (de)serialize. Browser glue lives in apps/studio (kept headless-testable).
export * from "./fs/binding.js";
