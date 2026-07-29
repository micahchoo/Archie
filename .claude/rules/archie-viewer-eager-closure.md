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
`import … from "./chunk-<osd>.js"` — page-load payload was **257.9KB gz instead of 32.7KB**.

## How to apply

- Anything the entry graph needs **by value** lives in `reader-guards.ts` (`OfflineRemoteBlockedError`,
  `isRemoteSource`, `OpenObjectOptions`). Anything needing a canvas lives in `reader.ts`. `reader.ts`
  re-exports the guards, so its own importers and `reader.test.ts` are unaffected.
- A **type-only** import of `reader.ts` is always safe (erased). A value import is the leak. `import
  type { ReadOnlyMountSurface } from "@render/mount"` in the entry is fine for the same reason.
- `openObject` is exported from `index.ts` as a lazy forwarding wrapper (`await import("./reader.js")`),
  not a static re-export — it was already `async`, so the public API is unchanged. Any future reader
  export the barrel needs takes the same shape.
- The same boundary holds for `av-player.ts` (`element.ts:405`) — don't statically import it either.

## The gate

`node build.mjs --check` ratchets **`eagerGzKB`** — the gz total of the entry's transitive
`import-statement` closure, walked from esbuild's metafile (`measureEagerGz`). Proven red-green: the
leak reintroduced fails at +226.6KB, exit 1.

Do NOT rely on `entryGzKB` or `totalGzKB` — **they cannot catch this**. `entryGzKB` measures the
entry *file* (6.2KB), never its graph; `totalGzKB` counts the OSD chunk either way. Re-measured
2026-07-25 against a freshly injected leak: `eagerGzKB` 36 → 270.5KB, `totalGzKB` **Δ +0KB**. The
metric is a byte total with no predicate, so it catches an eager leak of *any* shape (verified: a
~118KB non-OSD module statically exported from `index.ts` fails it at 36 → 73.5KB gz). The
`/openseadragon/i`-style needle lives only in `recipes/smoke.mjs`, which watches the WIRE where this
watches the metafile.

## The shared `@render/core` barrel puts LAZY-only code in the EAGER chunk

Measured from the metafile (2026-07-25): the barrel (`render-core/src/index.ts`) sits in the eager
chunk because `element.ts` uses `parseRoute`/`thumbnailCandidates`/`licenseLabel`/`metadataRows`;
esbuild places a module needed by both an eager and a lazy chunk into the shared (eager) one — so a
lazy module reaching through the barrel (e.g. `reading-marks.ts` → `readingMarkerStyle`) lands those
bytes on the page-load path.

**Bounded, and the bound is what makes it liveable**: tree-shaking still works — `publish/site.ts`
(52KB) contributes 0 bytes because nothing uses its exports; only what a lazy module actually calls
gets carried (current cost: a few hundred bytes). Don't panic-refactor, but know the shape: if a
lazy module ever reaches through the barrel for something heavy, `eagerGzKB` is what will tell you.
Deep imports are NOT the escape hatch — `render-core/package.json` states the exports map IS the
public API; the fix would be a new subpath export, a deliberate API change. What IS free: keep code
that only runs past the boundary in a module past the boundary (`annotationsFor` moved from
`element.ts` to `reader-chrome.ts` for exactly this reason).

## The baseline moves only via `pnpm bundle:baseline` (Archie-c314)

`node build.mjs` used to rewrite `bundle-size.json` as a side effect of building — and **`pnpm build`
at the repo root reaches this package's build**, so the most ordinary command in the repo relicensed
the baseline whether or not you touched the embed (the build is mandatory in its own right: `dist/`
is a committed, CI-enforced artifact — `pnpm sync-dist:check`, `checks.yml:196`). Proven
red-green-red with the exact leak above: **FAIL** at Δ+231.6KB → one plain build silently rewrote
the baseline → same leak, same command, **ok** at Δ+0 — with the allowance grown from +10.0 to
+27.1KB, since it is `max(10%, 10KB)` of a now-inflated base. `--check` was never the hole (it exits
before the write); the plain build was.

Now the write is gated behind `--update`, surfaced as `pnpm bundle:baseline`; a plain build prints
`baseline unchanged`. That also makes the file's diff informative again — it used to move ±0.1KB
with a fresh `measuredAt` in every PR, training reviewers to skip it (the metric is not bit-exact;
the 10KB floor absorbs the jitter). Treat any diff touching `bundle-size.json` with the scrutiny of
a diff touching a test assertion.

- **The sweep was done; don't redo it.** Every `*:check` in the workspace was enumerated:
  `build.mjs` was the repo's only self-rewriting baseline. The root ratchet's only writer is its own
  `bundle:baseline` script; there are no `prepare`/`postinstall`/`prebuild` hooks (proven
  empirically); `sync-dist:check` writes nothing.
- **Still open** (accidental path shipped first): CI does not catch a HAND-edited baseline —
  `git diff --exit-code packages/archie-viewer/bundle-size.json` after `bundle:check` would close it.

The general form — *a gate's reference point must not be writable by the thing it gates; a gate
whose bypass sits on the happy path is not a gate* — is stated once, with the detection question and
the three fixes, in [[post-review-fixes-are-unreviewed]].
