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

Select the gate that exercises the changed behavior. Read its output before reporting results.
Type checking, browser interaction, and artifact inspection answer different questions.

## Claim → gate

| claim | gate | caveat |
| --- | --- | --- |
| clicks work in the embed | `recipes/smoke.mjs` (real Chromium) | keyboard Enter / synthetic `.click()` pass even when OSD's overlay wrapper swallows a real click — [[osd-overlay-wrapper]] |
| an island's `.svelte` script typechecks | per-app `svelte-check` (`pnpm --filter @archie/studio run check`, viewer's `check:svelte`) | `tsc`/`astro check` never parse `.svelte` script bodies — [[two-typescript-compilers]] |
| `.ts` strictness in apps/studio | `pnpm typecheck` (native tsc, explicit path) | svelte-check relaxes `exactOptionalPropertyTypes` — [[two-typescript-compilers]] |
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

- [[two-typescript-compilers]] — compiler selection, Svelte checks, and prop wiring.
- [[a-green-run-is-one-sample]] — reliability needs repeated samples for timing-sensitive checks.
- [[post-review-fixes-are-unreviewed]] — review fixes and reconcile the actual assertion counts.
- [[drive-must-not-recreate-the-thing-under-test]] — preserve the state a transition check exercises.
- [[playwright-count-does-not-wait]] — wait for expected elements before counting them.
- [[playwright-emulation-and-scroll-traps]] — check that emulation and input reached the browser.
- [[viewer-e2e-shared-port]] — give concurrent app checks separate ports.
- [[shared-worktree-agent-collisions]] — protect preexisting edits during temporary test injections.

## Evidence and limits

- `.github/workflows/checks.yml` defines the required CI jobs. Inspect that file for the live set.
- `docs/CAPABILITIES.md` records delivery limits and the packaged desktop verification boundary.
- Review 2026-09-05 → Final gate results and limitations are recorded in `ledgers/IMPLEMENT-review-2026-09-05.md`.
- Documentation refresh 2026-09-05 → Guide checks and rule-loading validation are recorded in `ledgers/DOCS-refresh-2026-09-05.md`.
- Earlier gate failures and measurements: [archived hub](../ledgers/DOCS-hubs-before-2026-09-05.md#verification).
