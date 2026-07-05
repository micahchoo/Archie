# HANDOFF — Archie

**Updated:** 2026-07-05. **Branch:** `main`. Read `ISSUES.md` first — it's the live backlog; this file
is a snapshot of where things stand, not a task list.

## IN FLIGHT — Issue 11 execution: spikes → flesh plan → implement/review/repeat (2026-07-05)

Grill phase DONE (user confirmed). Deliverables on disk, uncommitted: `docs/plans/SCALE-GALLERY-PLAN.md`,
ISSUES.md Issue 11, `docs/adr/0023-library-level-image-index.md`, Gallery entry in `.scratch/CONTEXT.md`.

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

Read `ISSUES.md` for the full, current list with evidence and run-it prompts. As of this writing:

- **Issue 8** (queued) — a fresh clone loses git-LFS hook wiring; the stock LFS hooks under `qa/hooks/`
  are untracked.
- **Issue 9** (queued, needs the user in the loop) — the showroom exhibit ("Archie annotates Archie")
  is ~80% built: 21 CSVs and 21 screenshots exist, but the ASSEMBLE step (building the actual published
  exhibit) never ran.
- **Issue 10** (queued) — `docs/IMPLEMENTATION-STRATEGY.md`'s process/methodology sections (everything
  above its deferred-work registry) reference tooling (`sd`/seeds, `mulch`, `gate-enforcer`, `qmd`,
  `foxhound`, …) that doesn't exist in the current skill set.
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
