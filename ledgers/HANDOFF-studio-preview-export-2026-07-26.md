# HANDOFF — Studio preview + deposit-copy export (2026-07-26)

Branch **`explore/studio-folder-export-settings`**, worktree `.claude/worktrees/studio-explore`.
**MERGED into local `main` (`b7ba6e5`), NOT pushed.** Branch and `main` are the same commit; tree clean.

Separate from the viewer-ux lane (`ledgers/HANDOFF-viewer-ux-2026-07-26.md`) and from the root
`HANDOFF.md` (perf sweeps) — do not sweep those in.

> **`main` moved FOUR times across the two sessions** — 82 commits, 3 mid-rebase, then twice more from
> the `merge-main` lane while gates were running. Another session is actively working the same tree.
> **Rebase before starting, not after**, and re-check `git rev-list --left-right --count main...HEAD`
> after any long-running command — twice it had moved by the time a gate finished. If `main` has moved
> again, re-run the gates before trusting anything below.
>
> **Why `main` is unpushed:** the `merge-main` worktree holds a commit of its own that isn't on
> `origin`, so `git push` from here would publish their work as a side effect of publishing mine.
> Pushing is theirs to do, or yours.

## What shipped

Two features, both driven in a real browser, not just gate-green.

- **Preview as reader** — `Publish → Preview as reader` renders the actual published tree with the
  actual reader, in-process. `publish-flows.previewTree()` (a `projectSite(false)` reuse, never
  `toZip`) → `<archie-viewer>.openLibraryFs(fs)`. No URL is minted anywhere on this path, which also
  keeps the desktop CSP's `connect-src` blob ban out of the picture.
- **A deposit copy** — `Publish → A deposit copy` writes ONE `.html` holding the viewer and the
  library. Verified from `file://` with every non-`file://` request aborted at the context level:
  origin `file://`, gallery rendered, `slugs: [deposit-copy]`, **0 network requests**.

## Gates (green at `b7ba6e5`)

render-core **1194** · archie-viewer **185** · viewer **176** · studio **942** vitest ·
studio e2e **12/12** · `tsc` 0 · svelte-check studio **1178 files 0/0**, viewer **1521 0/0** ·
`pnpm build` clean · bundle ratchets ok (eager 38.9 · total 274.9 · single-file 274.5) ·
`sync-dist:check` matches.

The bundle/build/sync figures were measured before the Settings work, which touches only
`apps/studio` — no embed source, so they carry. Everything else was re-run after it.

Run tests PER APP. `pnpm typecheck` is the real `.ts` gate. `node build.mjs --check` for the embed;
`--update` ONLY when moving the baseline deliberately.

## The four defects the rebase exposed — read before touching these files

The branch was built on a base **82 commits stale**, so everything was verified against the wrong
tree. Three of these were mine.

1. **A false claim reached shipped UI copy.** I stated the deposit copy drops NARRATIVE reading and
   put that in the Publish card. Main's embed HAS narrative (`narrative.ts`, lazily mounted from
   `element.ts` — `26c2a59`). Only **search** is genuinely absent. `Archie-2935` carries the correction.
2. **The branch silently lowered the bundle ratchet**, reinstating the exact defect `fff4aa9` removed.
   Now folded into main's `--update` gating. Measured against main's reference BEFORE moving it:
   `openLibraryFs` costs **+2.9KB gz EAGER** (36.0 → 38.9, allowed +10.0) — real, within budget, paid
   by every CDN embed host for a Studio-only door. Revisit if the eager budget tightens.
3. **`.dialog` cannot scroll** — `position: fixed`, centred by transform, no `max-height`, no
   `overflow`. Content past the viewport overflows BOTH edges unreachably. Latent since the surface
   was built; a fourth destination card crossed the threshold. Fixed generally.
4. **Studio is now the embed's THIRD consumer**, which `css-text.d.ts` said would not happen. It broke
   twice at once: svelte-check TS2307 on `virtual:archie-tokens`, and Vite dev 500ing the dynamic
   import so the preview rendered an ERROR instead of a reader. Studio now carries both the ambient
   declaration (`archie-viewer-virtual.d.ts`) and a third resolver plugin (`vite.config.ts`), all three
   reading `tokens-source.mjs`. **Rename that virtual id and THREE places change.**

## Session 2 (same day, later) — what closed

**MERGED.** `main` is at `b7ba6e5`, local only — **not pushed**, deliberately: the `merge-main`
worktree lane is preparing a wave-1 merge, and pushing would put their unpushed commit up as a side
effect of mine. `main` moved THREE times during this session; each merge was a checked `--ff-only`
into their worktree, never a ref rewrite under them.

Also closed:

- **The empty-hall publish defect** (`3a3806e`). A fresh profile is examples-only, so the projection
  had zero exhibits and every destination built an empty site and reported success. The chooser now
  refuses and names the way out ("Keep a copy"). Red-greened. **It exposed that `preview.spec.ts` was
  previewing an EMPTY library** — it asserted `.intro h1`, which element.ts:816 paints either way. The
  spec now forks first and asserts the card.
- **Q-3 / Q-6 gated** (`e1aa8e7`). Q-6 ACCEPTED. **Q-3 gated to REVISIT, against my recommendation** —
  sized in **Archie-babe** rather than left as a table row. Read that ticket before starting: item 3
  (a multi-file Astro tree vs a one-bundle base64 inline) may make the single-file form impossible, in
  which case re-accepting Q-3 with the measurement attached is the honest outcome.
- **Both settings "blocking" questions answered from source** (`0558dc6`) — neither needed a run, and
  one was framed backwards. `storage.estimate()` is not unavailable on desktop; `refreshQuota` just
  declines to call it, because for the CHIP the OPFS residue misleads. The residue is exactly what
  L3 wants. **L5/R6 WITHDRAWN by the user**: one default-ON emergency kill-switch is not a section.
- **Settings panel PHASE 1** (`5080f59`, `b7ba6e5`) — frame, door (the shared `HelpMenu`, so it is
  reachable from the editor AND the library home in one edit), the two labelled sections, and the
  read-only diagnostics. `bakePoolSize()` was exported from `bake-async.ts` so the readout cannot
  drift from `POOL_MAX`.

### Settings panel — phases 2 and 3, NOT built

- **Phase 2, L2/R5 — autosave cadence.** The whole cadence is ONE literal: `800` at
  `exhibit-session.svelte.ts:79`. Named choices with a floor, no off switch (Freecut's `0 = off` is
  the rejected shape). It mutates a live seam, so it wants its own tests.
- **Phase 3, L3/R3 — "Reclaim space".** Destructive; typed confirm; show the retained size via a
  DIRECT `navigator.storage.estimate()` call. Do **not** reuse `storage-quota.svelte.ts` — its `usage`
  is pinned null on desktop by design, and that design is right for the chip and wrong for this.

The panel names both as "aren't here yet" in its own copy, so the surface does not read as finished.

## Next actions, ranked

1. ~~Rebase, then merge this branch.~~ **DONE** — `main` at `b7ba6e5`, unpushed (see above).
2. **`Archie-b5c2` — measure FSA folder autosave vs OPFS.** One measurement that decides web
   folder-canonical, a multi-week direction. **Blocked on a human**: needs a real
   `showDirectoryPicker` handle, which requires a user gesture Playwright cannot supply. Wants a
   5-minute manual run against `scripts/perf/fsrun.mjs`, not an agent.
3. **`Archie-9ece` — packaged desktop verification (Critical).** `main` carries a relocated storage
   spine nobody has booted. **Blocked in this environment**: `cargo` present, **`flatpak-builder`
   MISSING**. Needs your machine or CI. Cut to two rows for a ship gate: P2-a (author → relaunch →
   work survives) and P2-b (migrate a real OPFS library).
4. ~~Publishing an examples-only library produces an empty site, silently.~~ **DONE** (`3a3806e`).
5. ~~Gate or delete two decision records.~~ **DONE** (`e1aa8e7`) — Q-6 ACCEPTED; Q-3 gated to
   REVISIT, sized in **Archie-babe**.
6. **Settings panel — phases 2 and 3** (phase 1 shipped; see the section above). Spec:
   `docs/superpowers/specs/2026-07-26-studio-settings-panel-design.md`. Nothing gates the plan now:
   both blocking questions are answered in the spec, and L5/R6 are withdrawn. Six decisions remain
   (L1–L4, L6, L7); L4/L6/L7 are mine and still contestable.

## Artifacts

| path | what |
|---|---|
| `ledgers/EXPLORE-studio-folder-export-settings-2026-07-26.md` | the original four-question exploration (its §2 narrative claim is superseded — see defect 1) |
| `docs/superpowers/plans/2026-07-26-viewer-preview-and-single-file-export.md` | the executed plan + its Shape Changes log |
| `docs/superpowers/specs/2026-07-26-studio-settings-panel-design.md` | the settings design, unbuilt |
| `apps/studio/e2e/preview.spec.ts` | the only gate that can see prop-wiring and viewport traps |

Tickets filed/changed: **Archie-b5c2** (High), **Archie-9ece** (Critical, release-gated + cut to two
rows), **Archie-2935** (Low, corrected), **Archie-a09d** (raised off Medium).
