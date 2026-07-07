# HANDOFF — Archie

**Updated:** 2026-07-05 (graft session). **Branch:** `main`. Read `ISSUES.md` first — it's the live
backlog; this file is a snapshot of where things stand, not a task list.

## IN FLIGHT — publish-to-web BUILD (2026-07-05, graft session → build session)

Executing `docs/plans/PUBLISH-TO-WEB-PLAN.md` (committed on branch `worktree-publish-to-web`,
worktree `.claude/worktrees/publish-to-web`; plan reviewed+approved; Q-12/Q-13 minted in
docs/decisions/archie.md). Progress: **Waves 0–2 nearly done** — Task 1 types (`106dd23`),
Task 2 spike git2=YES (`eec8768`), Tasks 3–5 Tauri commands (`75a5620`,`7b034fd`,`681e3f0`)
+ review fixes (`c6ba97f`, poll deadline/async keyring/Debug redaction — gh_device_poll takes
expiresIn), Task 7 ensureRepo (`70a831e`), Task 6 gh_push_tree (`f72f0ba`, 13 cargo + ignored
push_live), Task 8 deployToPages orchestration (`7d71882`, factory createDeployFlows +
enablePagesFor wrapper), Task 9 sign-in/session (`a646760`, module-level exports,
deviceFlowAvailable fork-safe-false). Main merged post-Issue-11-close; post-merge suites green
(studio 226, cargo 13, tsc clean). **BUILD COMPLETE.** All 14 plan tasks done on `worktree-publish-to-web` (18 commits, `064af6f`..
`e9e9eec`, off main). Full stack: Rust device-flow/keyring/git2-push commands (src-tauri/src/
github.rs), deploy-flows.svelte.ts (session + deployToPages + checkRepoExists/listRepos/
recheckPages), Publish.svelte machine (publish-machine.svelte.ts, headless-tested), App.svelte
mount + PublishDialog chooser (flag deployToPages). Integration review PASS (all 15 deps sourced,
flow-map wired node-for-node, initialSession live, token-safe). **Automated acceptance GREEN**
(ledgers/DEPLOY-VERIFY.md): studio 270, render-core 737, cargo 13, tsc x2 exit 0, build clean.

**REMAINING = USER-GATED live acceptance** (can't be faked — needs device + GitHub account):
(1) register a GitHub OAuth App with Device Flow enabled, put its PUBLIC client id in
archie.config.json `githubOAuthClientId` (the value pasted in chat earlier was the client SECRET —
rotate it; device flow uses no secret); (2) packaged Tauri/Flatpak build (deploy is Rust-only);
(3) drive happy path → live URL <10min (kill criterion); (4) optional push_live closure. Full
steps in ledgers/DEPLOY-VERIFY.md. On live pass → merge worktree-publish-to-web.
KNOWN LIMITATION (v1 accept): same-session re-publish returns to intro not update-confirm (keys off
next-launch initialSession/remembered; keyring restore is the intended return path). IDE App.svelte
type errors are CLI-tsc-clean phantoms (svelte-no-typecheck-net.md). Concurrency lessons →
ledgers/HARVEST.md + memory. USER ITEMS: **client_id still needed — user pasted the client SECRET by
mistake (told to rotate; device flow needs no secret)**; optional `push_live` closure (Task 14).
CONCURRENCY LESSONS THIS WAVE: (1) reusing an Agent `name` → auto `-2` + crossed messages, use
distinct names (memory saved); (2) a subagent rebased the shared worktree under another active
agent — history rewrites in a shared worktree need a resync message to the co-located agent.
Rejected deploy-flows draft (RepoOption[]/allowExisting) was dropped; correct backing
(checkRepoExists→bool, listRepos→string[]) is Task 13's.

## DONE EARLIER THIS SESSION — /graft run (2026-07-05)

SECOND PASS (same day): /graft re-invoked on divergence 1 → pr-faq interview ran → **PRFAQ.md**
written at repo root; divergence 1 Status now **spec'd — PRFAQ.md**. Interview decisions (user):
customer = no-server scholar; announcement = "one click, yours"; auth = device-flow + PAT
fallback (+ fork client_id config slot); host = GitHub-only with git-remote/host-adapter seam;
**appetite = 3–4 weeks**; reach = Tauri full + browser guided-manual degraded path. Build order
+ cut-from-the-tail list in PRFAQ.md Appetite section. A build session starts from PRFAQ.md +
ledgers/PROBE-publish-to-web.md. PRFAQ.md is uncommitted (commit only when asked).

FIRST PASS: RUN COMPLETE. `DIVERGENCES.md` written (5 divergences; disposition table accounts for every
observation; handed-to-tend rows at the bottom). Top bet **publish-to-web** converged via
thin-slice probe → **verdict: pursue** (2026-07-05). Two probe runs, user-fired: v1 refuted
per-blob REST (secondary rate limit at ~500 blobs); v2 single-pack git push went **live in 0.6
min** vs a 10-min kill budget. Full handoff for the build session in
`ledgers/PROBE-publish-to-web.md` ("What the build session inherits": git2/gitoxide pack push in
src-tauri, PAT-paste vs device-flow client_id decision, keyring token storage, base-path rebuild,
flag `archie.deployToPages`). Probe branch `probe/publish-to-web` (3 commits, `54b2d42..4117631`,
isolated worktree) hands onward, never merges. Building is NOT graft's job — next session starts
from the ledger. Cleanup owed by user: delete `micahchoo/archie-pages-probe` on github.com.
DIVERGENCES.md + probe ledger + HARVEST.md updates are uncommitted on main's working tree (commit
only when user asks). Note: Directions 1–3 were verdicted *pursue* by a concurrent session
mid-run (`ea5fe8f`–`246550d`); DIVERGENCES.md reflects that.

## DONE — embed-autogrow shipped (DIVERGENCES.md #5, 2026-07-07)

**`e3766bc`** — ResizeObserver→postMessage in element.ts (reader view excluded: zoom surface,
feedback loop; convergence proven monotone), validated parent listener snippet in recipes/EMBED.md,
demo recipes/09-autogrow.html, ledger `ledgers/PROBE-autogrow.md` (kill-criterion boundary:
script-stripping hosts strip the listener too — fixed height remains their answer). Review-gated:
ship-breaker caught (rebuilt dist chunks were gitignored/untracked → force-added coherently in BOTH
tracked dist copies) + snippet clamp + src-leak discriminator fix. DIVERGENCES.md §5 status updated
(file stays uncommitted — graft session owns it). ALSO this session (post-Issue-11): rail fixes
`3c6523c` + `3238764` (ransom-note collapse; image-led tiles, position chip, auto-scroll,
content-visibility). Studio dev server restored on :5174 (evicted Atlasdraw's spillover vite; its
:5173 instance untouched).

## DONE — Issue 11 execution: scale & gallery plan fully shipped (2026-07-06)

**Issue 11 CLOSED** (`5706f19`) — all phases shipped review-gated; evidence `ledgers/SCALE.md`:
1.1 incremental autosave `1ca4733` · 1.2/1.3a lazy masters + list virtualization `9ac6218` ·
2 overview toolkit `21f95a6` · 3a images.json + matchesTitle `8374526` · 3b studio gallery
`eace2c0` · 3c viewer wall `a1227d6` · 4 viewer navigation `e272a0f` · seed fixture `57cbda8`
(`node scripts/seed-fixture.mjs`, profile `.scratch/seed-profile`) · Phase 1 empirically
verified vs seeded 70-object library (`739ec91`/`ebdb438`). New hazard rule:
`.claude/rules/svelte-no-typecheck-net.md` (`829a7ae`). **Manual remainder for the user:**
FSA folder-bind gesture (live incremental-autosave check); browser-verify lists in spikes
0003/0005; embed parity port (flagged follow-up); svelte-check adoption = Issue 12.

**NEW USER MANDATE (verbatim intent):** "Run spikes wherever there are gaps. Flesh the plan
document as needed. Implement review repeat." → autonomous execution loop, phase by phase:
spike gaps → update plan doc → implement phase → review (code-reviewer agent + tests) → next.
Commits per phase are part of the mandated loop (ISSUES.md Issue 11 Run-it prescribes ledger
`ledgers/SCALE.md` with commits). **Check `git branch --show-current` before every commit**
(concurrent-session hazard); pre-existing dirty files (.skill-invocation-log, a screenshot) are
NOT ours — leave out of commits.

**Spike plan (write results to docs/spikes/, then fold into plan doc):**
- S1 incremental folder autosave: map exactly what publishLibrary/writeTree/tileObject write;
  is anything content-addressed/skippable; design dirty-tracking (where the dirty set lives,
  how publishLibrary takes a scope). Anchors: binding-store.svelte.ts:176, publish-flows.svelte.ts:116-167.
- S2 exhibit-open cost + lazy masters: all consumers of assetUrls/thumbUrls (App.svelte:114-142);
  design masters-on-demand; overview list virtualization; canvas-mode: measure, don't assume.
  PLUS: how to seed a synthetic 2×30+1×10 library for verification (studio seed-data mechanism?).
- S3 (defer to Phase 3): image index schema + LibraryHome data needs.
- S4 (defer to Phase 2): marquee-vs-pan, multi-drag DnD design.

Tests: per-app `pnpm --filter <pkg> exec vitest run` (root binary fails rune tests). Node 22.

**Problem (user-confirmed):** both apps degrade past ~20 images — performance AND UX. Scale:
20+ Objects in one Exhibit AND 50+ Objects across the Library; both levels crowded.
Pain ranking: (1) finding in Studio, (2) organizing (one-at-a-time ops), (3) sluggishness,
(4) Viewer audience can't survey/jump a large set. No ISSUES.md entry exists — untracked.

**Decisions so far:**
- All four retrieval cues real (name search, visual survey, group membership, recency).
- **NO new grouping domain concept** — user challenged, agreed to drop. Finding = title search
  + sort (incl. recency) + denser grid. If chapters emerge later: IIIF Ranges (`structures`).
- **"Gallery" clarified:** user means photo-app-grade organizing tools on the within-Exhibit
  overview (glossary **Grid**), not the reserved library-level **Gallery** term.
- **Organizing kit = multi-select (ctrl/shift + marquee + select-all), bulk delete, multi-drag
  reorder, grid density control.** Bulk move-between-Exhibits deferred but must stay
  design-compatible. Ratings/flags rejected.

**Codebase facts (Explore agent, verified refs):**
- `apps/studio/src/ExhibitOverview.svelte` renders all Objects eagerly (:238 canvas, :304 list),
  no virtualization; has single-item DnD reorder (:128-163); comment :131 anticipates grouping.
- `App.svelte:114-142` mints blob URLs for every object's master+thumb at exhibit open.
- **Folder-bound autosave republishes the ENTIRE library per save** incl. DZI re-tiling:
  `binding-store.svelte.ts:176` → `publish-flows.svelte.ts:165`. Prime perf suspect.
- Viewer `read.ts:59-103` loads all objects + all annotations before first paint; Viewer
  `ObjectGrid.svelte:69-73` already has content-visibility virtualization (Studio doesn't).

- **Perf slate all confirmed** (user runs ALL modes: OPFS, folder-bound, Tauri; stutter at
  exhibit open + overview scroll + after saves): incremental folder autosave (dirty-tracking,
  never re-tile unchanged), lazy blob-URL minting, virtualize Studio overview
  (content-visibility like Viewer's ObjectGrid).
- **Viewer navigation = (a) filmstrip/jump surface + (b) position indicator ("14 of 32") +
  (d) richer grid landing.** No audience search (c rejected). Jump surface available in
  narrative mode too but collapsed by default (my default, user hasn't objected yet).

**Remaining branches:** (Q10, next) Library level at 50+ objects — LibraryHome is text-only
cards; recommend visual exhibit cards + cross-exhibit object search in Studio → Studio
search/sort placement specifics → synthesize plan; add ISSUES.md entry; ADR only if warranted.

## What shipped since the last handoff

The prior version of this file tracked the `<archie-viewer>` embeddable-viewer work session
(2026-06-21/22) as in-progress and uncommitted. That shipped to `main` in `c471b93` (v1.1) —
`packages/archie-viewer/` is a real tracked package, ADRs 0019-0022 are tracked, and the embed is
documented in `README.md`'s [Embed an exhibit](README.md#embed-an-exhibit) section and
`recipes/EMBED.md`.

Since then, a `tend` diagnosis pass (`ISSUES.md`, generated 2026-07-05) found and closed six issues:

- **Issue 1** — CI now runs typecheck/tests/`astro check` on every push (`ledgers/GATE.md`), not just
  deploy.
- **Issue 3** — tracked-artifact cleanup: the NUL byte in `apps/studio/src/App.svelte` that made grep
  silently report zero matches is gone; `--output`, stale lint dumps, and compile caches removed
  (`ledgers/ARTIFACTS.md`).
- **Issue 4** — the persistence-path silent-failure audit; save/binding/ingest failures now surface
  through the studio's toast layer instead of vanishing (`ledgers/SILENCE.md`).
- **Issue 5** — the untrusted-`.archie.zip`-open path, previously duplicated across three files, is
  now one seam (`packages/render-core/src/publish/open.ts`); studio's copy had silently skipped marker
  validation (`ledgers/CANON.md`).
- **Issue 6** — `iiif/presentation.ts` and `query/body.ts` got direct test coverage; that pass also
  surfaced and fixed a real bug (Canvas objects publishing with no width/height, violating IIIF
  Presentation 3 §5.3) (`ledgers/COVERAGE.md`).
- **Issue 7** — a negative-space matrix over the six ingest flows (IIIF manifest / folder / zip / CSV
  / WADM / transcript import) found and fixed 8 real gaps: transcript import silently no-op'd on
  unparseable input, a mid-flow exhibit switch could misdirect imports to the wrong exhibit, and four
  ingest vectors had no size cap (`ledgers/NEGSPACE.md`).
- **Issue 2** (this pass) — a claim-vs-reality diff over this file, `README.md`, and
  `docs/IMPLEMENTATION-STRATEGY.md`'s deferred-work registry; this rewrite is one of its resolutions
  (`ledgers/CLAIMS.md`).

## What's still open

Read `ISSUES.md` for the full, current list with evidence and run-it prompts. As of this writing
Issues 1–10 are all done (ledgers in `ledgers/`); still open:

- **Issue 11** (queued) — both apps degrade past ~20 images; grilled plan at
  `docs/plans/SCALE-GALLERY-PLAN.md`, execution mandate above.
- **Direction 1** (queued) — the collaboration/merge subsystem (`MergeReview.svelte`,
  `IdentityPrompt.svelte`, `spine/merge.ts`'s DAG-classification layer) is built and tested but mounted
  nowhere; `README.md`'s Collaboration feature claim is blocked on this direction's verdict.
- **Direction 2** (queued) — the annotation spine's version history (`mergeParents`, `lastEditor`) is
  written but has no display surface in either app.
- **Direction 3** (queued) — the `<archie-viewer>` element supports `target`/`offline`/`iiif-content`,
  but the Studio's embed-snippet generator only emits `src`.

## Key files

`ISSUES.md` (the live backlog) · `ledgers/` (one file per closed issue, with evidence) ·
`README.md` (`Status & roadmap`, `Architecture`) · `CONTEXT.md` (domain glossary) · `docs/adr/`
(architecture decisions).

Tests: per-app `pnpm --filter <pkg> exec vitest run` (root `vitest` binary fails Svelte-rune tests).
Node 22+, pnpm 9+.
