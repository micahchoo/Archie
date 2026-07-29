---
scope:
  - "apps/viewer/src/components/**"
  - "apps/viewer/src/pages/**"
  - "apps/viewer/src/lib/**"
  - "apps/viewer/e2e/**"
  - "apps/viewer/astro.config.mjs"
updated: 2026-07-28
---
# reading
> *how do readers experience things? (the Viewer app)*

`apps/viewer` is the SPA a museum visitor drives: gallery grid, `Reader`/`MediaPlayer`/
`NarrativeReader` canvases, the note surface (`NotePopup`/`NoteLightbox`/`NoteMedia`), the finder
(`SearchOverlay`), and scroll-coupling between narrative prose and the canvas. Entry points are
`ExhibitView.svelte` (mounts the three readers plus the finder and cite panel behind lazy imports) and `astro.config.mjs`
(`optimizeDeps.include` — the dev-server correctness seam). The gate that matters for any `.svelte`
edit here is `pnpm --filter @archie/viewer run check:svelte` (svelte-check, `--fail-on-warnings`,
baseline 0/0); for anything claiming a real interaction, `apps/viewer/e2e/*.spec.ts` driven in real
Chromium — jsdom/vitest cannot hit-test or catch hydration timing.

## Binding rules
- [[svelte-no-typecheck-net]] — svelte-check gates compile errors but not prop WIRING (a
  typed-not-destructured prop renders nothing, 0/0 green); assert the control in a browser drive.
- [[viewer-optimizedeps-bare-includes]] — a bare-name dep reached only via `@render/*` source or a
  lazy `import("./ExhibitView.svelte")` needs BOTH a direct dep AND `optimizeDeps.include`, or dev
  504s with no MIME — three bites (fflate/dompurify/snarkdown, minisearch, the OSD trio).
- [[wall-clock-quiet-is-a-load-sensitive-gate]] — "suppress until scroll goes quiet" re-arms forever
  under continuous scroll, releases too early on a stalled frame; end suppression on computed
  arrival, never on silence.
- [[stop-the-machine-not-just-the-token]] — clearing a scroll-intent flag doesn't cancel the
  in-flight `scrollTo`; 3 of 4 cancel inputs worked only because Chromium happens to cancel
  smooth-scroll on that gesture — `pointerdown` doesn't, and the observer kept firing mid-animation.
- [[osd-overlay-wrapper]] — `addOverlay` wraps your element in an unstyled div that eats clicks; this
  is the embed's DOM-overlay hazard, NOT the viewer's Annotorious/WebGL canvas (GL layer stacks above
  the wrapper) — verify here via the wrapper's computed `pointer-events`, not a hit test.
- [[playwright-count-does-not-wait]] — `Locator.count()` right after `page.goto()`, before an island
  hydrates, reads 0; a conditional skip/return then passes having tested nothing. Safe once a prior
  action forced hydration.
- [[playwright-emulation-and-scroll-traps]] — `test.use({ reducedMotion })` inside a `describe`
  block silently doesn't apply (assert `matchMedia(...).matches` first); a synthetic wheel is
  dropped outright during a running smooth-scroll animation.
- [[drive-must-not-recreate-the-thing-under-test]] — a drive helper that does a full `page.goto`
  recreates the custom element, so "does field X persist/reset" built on it is vacuous; cross the
  transition the way a reader would (click through), reserve `goto` for the starting point.
- [[viewer-e2e-shared-port]] — concurrent e2e runs share port 4326 and silently drive a *different*
  worktree's build (false-green is the dangerous direction); pass a distinct `VIEWER_E2E_PORT`.

## Decisions
- Archie-0d6c — narrative-scroll↔camera coupling ships arrival-based (not quiet-timer) suppression,
  both directions / 87b4bd1
- Archie-36e6 — exhibit-level credit/licence/metadata renders beside the object credit on all three
  readers (Reader/MediaPlayer/NarrativeReader `.credit-row`); dock and a UV-style panel both rejected / a44436b
- Archie-7b86 — AV reading surface: live client-side waveform via WaveSurfer attached to the existing `<audio>` element (V50; baked peaks were the road NOT taken — Studio's cache is keyed on the working store), note surface restored (V53), temporal
  map clears the item strip (V49) / 325de74, 17fd2e5, 5b08f9a
- Archie-9eeb — finder result states where it lives, not just what matched (V106) / e7716be
- Archie-06fb — selection.spec's order-dependent failure was TWO defects: OSD overlay re-render
  lags the DOM resize under load, and the spec's "pure translation" premise was false (frame
  rescales 1.0808x) — the spec now records the mark as a FRACTION of the frame and awaits arrival / b376aa8
- Archie-4524 / d37d — AV note card gets a reading legend; cite-trigger occlusion fixed once the dock
  landed / 27d02e4 (1cdf706 was the fixture half only, ticket stayed open there)
- Archie-5185 — flip-and-read stepper stays removed with the note-card redesign (decided, not reverted)
- note-dismiss reflow (no separate ticket) — accepted: dismissing a note grows the canvas 416→557px;
  `preserveImageSizeOnResize` was tried and measured WORSE (17/20 → 9/20 pass) — reverted

## Evidence
- `ledgers/PERF-reader-2026-07-24.md` — exhibit route shipped the whole canvas engine (OSD+pixi) to
  render a grid: 1149KB→148KB JS on arrival (7.8x) via `lazyComponent` memoized dynamic import; no
  ratchet exists yet for this (embed has `eagerGzKB`, the app doesn't) — the stated gap
- same ledger, "deeper scan" — on `/sampler` video is 82% of page weight (`preload="metadata"` pulled
  1648KB for a 1MB file); fix identified (baked poster) but NOT shipped — needs a design call
- `ledgers/HANDOFF-viewer-ux-2026-07-26.md` — `selection.spec.ts:96` two assertions (A: re-derive mark
  box from `#archie-object-frame` after dismissal, red 4/10→green 20/20; B: dismissed row height
  returns to image, red 3/3) proven red-green against 5 injections that silently targeted
  `Reader.svelte` while the fixture route renders `NarrativeReader.svelte` — see 1a-bis in
  [[post-review-fixes-are-unreviewed]]

## Open & hazards
- The viewer's eager-bytes ratchet is `scripts/perf/readerrun.mjs --check` vs `reader-budget.json`
  (CI `perf-ratchets`) — the ledger's "no ratchet yet" line predates the fix by 12 minutes
- `ExhibitView.svelte` is the shared mount point across slices (AV surface / finder both touch it) —
  append-only at mount sites, new props optional-with-defaults so merge order doesn't matter
