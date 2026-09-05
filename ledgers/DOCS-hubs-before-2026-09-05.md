# Territory hubs before the documentation refresh

Historical snapshot captured on 2026-09-05. These entries include superseded status claims.
Current guidance starts at [the hub index](../hubs/INDEX.md). Paths inside excerpts refer to the repository root.

## verification

````markdown
---
paths:
  - "recipes/**"
  - "apps/viewer/e2e/**"
  - "apps/studio/e2e/**"
  - ".github/workflows/**"
  - "scripts/doclint.mjs"
  - "scripts/perf/**"
  - "scripts/export-fidelity.mjs"
  - "scripts/export-fidelity.ts"
  - "scripts/export-fidelity.html"
updated: 2026-09-05
---
# verification
> *how do I prove a change works?*

This territory is every gate that turns "I believe it" into "I measured it": the CI jobs in
`.github/workflows/checks.yml`, the perf ratchets under `scripts/perf/`, the browser-driven
recipes/e2e suites, and `scripts/doclint.mjs` for the knowledge layer itself. The one rule that
cuts across all of them: **a gate answers the question it was asked, and "did this actually
exercise anything?" is a question no gate asks itself** ([[two-typescript-compilers]]). Pick your
claim from the table below before reaching for a test framework at random.

## Claim → gate

| claim | gate | caveat |
| --- | --- | --- |
| clicks work in the embed | `recipes/smoke.mjs` (real Chromium) | keyboard Enter / synthetic `.click()` pass even when OSD's overlay wrapper swallows a real click — [[osd-overlay-wrapper]] |
| an island's `.svelte` script typechecks | per-app `svelte-check` (`pnpm --filter @archie/studio run check`, viewer's `check:svelte`) | `tsc`/`astro check` never parse `.svelte` script bodies — [[two-typescript-compilers]] |
| `.ts` strictness in apps/studio | `pnpm typecheck` (native tsc, explicit path) | svelte-check relaxes `exactOptionalPropertyTypes` — [[two-typescript-compilers]], [[two-typescript-compilers]] |
| embed bundle kept OSD off the page-load path | `eagerGzKB` in `packages/archie-viewer/build.mjs --check` | `entryGzKB`/`totalGzKB` moved Δ+0KB while a real leak grew eager 36→270.5KB — [[archie-viewer-eager-closure]] |
| publish got faster | `scripts/perf/publishrun.mjs` (end-to-end, real Chromium, no `--check`/budget — read the printed numbers; ARCHIVAL-tier only, the tier engine is never exercised — Archie-e870) | a primitive bench misleads: tiling alone measured 19–37x, end-to-end 1.9–4.7x — [[perf-measure-the-flow]] |
| reader arrival payload in budget | `scripts/perf/readerrun.mjs --check` vs `reader-budget.json` | raw transferred JS bytes on arrival, per route |
| shipped workers actually boot | `scripts/perf/worker-smoke.mjs` (CI: perf-ratchets) | both call sites fall back to serial/inline SILENTLY on failure — only `bakeFallbackCount()` witnesses it — [[perf-measure-the-flow]], [[tauri-csp]] |
| spine hot-path perf didn't regress | `head-index.perf.test.ts` (ratios vs a full-log pass) | a reverted `deleteNote` scan once passed a loose ratio-threshold gate ("a fraction of a full projection" was too generous) — [[perf-measure-the-flow]] |
| desktop fs backend keeps browser-parity guarantees | `fs/conformance.ts` + `tauri.test.ts` targeted hardening tests | conformance alone proves observable behavior only — stays green whether or not `close()` is atomic — [[tauri-fs-seam]] |
| an injectable-fetch seam survives a real browser | brand-checking stub tests (`installBrandCheckedFetch`, `http.test.ts`/`load.test.ts`) | plain arrow-fn stubs are receiver-insensitive, can't catch `Illegal invocation` — [[bound-fetch-defaults]] |
| a CSS-text import actually carries the tokens | `tokens.test.ts` content assertion | vitest silently resolved the id to `""` while the shipped bundle was correct — [[vitest-css-id-empty-string]] |
| real navigation / hit-testing | `apps/studio/e2e` (popstate re-entrancy), `apps/viewer/e2e` (built-output, non-localhost aborted) | static analysis can't see prop wiring or click hit-testing — CI job `e2e` |
| ~70-object scale holds | `.github/workflows/scale-check.yml` (`workflow_dispatch` only) | real OPFS ingest via `scripts/seed-fixture.mjs`; deliberately never blocks a PR |
| a real publish produces a faithful tree/zip | `node scripts/export-fidelity.mjs` (CI job `export-fidelity`) | drives `publishLibrary` in real Chromium (OPFS + worker pools live), asserts in Node over emitted bytes; its `workers` check is the only PR gate that reddens on the silent pool-death class — and note the tree stays byte-identical under that injection, so no artifact diff can catch it |
| knowledge layer (rules/hubs/tickets) is consistent | `scripts/doclint.mjs` (CI job `doclint`, checks.yml) | needs full git history — the job checks out with `fetch-depth: 0`; a shallow local clone gives false reds on pointers/stale-hubs |

## Binding rules
- [[a-green-run-is-one-sample]] — one red-green proves an assertion CAN fail, not that it passes reliably; order/timing-sensitive assertions need ~20 unchanged runs.
- [[post-review-fixes-are-unreviewed]] — code written to address review feedback is unreviewed by default; red-green it and read the DETAIL line, not just PASS/FAIL.
- [[drive-must-not-recreate-the-thing-under-test]] — a drive that `goto`s destroys the state you're asserting about; inject the defect and watch it fail before trusting any assertion.
- [[playwright-count-does-not-wait]] — `Locator.count()` right after a navigation reads 0 pre-hydration; a bare-count skip passes vacuously.
- [[playwright-emulation-and-scroll-traps]] — assert an emulation option (`reducedMotion`, etc.) actually applied before depending on it; a synthetic wheel is dropped mid-smooth-scroll.
- [[viewer-e2e-shared-port]] — concurrent e2e runs share port 4326 and silently drive a sibling's build; assign distinct `VIEWER_E2E_PORT`s.
- [[shared-worktree-agent-collisions]] — in a shared checkout even `git restore --source=HEAD` can destroy a sibling's uncommitted edit.

## Decisions
- (arch deepening + read-seam probes, no ticket) / 8341381 — svelte-check caught a wiring bug neither
  tsc nor 1293 passing studio tests could see (`publishBlocked` returning a boolean where
  publish-machine invokes a predicate); `scripts/lib/checklist.mjs` gave every script gate one
  tolerant per-item tail, which is what let two adversarial read-path probes surface 9 finding
  classes in ONE run each instead of one per fix-and-rerun. Counter-lesson from the same commit: its
  own "1521 green" line was never reconciled against a run — the committed tree had 7 red tests / `ledgers/PROBE-read-seam-adversarial-2026-08-08.md`
- Archie-c314 — `build.mjs`'s baseline write gated behind `--update`; a plain `pnpm -r build` was silently rewriting the eagerGzKB ratchet's own reference point.
- Archie-f90d — `CONTRACTED_LABELS` completeness check restored to 40/40 after a post-review splice silently dropped it to 35/35 with every gate still green.
- Archie-64ef — `recipes/smoke.mjs` proven the only gate that catches OSD's overlay-wrapper click-swallow; keyboard/synthetic-click probes pass regardless.
- Archie-4635 — svelte-check (1464 files, 0/0) proven blind to unbound prop wiring; only a driven browser click caught the dead Cancel button.
- Archie-656a — a TS2379 violation passed vitest (542 green) and svelte-check (0/0); only `pnpm typecheck` caught it.
- Archie-676f — scale-check made `workflow_dispatch`-only by design: a multi-minute real-ingest drill must never gate an ordinary PR.
- Archie-027c — export-fidelity gate shipped and wired as CI job `export-fidelity` (~2s, 12/12 unchanged runs, 9/9 checks red-greened); found `verify-publish.mjs`'s heads line is `check(true, …)` — a report, not an assertion: a 0-of-9-heads tree passed it exit 0 / 35ef836
- Archie-b5c2 — FSA real-folder autosave measured 1.2–2.7 ms median vs the 800 ms debounce (within 0.5 ms of OPFS; 125 samples/config, `.crswap` temp-swap proven, tmpfs trap dodged — check the device of BOTH sides); web folder-canonical needs NO cadence change; `scripts/perf/fsafolderrun.mjs` is the headed-Xvfb runner (headless can only reach OPFS, which never exercises the temp-swap path) / 3423c92, ledger `ledgers/PERF-fsa-autosave-2026-07-28.md`

## Evidence
- `.github/workflows/checks.yml` — enumerates the live gate set: typecheck, unit-scripts, doclint, test, astro-check, svelte-check, gh-pages-build, archie-viewer-artifact, embed-smoke, export-fidelity, perf-ratchets, e2e.
- `recipes/smoke.mjs` header — documents its own two silent-failure preconditions (unbuilt fixtures, stale root `dist/`) and one still-unattributed flake (2026-07-26).

## Open & hazards
- doclint wired into CI 2026-07-27 (job `doclint`). All 12 checks proven red-green same day; the allowlist (scripts/doclint-allow.json) carried ticket ids for its deliberate deferrals; both (Archie-e149 ledger migration, Archie-1f60 accretion rewrite) resolved later the same day and their allowlist entries are empty again.
- Red-green discipline: inject the defect, confirm it fails for the reason you intended (not a precondition failure), then confirm clean — never trust an assertion you haven't watched fail.
- Before citing a count or "N/N" figure from any of the above gates, reconcile it against a number the tool itself printed — see [[post-review-fixes-are-unreviewed]]'s counting traps.

- Review 2026-09-05 → Review regressions cover corrupt adoption, racing saves, undo, source identity, contrast and built embed navigation; final counts and limits are in the implementation ledger. Evidence: `ledgers/IMPLEMENT-review-2026-09-05.md`; contracts: `ledgers/DESIGN-review-modules-2026-09-05.md`.

````

## product

````markdown
---
paths:
  - "README.md"
  - "PRFAQ.md"
  - "DIVERGENCES.md"
  - "docs/GOAL.md"
  - "docs/adr/**"
  - "docs/decisions/**"
  - "docs/guide/**"
updated: 2026-09-05
---
# product
> *what is Archie and why is it shaped this way?*

Archie is a static-publishable, multi-media exhibit annotation platform (image/map/audio/video)
built on open standards — notes are W3C Web Annotations, exhibits are IIIF Presentation 3
manifests — so the published site is a plain file tree with no server and no lock-in. `README.md`
is the spine (start there); `docs/GOAL.md` is the north-star the `/goal` autonomous loop re-reads
every cycle; `PRFAQ.md` + `DIVERGENCES.md` are the graft-discovery pipeline that turns observed
friction into specced features; `docs/adr/` (0001–0026) are ratified architecture decisions;
`docs/decisions/` holds citable Q-N records. The one gate that matters for any product-shape
change: `docs/GOAL.md` §3's dual gate — Family A regressions (typecheck/tests/build/bundle/a11y/
console/screenshots) must ALL stay green, and ≥1 Family B improvement scalar must move, or the
cycle reverts. Architecture changes additionally require a same-commit ADR or decision record
(§6) — no unattended architecture change ships with no provenance trail.

## Binding rules
- [[prior-art-citation-discipline]] — every divergence/PRFAQ claim cites prior art; a plausible
  citation that nobody re-opens is the recurring failure (7 bad ones caught in one session) —
  open the file and grep usage, don't cite from memory.

## Decisions
- Q-15 — the publish surface is split by AUTHOR INTENT, not by sink: publishing a SITE (a place that
  stays updated, opened on a remembered home) and exporting a FILE (an artifact you carry away) are
  different verbs behind one entry point. Rules out the c367 one-wall dialog, per-run destination
  choice, and a global quality setting / 58bd8e1
- Archie-ebe7 — AV posters: canvas frame-grab now, `mediabunny` deferred until rotation/audio
  bites / dc012e9
- Archie-5fb5 — untrusted-archive import validates marker + structure only, not content
  (`[[untrusted-archive-open-seam]]` is the enforcement seam) / 0efc2a1
- Archie-be3a — desktop CSP cleartext `http://**` grant removed, tightened to `https:`
  (`[[tauri-csp]]` covers the rest of that CSP) / baa86a7
- Archie-3754 — bulk catalogue-spreadsheet metadata import built: columns → Dublin Core, rows →
  objects by filename / c800a83
- Archie-19c5 / Archie-3504 — publish base URL derived from the destination BEFORE projection,
  relative-first (absolute only for `og:url`/JSON-LD/IIIF ids/canonical) / 89a1302
- Archie-babe, Archie-33bf — export ships the read-only embed, not a full Astro viewer; viewer
  links deliberately don't mirror Studio's hash routes — both closed same day, no work / f1378e1
- Q-12/Q-13 (`docs/decisions/archie.md`) — desktop GitHub token persists in the OS keyring
  (ratified in PRFAQ.md interview); deploy upload is single-pack `git2` push, per-blob REST
  demoted to the browser-PAT fallback only (probe-refuted at ~500 files, secondary rate limit)

## Evidence
- DIVERGENCES.md divergence 1 (publish-to-web) — top bet, shipped: `5dc6a93` merges the
  device-flow GitHub Pages deploy; DIVERGENCES.md's "spec'd" status line predates the merge
- DIVERGENCES.md divergence 5 (embed-autogrow) — built `e3766bc`; kill-criterion finding
  recorded: script-stripping hosts strip the parent listener too, fixed-height stays the answer
  for that class
- `docs/adr/0003-annotation-spine-append-only-version-dag.md` — append-only version-DAG spine, called "keystone" (Q-3); `docs/adr/0016-narrative-as-emergent-reading-mode.md` —
  narrative is emergent from content (sections present), never a picked template
- `docs/adr/0019-embeddable-read-only-archie-viewer.md`/`0021` — embed's public surface is 3 frozen attributes (`src`/`target`/
  `offline`); Archie-f90d gave it a capability contract enforced by `recipes/smoke.mjs`

## Open & hazards
- DIVERGENCES.md 2–4 (studio-preview, remix-from-viewer, headless-publish) are still **queued** —
  read the divergence's kill criterion before building; don't re-probe a killed assumption
- GOAL.md §6's locked frames (OSD+Annotorious, Studio/Viewer split, WADM, IIIF,
  static-publishable, no server) are non-negotiable — a cycle that relitigates one is out of
  scope, not a bug fix. (GOAL.md attributes the list to CONTEXT.md, but CONTEXT.md is a pure
  glossary and doesn't contain it — §6 itself is the real source.)
- GOAL.md §4a: after 3 consecutive dry `/goal` cycles the run stops and defers to seeds — a
  report of "no improvement found" is the loop working as designed, not a failure to diagnose

- Review 2026-09-05 → Delivery capabilities and a first-use protocol are documented; scholar/curator cohort remains a hypothesis until observed sessions. Evidence: `ledgers/IMPLEMENT-review-2026-09-05.md`; contracts: `ledgers/DESIGN-review-modules-2026-09-05.md`.

- README simplification 2026-09-05 → One overview, one quickstart and links to existing guides replace repeated feature/persona lists and stale status claims; browser storage and remote-media limits stay explicit. Entry: `README.md`.

````

## data

````markdown
---
paths:
  - "packages/render-core/src/spine/**"
  - "packages/render-core/src/fs/**"
  - "packages/render-core/src/publish/**"
  - "packages/render-core/src/model/**"
  - "packages/render-core/src/session/**"
  - "packages/render-core/src/state/**"
updated: 2026-09-05
---
# data
> *How is knowledge stored, merged, and kept safe?*

`render-core` is the engine: an append-only per-note version DAG (`spine/`, ADR-0003) read/written
through one `Filesystem` seam — Memory/Zip/FSA/OPFS (`fs/`), node:fs (`fs/node.ts`,
`NodeFilesystem`, subpath `@render/core/node`), read-only HTTP (`fs/http.ts`, `HttpFilesystem`),
Tauri (path-based, `fs/tauri.ts`), a streaming zip writer (`fs/zip-stream.ts`) and a fixity
decorator (`fs/hashing.ts`) — and published/opened through `publish/`. The one spec that matters is
`spine/MERGE-CONTRACT.md` (C1-C18, each pinned by a named test in `merge-contract.test.ts`); the one
gate that matters is that suite plus `fs/conformance.ts` run against every backend.

## Binding rules
- [[render-core-data-integrity]] — multi-file writes: content before index/marker; reads are
  per-item tolerant (corrupt ≠ empty, absent ≠ failed); every hand-mapped model field carries a
  compiler-guarded `carry.ts` sentinel — an unguarded new mapper is how a field silently stops
  copying.
- [[untrusted-archive-open-seam]] — `publish/open.ts` is the ONLY place `ZipFilesystem.fromZip` +
  `validateArchieMarker` compose; a second hand-rolled copy is how studio's `ingest-flows.ts` once
  shipped with marker validation skipped entirely.
- [[tauri-fs-seam]] — the Tauri backend must re-earn what browser handle APIs give free: atomic
  replace (temp-then-rename in `close()`) and name containment (`assertSafeName`, blocks `..`
  traversal) — both are desktop-only write-escape / torn-write risks a naive path-join port drops.
- [[bound-fetch-defaults]] — `fs/http.ts`'s ctor-defaulted `fetch` must be
  `globalThis.fetch.bind(globalThis)`; unbound, it throws `Illegal invocation` in every real browser
  and passes every Node vitest suite silently.
- [[perf-measure-the-flow]] — §3: the spine's hot path is per-EDIT; a whole-log op added to
  `createNote`/`editNote`/`notes()` is quadratic at scale and every gate here is a RATIO, never a
  ms threshold.

## Decisions
- (arch deepening P1-P3, no ticket) / 8341381 — the READ seam is one composition in core:
  `NodeFilesystem` on the `@render/core/node` subpath (off the browser barrel — the esbuild gate
  caught the node:fs drag), `tryResolveFile` the one classified traversal, `httpJsonSource` +
  `fetchZipBytesIfAny` in core, 5 script bridges collapsed; one `classifyArchieMarker` with typed
  verdicts behind both gates; `recordsToWorking` / segment-safety / `FileContent` twins collapsed.
  Adversarially re-probed the same week — 9 finding classes, 5 fixed, 4 open (zip name gate, raw
  fflate decode text, silently-short STORED entries, torn-marker surface) / `ledgers/PROBE-read-seam-adversarial-2026-08-08.md`
- Archie-69f9 — an OLDER published tree now MIGRATES on read (`migrate/tree.ts` + `migratingJsonSource`
  over the `JsonSource` seam), never rewritten in place; the marker gates accept `version <
  SCHEMA_VERSION` ONLY where the registry covers every step, so a gap is still a clean refusal /
  e0416f4. The remainder landed same-day: Archie-5c8d wired the hosted-tree reader
  (`apps/viewer/src/published.ts`) to the same seam / 857e1fa — every reader now migrates.
- Archie-01c9 — minimal signals layer (`state/`: atom/computed/transact, 322 code lines, tldraw-cited)
  ADOPTED per grill 2026-07-28; `workingAnnotations` is a computed over a revision atom, Δ 0.0KB in the
  embed's eager chunk, perf ratchet live 13/13; the learn-ledger's "transact batches recomputation"
  claim was wrong — laziness does that, transact batches the SUBSCRIBER tick (both pinned separately)
  / 90fa87a
- Archie-69a6 — RecordsDiff undo proven over the PROJECTION, never the log (`session/undo.ts`,
  `session.entries` byte-identical across undo/redo/bailToMark, O(1) per mutation); freecut's
  whole-projection snapshot disqualified by the merge model (resurrects an undone note, measured);
  known limit: undo does not survive save+reload — build ruled session-scoped per grill 2026-07-28
  / 1ce65c5, `docs/research/undo-feasibility.md`
- Archie-6b8e — note→section attribution is a 7th content field, dropped on tombstone (non-revivable
  by section un-delete, deliberate) / facb09c
- Archie-494c — spine stays append-only-DAG, not promoted to an op-log (decision gate, closed)
- Archie-d71c — collaboration signals: wire or remove (closed) — feeds MERGE-CONTRACT OQ-6
  (`projectHeads` hides delete-vs-edit conflicts; MergeReview must read `headsOf`)
- Archie-5a9b — Dublin Core metadata pipeline: model field + carry sentinels + lossless
  `archieMetadata` round-trip at Collection/Manifest/Canvas / 30c1356
- Archie-1cf0 — Zip64 writer: streaming zip's 4 GiB and 65,535-entry caps removed (bytes: c27aa95,
  entries: 56cf7c5)

## Evidence
- `ledgers/PERF-annotation-spine-2026-07-24.md` — per-edit cost was O(log): 20k records = 17.75ms
  (past the 16ms bar) for ONE edit; `HeadIndex` (incremental projection) makes it O(versions-of-note),
  23-314x measured (23x at small logs, 130x+ at 2k-20k). Save's `toZip` was the real freeze (5.7s at 272MB, not Open, which cost 155ms) —
  per-entry STORE-for-media fixed it to 0.6s (9x, end-to-end validated, not just micro-benched).
- `docs/state/CANON.md` — the untrusted-archive seam's canonicalization: zero remaining call sites of
  `ZipFilesystem.fromZip` outside `open.ts`; caps rescaled 2026-07-19 (`SRC_MAX_BYTES` 256MB→1GiB,
  `maxEntries` 50k→500k) after a legit 100-object library blew past the old ones.
- `packages/render-core/src/spine/MERGE-CONTRACT.md` — OQ-2 (rev-collision content mismatch is
  silently unchecked), OQ-3 (tombstone-primary resolution yields a live, body-less node), OQ-5
  (duplicate explicit `logicalId` forks an unguarded second root) are PINNED, not fixed — read before
  assuming any of the three can't happen.

## Open & hazards
- MERGE-CONTRACT OQ-2/3/5 above are load-bearing gaps, not oversights — a new caller that can inject
  duplicate revs or replay `logicalId`s (an importer) hits them for real.
- CANON.md's maximal-flexibility design flagged an HTTP backend as "not built" — the backend half HAS
  since landed: `fs/http.ts`'s `HttpFilesystem` is the read-only HTTP backend, composed by core's
  `httpJsonSource` (`publish/read.ts`) and consumed by `apps/viewer/src/published.ts` and
  `packages/archie-viewer/src/load.ts`. What stays deferred is the unification half: the zip-open
  marker gate (`open.ts`) and the tree-over-HTTP gate (`read.ts`'s `assertArchieTreeMarker`) remain
  two gate shapes over the one shared `classifyArchieMarker`.
- Zip-open cap rescale is an accepted DoS tradeoff: a crafted `?src=` URL can now cost a tab ~4GiB
  before any guard fires (marker/ratio guards unchanged, only the ceiling moved).

- Review 2026-09-05 → Save snapshots retain concurrent dirt; shared history reads distinguish corruption from absence; writable Adapters append mixed chunks consistently. Evidence: `ledgers/IMPLEMENT-review-2026-09-05.md`; contracts: `ledgers/DESIGN-review-modules-2026-09-05.md`.

````

## reading

````markdown
---
paths:
  - "apps/viewer/src/components/**"
  - "apps/viewer/src/pages/**"
  - "apps/viewer/src/lib/**"
  - "apps/viewer/e2e/**"
  - "apps/viewer/astro.config.mjs"
updated: 2026-09-05
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
- [[two-typescript-compilers]] — svelte-check gates compile errors but not prop WIRING (a
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
- (arch deepening P5 + P6, no ticket) / 8341381 — `note-tree.ts` gives the V100 bug class ONE home
  (one walk), `createNoteSurface()` one open-note state machine (three hosts ~100 lines lighter
  each), `readingSession` sheds ~15 locals from `ExhibitView`; the mount gained `overlay-core.ts`
  (one lifecycle, `makeClickable` the V68 home) and `osd-open.ts` (one OSD construction). The gate
  caught a REAL regression: the merged `applyFitBounds` dropped the OSD Rect→Box conversion (NaN fits).
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

- Review 2026-09-05 → One source-aware address Interface covers links and locus updates; changing source reloads the library session; empty live stores drop stale exhibits. Evidence: `ledgers/IMPLEMENT-review-2026-09-05.md`; contracts: `ledgers/DESIGN-review-modules-2026-09-05.md`.

- README simplification 2026-09-05 → App introduction links to current capabilities and verification instead of the removed root status section. Evidence: `apps/viewer/README.md`.

````

## process

````markdown
---
paths:
  - "hubs/**"
  - ".claude/rules/**"
  - ".seeds/**"
  - "ledgers/**"
  - "docs/agents/**"
updated: 2026-08-08
---
# process
> *how do agents work in this repo?*

This is the territory of working AS a fleet in this repo, not any one feature: worktree
discipline when agents share a checkout, `.seeds` as the single issue tracker (`sd`,
`docs/agents/issue-tracker.md`), the commit-message conventions that make `git log`
searchable, and the counting/verification traps that make a green run or a clean `git
diff` misleading. The one gate that matters here is `node scripts/doclint.mjs` — it is
the mechanical check over the knowledge layer itself (see `ledgers/DESIGN-knowledge-layer-2026-07-27.md`
§2 Q6, §3b) and is what enforces the closure convention below; wired into CI 2026-07-27
(job `doclint` in `.github/workflows/checks.yml`, full-history checkout).

## Binding rules
- [[shared-worktree-agent-collisions]] — two agents in one checkout turns safe git habits (`add -A`, `commit -a`, `restore --source=HEAD`, remembering your own branch) into destructive ones; pass `isolation: "worktree"` and verify with `git worktree list`.
- [[post-review-fixes-are-unreviewed]] — a fix written after sign-off is unreviewed by default; red-green it like anything else, and reconcile every reported count against one you actually read (a gate's own reference point must not be writable by the thing it gates).
- [[a-green-run-is-one-sample]] — a red-green proves an assertion CAN fail; it says nothing about whether it passes reliably — run order-sensitive assertions N times before trusting them.
- [[prior-art-citation-discipline]] — a citation that reads plausibly and is never re-opened is the recurring failure (7 bad ones caught in one session); open the file, grep where a thing is USED not just defined, cite to the line.

## Decisions
- (arch deepening, no ticket) / 8341381 — 9 orthogonal phases in one sweep, ordered so the read seam
  landed FIRST and every later phase composed it. The gates caught 6 regressions the phases
  themselves introduced (OSD Rect→Box in a merged `applyFitBounds`, a mount-barrel OSD drag into a
  headless test, Tauri's `__cmd__` path, a `publishBlocked` predicate, a stale root `dist/`, 2 unused
  imports) — the phase discipline works, and its cost is recorded honestly: the same commit shipped
  a red suite and 8 stale hubs, both found by the next reader, not by its own report / `ledgers/PROBE-read-seam-adversarial-2026-08-08.md`
- Archie-1f60 — first exercise of the accretion rewrite: two-typescript-compilers cut ~110→61 lines, evidence kept, correction-narrative dropped; the doclint accretion exemption list is empty again.
- Archie-1a47 — worktree "drift" was a measurement artifact (diffed against a stale ref); 11 merged checkouts pruned, prune criterion recorded in `ledgers/AUDIT-worktrees-2026-07-27.md`.
- (prior-art deep pass, no ticket) / 1e7809d — clover-iiif/mirador/universalviewer promoted from three chrome-placement rows to full clone-verified pages; **a standing correction of ours was itself refuted** ("universalviewer's suite never touches the network" — it is puppeteer-driven against live remote manifests). A correction outlives the error it replaced and nobody re-opens it: re-verify corrections on the same terms as claims.
- Archie-e149 / 4f7636f — ledgers/ is dated-only by predicate; standing docs moved to docs/state/; dated ledgers + .seeds bodies keep historical paths (immutable evidence).
- Archie-098f — toolchain & docs pipeline tend epic closed; its children are the process-tooling ratchets below.
- Archie-9140 / 7a07cd9 — harness consolidation: two rotted drive-and-shoot verifiers deleted with coverage proof (behavior moved to unit + e2e), one shared driver.mjs kept.
- Archie-b975 / 329ee4d — screenshot capture gate wired with no exit-0 escape (zero skips, per-viewport, size floor); wiring it exposed month-old rot the old gate had stopped catching.
- (doclint itself, no ticket) / a3fd4d8 — deterministic knowledge-layer gate shipped, 12 checks (TRACKERS drift and evidence-path existence were added later, keeping the count at 12), born red on 2 real standing findings (undated ledgers, svelte rule 4x accretion) — proves the gate can fail before being trusted, per this design's own §2 Q6.

## Evidence
- `scripts/doclint.mjs` — 12 checks (dangling `[[links]]`, dead scopes, stale hubs via `git log -1 -- <scope>` vs `updated:`, INDEX drift, ticket/sha pointer integrity, TRACKERS drift, evidence-path existence, untracked docs, declared mirrors, ledger date-naming, rule-accretion count, scope-coverage totality); all scope/link checks run against `git ls-files` — an **uncommitted** hub or rule file is invisible to it.
- `docs/agents/issue-tracker.md` — `sd` conventions: claim with `--assignee`+`--status in_progress` before working, `sd dep add` for blockers, `sd ready` for the frontier, close with `--reason` carrying the answer, not a restatement.
- `git log --oneline` — the live commit-message convention: `close: Archie-xxxx — <verdict>`, `<type>(<slug>): <description> (Archie-xxxx)`, `rule: <what changed>`, `docs(<slug>): <what was recorded>`. Ticket id in parens or after a colon is what makes `git log --grep Archie-xxxx` work.

## Open & hazards
- `sd list` silently truncates at 50 and prints no notice — a backlog count taken from it undercounts; use `sd stats` to reconcile, or `sd list --limit 500 --json` to enumerate. Two independent people derived a wrong count from the default limit in one session before the tell (`sd stats` disagreeing) was noticed.
- `.seeds/issues.jsonl` is ONE shared file — `git add .seeds/` is a precise path and still sweeps every other agent's concurrent ticket edit into your commit. Diff the set of ids, not the line count, before committing it.
- Ledger files recur with embedded NUL bytes (hit `docs/state/CANON.md`, `ledgers/ANTIPATTERN-SWEEP-2026-07-19.md`, this design doc itself, among others) — plain `grep` silently reports zero matches; use `grep -a` or `fff`/`file(1)` to confirm before trusting a no-match result.
- The stale-hub closure convention (`ledgers/DESIGN-knowledge-layer-2026-07-27.md` §3, row 1) is live in CI as of 2026-07-27: a diff touching a hub's scope without moving the hub is a red build, not a silent gap.

````

## authoring

````markdown
---
paths:
  - "apps/studio/src/**"
  - "apps/studio/e2e/**"
updated: 2026-09-05
---
# authoring
> *how do authors make things?*

`apps/studio` is the authoring SPA (ADR-0002/Q-2): Library → Exhibit → draw regions → notes/media →
merge → publish. It depends on `@render/svelte → @render/mount → @render/core` and shares no code
with `@archie/viewer` beyond the published contract. Entry points: `src/App.svelte` (shell) plus flat top-level components
(`LibraryHome.svelte`, `AvEditor.svelte`, `CmdK.svelte`, `MergeReview.svelte`, `Publish.svelte`);
`Canvas.svelte` is lazy-loaded from the shared `@render/svelte` package, not local to studio. The one gate that matters for `.ts` edits
is `pnpm typecheck` (not svelte-check); for `.svelte` edits it's `pnpm --filter @archie/studio run
check`. Neither alone is sufficient — see below.

## Binding rules
- [[metadata-rights-keyed-writebacks]] — RightsFields (`rights`/`requiredStatement`/`metadata`) write-backs MUST be keyed partial patches, never whole-object reconstructions — a naive handler clobbers sibling fields; audited and fixed across every UI site.
- [[two-typescript-compilers]] — svelte-check relaxes `exactOptionalPropertyTypes`; only `pnpm typecheck` (tsc --noEmit) catches it on `.ts` files — TS2379 passed 542-green vitest + 0/0 svelte-check once already.
- [[two-typescript-compilers]] — a typed-but-undestructured prop (`oncancel`) shipped a dead button through svelte-check at 0/0; a gate proves compiled, never that a prop is wired — assert in a browser drive.
- [[two-typescript-compilers]] — never call bare `tsc`; the workspace `typecheck` script must invoke `typescript-native`'s binary by explicit path, TS 5.9 stays for svelte-check/astro check.
- [[tauri-csp]] — `worker-src 'self' blob:` is load-bearing for the DZI-tile and bake workers, not just PixiJS; both call sites fall back silently on failure, so a CSP break shows as slow, not broken.
- [[perf-measure-the-flow]] — tiling/bake worker wins are real per-image (19–37x) but the worker pool is process-wide, not per-call; a per-call pool self-destructs silently at library scale (see Evidence).
- [[tauri-fs-seam]] — desktop fs backend needs atomic temp+rename writes and name containment that plugin-fs doesn't give for free; both are studio write paths (autosave, resident store).

## Decisions
- (arch deepening P8, no ticket) / 8341381 — the ~450-line canvas-derivation cluster left `App.svelte`
  for `editor-model.svelte.ts`; the legacy advanced-token publish flow folded into publish-machine
  (drifted validator gone, five clipboard helpers → one `copyText`); `zoomBand`/`dotsVisibleForBand`
  moved to core, so studio derives the band without importing the mount's OSD graph. svelte-check
  caught the one regression tsc could not: a `publishBlocked` getter returning the boolean where the
  machine invokes a predicate.
- Q-15 / Archie-5aee..bce2 — publish surface split by AUTHOR INTENT: `Publish` opens the site half
  (`PublishSheet` when the library has a remembered home, `SetupFlow` first-run, quality asked only
  where `qualityMatters`), `Export a copy…` opens the artifact half (`ExportMenu`, with the
  single-file/folder viewable PAIR adjacent). Retired the c367 one-wall chooser. Finding worth
  keeping: a pre-greyed single-file row is a FALSE REFUSAL — the probe only knows published-tree
  bytes, the guard measures raw asset bytes / 5f9a495
- Archie-e09d — self-contained trees wired into Studio's site sinks (folder destination / GitHub
  push / desktop deploy write `_viewer/` + `viewer.html`; zip and folder AUTOSAVE stay lean) via the
  SAME `@render/archie-viewer/single?raw` IIFE `exportSelfContained` ships — the parked spike's
  +304.9KB-gz duplication is gone (one lazy chunk serves both); trade: the tree's viewer eager-loads
  278KB gz instead of ~39KB lazy / 64c8f62
- Archie-7e6f — video transcode CLOSED: browser WebCodecs path via mediabunny wired into the
  web-tier publish with pinned fallback counters (both routes); H.264 empirically proven present in
  the Flatpak, so no codecs-extra manifest stanza needed / 6f4c3cc
- Archie-5a9b — RightsFields clobber audit shipped; every UI write-back site converted to keyed patches / `0fb15fc`
- Archie-458e — metadata joined the Details panel as a tab at all three levels (Library/Exhibit/Object) / `16d0f2c`
- Archie-a5b1 — partially this territory: the fix landed on the archival-page RENDER side, not studio write-back; RightsEditor's keyed-patch contract (Archie-5a9b) was already correct and untouched / `58f1cc3`

## Evidence
- `ledgers/PERF-image-pipeline-2026-07-24.md` — DZI tiling worker pool 37x on one image, but at 70-object library scale the per-call pool asked for ~25GB at once and every pool died; fixed with a process-wide gate (`withPoolGate`), end-to-end win is 1.9–4.7x, not 37x (a narrower 70-object serial→inline comparison is 1.26x).
- `ledgers/FIX-a5b1-rights-metadata-2026-07-26.md` — the read-side rights/metadata ladder is 3 surfaces (SPA/embed/archival page) in 3 different states; only the archival page (publish output, not studio) had a real gap.
- `ledgers/EXPLORE-studio-folder-export-settings-2026-07-26.md` — no settings surface exists today; ~20 loose `localStorage` keys with no UI; storage/diagnostics readout is the one genuinely new thing a panel should add (worker-pool fallback + retained-OPFS bloat are both currently invisible to the author).

## Open & hazards
- Archie-a09d — desktop-lane QA quarantine: native fs/dialog flows (add-media, project-binding, portable-zip-open) are logic-tested via the fs-seam but never smoke-tested in a packaged Tauri build; still open.
- Archie-623e — native folder as canonical desktop store: code (Phases 1-6) is in the tree at authoring's `resident-store.ts`, but unverified end-to-end (blocked on Archie-9ece, the packaged-run verification, also open).
- Worker-pool fallback is silent by design (`bakeFallbackCount()` is the only witness) — a broken worker path degrades to slow-but-looks-healthy, not to a visible error; don't remove the counter or the CI worker-smoke gate.
- `apps/studio/e2e/playwright.config.ts` defaults to port 5198 with `reuseExistingServer: !CI`, same shared-port shape as [[viewer-e2e-shared-port]] — `STUDIO_E2E_PORT` exists precisely so concurrent agents don't drive each other's stale build.

- Review 2026-09-05 → UndoWire owns action grouping and edits the visible revision; save status names its destination; sampled contrast and title geometry pass browser checks. Evidence: `ledgers/IMPLEMENT-review-2026-09-05.md`; contracts: `ledgers/DESIGN-review-modules-2026-09-05.md`.

- README simplification 2026-09-05 → App introduction links to current capabilities and verification instead of the removed root status section. Evidence: `apps/studio/README.md`.

````

## publishing

````markdown
---
paths:
  - "packages/render-core/src/publish/**"
  - "apps/studio/src/dzi-*.ts"
  - "apps/studio/src/bake-*.ts"
  - "apps/viewer/scripts/gen-published.mts"
  - "scripts/perf/publish*"
  - "scripts/perf/worker-smoke.mjs"
  - ".github/workflows/deploy.yml"
updated: 2026-09-05
---
# publishing
> *How does authored become published?*

`publishLibrary` (`packages/render-core/src/publish/site.ts:517`) is the ONE function that turns a
`Library` + log into a tree: collection.json/exhibits.json first, `archie.json` marker LAST as the
commit point (ADR-0020, generation hash keys viewer cache-busting). `apps/viewer/scripts/gen-published.mts`
is the disk-writing wrapper the Viewer's dev/deploy path calls; `.github/workflows/deploy.yml` is the
GH Pages sink. DZI tiling (`apps/studio/src/dzi-slicer.ts` + `dzi-slice-pool.ts`/`dzi-tile-worker.ts`)
and bake (`bake-async.ts`/`bake-worker.ts`) are the two worker-backed perf paths inside publish/ingest —
both fall back to a slow inline path **silently** on worker failure. The one metric that matters:
end-to-end wall-clock over a real library (`scripts/perf/publishrun.mjs`), not a single-image bench
  (that bench is ARCHIVAL-TIER ONLY — it never exercises the tier engine; don't cite it for web-tier
  numbers — Archie-e870).

## Binding rules
- [[perf-measure-the-flow]] — a primitive win (DZI tiling 19x/image) was 1.9-4.7x end-to-end because
  `publishLibrary` already fans out `mapLimit(exhibits, 6)`; worker pools must be sized by memory
  (`POOL_BYTE_BUDGET`), never per-call — a per-call pool at library scale silently destroyed itself
  and every object fell back to inline, still reporting a healthy publish.
- [[render-core-data-integrity]] — multi-file writes: content first, `archie.json` marker LAST is the
  commit point; a torn write must read as stale/refused, never as complete.
- [[bound-fetch-defaults]] — `publish/open.ts`'s `fetchArchieLibraryBytes` default must be
  `globalThis.fetch.bind(globalThis)`; Node tests can't see the unbound-receiver break, only
  `embed-smoke` in a real browser can.
- [[tauri-csp]] — `worker-src 'self' blob:` is load-bearing for `dzi-tile-worker.ts`/`bake-worker.ts`;
  both fallbacks are silent, so a CSP regression here reads as a healthy but 37x-slower publish.
- [[untrusted-archive-open-seam]] — the marker this hub writes is validated by exactly one module
  (`publish/open.ts`); don't grow a second decode-then-validate copy for a new consumer.

## Decisions
- (arch deepening P2-P4, no ticket) / 8341381 — marker version policy is ONE
  `classifyArchieMarker` that both gates adapt (verify-publish composes it, no third copy);
  `FileContent`/`collectFiles` moved to `publish/snapshot.ts` and republish-tree became a thin
  composition; `loadLibrary` is lossless on request (`preservePublishFields`); the video tier got a
  neutral contract (`video-profiles.ts`, one `pickTarget`/`unavailableReason`, `TILE_MIN_EDGE` one home).
- Archie-9b93 — gen-published tree is a UNION (merge-preserving); rm-everything regen deleted
  committed exhibits on every dev run and CI deploy — fixed, don't reintroduce full-wipe regen.
- Archie-3db4 — gen-published `--from` bakes the real deploy BASE (`published-base.js`), not the
  sample-data fixture's demo base, into user manifests.
- Archie-4b0a — quality-tier engine (archival/web) at the publish seam; web tier fenced on selector
  rescale into served pixel space / `1074795`.
- Archie-53e3 — incremental GitHub push: blob-sha delta against what GitHub already has, truncation
  degrades to full re-upload / `ec4c763`.
- Archie-e09d — self-replicating publish prototype: tree can carry its own viewer bundle (opt-in
  `getViewerBundle`) / `c2f1ade`.
- Archie-039e — BagIt-shaped deposit export with a fixity manifest, validated against `bagit-python`
  / `b0c73f4`.
- Archie-c85f — object-storage publish probe (rclone, two-pass marker-last ordering) / `d7ae26f`.
- Archie-19d7 — a published manifest may not reference an asset file the tree lacks; enforced as a
  CLOSING invariant over the finished manifest (`PublishResult.danglingRefs`), because the JSON-only
  recovery path writes no bytes and so cannot check its own output / 896a92f, 2c997fe
- Archie-fde8 — post-publish verification (`verify-publish.mjs` + `verify-publish-run.mts`, reads the
  tree back through the REAL render-core readers; 26/26 checks against the baked tree) / `7fbd87d`.
- Archie-c367 — one-flow export surface (probe recommendation, greyed-with-reason sinks, tier
  control, deposit bag) shipped / f63a90f (on `main`).
- Archie-c74e — 1,000-image acceptance PASSED: web tier fits GitHub at 63%, archival does not
  (549%); tile arithmetic exact; peak-RSS finding ticketed Archie-6a99 / 14b380d (harness and the
  ACCEPT-thousand-images ledger live on `main`, not this branch).

## Evidence
- `ledgers/PERF-image-pipeline-2026-07-24.md` — DZI tiling per-image 19x at shipped concurrency=48
  (a separate worker-pool path measures 37.8x, but concurrency is what ships); the
  dominant cost was the serial `await`, not CPU; end-to-end library figure is the one to report.
- `scripts/perf/worker-smoke.mjs` — proves the BUILT `dzi-tile-worker`/`bake-worker` boot in real
  Chromium; the bench's `@render/core` shim can't see the barrel's module-load-time DOMPurify hang.
- `.github/workflows/deploy.yml` (comment at the `deploy` job) — build/deploy are separate jobs
  because a build rerun after a transient Pages failure double-uploads the pages artifact and
  hard-fails (run 28698550063).

## Open & hazards
- Archie-6a99 (open, P2) — web-tier publish peaked at **16.9GB RSS** in the 1,000-image acceptance
  run: the per-exhibit fan-out inside `publishLibrary` is uncapped; found by c74e / 14b380d.

- Review 2026-09-05 → History pages precede indexes; note-only publishes change generation; Pages transport failures preserve successful push results; in-place publication remains nontransactional. Evidence: `ledgers/IMPLEMENT-review-2026-09-05.md`; contracts: `ledgers/DESIGN-review-modules-2026-09-05.md`.

````

## embed

````markdown
---
paths:
  - "packages/archie-viewer/**"
  - "recipes/**"
updated: 2026-09-05
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
  OSD eagerly (36→270.5KB gz was the regression, re-measured 2026-07-25 against a freshly
  injected leak); only `eagerGzKB` sees it, `entryGzKB`/`totalGzKB` moved <0.2KB on the same leak
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
- (arch deepening P7, no ticket) / 8341381 — `reading-marks.ts` DELETED: the package's only untested
  module, its DOM pairing + 12-frame retry gone by construction rather than covered. Reading
  collapsed to `reading-layer.ts`, a per-annotation `styleFor` channel replaced the overlay's own
  styling, `openNote(id)` became one contract, and the codec returns the resource IRI with one
  fragment parser in core.
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

- Review 2026-09-05 → Resource policy covers all media sinks; Reading/untimed AV arrival works; target/policy changes cancel lazy and pending mounts through teardown. Evidence: `ledgers/IMPLEMENT-review-2026-09-05.md`; contracts: `ledgers/DESIGN-review-modules-2026-09-05.md`.

````

## desktop

````markdown
---
paths:
  - "src-tauri/**"
  - "apps/studio/src/tauri-fs.ts"
  - "apps/studio/src/resident-store.ts"
  - "apps/studio/src/folder-native.ts"
  - "packages/render-core/src/fs/tauri.ts"
  - "packages/render-core/src/fs/tauri.test.ts"
  - "docs/plans/native-canonical-store.md"
  - "docs/plans/folder-av-originals.md"
updated: 2026-09-05
---
# desktop
> *How is the desktop app different?*

The Tauri v2 shell (`src-tauri/`) bundles Studio+Viewer into a native window; the main app-side
Tauri touchpoint is `apps/studio/src/tauri-fs.ts` (fs seam); two more `isTauri()`-gated dynamic-import
sites exist — external links (`Publish.svelte`) and GH-Pages deploy (`deploy/deploy-flows.svelte.ts`) (dynamic-imports `@tauri-apps/*`, gated by
`isTauri()`, so the web build is byte-identical). Three things a desktop task must know: the
capability manifest (`src-tauri/capabilities/default.json`) is a second, independent failure
surface vitest cannot see; the working store is native-folder-canonical now, code-complete but
UNVERIFIED packaged (Archie-9ece); and `scripts/check-tauri-capabilities.mjs` (`pnpm
capabilities:check`, CI's unit-scripts job) is the one gate that catches the class that has bitten
twice already.

## Binding rules
- [[tauri-csp]] — CSP must keep `script-src 'unsafe-eval'` (PixiJS shader compile) and
  `worker-src 'self' blob:` (both Annotorious AND Archie's own dzi/bake workers — the second one
  fails SILENTLY, re-freezing import UI with no visible error); `img-src`/`media-src`/`connect-src`
  need `https:` for remote IIIF, but native fetch (below) is the fallback for CORS/redirect hosts.
- [[tauri-fs-seam]] — `TauriFilesystem` must re-earn what browser handle APIs give free: atomic
  commit via same-dir temp-then-rename in `close()`, and `assertSafeName` blocking `..`/`/` traversal
  on every name-join (an untrusted exhibit slug from a `.archie.zip` is the concrete threat).

## Decisions
- (arch deepening P4 + P9, no ticket) / 8341381 — the desktop ffmpeg sidecar is CONNECTED
  (`video-sidecar-bridge.ts`: temp-file handoff, `$APPDATA` scope, no new capability grant), and
  `github.rs` split into 4 modules with a tested `PollIo` poll loop. The gate caught Tauri 2's
  `__cmd__` macro-path break (fixed via sibling re-exports) — a module split here is never a pure
  refactor, the macro path is part of the contract.
- Archie-91e7 — capability manifest omitted `fs:allow-rename`; **every desktop write failed at its
  commit point**, 100% of authored work lost with the UI showing "Retry save" / 25e6d67
- Archie-7b48 — scope globs don't match dot-led path components (`.bake-schema`,
  `.archie-cache/`); asset saves rejected AFTER bytes landed, misreported as "free some space" / 891e6f7
- Archie-be3a — `http:default` cleartext `http://**` grant removed (merged to main 2c26708); native-http
  bridge is `https://**` only, refusal falls back cleanly to the webview path / 7da8734
- Archie-2139 — "Open my site" and every external link were silently dead (opener scope covered
  only the login URL); `openExternal` now pins hostnames itself, since the capability glob can't / 4730681 (glob), 6f3630d (the pinning itself)
- Archie-fada — remote images + IIIF `info.json` now route through the native-http bridge on
  desktop (previously AV-only); tiles deliberately stay webview-fetched (per-tile IPC not worth it) / 3c9a70f
- Archie-623e — native folder is becoming the canonical desktop store (OPFS demoted to web-only);
  **still OPEN**, all 6 phases code-landed (`68e5041` phase 1, `8140bc4` phases 2-6) but blocked on packaged proof, not on code

## Evidence
- `docs/plans/native-canonical-store.md` §"a09d packaged verification" — 9-row checklist (the ticket's own "7" undercounts the primary table), every row
  code-complete and unit-proven, every row still `☐ pending build`; this is the honest state, not
  the ledger below.
- `scripts/lib/tauri-capabilities.test.mjs` — the gate born from Archie-91e7/7b48 is TWO audits
  (permissions: is the command granted; scope: may it touch this path) because the manifest is
  wrong in two structurally different ways — audit 1 is blind to audit 2's class by construction.
- `ledgers/TEND-EXPLORE-tauri-2026-07-20.md` — dated exploration; **its L1/L2 "OPFS still canonical"
  finding is STALE** (fixed by Archie-623e phases 2-6 since). Its Flatpak findings (keyring D-Bus,
  metainfo screenshots) were fixed same week (Archie-18b4, Archie-a53c, merged `1cc1ee8`) — cite those tickets, not this file, for current truth.

## Open & hazards
- `src-tauri/README.md:44-48` still calls asset-protocol/`convertFileSrc` "the real remaining
  work" / "highest-risk item" — **doc is stale**, Phase 4 (`convertFileSrc` for AV, `1c5f813`)
  shipped. Don't cite the README for current state; cite `docs/plans/native-canonical-store.md`.
- Archie-9ece (open, blocks Archie-623e) — nothing in the 9-row checklist may be claimed "done" on
  vitest/typecheck alone; each rides the packaged native-build smoke.
- Flatpak "stay signed in" (keyring/Secret Service D-Bus) and the single-instance focus behavior
  are still packaged-only claims — same a09d dependency, not yet independently ticketed as stale.
- A new `TauriFsBridge` method is invisible to unit tests until `pnpm capabilities:check` runs it
  through both audits — the bridge interface is the derivation source, so an unmapped method fails
  loudly instead of shipping a silent data-loss bug a third time.

- Review 2026-09-05 → Current offline packaged build and isolated native boot persist a valid six-exhibit library; full native import/edit/publish remains unverified. Evidence: `ledgers/IMPLEMENT-review-2026-09-05.md`.

````