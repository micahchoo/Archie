# HANDOFF — Archie

**Updated:** 2026-07-05. **Branch:** `main`. Read `ISSUES.md` first — it's the live backlog; this file
is a snapshot of where things stand, not a task list.

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
