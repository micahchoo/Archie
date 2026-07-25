// The bench aliases `@render/core` to this instead of the real barrel.
//
// WHY: packages/render-core/src/index.ts re-exports ./text/sanitize.js, which its own header (:10)
// flags as having import-time DOMPurify effects. Under this bench's bare vite server
// (configFile:false → no dep pre-bundling) that CJS dep fails interop and throws
// "Cannot read properties of undefined (reading 'bind')" at module-evaluation time — before any
// bench code runs, so it can't be caught and the page never reports.
//
// The two modules below are what dzi-slicer.ts and bake.ts actually need, and both are runtime-pure
// (dzi.ts's only import is `import type`; downscale.ts has none). So this narrows the import graph
// WITHOUT substituting any measured code — sliceToDzi and the bake functions are still the real,
// shipped implementations calling the real geometry.
export * from "../../packages/render-core/src/geometry/dzi.ts";
export * from "../../packages/render-core/src/geometry/downscale.ts";
export * from "../../packages/render-core/src/concurrency.ts";
export type { DziTileSource } from "../../packages/render-core/src/iiif/resolve.ts";
