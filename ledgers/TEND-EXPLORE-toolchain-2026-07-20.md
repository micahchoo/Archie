# TEND EXPLORE — toolchain & docs pipeline — 2026-07-20

Subsystem: `scripts/`, `qa/`, `.github/workflows/`, `recipes/`, docs generation
(`docs/screenshots/auto`, `docs/showroom`), launchers (`start.*`), workspace wiring
(`pnpm-workspace.yaml`, `tsconfig.base.json`), bake outputs (`dist/`, `gh-pages-dist/`),
`skills-lock.json`. App/package source is context only.

Baseline: `main`. Node v24.14.0, pnpm 11.6.0 local. Read-only pass; evidence is static
(scripts + CI YAML), no builds/screenshots/e2e run.

## Method correction logged (own discipline)

First `Read` of `.github/workflows/checks.yml` returned a **stale 167-line / 7-job** view;
`wc -l` + direct `grep` proved the canonical file is **249 lines / 9 jobs** (adds
`archie-viewer-artifact` @145 and `embed-smoke` @185). Caught by cross-checking a subagent's
line numbers against my own. All CI claims below are re-verified against the 249-line file.
This killed a would-be false issue ("orphan `--check` gates never in CI") — see Decided-not-issue.

## Decided-NOT-issue (guards that held; do not raise)

- **CI pins pnpm 10 while local is 11** — DELIBERATE. `ledgers/GATE.md:4`: "new checks job will
  match `deploy.yml`, not this machine." lockfileVersion 9.0 is read by both. Not a drift.
- **`sync-dist:check` + embed `bundle:check` "run by nothing"** — now WIRED, `checks.yml:169-175`
  (`archie-viewer-artifact` job), with a documented rationale (`checks.yml:139-144`) for why they
  are deliberately NOT rebuild-and-diff freshness gates (batch-catch-up cadence; a freshness gate
  would have failed 9/11 historical commits). Matches decided Issue 24.
- **`recipes/smoke.mjs`** — WIRED, `checks.yml:185-212` (`embed-smoke`): builds the embed bundle
  from source + drives it in Chromium. A real gate.
- **`qa/sync-csv.mjs` staleness** — pre-commit hook installed here (`core.hooksPath=qa/hooks`),
  `features.csv` in sync. Working on this clone.

## Rung ledger

### L1 Purpose (why it exists)

**Friction**
- README presents a `docs/guide/` "user guide" as the primary onboarding walkthrough in THREE
  places (`README.md:11`, `:108`, `:364`) — **the directory does not exist**; the guide is
  generated into `.scratch/guide/`, which `git check-ignore .scratch/guide` confirms is gitignored
  (can never reach a clone). Flagship onboarding link 404s for every reader. → ISSUE 3.
- `scripts/import-voynich.mjs:1-6` — header: "DEPRECATED … do not run … will OVERWRITE the
  hand-authored seed." A retired one-time importer living in `scripts/` (live-tooling dir); git
  history already is the "historical record" it claims to preserve. → ISSUE 5.

**Surplus**
- `qa/` is a full autonomous-loop ledger subsystem (gate math, dedupe, dry-streak convergence,
  CSV mirror, installed git hook) whose driving `/goal` loop has **already terminated**:
  `qa/state.json` = `{turn:11, discoveryDryStreak:2, lastFeatureCount:46}` — the exit predicate's
  fixed point (`gate.mjs:27`, `PLAN.md:41-48`) is reached. Machinery modeled for an ongoing loop
  now guards a static 46-row snapshot. → DIRECTION 1.

### L2 Behavior (what it does)

**Friction**
- `verify-marginalia.mjs:16-17` and `verify-readings-rail.mjs:17-18` hardcode WRONG base URLs
  (`http://localhost:5173/` with no `/studio/`; `:4321` with no `/viewer`) — studio dev serves
  under base `/studio/` (302) and the viewer routes resolve under `/viewer/`. `capture-screenshots.mjs`
  uses the CORRECT `:5173/studio/`. The two verify harnesses are "parked, fails until…"
  (`.scratch/plans/IMPROVEMENT-WORKLIST.md:59,71,86`). → ISSUE 1.
- Keystone checks downgraded to non-gating: `verify-readings-rail.mjs:132-136` computes `drewIntoPen`
  (the headline "pen independence" behavior) then only WARNs — the script "passes" without verifying
  its own point. → ISSUE 1.
- `capture-screenshots.mjs` never fails: every catch → `record(...,"skipped")` (`:99,277,313,349,515,529`),
  `main` (`:629-643`) exits 0 even at 100% skipped. A selector/route rename yields stale/blank
  README images with a green run. → ISSUE 2.

**Surplus**
- `docs/screenshots/auto/manifest.json` — a structured 23-shot run-log written by
  `capture-screenshots.mjs:79-83` and read by **nothing** (grep hits for `manifest.json` are all the
  unrelated published-IIIF manifest). Output written, never read. → folded into ISSUE 2 / fog.
- `seed-fixture.mjs` — a production-grade 70-object large-library perf harness (discovers/boots the
  dev server `:78-95`, `--fresh`, idempotent) whose only consumer is a human eyeballing `.scratch/`.
  No automated scale/perf gate reads it. → DIRECTION 2.

### L3 Structure (how organized)

**Friction**
- The "drive the app by seeded fixtures + act on canvas" concern is implemented **4 unshared ways**
  outside tests — `capture-screenshots.mjs`, `seed-fixture.mjs`, `verify-marginalia.mjs`,
  `verify-readings-rail.mjs` — plus the CI e2e suite (`apps/studio/e2e/`) as a 5th. `assert/settle/launch`
  is copy-pasted verbatim (`verify-marginalia.mjs:21-34` ≡ `verify-readings-rail.mjs:22-34`); the literal
  selector `button.plate:not(.add)` recurs in all four (`capture-screenshots.mjs:301`,
  `seed-fixture.mjs:176`, `verify-marginalia.mjs:45`, `verify-readings-rail.mjs:64`). No common module;
  each drifts independently and two have already rotted. → ISSUE 1.

**Surplus**
- `scripts/import-voynich.mjs` — a script nothing would miss (deprecated, destructive). → ISSUE 5.
- (Weak) two showroom verifiers (`docs/showroom/verify.mjs` real-parser CSV check;
  `docs/showroom/sync-screenshots.sh` rename-map copier) are manual and separate from the main
  screenshot pipeline — but showroom-stranded is decided Issue 9. Fog only.

### L4 Implementation (how built)

**Friction**
- Zero tests on every load-bearing generator/verifier: `capture-screenshots.mjs` (645 lines),
  `seed-fixture.mjs` (275), `verify-*` — none export, none covered by any `*.test.*`. No
  pixel/dimension/readback check anywhere (`shoot` `:81` `fullPage:false`, never validated). → ISSUE 2.
- Root apps-dist size ratchet is orphaned: `scripts/bundle-size.mjs --check` (`package.json:15`
  `bundle:check`) fails on >max(10%,10KB) gz growth against `docs/bundle-size.json`, but is DISTINCT
  from the archie-viewer package `bundle:check` (`build.mjs --check`) that CI runs, and grep confirms
  the root script is in NO workflow. Baseline `measuredAt 2026-06-22` (studio 443.9KB) predates the
  lazy-Canvas 340KB win. A studio/viewer bundle regression ships silently. → ISSUE 4.

**Surplus**
- `verify-readings-rail.mjs:38-50` `maxMarkFillOpacity` — defined, **never called** (comment
  `:85-87` says the probe was abandoned as not-DOM-observable under Annotorious-3 WebGL). Dead code /
  computed concept dropped. → ISSUE 1 (rider).
- Root `bundle-size.mjs` also measures a renderer-floor + read-only-mount table (`:31-43`) written to
  `docs/bundle-size.json` `rows[]` — recorded, consumed by no gate (only `appBundles` feeds `--check`).
  Persisted-then-dropped numbers. → context for ISSUE 4.

## Issues → see final JSON. Directions → see final JSON. Fog captured in JSON.

## Adversarial verification — 2026-07-20 (workflow wf_19aab265-c48; one independent skeptic per finding)

- issues[0] "Four unshared Playwright 'drive-and-shoot' harnesses; two (verify-marginalia, verify-readings-rail) are silently broken and non-gating" — corrected (Strong) → seeds Archie-9140. Corrections: IMPROVEMENT-WORKLIST.md marks only verify-marginalia.mjs as "(parked, fails until re-wired)" — at line 71 only. Line 59 is the original shipped-harness note for verify-marginalia; line 86 records verify-readings-rail as "9/9" passing (awaiting the B3 human comprehension gate), not parked. So "two are marked parked at :59,71,86" is wrong: one script is documented-parked; the other's brokenness is inferred (correctly) from its hardcoded :5173/ base lacking the mandatory /studio/ prefix plus the non-gating WARN. Minor: capture-screenshots.mjs uses the plate selector at 4 sites (301, 332, 367, 498), not just :301.
- issues[1] "capture-screenshots.mjs feeds the README but never fails and never validates its output" — confirmed (Strong) → seeds Archie-b975. Corrections: Minor cite errors only: manifest.json is written at capture-screenshots.mjs:639 (in main), not ":79-83" — that range is shoot(), which writes the PNG and pushes the manifest entry. Also the README embeds a fourth auto shot (viewer-readings.desktop.png at README.md:98) beyond the three lines cited (5, 92, 104).
- issues[2] "README links a docs/guide/ user guide that does not exist; the real guide is generated into gitignored .scratch/guide/" — confirmed (Strong) → seeds Archie-441b. Corrections: Minor wording only: the guide is not "generated" by any script — no build step writes .scratch/guide/ (grep across scripts/, package.json finds nothing); it is authored markdown sitting in the scratch dir. Its image links (`../screenshots/auto/*.png`) resolve correctly only from docs/guide/, confirming it was written to live there but never promoted.
- issues[3] "Root apps-dist size ratchet (bundle:check) is orphaned with a month-stale baseline, while its embed-bundle twin got wired into CI" — confirmed (Strong) → seeds Archie-9925.
- issues[4] "import-voynich.mjs is a deprecated, destructive dead script kept in scripts/" — corrected (Worth exploring) → seeds Archie-e129. Corrections: 1) The overwrite hazard is stale: apps/viewer/src/voynich.ts and apps/studio/src/voynich.ts do not exist — the hand-authored seed now lives at apps/viewer/fixtures/voynich.ts. Re-running the script writes NEW dead src/voynich.ts files and copies images into public/voynich/ (pollution/confusion), it does NOT overwrite the current live seed, so "corrupts apps/*/src/voynich.ts" overstates the danger. 2) The ../anvil fixture path DOES resolve in this checkout (/mnt/.../Image/anvil/app/public/fixture/voynich-manuscript exists), so the script would actually execute. 3) Repo references are in ledgers/TEND-EXPLORE-toolchain-2026-07-20.md and tool metadata (.mulch, .understand-anything), not ".scratch planning notes".
- directions[0] "The qa/ /goal ledger harness has converged and terminated but still exists as live machinery + a per-commit hook" — confirmed (Strong) → seeds Archie-e885.
- directions[1] "seed-fixture.mjs is a production-grade large-library perf harness with no automated scale/perf gate consuming it" — confirmed (Strong) → seeds Archie-fd24.
