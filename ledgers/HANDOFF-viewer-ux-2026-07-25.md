# HANDOFF — Viewer UX audit, implementation wave (2026-07-25)

Branch **`test/viewer-e2e`** in worktree `.claude/worktrees/chrome-occlusion`, cut from `main` by
name. Merged to `main` and pushed through `d34e640`.

**The previous handoff (perf sweeps, `perf/spine-and-image-pipeline`) is DONE and merged** — its
ledgers stay authoritative for that work: `ledgers/PERF-image-pipeline-2026-07-24.md` (+ ADDENDUM),
`ledgers/PERF-annotation-spine-2026-07-24.md`, `ledgers/PERF-reader-2026-07-24.md`.

## Where things stand

`main` is **pushed** and CI is green. That mattered: 29 commits had never seen CI, and the first run
immediately caught a real failure (`archie-viewer-artifact` — the root `dist/` mirror left
un-resynced by a dist rebuild; fixed in `65a9175`).

The Viewer UX audit (`ledgers/UX-AUDIT-viewer*.md`, 76 findings over six reader journeys) has seven
fix tickets merged. This session added the gate that was missing under all of them, decided the
canvas-selection question 18 findings were parked behind, and fixed the embed's dead pointer path.

## What landed

| commit | what |
| --- | --- |
| `65a9175` | resync root `dist/` — the red CI job |
| `716cf39` | regenerate the seed's archival page so **V110 is actually in it** |
| `00b80a4` | **`apps/viewer/e2e`** — 17 specs, wired into CI's `e2e` job |
| `d973f42` | **V68** — the embed's regions were unclickable; OSD's overlay wrapper ate every click |
| `0cc79ca` | **V51/V29** — the AV plate stops lying about what is playing and what is there |

### The viewer e2e suite is the important one

`apps/viewer` had **no browser gate at all**, while `apps/studio/e2e` had one with its own CI job.
Every behavioural assertion from seven fix tickets had been an ad-hoc script, written and thrown away.

17 specs over four journeys, each carrying its finding id. **Proven red-green**: reverting the
`oncancel` destructuring, the grid-density default, and the static shell's object list failed exactly
the 6 specs that guard them and no others. With the Cancel button broken, `svelte-check` still
reported **1496 files, 0 errors, 0 warnings**.

Two choices that must not be "simplified" later:

- **It serves BUILT output** (`astro preview`, :4326), because the static exhibit shell is emitted by
  a build-time `import.meta.glob`. A dev-server gate cannot see it. `astro preview` also has no dep
  optimizer, so the wedge in `viewer-optimizedeps-bare-includes.md` can't flake it.
- **Every spec aborts non-localhost requests.** All seed exhibits are remote-sourced (Yale IIIF,
  archive.org, OSM). This keeps CI off third-party uptime *and* proves the grid, filmstrip and canvas
  chrome all render from the local manifest.

`apps/viewer/vitest.config.ts` is required, not incidental: vitest's default `**/*.spec.*` sweeps up
Playwright specs and fails all four at collection.

## Two artifacts were stale, and no test could tell

Now a rule (`svelte-no-typecheck-net.md`, "a gate proves the code COMPILED, never that the output
CARRIES anything"):

- **V110's fix shipped in `3c82bfc` with a passing unit test, and the published tree had none of it.**
  `grep -c "The narrative"` over `dist/published/screenshots/index.html` returned **0** until the tree
  was regenerated. The function was proven; the output was not.
- Only `screenshots` changed on regeneration — it is the one exhibit the seed's source zip **owns**.
  Every other exhibit dir is *carried* untouched by `gen-published.mts`, so their archival pages are
  stale committed output from `e45f38b` and their manifests carry no sections at all.

## Decisions recorded

**`Archie-ed50` — how the canvas shows what is selected. CLOSED.** A contrasting **halo** (reading
colour keeps "which reading", the halo answers "which one"), distinct from hover, plus a 0.15
breathing-room margin in `fitBoundsRect`. Rejected spotlight/dim-the-rest (fights the COMPARING
outline-only regime) and reusing `highlighted` (collapses hover and selection).

The mechanism finding is load-bearing: **neither consumer's style channel can express two strokes** —
`MarkerStyle` is a single fill/stroke and Annotorious 3 has no per-shape SVG node — so the halo is an
OSD **overlay element** in `@render/mount`, modelled on the existing `FrameOverlay`. That satisfies
"expressible in the poorer renderer" by construction. The embed already sets `data-selected`
(`read-overlay.ts:253`) and **nothing in the repo styles it**.

The 18 findings parked behind that ticket were four unrelated clusters, now filed:
`Archie-52a0` paint the selected mark · `Archie-40fe` floating-chrome occlusion ·
`Archie-3d55` canvas keyboard · `Archie-c982` where a note lives (grilling).

## Next, in order

1. **`Archie-52a0`** — implement the halo + fit margin. Decision made, mechanism pinned; this is
   execution. Do it in `@render/mount` so both consumers get it once.
2. **`Archie-7b86`** — the AV surface's remaining three (V50 empty audio plate, V49 the temporal map
   covered by the item strip, V53 four dropped affordances). **Read the prior art first** —
   `osd-audio-video`, `hyperaudio-lite`, `videojs-annotation` sit beside the repo and none has been
   read; `wavesurfer.js` is already a dependency. V49 may want `Archie-40fe`'s reservation fix rather
   than a local one.
3. **The three remaining grillings** — `Archie-d5cd` (address grammar; V100 proves an
   ADR-0021-frozen contract is unsatisfiable and V102 says there is nothing to copy anyway),
   `Archie-c982`, `Archie-52a9` (embed fidelity). `Archie-33bf` on the Studio map waits on `d5cd`.
4. **`Archie-84e0`** — V11, measured this session: the embed resolves a tree-relative asset ref
   against the HOST PAGE's directory (`HTTP 404 /recipes/screenshots/assets/o1-e1-embed.png`). The
   portable twin of V7, and worse in the embed, where the host's path is never the library base.

## Territory and hazards

- **A concurrent session shares this checkout.** The primary tree is on `perf/spine-and-image-pipeline`,
  not main. Cut worktrees from **`main` by name**, never `HEAD` — a branch cut from local HEAD once
  captured three of their commits. Do merges in the dedicated `merge-main` worktree so their working
  tree is never touched.
- I edited `recipes/smoke.mjs` in the **primary tree** by mistake this session and had to rescue it.
  Check `pwd` before editing; the shell's cwd persists across calls.
- `.seeds/issues.jsonl` is written by `sd` wherever it runs — it drifts between the primary tree and
  worktrees. Carry it deliberately.
- `Prior Art/` (52MB, a nested `freecut` clone) is now **git-ignored**. Reference material for the
  `Freecut-informed optimization program` map, not repo content.

## Gates

Per app, always — the root vitest binary fails rune tests:

```
pnpm --filter @archie/viewer run check:svelte     # 1497 files, 0/0 — warnings gate too
pnpm --filter @archie/viewer run typecheck        # TS7; never bare `tsc`
cd apps/viewer  && pnpm exec vitest run           # 144
cd apps/studio  && pnpm exec vitest run && pnpm typecheck
cd packages/render-mount && pnpm exec vitest run  # 159
cd packages/archie-viewer && pnpm exec vitest run # 138
node recipes/smoke.mjs                            # 7/7 — the ONLY gate that hit-tests a real pointer
pnpm --filter @archie/viewer run e2e              # 17
```

`recipes/smoke.mjs` and `apps/viewer/e2e` are not redundant with the unit suites and cannot be
replaced by them — see `.claude/rules/osd-overlay-wrapper.md` for the case where keyboard Enter and a
synthetic `click()` both succeed against code whose real mouse click does nothing.
