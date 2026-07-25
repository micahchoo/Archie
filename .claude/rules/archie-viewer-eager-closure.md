---
scope: packages/archie-viewer/**
tags: [bundle, performance, lazy-loading, embed]
priority: high
source: hand-written
---

# The embed entry's STATIC graph must never reach reader.ts

`src/index.ts` is the bundle entry (importing it registers `<archie-viewer>`). Anything it reaches
through a **static** edge is downloaded and parsed by every host on page load. `reader.ts` is the only
importer of `@render/mount` (OpenSeadragon + pixi, ~231KB gz), and `element.ts:357` defers it with
`await import("./reader.js")`.

**This broke once, silently, and shipped** (found 2026-07-24). Two static references defeated the whole
split: `index.ts` re-exported `openObject`/`isRemoteSource`/`OfflineRemoteBlockedError` **from
`./reader.js`**, and `element.ts` imported `OfflineRemoteBlockedError` as a *value* for its `instanceof`
check. Either one alone is enough. The shipped `dist/archie-viewer.js` opened with a top-level
`import … from "./chunk-<osd>.js"`, so the gallery path paid the full canvas engine before opening
anything — page-load payload was **257.9KB gz instead of 32.7KB**.

## How to apply

- Anything the entry graph needs **by value** lives in `reader-guards.ts` (`OfflineRemoteBlockedError`,
  `isRemoteSource`, `OpenObjectOptions`). Anything needing a canvas lives in `reader.ts`. `reader.ts`
  re-exports the guards, so its own importers and `reader.test.ts` are unaffected.
- A **type-only** import of `reader.ts` is always safe (erased). A value import is the leak. `import
  type { ReadOnlyMountSurface } from "@render/mount"` in the entry is fine for the same reason.
- `openObject` is exported from `index.ts` as a lazy forwarding wrapper (`await import("./reader.js")`),
  not a static re-export. It was already `async`, so the public API is unchanged for CDN consumers.
  Any future reader export the barrel needs takes the same shape.
- The same boundary holds for `av-player.ts` (`element.ts:405`) — don't statically import it either.

## The gate

`node build.mjs --check` ratchets **`eagerGzKB`** — the gz total of the entry's transitive
`import-statement` closure, walked from esbuild's metafile (`measureEagerGz`). Proven red-green: the
leak reintroduced makes it FAIL at +226.6KB and exit 1.

Do NOT rely on `entryGzKB` or `totalGzKB` to catch this — **they cannot**. `entryGzKB` measures the
entry *file* (6.2KB) and never sees its graph; `totalGzKB` counts the OSD chunk either way, eagerly or
lazily. Both moved less than 0.2KB when 225KB left the load path. That blindness is why `eagerGzKB`
exists; don't drop it for being redundant.
