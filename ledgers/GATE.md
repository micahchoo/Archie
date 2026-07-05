# GATE — CI tripwire ledger (ISSUES.md Issue 1)

Inventory taken 2026-07-05 against `main` @ `2091557`. Node v24.14.0, pnpm 11.0.9 locally;
`deploy.yml` pins Node 24 / pnpm 10 — new checks job will match `deploy.yml`, not this machine.

| check | command | local result | CI job | commit |
|---|---|---|---|---|
| render-core test | `pnpm --filter @render/core exec vitest run` | pass (688/688) | `test` | — |
| render-core typecheck | `pnpm --filter @render/core exec tsc --noEmit` | pass | `typecheck` | `ee244d8` |
| render-mount test | `pnpm --filter @render/mount exec vitest run` | pass (116/116) | `test` | — |
| render-mount typecheck | `pnpm --filter @render/mount exec tsc --noEmit` | pass | `typecheck` | `7415fe2`, `8693795` |
| render-svelte test | `pnpm --filter @render/svelte exec vitest run` | pass (7/7) | `test` | — |
| render-svelte typecheck | `pnpm --filter @render/svelte exec tsc --noEmit` | pass (cleared once render-mount's mount.ts:251 was fixed, as predicted) | `typecheck` | `7415fe2` |
| archie-viewer test | `pnpm --filter @render/archie-viewer exec vitest run` | pass (98/98) | `test` | — |
| archie-viewer typecheck | `pnpm --filter @render/archie-viewer exec tsc --noEmit` | pass (same cascade, same fix) | `typecheck` | `7415fe2` |
| viewer test | `pnpm --filter @archie/viewer exec vitest run` | pass (63/63) | `test` | — |
| viewer typecheck | `pnpm --filter @archie/viewer exec tsc --noEmit` | pass (needed `pretypecheck: astro sync` — see below) | `typecheck` | `cd421bc` |
| viewer astro check | `pnpm --filter @archie/viewer run check` | pass (0 errors/warnings/hints, 33 files) | `astro-check` | — |
| studio test | `pnpm --filter @archie/studio exec vitest run` | pass (148/148) | `test` | — |
| studio typecheck | `pnpm --filter @archie/studio exec tsc --noEmit` | pass — added `tsconfig.json` (extends root, `include: ["src"]`, no `rootDir`/`outDir` since `seed-data.ts` imports `apps/viewer/fixtures/*`) + `"typecheck": "tsc --noEmit"` script | `typecheck` | `8de4a8f`, `9a1aa33`, `7c05375`, `fb42311`, `2dfa0e1` |
| gh-pages build | `bash scripts/build-gh-pages.sh` | pass | `gh-pages-build` | — |

CI wiring: `.github/workflows/checks.yml` (commit `aa02d0b`), 4 independent jobs, on every push +
PRs targeting main. `deploy.yml` untouched. Verified end-to-end via PR #1 (`ci/wire-checks`).

## Tripped red — each job proven to catch a real defect (PR #1, `ci/wire-checks`)

One deliberate defect planted per job, pushed, watched fail in both the push- and PR-triggered
Actions runs, then reverted — confirming each job actually gates on its class of failure and that
the four jobs are correctly isolated (a defect in one job's domain never fails the other three).

| job | defect | trip commit | red confirmed | revert commit |
|---|---|---|---|---|
| `typecheck` | `const x: string = 12345` in a throwaway `render-core` file | `c0d9663` | yes (both runs) — `test`/`astro-check`/`gh-pages-build` stayed green | `0cc2383` |
| `test` | `expect(1).toBe(2)` in a throwaway `render-core` test | `531b60d` | yes (both runs) — other 3 jobs stayed green | `68835ea` |
| `astro-check` | undefined-variable reference in a throwaway `.astro` page (a diagnostic bare `tsc` never sees — confirmed locally: `astro check` exit 1, `tsc --noEmit` exit 0) | `237a10d` | yes (both runs) — other 3 jobs stayed green | `91f58c1` |
| `gh-pages-build` | corrupted `archie.config.json` `canonicalOrigin` to omit `/Archie/`, tripping the script's own explicit guard (confirmed locally first) | `a319599` | yes (both runs) — other 3 jobs stayed green | `e30c736` |

Done: every check green on `ci/wire-checks` AND each witnessed failing exactly once.

## Fresh-clone verification (not just the dirty working copy)

Before trusting any of the above, cloned into `/tmp` and re-ran `pnpm install --frozen-lockfile` +
all 4 checks there. This caught a real bug the local working copy was masking: `apps/viewer`'s
typecheck depends on `.astro/types.d.ts` (the `astro/client` triple-slash reference that types
`import.meta.env`) — gitignored, astro-generated, and only present locally because `astro dev`/
`build`/`check` had already been run here. A genuine fresh checkout (any CI runner) had nothing to
generate it, so `tsc --noEmit` failed on `published.ts`'s `import.meta.env` access. Fixed with a
`pretypecheck: astro sync` script (`cd421bc`, matching the existing predev/prebuild convention).
Re-verified clean on a second fresh clone after the fix.

## Concurrent-session branch mishap (resolved)

A second session was working ISSUES.md Issue 3/4 on the same checked-out working directory at the
same time. Both sessions' git commands share one `.git` — at some point the other session checked
out `main` mid-flow, so one of my commits (the deliberate typecheck-tripwire test, see below) landed
on local `main` instead of `ci/wire-checks`, and one of their commits landed on `ci/wire-checks`
instead of `main`. Resolved once the other session paused: reverted the tripwire commit off `main`
(non-destructive `git revert`, safe since `main` was never pushed with it) and reset the local+remote
`ci/wire-checks` branch back to its correct tip (`cd421bc`) — both stray commits were independently
verified safe to drop (one already an ancestor of `main`, the other byte-identical in content to a
commit already on `main`), and the reset/force-push was only done after explicit user authorization
naming the exact commits being overwritten.

## Scope correction vs. ISSUES.md

ISSUES.md's "known-red" list named only 3 sites (render-core x2, render-mount mount.ts:251).
Actual inventory found more:

- **render-mount** also fails on ~20 pre-existing `noUncheckedIndexedAccess` /
  `exactOptionalPropertyTypes` errors in `frame-overlay.test.ts`, `read-overlay-security.test.ts`,
  `read-overlay.test.ts` — untouched by the mount.ts:251 fix, never mentioned in the issue.
- **render-svelte** and **archie-viewer** typecheck failures are *not* independent — both show the
  identical single `mount.ts(251,43)` error, reached because `tsc` follows the imported source
  graph even though neither package's own `include` covers `render-mount/src`. Fixing mount.ts:251
  once should clear both, pending re-verification.
- **studio** typechecking has never run before; a bare `tsc --noEmit` (matching every other
  package's pattern) surfaces 22 errors on the first try, concentrated in `store.ts` (9 — looks
  like a broken/incomplete type re-export, `RightsFields`/`MediaType`/etc. reported as
  "cannot find name"), plus one real branded-type misuse in `publish-flows.svelte.ts` (×3, same
  `LogicalId` cause), a `TileSourceDescriptor`/`Extentish` mismatch in `geo-notes.ts` (×4) +
  its test (×1), and five one-off sites (`binding.ts`, `collab.test.ts`, `ingest-flows.ts`,
  `save-queue.svelte.ts`, plus the `TileSourceDescriptor` overlap in `ingest-flows.ts`).

Net: ~26 individual TypeScript error sites to clear across 3 packages before `pnpm -r typecheck`
is green — more than the 4 the issue named, none look architectural (no test asserts wrong
behavior), all look like mechanical strict-mode / branded-type fixes.

## Tests are already green everywhere

Every package's own `vitest run` passes today when invoked per-package (as above). The
"root vitest binary fails rune tests" problem noted elsewhere only bites the root `vitest` binary
run directly — `pnpm -r --no-bail test` (each package running its own local `vitest`) already
works and needs no fix. Issue 1's test-inventory step is done; nothing to repair there.
