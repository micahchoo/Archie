# HANDOFF — Studio preview + deposit-copy export (2026-07-26)

Branch **`explore/studio-folder-export-settings`**, worktree `.claude/worktrees/studio-explore`.
**9 commits, rebased onto current `main`, 0 behind, tree clean.** Not merged.
(Re-confirmed against `origin/main` after a fetch: still 0 behind.)

Separate from the viewer-ux lane (`ledgers/HANDOFF-viewer-ux-2026-07-26.md`) and from the root
`HANDOFF.md` (perf sweeps) — do not sweep those in.

> **`main` moved TWICE during this session** — 82 commits, then 3 more mid-rebase. Another session is
> actively working the same tree. **Rebase before starting, not after.** Everything below was verified
> after the second rebase; if `main` has moved again, re-run the gates before trusting any of it.

## What shipped

Two features, both driven in a real browser, not just gate-green.

- **Preview as reader** — `Publish → Preview as reader` renders the actual published tree with the
  actual reader, in-process. `publish-flows.previewTree()` (a `projectSite(false)` reuse, never
  `toZip`) → `<archie-viewer>.openLibraryFs(fs)`. No URL is minted anywhere on this path, which also
  keeps the desktop CSP's `connect-src` blob ban out of the picture.
- **A deposit copy** — `Publish → A deposit copy` writes ONE `.html` holding the viewer and the
  library. Verified from `file://` with every non-`file://` request aborted at the context level:
  origin `file://`, gallery rendered, `slugs: [deposit-copy]`, **0 network requests**.

## Gates (green after the second rebase)

render-core **1194** · archie-viewer **185** · viewer **176** · studio **942** vitest ·
studio e2e **9/9** · `tsc` 0 · svelte-check **1177 files 0/0** · `pnpm build` clean ·
bundle ratchets ok (eager 38.9 · total 274.9 · single-file 274.5) · `sync-dist:check` matches.

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

## Next actions, ranked

1. **Rebase, then merge this branch.** It is done and verified; its value decays with every commit
   `main` takes, and defect 2 above is what a stale merge looks like.
2. **`Archie-b5c2` — measure FSA folder autosave vs OPFS.** One measurement that decides web
   folder-canonical, a multi-week direction. **Blocked on a human**: needs a real
   `showDirectoryPicker` handle, which requires a user gesture Playwright cannot supply. Wants a
   5-minute manual run against `scripts/perf/fsrun.mjs`, not an agent.
3. **`Archie-9ece` — packaged desktop verification (Critical).** `main` carries a relocated storage
   spine nobody has booted. **Blocked in this environment**: `cargo` present, **`flatpak-builder`
   MISSING**. Needs your machine or CI. Cut to two rows for a ship gate: P2-a (author → relaunch →
   work survives) and P2-b (migrate a real OPFS library).
4. **Publishing an examples-only library produces an empty site, silently.** `buildFullLibrary`
   excludes bundled examples; a fresh seed publishes nothing and says nothing. Preview now makes it
   visible, but only if you preview. Recommended shape: the chooser refuses-and-explains on a
   zero-exhibit projection, same shape as the deposit copy's size cap.
5. **Gate or delete two decision records.** `archie-linkability Q-3` and `archie-ux Q-6` are marked
   **PROPOSED, not user-gated**; every other row in those tables says "grilled+user-gated".
6. **Build the settings panel** from `docs/superpowers/specs/2026-07-26-studio-settings-panel-design.md`.
   Three decisions are user-gated (one panel/two sections; autosave exposed with no off switch;
   reclaim-space behind a typed confirm); L4–L7 are mine and contestable. Two blocking questions in
   the spec are cheap and should be answered first.

## Artifacts

| path | what |
|---|---|
| `ledgers/EXPLORE-studio-folder-export-settings-2026-07-26.md` | the original four-question exploration (its §2 narrative claim is superseded — see defect 1) |
| `docs/superpowers/plans/2026-07-26-viewer-preview-and-single-file-export.md` | the executed plan + its Shape Changes log |
| `docs/superpowers/specs/2026-07-26-studio-settings-panel-design.md` | the settings design, unbuilt |
| `apps/studio/e2e/preview.spec.ts` | the only gate that can see prop-wiring and viewport traps |

Tickets filed/changed: **Archie-b5c2** (High), **Archie-9ece** (Critical, release-gated + cut to two
rows), **Archie-2935** (Low, corrected), **Archie-a09d** (raised off Medium).
