# PERF — the reader path (2026-07-24, third sweep)

The first two sweeps were entirely author-side (publish, ingest, the editing spine). This one measures
what a *reader* experiences, on the BUILT viewer in real Chromium: `scripts/perf/readerrun.mjs` serves
`apps/viewer/dist` and drives local fixture routes only. (The `voynich` route loads folios from Yale's
IIIF service — timing it would measure their CDN.)

## What was slow: the exhibit page shipped the canvas engine to show a grid

`ExhibitView.svelte` renders `Reader`, `MediaPlayer`, `SearchOverlay` and `NarrativeReader` behind
`{#if}` blocks — but **imported all four statically**. An `{#if}` gates rendering; only a dynamic
`import()` gates the download. So landing on any exhibit pulled one 1029 KB
(**302 KB gz**) `ExhibitView-*.js` chunk carrying OpenSeadragon + pixi, on a page whose entire visible
content is a grid of object cards.

This is exactly the failure `.claude/rules/archie-viewer-eager-closure.md` documents *and gates* for
the `<archie-viewer>` embed — which does the same job in **32.9 KB gz** eager. The app never got the
same treatment; it had no equivalent rule and no ratchet.

## Measured, built viewer, local routes

| route | JS on arrival — before | after | cards hydrated — before | after |
|---|---|---|---|---|
| `/sampler` | 1149 KB | **148 KB (7.8x)** | 105 ms | **45 ms** |
| `/language-atlas` | 1149 KB | **148 KB (7.8x)** | 101 ms | **37 ms** |
| `/` (gallery index) | 138 KB | 138 KB | n/a | n/a |

Chunk split after: `ExhibitView` 28 KB raw / **10 KB gz** (was 1.1 MB / 302 KB gz); the canvas engine
moved to a lazily-fetched 924 KB / 266 KB gz chunk.

Opening an object then costs **click → canvas 173 ms**, pulling that 1115 KB at the moment it is
actually needed. Nothing regressed: the finder opens and returns results, a video object mounts its
player, the narrative route renders, and there are no pageerrors.

## What shipped

`apps/viewer/src/lib/lazy.svelte.ts` — `lazyComponent`, a memoized dynamic import. The memo matters:
a bare `{#await import(…)}` in markup re-invokes on every re-render, and while the module cache makes
the import itself cheap, the re-render thrash is not. Each of the four call sites in `ExhibitView` is
guarded (`{#if XLazy.current}`) so a not-yet-loaded component renders nothing rather than throwing.

## The test this broke, and why it mattered that it did

`narrative-escape.test.ts` (the ADR-0016 §223 anti-trap contract: every object opened from a narrative
index must have a way back) walks the Svelte AST for `Component` nodes named `MediaPlayer` / `Reader`.
Renaming the tags to `MediaPlayerLazy.current` made both matchers miss — and it failed **loudly**,
which is the good outcome. The matcher now normalizes the `…Lazy.current` holder.

But the near-miss is the point: had the assertion been "no instance is missing `onback`" instead of
"exactly one instance HAS it", a matcher finding **zero** instances would have passed green-by-absence
and silently retired a safety contract. An explicit `expect(instances.length).toBeGreaterThan(0)` now
guards that. Both regressions verified by injection: removing the index-AV `onback` fails, and
blinding the matcher to lazy holders fails.

## Verification

- viewer vitest **136/136** · svelte-check **1466 files, 0 errors 0 warnings** · `astro check` clean
- render-core **1143/1143** · studio **925/925** (untouched, re-run to confirm)
- `pnpm build` clean; interaction probe (finder / video / narrative route) passes with no pageerrors

## Not done

- **No ratchet yet.** The embed has `eagerGzKB` in `build.mjs --check`; the app has nothing equivalent,
  which is precisely how it drifted to 302 KB gz unnoticed. An eager-bytes gate on the viewer's
  exhibit route is the obvious follow-up and would prevent the regression this sweep just fixed.
- Numbers are localhost with no throttling, so they are engine cost, not field latency. The BYTE
  reduction is the durable result; the millisecond figures scale with a real network.
- `/published/*` routes serve the data tree, not pages — excluded from the table rather than reported
  as misses.

---

# Deeper scan — where the reader's bytes actually go (2026-07-24, later)

After the lazy split, profiled every request on arrival rather than just JS. `/sampler`, 20 requests,
**2002 KB total**:

| bytes | what |
|---|---|
| **1648 KB** | the same remote MP4, fetched **TWICE** (968 + 680 KB) |
| 117 KB | two **raw TTF** fonts (`LARAZ-Regular` 59 KB, `FOPVHS` 58 KB) |
| 148 KB | JS (post-split) |
| 64 KB | CSS across 7 requests |
| 25 KB | HTML + manifest.json |

So the JS I had just cut 7.8x was **7% of the page**. Video was 82%.

## 1. `<video preload="metadata">` per gallery card — 5.9x, needs a design call

`MediaThumbnail.svelte:42` renders a live `<video src={object.source} preload="metadata">` for every
AV object in the grid, to use the first frame as a poster. `preload="metadata"` is **not a byte
guarantee**: measured, it pulled 1648 KB for a file advertised as 1 MB.

Flipping that one attribute to `preload="none"`: **2.08 MB → 0.35 MB on arrival, 5.9x.** And it is
per card — a 20-video exhibit pays this twenty times over.

NOT shipped, because it is a visual trade, not a pure win: `preload="none"` loses the first-frame
poster and falls back to the designed plate + ▶ (already the `failed` and audio rendering). The
strictly-better fix is a **baked video poster** at ingest — the pipeline already bakes image
thumbnails, and `AObject.thumbnail` already exists — then `preload="none" poster={thumbnail}` keeps
the visual at ~5 KB instead of ~1.8 MB. That is a small feature, not a tweak. **Needs a decision.**

Also unexplained and worth a look on its own: the file is fetched **twice** on a page with one video
object.

Caveat on the fixture: `apps/viewer/fixtures/sampler.ts:28` points at a remote demo video
(`test-videos.co.uk`), so these bytes crossed the real internet. The per-card behaviour is
fixture-independent; the absolute figure is not.

## 2. Brand fonts ship as raw TTF — ~60 KB, no trade at all

`dist/fonts/` holds `hanken-grotesk` and `spline-sans-mono` correctly as **subset WOFF2**, but the
brand faces are raw **TTF**: `LARAZ-Regular` 59 KB, `FOPVHS` 58 KB, `LARAZ-Light` 26 KB (143 KB
total; 117 KB of it loaded on arrival). WOFF2 typically halves that — ~60 KB off every page, with no
visual change whatsoever.

Not done here: no `fonttools`/`brotli` or `woff2_compress` in the environment, and adding a toolchain
dependency is not a call to make silently. It is the cheapest remaining reader win.

## Is 100x available on the reader? No — and here is the arithmetic

Arrival is now ~330 KB excluding video (148 JS + 117 fonts + 64 CSS). The credible remaining moves:

| move | effect on arrival | status |
|---|---|---|
| video poster instead of live `<video>` | −1648 KB (5.9x on this route) | needs a design call |
| TTF → WOFF2 | −60 KB | needs tooling |
| `createReadOnlyMount` in the viewer canvas | −198 KB gz **on object open**, not arrival | needs the shared-Canvas split (HANDOFF) |

Together with the 7.8x already shipped that is roughly **another 3–6x on arrival bytes**, not 100x.
The floor is real: fonts, CSS and the shell are irreducible without dropping the design, and the
canvas engine is genuinely needed the moment someone opens an object. The one place a 100x-shaped
number was hiding was the video, and it is 5.9x on the route that has one.

---

# Deeper scan — where the reader's bytes actually go (2026-07-24, later)

After the lazy split, profiled every request on arrival rather than just JS. `/sampler`, 20 requests,
**2002 KB total**:

| bytes | what |
|---|---|
| **1648 KB** | the same remote MP4, fetched **TWICE** (968 + 680 KB) |
| 117 KB | two **raw TTF** fonts (`LARAZ-Regular` 59 KB, `FOPVHS` 58 KB) |
| 148 KB | JS (post-split) |
| 64 KB | CSS across 7 requests |
| 25 KB | HTML + manifest.json |

So the JS I had just cut 7.8x was **7% of the page**. Video was 82%.

## 1. `<video preload="metadata">` per gallery card — 5.9x, needs a design call

`MediaThumbnail.svelte:42` renders a live `<video src={object.source} preload="metadata">` for every
AV object in the grid, to use the first frame as a poster. `preload="metadata"` is **not a byte
guarantee**: measured, it pulled 1648 KB for a file advertised as 1 MB.

Flipping that one attribute to `preload="none"`: **2.08 MB → 0.35 MB on arrival, 5.9x.** And it is
per card — a 20-video exhibit pays this twenty times over.

NOT shipped, because it is a visual trade, not a pure win: `preload="none"` loses the first-frame
poster and falls back to the designed plate + ▶ (already the `failed` and audio rendering). The
strictly-better fix is a **baked video poster** at ingest — the pipeline already bakes image
thumbnails, and `AObject.thumbnail` already exists — then `preload="none" poster={thumbnail}` keeps
the visual at ~5 KB instead of ~1.8 MB. That is a small feature, not a tweak. **Needs a decision.**

Also unexplained and worth a look on its own: the file is fetched **twice** on a page with one video
object.

Caveat on the fixture: `apps/viewer/fixtures/sampler.ts:28` points at a remote demo video
(`test-videos.co.uk`), so these bytes crossed the real internet. The per-card behaviour is
fixture-independent; the absolute figure is not.

## 2. Brand fonts ship as raw TTF — ~60 KB, no trade at all

`dist/fonts/` holds `hanken-grotesk` and `spline-sans-mono` correctly as **subset WOFF2**, but the
brand faces are raw **TTF**: `LARAZ-Regular` 59 KB, `FOPVHS` 58 KB, `LARAZ-Light` 26 KB (143 KB
total; 117 KB of it loaded on arrival). WOFF2 typically halves that — ~60 KB off every page, with no
visual change whatsoever.

Not done here: no `fonttools`/`brotli` or `woff2_compress` in the environment, and adding a toolchain
dependency is not a call to make silently. It is the cheapest remaining reader win.

## Is 100x available on the reader? No — and here is the arithmetic

Arrival is now ~330 KB excluding video (148 JS + 117 fonts + 64 CSS). The credible remaining moves:

| move | effect on arrival | status |
|---|---|---|
| video poster instead of live `<video>` | −1648 KB (5.9x on this route) | needs a design call |
| TTF → WOFF2 | −60 KB | needs tooling |
| `createReadOnlyMount` in the viewer canvas | −198 KB gz **on object open**, not arrival | needs the shared-Canvas split (HANDOFF) |

Together with the 7.8x already shipped that is roughly **another 3–6x on arrival bytes**, not 100x.
The floor is real: fonts, CSS and the shell are irreducible without dropping the design, and the
canvas engine is genuinely needed the moment someone opens an object. The one place a 100x-shaped
number was hiding was the video, and it is 5.9x on the route that has one.

---

# Deeper scan — where the reader's bytes actually go (2026-07-24, later)

After the lazy split, profiled every request on arrival rather than just JS. `/sampler`, 20 requests,
**2002 KB total**:

| bytes | what |
|---|---|
| **1648 KB** | the same remote MP4, fetched **TWICE** (968 + 680 KB) |
| 117 KB | two **raw TTF** fonts (`LARAZ-Regular` 59 KB, `FOPVHS` 58 KB) |
| 148 KB | JS (post-split) |
| 64 KB | CSS across 7 requests |
| 25 KB | HTML + manifest.json |

So the JS I had just cut 7.8x was **7% of the page**. Video was 82%.

## 1. `<video preload="metadata">` per gallery card — 5.9x, needs a design call

`MediaThumbnail.svelte:42` renders a live `<video src={object.source} preload="metadata">` for every
AV object in the grid, to use the first frame as a poster. `preload="metadata"` is **not a byte
guarantee**: measured, it pulled 1648 KB for a file advertised as 1 MB.

Flipping that one attribute to `preload="none"`: **2.08 MB → 0.35 MB on arrival, 5.9x.** And it is
per card — a 20-video exhibit pays this twenty times over.

NOT shipped, because it is a visual trade, not a pure win: `preload="none"` loses the first-frame
poster and falls back to the designed plate + ▶ (already the `failed` and audio rendering). The
strictly-better fix is a **baked video poster** at ingest — the pipeline already bakes image
thumbnails, and `AObject.thumbnail` already exists — then `preload="none" poster={thumbnail}` keeps
the visual at ~5 KB instead of ~1.8 MB. That is a small feature, not a tweak. **Needs a decision.**

Also unexplained and worth a look on its own: the file is fetched **twice** on a page with one video
object.

Caveat on the fixture: `apps/viewer/fixtures/sampler.ts:28` points at a remote demo video
(`test-videos.co.uk`), so these bytes crossed the real internet. The per-card behaviour is
fixture-independent; the absolute figure is not.

## 2. Brand fonts ship as raw TTF — ~60 KB, no trade at all

`dist/fonts/` holds `hanken-grotesk` and `spline-sans-mono` correctly as **subset WOFF2**, but the
brand faces are raw **TTF**: `LARAZ-Regular` 59 KB, `FOPVHS` 58 KB, `LARAZ-Light` 26 KB (143 KB
total; 117 KB of it loaded on arrival). WOFF2 typically halves that — ~60 KB off every page, with no
visual change whatsoever.

Not done here: no `fonttools`/`brotli` or `woff2_compress` in the environment, and adding a toolchain
dependency is not a call to make silently. It is the cheapest remaining reader win.

## Is 100x available on the reader? No — and here is the arithmetic

Arrival is now ~330 KB excluding video (148 JS + 117 fonts + 64 CSS). The credible remaining moves:

| move | effect on arrival | status |
|---|---|---|
| video poster instead of live `<video>` | −1648 KB (5.9x on this route) | needs a design call |
| TTF → WOFF2 | −60 KB | needs tooling |
| `createReadOnlyMount` in the viewer canvas | −198 KB gz **on object open**, not arrival | needs the shared-Canvas split (HANDOFF) |

Together with the 7.8x already shipped that is roughly **another 3–6x on arrival bytes**, not 100x.
The floor is real: fonts, CSS and the shell are irreducible without dropping the design, and the
canvas engine is genuinely needed the moment someone opens an object. The one place a 100x-shaped
number was hiding was the video, and it is 5.9x on the route that has one.
