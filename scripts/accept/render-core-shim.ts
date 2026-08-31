// The bare `@render/core` specifier, narrowed — for exactly the reason
// `scripts/perf/render-core-shim.ts:1-10` states: render-core's BARREL re-exports `text/sanitize.js`,
// whose import-time isomorphic-dompurify interop throws at module-evaluation time under a
// `configFile:false` vite server, before any harness code runs.
//
// This is a SUPERSET of the perf shim, because this harness's graph reaches further: `bake.ts` wants
// `exceedsCap`, `archive-probe.ts` (which `publish-tier.ts` imports for the pinned WEB_TIER numbers)
// wants `MAX_MASTER_DIM` / `ZIP_FORMAT_LIMITS` / `dziPyramid` / `fitWithin`. The perf shim is left
// untouched — a shared fixture is never widened to suit one consumer
// (`.claude/rules/test-fixtures.md`).
//
// Every export here is the REAL, shipped module reached by relative path. Nothing is substituted; the
// only thing this file changes is which modules get EVALUATED.
export * from "../../packages/render-core/src/geometry/dzi.ts";
export * from "../../packages/render-core/src/geometry/downscale.ts";
export * from "../../packages/render-core/src/concurrency.ts";
export { ZIP_FORMAT_LIMITS } from "../../packages/render-core/src/fs/zip.ts";
export type { ZipFormatLimits } from "../../packages/render-core/src/fs/zip.ts";
export type { DziTileSource } from "../../packages/render-core/src/iiif/resolve.ts";
export type { AObject, AExhibit, Library, AnnotationLog } from "../../packages/render-core/src/wadm/types.ts";
export type { SelectorScale } from "../../packages/render-core/src/geometry/rescale.ts";
// `TauriFilesystem` (fs/tauri.ts) and `ZipStreamFilesystem` (fs/zip-stream.ts) joined later
// (Archie-e266 rerun): the publish page graph grew a video-transcode leg (video-transcode.ts →
// tauri-fs.ts), and tauri-fs.ts value-imports those two from the barrel. Both source modules are
// pure/headless (fs/tauri.ts talks to an injected bridge, never to @tauri-apps/*), so re-exporting
// them keeps the shim's one rule — real shipped modules, only module-evaluation scope changed.
export { TauriFilesystem } from "../../packages/render-core/src/fs/tauri.ts";
export type { TauriFsBridge, TauriDirEntry, TauriWriteHandle } from "../../packages/render-core/src/fs/tauri.ts";
export { ZipStreamFilesystem } from "../../packages/render-core/src/fs/zip-stream.ts";
