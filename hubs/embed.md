---
scope:
  - "packages/archie-viewer/**"
  - "recipes/**"
updated: 2026-07-28
---
# embed
> *how does `<archie-viewer>` work and stay small?*

`@render/archie-viewer` builds one self-contained ESM bundle (`build.mjs`, esbuild) that
registers `<archie-viewer>` as a Web Component (ADR-0019): shadow-DOM gallery → object grid →
lazy deep-zoom reader (OSD, no Annotorious/pixi/`unsafe-eval`). Entry is `src/index.ts`; the
only thing that matters is what it reaches BY VALUE — the OSD-heavy `reader.ts` must stay
behind `element.ts`'s `await import("./reader.js")`. The one gate: `node build.mjs --check`
measures `eagerGzKB` (the entry's static-import closure, gz) against `bundle-size.json`; the
baseline moves only via `pnpm bundle:baseline`, never a plain build. `recipes/smoke.mjs` drives
the BUILT bundle in real headless Chromium — the only gate that can see hit-testing, fetch
receiver-brand-checks, or hydration timing, all classes vitest is structurally blind to.

## Binding rules
- [[archie-viewer-eager-closure]] — a value import of `reader.ts` from the entry graph ships
  OSD eagerly (32.7KB→257.9KB gz was the regression); only `eagerGzKB` sees it, `entryGzKB`/
  `totalGzKB` moved <0.2KB on the same leak
- [[vitest-css-id-empty-string]] — tokens must load via the `virtual:archie-tokens` id, not a
  bare `.css` import — vitest silently returns `""` while the real esbuild build is correct
- [[bound-fetch-defaults]] — a defaulted/stored `fetch` (`load.ts`) must be
  `globalThis.fetch.bind(globalThis)` — Node's fetch has no receiver brand check, so vitest
  can't see the browser's "Illegal invocation"
- [[osd-overlay-wrapper]] — `addOverlay` wraps your element in a div that eats clicks; the embed
  (`read-mount`) is the renderer where the bare-DIV hit-test signature can appear at all (the
  viewer's GL renderer structurally can't)
- [[drive-must-not-recreate-the-thing-under-test]] — smoke.mjs's `open(slug)` helper does a full
  reload; an assertion about state across a transition must drive the reader's OWN navigation
- [[post-review-fixes-are-unreviewed]] — `CONTRACTED_LABELS` silently shrank 40→35 in a
  post-review edit; completeness is enforced by `auditOwnSource()`, never by trusting the array
- [[viewer-e2e-shared-port]] — smoke.mjs binds an ephemeral port (`listen(0, …)`, safe), but
  `try.html` loads the REPO-ROOT `/dist/archie-viewer.js` — `node scripts/sync-dist.mjs` after
  every build or the drive silently exercises the previous bundle

## Decisions
- Archie-f90d — ADR-0019 capability contract ratified: one row per capability, verdict + gate;
  no surveyed corpus (annomea/clover-iiif/canvas-panel/anvil) gates embed parity the way
  smoke.mjs does — original, not borrowed / 26c2a59
- Archie-c314 — embed parity (V30 object nav, V70 note list, tokens virtual module) landed
  behind the existing lazy boundary / 26c2a59; the eagerGzKB baseline-write hole (`build.mjs`
  silently rewriting `bundle-size.json` on every plain build) closed under the same ticket / fff4aa9
- Archie-64ef — OSD overlay-wrapper fix: region clicks were dead in the embed because the frame
  overlay's wrapper blanketed the whole image / d973f42

## Evidence
- `packages/archie-viewer/build.mjs` — `eagerGzKB` walks esbuild's metafile from `src/index.ts`;
  `--update` (`pnpm bundle:baseline`) is the only writer, a plain build leaves the baseline alone
- `recipes/smoke.mjs` header — two silent-fail preconditions (ungenerated viewer fixtures, stale
  root `dist/`); one unattributed flake (2026-07-26, 1 run in 6) recorded rather than rounded to
  "transient" — capture the FAIL line if it recurs
- 66ec782 — bound-fetch regression: a freshly rebuilt `dist/` rendered 0 gallery cards while all
  2,241 unit tests stayed green (no ticket id recorded on this commit)

## Open & hazards
- The unattributed smoke.mjs flake has two live suspects (narrative section stepper remount, AV
  note-list post-click reads) — neither confirmed or ruled out as of 2026-07-26
- CI's `embed-smoke` job is the only gate driving real Chromium against current source
  (hit-testing, fetch brand-checks, completeness); eager-closure is caught separately by
  `archie-viewer-artifact`'s `bundle:check` (esbuild metafile, no browser)
