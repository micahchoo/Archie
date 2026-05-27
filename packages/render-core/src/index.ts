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

// AV transcript adapter (CONTEXT AV): WebVTT/SRT -> supplementing time-range Notes (import-only v1).
export * from "./av/transcript.js";
export * from "./av/time.js";

// Layer + tag filtering over Notes (CONTEXT Layers v1 / Tags). Archie filters; pure shows all.
export * from "./query/filter.js";

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
export * from "./geometry/mediafragment.js";
export * from "./geometry/downscale.js";
export * from "./url/deeplink.js";
export * from "./url/route.js";
export * from "./url/breadcrumb.js";
export * from "./note/media.js";
export * from "./iiif/resolve.js";

// IIIF Presentation 3 projections (Q-1 exhibit-nested): Manifest / Collection / exhibits.json.
export * from "./iiif/presentation.js";
export * from "./iiif/manifest.js";
export * from "./iiif/collection.js";
export * from "./iiif/exhibits.js";

// The Filesystem seam (source interface) + its backend projections (Q-5):
// memory (tests/Playground), zip (DownloadFilesystem core), fsa (Chromium folder, browser).
export * from "./fs/seam.js";
export * from "./fs/memory.js";
export * from "./fs/zip.js";
export * from "./fs/fsa.js";
// Library-binding model (CONTEXT three-configs persistence, invention #3): pure shapes + recent-projects
// algebra + tolerant localStorage (de)serialize. Browser glue lives in apps/studio (kept headless-testable).
export * from "./fs/binding.js";
