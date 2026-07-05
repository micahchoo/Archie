# COLDSTART — fresh-clone cold-start rehearsal (ISSUES.md Issue 8)

Rehearsed 2026-07-05 against `main` (`c32021f`). Cloned fresh via `git clone
https://github.com/micahchoo/Archie.git` into a clean scratch directory (never a copy of the working
tree) and followed only committed files + `README.md`. Fixing nothing during the rehearsal phase — every
stumble logged verbatim first.

**Scoping caveat:** Node 22+, pnpm 9+, and git-lfs were already installed system-wide on the rehearsal
machine, so the "install these tools from scratch" experience was NOT rehearsed — only the repo-specific
setup surface (clone → hooks → LFS → dev servers) was exercised, per this issue's stated scope.

## Prerequisite inventory

| prerequisite | where consumed | documented? | stumble | fix commit | clean rerun |
|---|---|---|---|---|---|
| Node.js 22+ | `README.md` Installation section; `scripts/start.mjs`'s `MIN_NODE_MAJOR` check | yes (`README.md`) | none | n/a | n/a |
| pnpm 9+ | `README.md`; workspace lockfile v9 | yes (`README.md`) | none | n/a | n/a |
| git-lfs | `apps/viewer/libraries/*.archie.zip` (`.gitattributes`: `filter=lfs diff=lfs merge=lfs -text`); `.github/workflows/{deploy,checks}.yml` check out with `lfs: true` | **no** — zero mentions of "lfs" anywhere in `README.md` | A contributor without git-lfs installed gets pointer-stub text in place of the real 74MB `archie-library.archie.zip`, with no doc telling them why the app looks broken. (Not independently re-verified without git-lfs on this machine — inferred from standard git-lfs behavior, not empirically triggered here.) | pending | pending |
| `core.hooksPath=qa/hooks` (`qa/hooks/install.sh`) | `qa/hooks/pre-commit` (syncs `qa/features.csv` on commit) | **no** — `install.sh` isn't mentioned in `README.md`, and there's no `CONTRIBUTING.md` | Undocumented step — a contributor would never know to run it (low stakes: only affects an internal QA feature-tracking commit hook, not required to run the app) | pending | pending |
| **The real bug**: LFS hook safety net silently regresses when `qa/hooks/install.sh` runs | `qa/hooks/{post-checkout,post-commit,post-merge,pre-push}` (untracked) vs `.git/hooks/*` (auto-populated) | n/a — this is the mechanism, not a doc gap | **Confirmed precisely, see below.** | pending | pending |
| Seed/gen step (`vite-node apps/viewer/scripts/gen-published.mts`) | `apps/viewer/public/published/` | Not documented as a manual step, but it doesn't need to be — `apps/viewer/package.json`'s `predev`/`prebuild` npm hooks run it automatically before `dev`/`build` | none — ran automatically, no stumble | n/a | n/a |
| `node scripts/start.mjs both` reaching working dev servers | the whole point of the rehearsal | yes (`README.md` Quickstart) | none — Studio (`:5174/studio/`) and Viewer (`:4321/viewer/`) both came up clean behind the `:5173` front door, `gen-published` ran via `predev`, archie-library.archie.zip loaded as real content (2 exhibits, 118 published files) | n/a | n/a |

## The real bug, precisely characterized

The original ISSUES.md diagnosis framed this as "a fresh clone loses LFS hook wiring even after
`install.sh` runs." The rehearsal found something more specific and more surprising:

1. A **plain `git clone`** (before running anything) already ends up with **working** LFS hooks in
   `.git/hooks/post-checkout` / `pre-push` / etc. — confirmed byte-identical to the untracked
   `qa/hooks/` copies. (Git-lfs's own tooling self-installs these into the currently-effective
   hooksPath — `.git/hooks` by default — as part of the clone/checkout's smudge-filter pass, on this
   git-lfs version; `git lfs install --help` documents it as hooksPath-aware.)
2. Running **`qa/hooks/install.sh`** — the repo's own setup step — sets `core.hooksPath` to `qa/hooks`.
   This **switches the effective hooks directory away from the one that had working LFS hooks**, to one
   that doesn't (the four LFS hook files there are untracked, so a fresh clone's `qa/hooks/` only has
   `install.sh` and `pre-commit`).
3. The switch is **silent** — `install.sh` prints only `"Installed: core.hooksPath -> qa/hooks
   (pre-commit syncs qa/features.csv)"`, nothing about LFS.

So the bug isn't "fresh clone has no LFS" (LFS itself worked fine, confirmed by the real 74MB zip
loading) — it's **"running this repo's own recommended setup step silently downgrades a working LFS
safety net to a broken one."** That's worse: a contributor who never runs `install.sh` is actually
*safer* on this specific point than one who follows the (undocumented, but presumably intended) setup
path. This matches ISSUES.md's cited prior incident (`a0b6dc0`, a broken deploy from missing LFS in
checkout) — a `pre-push` hook that silently stopped firing is exactly the kind of gap that produces a
push whose LFS objects never actually upload.

## Fixes

| # | item | fix | commit | recheck |
|---|---|---|---|---|
| 1 | Track the four LFS hook files in `qa/hooks/` | `git add qa/hooks/{post-checkout,post-commit,post-merge,pre-push}` — they're stock, repo-agnostic git-lfs hook scripts (confirmed byte-identical to what `git lfs install` generates), so tracking them is the direct fix: once `install.sh` points `core.hooksPath` at `qa/hooks`, that directory now has the LFS hooks too, no regression | `b8e7e87` | pass |
| 2 | Document git-lfs as a prerequisite in `README.md` | Added to the Installation section's prerequisite list + Quickstart commands (`git lfs install`, `sh qa/hooks/install.sh`) | `bed2462` | pass |
| 3 | `install.sh` should not silently go quiet about LFS | Now prints explicit confirmation the four LFS hooks are present + executable in the target dir, warns per-hook if not, and notes if `git-lfs` itself isn't on PATH | `bed2462` | pass — ran `sh qa/hooks/install.sh`, output now reads `LFS hooks present: post-checkout, post-commit, post-merge, pre-push` |

## Re-rehearsal (post-fix, from a second fresh clone)

Cloned again into a clean scratch directory (local-path clone, since the fix commits aren't pushed to
GitHub yet — same clone semantics as a remote clone, just local transport). `sh qa/hooks/install.sh` →
`core.hooksPath` set to `qa/hooks`, all four LFS hooks now present/executable there (confirmed via
`ls -la qa/hooks/`), `git lfs status` clean, `archie-library.archie.zip` loaded as real 74,314,480-byte
content (not a pointer stub). `pnpm install` + `node scripts/start.mjs both` reached both dev servers
ready (`Studio (authoring) is ready`, `Viewer (reading) is ready`) with zero undocumented steps beyond
what `README.md` now states.

**Done 2026-07-05**: every row above reads pass; the fix closes the regression precisely (an untracked
LFS-hook gap, triggered by the repo's own setup step) rather than the originally-assumed simpler "fresh
clone has no LFS" framing.
