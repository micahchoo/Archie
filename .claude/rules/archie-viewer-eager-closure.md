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

## The shared `@render/core` barrel puts LAZY-only code in the EAGER chunk (added 2026-07-25)

`readingMarkerStyle` is used by exactly one module, the lazy `reading-marks.ts` — and its bytes sit in
the eager chunk anyway. The mechanism, measured from the metafile rather than guessed:

- `render-core/src/index.ts` (the barrel) is the ONLY importer of `query/marker-style.ts`.
- The barrel is in the eager chunk, because `element.ts` uses `parseRoute` / `thumbnailCandidates` /
  `licenseLabel` / `metadataRows` from it.
- esbuild puts a module needed by both an eager and a lazy chunk into the SHARED (eager) one. So the
  lazy side's use of `readingMarkerStyle` *through the shared barrel* lands it on the page-load path.

**Bounded, not unbounded — and the bound is what makes it liveable.** Tree-shaking still works: of the
render-core modules reachable only through the barrel, `publish/site.ts` is 52 KB and contributes
**0 bytes** because nothing uses its exports. Only what a LAZY module actually calls gets carried.
Current cost: `marker-style.ts` 327 B, `query/published.ts` 668 B (most of which is legitimately eager
anyway — `note-card.ts` is a static import of `element.ts` and needs `commentOfAnnotation`).

So: don't panic-refactor for a few hundred bytes, but know the shape. If a lazy module ever reaches
through the barrel for something genuinely heavy, that weight lands eagerly and `eagerGzKB` is what
will tell you. Deep imports are NOT the escape hatch — `render-core/package.json` states "the exports
map IS the public API — deep imports are unsupported"; the fix would be a new subpath export, which is
a deliberate API change. What IS free: keep code that only runs past the boundary in a module past the
boundary (`annotationsFor` moved from `element.ts` to `reader-chrome.ts` for exactly this reason).

## The gate only holds against an UNREFRESHED baseline (added 2026-07-25, Archie-c314)

`eagerGzKB` is not unconditional protection, and for one session it protected nothing. `node
build.mjs` used to write `bundle-size.json` as a side effect of building.

**The trigger was `pnpm build` at the REPO ROOT** — that is `pnpm -r build`, which reaches this
package's `build` script. So the most ordinary command in the repo relicensed the baseline, whether or
not the developer had touched the embed. The build is also *mandatory* on its own account:
`packages/archie-viewer/dist/` is a committed, CDN-published artifact that CI enforces (`pnpm
sync-dist:check`, `checks.yml:196`). The regression and its new baseline were therefore committed
together, and CI compared the regressed build against the regressed baseline. Proven red-green-red
with the exact leak above:

| step | result |
| --- | --- |
| A. leak present, committed baseline | **FAIL** eager 38.9 → 270.5KB (Δ +231.6, allowed +10.0), exit 1 |
| B. `node build.mjs` (the required `dist/` refresh) | baseline silently rewritten to 270.5 |
| C. same leak, same command | **ok** eager 270.5 → 270.5KB (Δ +0, allowed +27.1), exit 0 |

Exit 1 became exit 0 with 231.6KB of OpenSeadragon in the page-load path. Worse, the allowance grew
from +10.0 to +27.1KB — it is `max(10%, 10KB)` of a now-inflated base, so **the gate gets looser the
worse the regression**. `--check` was never the hole (it exits before the write and builds to a temp
dir); the plain build was.

**A second, independent harm: the file moved in nearly every PR.** A no-op build at `main`, clean
tree, no source change at all, still produced `36 → 36.1`, `266.3 → 266.4` and a fresh `measuredAt`.
So `bundle-size.json` became routine diff noise — and a reviewer who sees a file move every time stops
reading it, which camouflages the one diff that would signal a real regression. Gating the write fixes
the integrity hole and makes the diff informative again; those are separate wins. (Note the ±0.1
jitter while you are here: two measurements of the same tree came back 36 and 36.1. The metric is not
bit-exact, which is fine — the allowance floor is 10 KB.)

**Now:** the write is gated behind `--update`, exposed as `pnpm bundle:baseline`. A plain build
refreshes `dist/` and prints `baseline unchanged`. This matches the root ratchet, which already
refreshed its baseline through a separately named script (`pnpm bundle:baseline`, `checks.yml:161`)
rather than by building.

**The sweep was done; don't redo it.** Every `*:check` in the workspace was enumerated. The root
ratchet is clean — `node scripts/bundle-size.mjs` with no flag is invoked by exactly one thing, its
own `bundle:baseline` script; no CI step, no build script, and the root `package.json` has no
`prepare`/`postinstall`/`prebuild` hooks (proven empirically: a no-op root build dirties the embed's
baseline and leaves `docs/bundle-size.json` untouched). `sync-dist:check` has no baseline to rewrite —
it is a byte-for-byte directory comparison that writes nothing, and a plain build making the two sides
differ is the check working, not failing. **`build.mjs` was the only instance in the repo.**

**How to apply:**
- This is one instance of a pattern with a second, unrelated-looking sibling in this repo (the
  completeness check's `CONTRACTED_LABELS`); the general form — *a gate's reference point must not be
  writable by the thing it gates* — is stated once in
  `[[post-review-fixes-are-unreviewed]]`, with the detection question and the three fixes.
- A build never moves a ratchet. If you add another size gate, the baseline write is opt-in from the
  start, with its own script name so moving it reads as an intentional line in review.
- A diff that touches `bundle-size.json` deserves the same scrutiny as a diff that touches a test
  assertion — both change what "passing" means. Ask what moved and why before reading anything else.
- The general form, worth carrying past this file: **a gate whose bypass sits on the happy path is not
  a gate.** The `dist/` mirror made this one worse precisely BECAUSE the rebuild is mandatory. Note
  also what the metric is and is not: `eagerGzKB` is a byte total over the entry's static closure with
  **no predicate**, so it catches an eager leak of any shape (verified: a ~118 KB non-OSD module
  statically exported from `index.ts` fails it at 36 → 73.5 KB gz). It was never needle-shaped; it was
  simply switched off by the self-rewriting baseline. The `/openseadragon/i`-style needle lives only in
  `recipes/smoke.mjs`, which watches the WIRE where this watches the metafile.
- Still open (follow-up, not shipped): CI does not yet catch a HAND-edited baseline. A
  `git diff --exit-code packages/archie-viewer/bundle-size.json` after `bundle:check` would close it.
  `--update` alone was shipped first because the accidental path is the one that actually fired.
