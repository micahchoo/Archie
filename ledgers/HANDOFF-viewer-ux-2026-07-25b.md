# HANDOFF — Viewer UX audit, second wave (2026-07-25)

Branch **`test/viewer-e2e`** in worktree `.claude/worktrees/chrome-occlusion`, cut from `main` by
name. **7 commits ahead of `main` (`6ecd65f`), NOT yet merged or pushed.**

Supersedes `ledgers/HANDOFF-viewer-ux-2026-07-25.md` (the first wave). That one stays accurate for
what it covered.

## What landed

| commit | what |
| --- | --- |
| `36ce001` | **Archie-52a0** — the selection halo + fit margin (V43/V44/V47/V41/V46) |
| `0791172` | note + narrative e2e journeys (V61/V62/V63, V86/V91) |
| `3ca861d` | **the published tree was fossilised** — the seed is always owned again |
| `75bc949` | **Archie-40fe** — floating chrome off the canvas and off each other |
| `d917a40` | **Archie-3d55** — canvas keyboard: named, reachable, escapable |
| `6feebdd` | **Archie-84e0** — V11, tree-relative asset refs resolve against the library base |
| `5b08f9a` | **V49** — the AV temporal map clears the item strip |

Tickets closed: `52a0`, `40fe`, `3d55`, `84e0`, and three grillings — `c982`, `d5cd`, `52a9`,
`e902`. **The viewer-ux map has no open grillings left.**

Eleven implementation tickets were filed from those decisions: `dbbc` `01a6` (note surface),
`67b6` `99b1` `3ea1` (addressing + citing), `b681` `f90d` `c314` (embed), `0d6c` `c5cb` (narrative),
plus `7b86` still open.

## The three findings that were bigger than their tickets

**The published tree had been frozen across three model changes.** From the moment a zip was
committed to `apps/viewer/libraries/`, a dropped zip REPLACED the sample-data source instead of
adding to it, so `pnpm gen` silently stopped regenerating six of the seven seed exhibits. They had
missed section emission, inline annotations, AND Archie-9ea8's `ex-<exhibit>.<object>` id grammar —
so published canvas IRIs disagreed with the fixture that mints them. The zip now unions with the
seed and wins per slug. Guard: `apps/viewer/src/published-tree.test.ts`.

**`getFitOptions` had never been wired.** @render/mount's fit-reservation seam has existed since the
anvil delamination; the viewer always passed `PLAIN_FIT`. Every fit centred the region in the whole
container while the legend and note card sat on the left flank. It now reserves both flanks.

**wavesurfer.js is NOT a dependency.** `Archie-7b86` and the map both say it is. It appears only in
the docs index and one aspirational comment. V50 is therefore "add a new viewer dependency", which
trips `.claude/rules/viewer-optimizedeps-bare-includes.md` — a hazard this repo has been bitten by
three times. Recorded on the ticket.

## A pattern worth carrying: the gates kept testing the wrong artifact

Four times this session a guard passed against code I had deliberately broken:

- The published-tree guard, written as an e2e spec, **passed against the known-stale page** — the
  e2e `webServer` runs `pnpm build`, whose `prebuild` runs `gen`. It regenerated the tree before
  every assertion. Moved to vitest (no `pretest` hook), it fails correctly.
- The V11 404 gate asserted **mid-drive** and passed against the unfixed embed, because covers are
  `loading="lazy"` and the request had not been made yet. Moved to the end of the drive.
- The V86 echo assertion used `allInnerTexts()`, which is layout-aware and **omits the `.obj`
  span** — the half being inspected. Then `textContent` concatenated the parts with no separator,
  fusing `Herbal` + `f1r` into `Herbalf1r` so a word-split saw no repetition.
- The V87 assertion targeted `.num` (the section title), which clears the pill even when the prose
  and cite card underneath it do not.

Every one was found by injecting the bug and watching for red. **Do that; the failure mode here is
consistently a guard that is green for the wrong reason.**

## Verification gaps, recorded not papered over

`apps/viewer/e2e` runs offline by design and **every annotated seed exhibit is remote-sourced**, so:

- OSD never opens, and a failed mount **tears its own canvas out of the DOM** (measured:
  `querySelector('.openseadragon-canvas')` returns null, no OSD element in the tab list). No canvas
  overlay, no canvas tab stop, and no AV timeline (`dur` needs media metadata) can be asserted there.
- The halo, the canvas naming, the Escape-from-canvas rung and V49 were each driven ONLINE by hand
  instead. Measurements are in the commit messages and ticket close reasons.
- `screenshots` is the only locally-sourced exhibit and reports 0 notes despite three inline
  annotations in its manifest — **unexplained, worth a look**, and it is what blocks making the
  canvas assertions offline-capable.

## Next

1. **Merge and push.** Seven commits, none on `main`. CI has not seen any of it.
2. `Archie-67b6` → `99b1` → `3ea1` in that order — each needs the previous to be TRUE, not merely
   merged.
3. `Archie-b681` (embed rights) is legal exposure; it is cheap and ships alone.
4. `Archie-dbbc`/`01a6`, then `0d6c`/`c5cb`.
5. `7b86`'s remainder: V50 (waveform-as-canvas, prior art decided — see the ticket) and V53's six.

## Gates

```
pnpm --filter @archie/viewer run check:svelte     # 1507 files, 0/0
pnpm --filter @archie/viewer run typecheck        # TS7; never bare `tsc`
cd apps/viewer  && pnpm exec vitest run           # 149
cd apps/studio  && pnpm exec vitest run           # 925
cd packages/render-core  && pnpm exec vitest run  # 1159
cd packages/render-mount && pnpm exec vitest run  # 207
cd packages/archie-viewer && pnpm exec vitest run # 138
node recipes/smoke.mjs                            # 11/11
pnpm --filter @archie/viewer run e2e              # 44
cd packages/archie-viewer && node build.mjs --check   # eager 33.1KB gz
```

**Kill `astro preview` between e2e runs when you have changed source.** `reuseExistingServer` is
true locally, and a stale server cost me three wrong measurements before I noticed.
