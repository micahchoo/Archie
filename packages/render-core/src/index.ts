// @render/core — pure-TS rendering core (ADR-0002 / Q-2).
// The annotation spine (ADR-0003 / Q-3) is the keystone source every projection depends on.
// Surface is filled across Phase 0 tasks P0-2..P0-9; this file re-exports the public API.
//
// EXPORTS MAP IS THE CONTRACT (ticket C2): the package.json `exports` map (`.` here, `./spine`
// -> spine/index.ts) is the whole public API. Anything not reachable through it — deep imports
// like `@render/core/src/fs/names.js` — is internal, unsupported, and free to move or vanish
// without notice. Need something a barrel doesn't export? Add it to a barrel (or a new subpath
// export), don't deep-import. `sideEffects` in package.json lists the ONLY module with
// import-time effects (text/sanitize.ts's DOMPurify hook); keep it honest when adding modules.

export const RENDER_CORE = "@render/core" as const;

// WADM branded ids + structural types — the data-model vocabulary (ADR-0003 / Q-3).
export * from "./wadm/index.js";

// Object identity — the ONE place object-id shapes are minted / composed / detected (Archie-9ea8).
export * from "./object-id.js";

// The annotation spine: append-only log (source) + projections (merge / heads / serialize).
export * from "./spine/index.js";

// The Studio editor session (authoring loop over the log + persistence).
export * from "./session/session.js";

// Publish primitive: assemble the full site data tree + the architectural zip (CONTEXT publish).
export * from "./publish/site.js";
export * from "./publish/ghpages.js";
// Portable read seam (ADR-0010): read a published tree out of an opened `.archie.zip`, media → blob URLs.
export * from "./publish/portable.js";
// ADR-0020: L1 `.archie.zip` self-ID marker — write (publishLibrary stamps archie.json) + read (validateArchieMarker).
export * from "./publish/marker.js";
// The untrusted-archive open seam (ISSUES.md Issue 5): the ONE place ZipFilesystem.fromZip +
// validateArchieMarker compose — every app funnels an untrusted .archie.zip through here.
export * from "./publish/open.js";
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
export { readExhibitTree, fsJsonSource, FailedReadError, assertArchieTreeMarker, type JsonSource, type NoteTransform } from "./publish/read.js";

// Schema migration runner + version stamping (CONTEXT orphan gap; strategy §39).
export * from "./migrate/migrate.js";

// Object-id migration engine (Archie-8c10): the five-class in-place legacy→composed id rewrite, behind
// the snapshot-then-marker safety protocol. The ENGINE only — trigger wiring is Archie-8439.
export * from "./migrate/object-ids.js";

// Linkability resolution (CONTEXT linkability v1): structured refs -> published URLs + validation.
export * from "./link/link.js";

// EXIF orientation -> transform mapping (CONTEXT EXIF display-master; orphan gate §39).
export * from "./exif/orientation.js";
export * from "./exif/read.js";

// Authoring domain model (Library / Exhibit / Object) — the IIIF projections derive from it.
export * from "./model/model.js";
export * from "./model/layout.js";
// DCMI Metadata Terms vocabulary data (Dublin Core pipeline, Archie-c6bf): the 55 dcterms
// properties + import aliases + native-field exclusions + per-level default field sets.
export * from "./model/dcterms.js";

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
// Shared title-search primitive (case/diacritic-insensitive substring) — Gallery wall + overview toolbar.
export * from "./text/match.js";

// IIIF Presentation 3 projections (Q-1 exhibit-nested): Manifest / Collection / exhibits.json.
export * from "./iiif/presentation.js";
export * from "./iiif/canvasid.js";
export * from "./iiif/manifest.js";
export * from "./iiif/collection.js";
export * from "./iiif/exhibits.js";
// Library-level image index baked at publish (ADR-0023) — the Viewer Gallery wall's one-fetch source.
export * from "./iiif/image-index.js";
export * from "./iiif/rights.js";
// Descriptive-metadata projector (Archie-c6bf): MetadataEntry[] ↔ IIIF metadata[] + archieMetadata.
export * from "./iiif/metadata.js";

// The Filesystem seam (source interface) + its backend projections (Q-5):
// memory (tests/Playground), zip (DownloadFilesystem core), fsa (Chromium folder, browser).
export * from "./fs/seam.js";
export * from "./fs/memory.js";
export * from "./fs/zip.js";
// zip-stream (ZipStreamFilesystem — WRITE-THROUGH streaming .archie.zip sink; SCALE bounded-memory
// export). Publish INTO it, then finish(); media bytes stream to disk and release, never a tree Map.
export * from "./fs/zip-stream.js";
export * from "./fs/fsa.js";
// tauri (TauriFilesystem, desktop folder backend). Pure over a path-based TauriFsBridge; the real
// @tauri-apps/plugin-fs binding lives in apps/studio/src/tauri-fs.ts (headless-core / app-glue split).
export * from "./fs/tauri.js";
// http (HttpFilesystem, READ-ONLY published-tree-over-HTTP backend — the fourth backend). Absent
// vs failed per data-integrity contract #2; capped by SRC_MAX_BYTES; name-contained URL joins.
export * from "./fs/http.js";
// Library-binding model (CONTEXT three-configs persistence, invention #3): pure shapes + recent-projects
// algebra + tolerant localStorage (de)serialize. Browser glue lives in apps/studio (kept headless-testable).
export * from "./fs/binding.js";
