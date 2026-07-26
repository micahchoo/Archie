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
exists; don't drop it for being redundant. (Re-measured 2026-07-25 against a freshly injected leak:
`eagerGzKB` 36 → 270.5KB, `totalGzKB` **Δ +0KB**. The blindness is measured, not assumed.)

## The gate only holds against an UNREFRESHED baseline (added 2026-07-25, Archie-c314)

`eagerGzKB` is not unconditional protection, and for one session it protected nothing. `node
build.mjs` used to write `bundle-size.json` as a side effect of building — and that build is
**mandatory**, not optional: `packages/archie-viewer/dist/` is a committed, CDN-published artifact
that CI enforces (`pnpm sync-dist:check`, `checks.yml:196`), so every source change requires it. The
regression and its new baseline were therefore committed together, and CI compared the regressed
build against the regressed baseline. Proven red-green-red with the exact leak above:

| step | result |
| --- | --- |
| A. leak present, committed baseline | **FAIL** eager 38.9 → 270.5KB (Δ +231.6, allowed +10.0), exit 1 |
| B. `node build.mjs` (the required `dist/` refresh) | baseline silently rewritten to 270.5 |
| C. same leak, same command | **ok** eager 270.5 → 270.5KB (Δ +0, allowed +27.1), exit 0 |

Exit 1 became exit 0 with 231.6KB of OpenSeadragon in the page-load path. Worse, the allowance grew
from +10.0 to +27.1KB — it is `max(10%, 10KB)` of a now-inflated base, so **the gate gets looser the
worse the regression**. `--check` was never the hole (it exits before the write and builds to a temp
dir); the plain build was.

**Now:** the write is gated behind `--update`, exposed as `pnpm bundle:baseline`. A plain build
refreshes `dist/` and prints `baseline unchanged`. This matches the root ratchet, which already
refreshed its baseline through a separately named script (`pnpm bundle:baseline`, `checks.yml:161`)
rather than by building.

**How to apply:**
- A build never moves a ratchet. If you add another size gate, the baseline write is opt-in from the
  start, with its own script name so moving it reads as an intentional line in review.
- A diff that touches `bundle-size.json` deserves the same scrutiny as a diff that touches a test
  assertion — both change what "passing" means. Ask what moved and why before reading anything else.
- Still open (follow-up, not shipped): CI does not yet catch a HAND-edited baseline. A
  `git diff --exit-code packages/archie-viewer/bundle-size.json` after `bundle:check` would close it.
  `--update` alone was shipped first because the accidental path is the one that actually fired.
