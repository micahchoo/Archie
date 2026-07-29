// The DOM-FREE subset of @render/core — the entry point a Web Worker should import.
//
// WHY THIS EXISTS. The main barrel (`src/index.ts:114`) does `export * from "./text/sanitize.js"`, and
// that module's import of `isomorphic-dompurify` explodes at MODULE INITIALISATION where there is no
// `window`. The failing line is in the dependency, not in our code:
//
//     // isomorphic-dompurify/dist/browser.mjs:4
//     import DOMPurify from "dompurify";
//     var sanitize = DOMPurify.sanitize.bind(DOMPurify);   // TypeError: purify.sanitize is undefined
//
// DOMPurify needs a real DOM to construct, so in a worker its default export has no `.sanitize` and the
// `.bind` throws. Nothing downstream can guard it: the throw happens while the dependency's own module
// body runs, which is before any of our code — including any `typeof document` check we might add to
// `sanitize.ts` — gets a chance to execute. **The only fix is not to import it.**
//
// SCOPE, MEASURED 2026-07-27 RATHER THAN ASSUMED — this is a DEV-SERVER failure, not a shipped one:
//
//   dev (Vite, unbundled ESM)  the `export *` is really evaluated, sanitize.ts loads, the worker dies
//                              on import. Reported from the app: ingest blocked, `browser.mjs:4:16`.
//   built (`pnpm build`)       CLEAN. `scripts/perf/worker-smoke.mjs` boots both shipped workers in a
//                              real browser: 2/2 PASS. The chunks are 1.6 KB / 2.2 KB and contain
//                              ZERO occurrences of dompurify / sanitize / addHook / snarkdown.
//
// So Rollup does tree-shake the re-export away, even though `package.json` declares
// `sideEffects: ["./src/text/sanitize.ts"]`. Do not read that as "the problem is only cosmetic": the
// production build is currently correct BY ACCIDENT OF TREE-SHAKING, and it is one `export *` or one
// bundler-config change away from shipping the same crash — where it would be far worse, because both
// worker call sites fall back SILENTLY (`sliceToDziAuto` catches, `bake-async` catches and counts), so
// a dead worker quietly reverts publish tiling from ~0.46 s to ~17 s per large image while the app
// looks entirely healthy. Importing this file instead makes the guarantee structural rather than
// incidental.
//
// WHAT MAY LIVE HERE: modules with no DOM dependency anywhere in their transitive graph. All three
// below are import-free today (`dzi.ts` has a single `import type`, which is erased). Before adding a
// module, check its transitive imports, not just its own body.
//
// WHAT MAY NOT: anything reaching `text/sanitize.ts`, `publish/`, or any module touching `document`,
// `window`, `Image`, or `URL.createObjectURL`.
//
// The gate is `worker-safe.test.ts` (a static walk of this file's transitive imports, which fails on a
// DOM-touching module) plus `scripts/perf/worker-smoke.mjs`. Keep both: the walk catches a bad import
// at commit time and covers the dev path the smoke cannot see, the smoke catches whatever the walk's
// model gets wrong.

export * from "./geometry/downscale.js";
export * from "./geometry/dzi.js";
export * from "./concurrency.js";
