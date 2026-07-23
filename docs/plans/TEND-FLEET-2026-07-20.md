# TEND fleet plan — 2026-07-20

Executes the 26 verified tickets on the six tend maps (`sd list --label wayfinder:map`, the six
`tend:` epics). Every ticket was adversarially verified (workflow `wf_19aab265-c48`); every lane
below had its file territory **measured** by an audit workflow (`wf_0c917f9c-031`, results mirrored
in `/tmp/tend-reports/territory.json`) — lanes marked parallel share **zero** files. Grill verdicts
2026-07-20 are recorded on the maps' Decisions-so-far.

Shape: **Phase 0 (human gate) → Phase 1: 10 parallel lanes → sequential merge train → Phase 2: 4
parallel lanes → Phase 3: one spine change.**

## Dispatch protocol (per lane — the proven fleet recipe, reuse verbatim)

- Claim first: `sd update <ids> --assignee micah --status in_progress`.
- One worktree agent per lane. Brief bakes in **Step 0: `git checkout -B wf/<lane> <EXPLICIT SHA>`**
  — pin the sha printed by `git rev-parse main` at dispatch time; worktrees spawn stale, and a
  concurrent session moves HEAD (it landed `f0787d2` mid-planning). Then `pnpm install --prefer-offline`.
- Never touch `.seeds/`, `HANDOFF.md`, `ISSUES.md`. `grep -a` always (NUL bytes recur). Worktree LSP
  diagnostics in the main session are noise; gates are authoritative.
- **Single-writer rules** (measured collisions): `README.md` → repo-hygiene lane only ·
  `checks.yml`/root `package.json` → toolchain-pipeline lane only · `pnpm-lock.yaml` → viewer-truth
  is the ONLY Phase-1 lane allowed to add a dependency (jsdom or happy-dom for the dialog test).
- Gates per app (run in-lane AND on the merged tree): studio = vitest + `pnpm typecheck` +
  svelte-check (if .svelte touched) + e2e `--config e2e/playwright.config.ts` when publish/App UI
  moved; viewer = vitest + `astro sync` **then** `check:svelte` (new gate, `f0787d2`) + astro check +
  build; packages = per-package vitest + tsc. Browser-verify anything visual (run-app skill, spare
  port, Playwright-from-/tmp createRequire) — it has caught real bugs twice.
- Deliver: branch + sha + EXACT gate counts. **No merging from inside a worktree** (self-merges lie
  "Already up to date"); merges happen sequentially from the main checkout only.
- Review: one code-reviewer subagent per code branch, read-only detached worktree
  (`git worktree add --detach /tmp/review-<lane> <sha>`), re-runs gates itself, hunts same-class
  misses + crash-window walks. REQUEST-CHANGES → SendMessage the impl agent → reviewer verifies the
  delta. Config/docs lanes (flatpak-pack, repo-hygiene) are reviewed by the main session directly.

## Phase 0 — human gates (run any time, block nothing in Phase 1)

- **Archie-a7a7** (studio rev-log disposition, `wayfinder:grilling`): ENACT vs PARK+CUT is Micah's
  call — grill in the main session. If ENACT → new Phase-3 lane; if CUT → a Phase-2 cut lane.
- **Archie-5323** (authorship modeling) stays parked, natively blocked by Archie-3452.

## Phase 1 — 10 parallel lanes (all pinned to the same base sha)

| # | Lane | Tickets | Territory (measured) | Notes |
|---|------|---------|----------------------|-------|
| 1 | embed-a11y | 9413, 6f25 | render-mount: read-overlay, frame-overlay (+their tests); archie-viewer: reader.ts | aria-labels via setAttribute only; browser-verify keyboard on live OSD (recipes/example.html) |
| 2 | embed-deeplinks | 69a7, a9f4 | render-mount: read-mount(+test); archie-viewer: element.ts, target-resolve, av-player (+tests) | fitRegion goes on BOTH surface implementers; needs `applyFitBounds` import; no auto-play |
| 3 | viewer-routes | d93a | `[slug].astro` ONLY | data table must live INSIDE getStaticPaths (Astro prerender constraint documented in-file) |
| 4 | viewer-truth | a2b9, 81fa | published.ts, ViewerShell.svelte, published.test.ts + NEW dialog-a11y.test.ts, viewer package.json, pnpm-lock | sole dep-installer of Phase 1 |
| 5 | rc-wadm | 3452 | render-core spine/wadm/session + 17 files incl. golden snapshots | byte-golden updates are DELIBERATE; suppress creator for synthetic session ids; carry sentinels per data-integrity rule |
| 6 | rc-transcript | bd0a | av/transcript.ts(+test), render-core index.ts | export the pure function only; no Studio UI |
| 7 | publish-surface | b53d, 2139 | deploy/types, deploy-flows(+test), publish-machine, Publish.svelte(+test), capabilities/default.json | capability change needs tauri build to take effect — packaged verify rides a09d; don't touch CSP |
| 8 | flatpak-pack | 18b4, a53c | flatpak yml + metainfo.xml | manifest-only; NO flatpak build here; packaged verify rides a09d |
| 9 | toolchain-pipeline | 9140, b975, e129, 9925, 676f | scripts/* + NEW scripts/lib/driver.mjs + scale-check.mjs, checks.yml, root package.json, bundle-size.json | internal order: consolidate scripts → gates → CI wiring; baseline refreshed again at merge time |
| 10 | repo-hygiene | e8ef, 441b | qa/ + README.md + NEW docs/guide/* | **LANDMINE: qa/hooks/ also carries the LFS hooks (Issue 8)** — take the surgical path: remove only the pre-commit feature-ledger hook + its install line; LFS hooks stay working |

## Phase 1 merge train (sequential, main checkout, `--no-ff`, gates on the merged tree each step)

1. **flatpak-pack** (config-only, zero gate surface)
2. **repo-hygiene** (verify LFS hooks still fire post-merge: `git lfs env` + a checkout smoke)
3. **rc-transcript** (render-core vitest)
4. **rc-wadm** (render-core vitest+tsc; ALSO viewer vitest — heads-embed shape pins)
5. **embed-a11y** (render-mount + archie-viewer gates)
6. **embed-deeplinks** (same two packages re-gated; same-package semantic merge — one design, not two interleaved)
7. **viewer-routes** (viewer build + vitest; check all 7 slugs build, sitemap parity)
8. **viewer-truth** (viewer gates incl. new jsdom test; lockfile lands here)
9. **publish-surface** (studio vitest + typecheck + svelte-check + publish e2e/browser-verify)
10. **toolchain-pipeline LAST** — re-measure `docs/bundle-size.json` against the FULLY merged tree
    (the whole train changed app code), then verify the ratchet + dispatch job on that tree.

After step 10: `sd close` each ticket with evidence-rich reasons, gist per map (Decisions-so-far),
delete merged `wf/*` branches, print the post-train sha — Phase 2's base pin.

## Phase 2 — 4 parallel lanes (base = post-train sha; deps already wired in seeds)

| Lane | Ticket | Unblocked by | Territory |
|------|--------|--------------|-----------|
| localstorage-primitive | 3148 | b53d merged | 6 studio modules + NEW persisted.ts(+test); App.svelte stays untouched (Issue 18 territory) |
| unlisted-lever | 77b2 | d93a merged | render-core exhibits/merge, viewer og-image/sitemap/Gallery/gen-published, exhibits.json |
| asset-store-split | cf93 | — | store.ts + NEW asset-store.ts(+test); re-export for compat |
| native-fetch-images | fada | — | tauri-fs, ingest-flows, App.svelte, AvEditor, mount.ts, Canvas.svelte + 2 new tests — **the hot-file lane; expect conflicts with the concurrent session on App.svelte/ingest-flows; resolve semantically** |

All four are measured-disjoint from each other. Merge order: asset-store-split → localstorage-primitive
→ unlisted-lever → native-fetch-images (hot-file lane last, freshest base).

## Phase 3 — the spine (solo)

**Archie-623e** native canonical desktop store. Blocked (natively, in seeds) by cf93 + fada. The
plan doc (`docs/plans/native-canonical-store.md`) is authored via /writing-plans DURING Phases 1–2 —
it must subsume pending task #5 (folder-AV, `docs/plans/folder-av-originals.md`) or explicitly
separate it with a reason. Multi-phase execution per that plan: migration sentinel-guarded,
atomic temp-then-rename everywhere (tauri-fs-seam rule), packaged-app verification mandatory.

## Standing landmines

- Working tree is DIRTY with the concurrent session's uncommitted work (og-image.ts,
  exhibits.json, screenshots) — worktrees see only committed state; reconcile at merge if it lands.
- `git branch --show-current` before EVERY merge/commit (shared HEAD).
- Test counts vary a few units between environments; the reviewer's relative accounting decides.
- Idle notifications precede reports; nudge with the specific ask, don't re-brief.
