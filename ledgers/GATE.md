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

---

# GATE — Svelte typecheck (ISSUES.md Issue 12)

**Run:** 2026-07-05 · baseline `main` @ `1704e83`, in an isolated worktree
(`tend/issue-12-svelte-check`) — the shared `main` tree had an active concurrent session
mid-rewriting `App.svelte` (Issue 11 Phase-2 multi-select), so this loop worked off the *committed*
HEAD to get a stable, collision-free inventory. Node 24 / pnpm 11.

## The gap (confirmed)

`apps/studio`'s only type gate is `typecheck: tsc --noEmit` (GATE.md Issue-1 table, row `studio
typecheck`). Plain `tsc` treats `.svelte` files as opaque — it never checks `<script>`/template
contents. `svelte-check` was **not a dependency anywhere** in the monorepo. So CI's `typecheck` job
(`.github/workflows/checks.yml`) type-checks studio's `.ts` but **none of its 66 `.svelte` files** —
a green check over an unchecked surface.

## Infra added (this branch)

- `svelte-check@^4.7.1` as an `apps/studio` devDep.
- `apps/studio/svelte.config.js` — minimal `{ preprocess: vitePreprocess() }`. **Required**: without a
  discoverable Svelte config, `svelte-check` emitted a `"No Svelte configuration found in vite config"`
  error on *every* `.svelte` file (23-error cascade) and could not reliably check them. This file
  changes no runtime behaviour (vite-plugin-svelte already applies the same TS preprocessing).
- `apps/studio` `check` script: `svelte-check --tsconfig ./tsconfig.json`.

## Inventory (baseline `1704e83`, with `svelte.config.js`)

`pnpm --filter @archie/studio run check` → **43 errors + 11 warnings, 9 files with problems** (exit 1).

Empirical split (re-ran with `exactOptionalPropertyTypes: false`):

| class | count | where | disposition |
|---|---|---|---|
| `exactOptionalPropertyTypes` strictness | **13** | App.svelte (8) + AddMapModal/ReadingsModal/LibraryHome/ExhibitOverview/MergeReview (5) | mostly component-prop optional-field noise; **relax the flag in studio's tsconfig OR add `\| undefined` to prop types**. Low priority. |
| real type errors | **30** | **all in App.svelte** | must be fixed (or narrowly suppressed) per-site — the real worklist |

## The 30 real errors — classified (all App.svelte, verified against `1704e83`)

| lines | n | class | verdict |
|---|---|---|---|
| 34 | 1 | undeclared dep | **real** — studio imports `@render/mount` (type-only) but doesn't declare it (only `@render/core`+`@render/svelte`); resolves transitively via `@render/svelte`, so `tsc` tolerates it, svelte-check flags it. Fix: add `@render/mount` to studio deps. |
| 522 | 1 | **silent data-loss BUG** | **real, highest value** — exhibit-copy builds carried notes with `layers: r.layers`, but `layers` isn't on `AnnotationRecord` → per-note layer assignments are dropped (carried as `undefined`) on copy. The gate would have caught a real data-loss regression. |
| 1635, 1753, 1755 | 3 | DZI-union unsoundness | **real** — Issue 11 Phase 1 widened `TileSourceDescriptor` to `Xyz\|Dzi`; `DziTileSource` has no `attribution`, and 1635 passes the union where `XyzTileSource` is expected. Currently masked at runtime (the `isMapCurrent` guard means only XYZ tile sources hit `.attribution`), but genuinely unsound. Fix: narrow on `kind === "xyz"`. |
| 916–983 | 7 | array-target gap | **real (type)** — `W3CTarget \| W3CTarget[]` passed where a single `W3CTarget` is expected; the array case is unhandled. Fix: narrow/normalize the target. |
| 810, 1327–1369 | 10 | null-safety gaps | **real (guards)** — `currentExhibit` possibly-undefined (8) + `string \| undefined` → `string` (2). Low runtime risk if `currentExhibit` is always set in that template branch, but the guards are genuinely missing. |
| 379 | 2 | forward reference | **real (smell)** — `canvasFocus` `$derived` reads `currentObjectId` before its declaration; lazy-derived so low runtime risk, but a real TDZ hazard. Fix: reorder. |
| 792, 797 | 2 | intentional rune idiom | **pattern** — `(rev, sess.session.notes())` comma-operator to register `rev` as a reactive dep; svelte-check flags "left side unused". Not a bug, but fragile. Fix: `void rev` or a cleaner dependency. |
| 803, 842, 863 | 3 | dynamic-key cast | **fixable cast** — `(a as Record<string, unknown>)["archie:reading"]` to read a namespaced key not on `W3CAnnotation`. Fix: `as unknown as Record<…>`. |

Net: **≥1 genuine data-loss bug (522), 3 real unsoundnesses (DZI), 17 real guard/type gaps, 5 fragile
patterns/casts.** The gate is hiding real defects, not just strictness noise.

## Status: INVENTORY + INFRA DONE — fix & CI-wire DEFERRED (blocked)

The remaining loop phases are **blocked by a live collision** and were deliberately not run:

- **Fix phase** — all 30 real errors are in `App.svelte`, which a concurrent session is actively
  rewriting (Issue 11 Phase-2; it is *adding* errors — `selection/selectMode/onselectmode` prop
  mismatches at :1322). Fixing App.svelte on this branch would conflict with that rewrite and much of
  the worklist will shift when it lands. **Re-run `check` against the post-Phase-2 App.svelte before
  fixing.**
- **CI-wire phase** — wiring `svelte-check` into `checks.yml` while it is red would fail every push,
  including the concurrent session's. **Wire only after the check is green.**

## Next steps (when the concurrent studio work settles)

1. Rebase/re-run `check` on the current `App.svelte`; regenerate the 30-error worklist.
2. Decide the `exactOptionalPropertyTypes` disposition (relax in studio tsconfig vs fix 13 sites).
3. Fix the real errors — 522 (`layers`) and the DZI unsoundness first (real defects), one commit per cluster.
4. Add `check` to `checks.yml`'s `typecheck` job (or a new `svelte-check` job); plant one deliberate
   `.svelte` type error, watch CI go red, revert (mirroring Issue 1's trip-red proof).
5. Done when `pnpm --filter @archie/studio run check` is green on `main`, wired in CI, and seen to fail once.

**Infra + this ledger live on branch `tend/issue-12-svelte-check` (off `1704e83`), ready to merge.**
