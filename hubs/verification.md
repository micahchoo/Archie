---
scope:
  - "recipes/**"
  - "apps/viewer/e2e/**"
  - "apps/studio/e2e/**"
  - ".github/workflows/**"
  - "scripts/doclint.mjs"
  - "scripts/perf/**"
  - "scripts/export-fidelity.mjs"
  - "scripts/export-fidelity.ts"
  - "scripts/export-fidelity.html"
updated: 2026-07-28
---
# verification
> *how do I prove a change works?*

This territory is every gate that turns "I believe it" into "I measured it": the CI jobs in
`.github/workflows/checks.yml`, the perf ratchets under `scripts/perf/`, the browser-driven
recipes/e2e suites, and `scripts/doclint.mjs` for the knowledge layer itself. The one rule that
cuts across all of them: **a gate answers the question it was asked, and "did this actually
exercise anything?" is a question no gate asks itself** ([[svelte-no-typecheck-net]]). Pick your
claim from the table below before reaching for a test framework at random.

## Claim → gate

| claim | gate | caveat |
| --- | --- | --- |
| clicks work in the embed | `recipes/smoke.mjs` (real Chromium) | keyboard Enter / synthetic `.click()` pass even when OSD's overlay wrapper swallows a real click — [[osd-overlay-wrapper]] |
| an island's `.svelte` script typechecks | per-app `svelte-check` (`pnpm --filter @archie/studio run check`, viewer's `check:svelte`) | `tsc`/`astro check` never parse `.svelte` script bodies — [[svelte-no-typecheck-net]] |
| `.ts` strictness in apps/studio | `pnpm typecheck` (native tsc, explicit path) | svelte-check relaxes `exactOptionalPropertyTypes` — [[studio-ts-typecheck-gate]], [[two-typescript-compilers]] |
| embed bundle kept OSD off the page-load path | `eagerGzKB` in `packages/archie-viewer/build.mjs --check` | `entryGzKB`/`totalGzKB` moved Δ+0KB while a real leak grew eager 36→270.5KB — [[archie-viewer-eager-closure]] |
| publish got faster | `scripts/perf/publishrun.mjs` (end-to-end, real Chromium, no `--check`/budget — read the printed numbers) | a primitive bench misleads: tiling alone measured 19–37x, end-to-end 1.9–4.7x — [[perf-measure-the-flow]] |
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
- Archie-c314 — `build.mjs`'s baseline write gated behind `--update`; a plain `pnpm -r build` was silently rewriting the eagerGzKB ratchet's own reference point.
- Archie-f90d — `CONTRACTED_LABELS` completeness check restored to 40/40 after a post-review splice silently dropped it to 35/35 with every gate still green.
- Archie-64ef — `recipes/smoke.mjs` proven the only gate that catches OSD's overlay-wrapper click-swallow; keyboard/synthetic-click probes pass regardless.
- Archie-4635 — svelte-check (1464 files, 0/0) proven blind to unbound prop wiring; only a driven browser click caught the dead Cancel button.
- Archie-656a — a TS2379 violation passed vitest (542 green) and svelte-check (0/0); only `pnpm typecheck` caught it.
- Archie-676f — scale-check made `workflow_dispatch`-only by design: a multi-minute real-ingest drill must never gate an ordinary PR.
- Archie-027c — export-fidelity gate shipped and wired as CI job `export-fidelity` (~2s, 12/12 unchanged runs, 9/9 checks red-greened); found `verify-publish.mjs`'s heads line is `check(true, …)` — a report, not an assertion: a 0-of-9-heads tree passed it exit 0 / 35ef836
- Archie-b5c2 — FSA real-folder autosave measured 1.2–2.7 ms median vs the 800 ms debounce (within 0.5 ms of OPFS; 125 samples/config, `.crswap` temp-swap proven, tmpfs trap dodged — check the device of BOTH sides); web folder-canonical needs NO cadence change; `scripts/perf/fsafolderrun.mjs` is the headed-Xvfb runner (headless can only reach OPFS, which never exercises the temp-swap path) / 3423c92, ledger `ledgers/PERF-fsa-autosave-2026-07-28.md`

## Evidence
- `.github/workflows/checks.yml` — enumerates the live gate set: typecheck, unit-scripts, doclint, test, astro-check, svelte-check, gh-pages-build, archie-viewer-artifact, embed-smoke, perf-ratchets, e2e.
- `recipes/smoke.mjs` header — documents its own two silent-failure preconditions (unbuilt fixtures, stale root `dist/`) and one still-unattributed flake (2026-07-26).

## Open & hazards
- doclint wired into CI 2026-07-27 (job `doclint`). All 10 checks proven red-green same day; the allowlist (scripts/doclint-allow.json) carried ticket ids for its deliberate deferrals; both (Archie-e149 ledger migration, Archie-1f60 accretion rewrite) resolved later the same day and their allowlist entries are empty again.
- Red-green discipline: inject the defect, confirm it fails for the reason you intended (not a precondition failure), then confirm clean — never trust an assertion you haven't watched fail.
- Before citing a count or "N/N" figure from any of the above gates, reconcile it against a number the tool itself printed — see [[post-review-fixes-are-unreviewed]]'s counting traps.
