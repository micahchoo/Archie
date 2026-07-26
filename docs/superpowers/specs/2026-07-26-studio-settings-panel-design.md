# Studio settings panel — Design

**Date** 2026-07-26 · **Cycle 1** · Upstream: `ledgers/EXPLORE-studio-folder-export-settings-2026-07-26.md` §4

## Intent

Studio has no settings surface. Roughly twenty user preferences are already persisted to
`localStorage` and read through `persisted.ts`'s `safeGet`, and exactly one feature flag exists —
`feature-flags.ts:12` `archie.structureRevlog`, default-on, documented as an emergency kill-switch
you set **from the browser console**. The author cannot change their own display name after the
first prompt, cannot see where their library actually lives, and cannot act on two failure modes
the code degrades through silently.

So this is mostly **surfacing state that already exists and is currently unreachable** — not
inventing configuration. The one genuinely new thing is a storage/diagnostics readout.

## Requirements

Each states an outcome, not a mechanism.

- **R1** An author can change their display name after the identity prompt has been dismissed.
- **R2** An author can see where this library's bytes actually live, and how much space they occupy.
- **R3** An author on desktop can reclaim the OPFS copy retained by the folder migration.
- **R4** An author can tell when the app has silently fallen back off a fast path (worker-pool
  fallback) rather than discovering it as unexplained slowness.
- **R5** An author can change how often Studio saves, without being able to turn saving off.
- **R6** An author can find and flip a kill-switch without opening a console, and understands it
  applies on reload.
- **R7** Settings that belong to *this library* are distinguishable from settings that belong to
  *this app on this machine*.
- **R8** Nothing in this panel can silently corrupt authored content.

## Constraints

- **C1** Svelte 5 runes; `.svelte` gates are `pnpm --filter @archie/studio run check` at **0/0**,
  `.ts` strictness is `pnpm typecheck` (`.claude/rules/studio-ts-typecheck-gate.md`).
- **C2** Flags are read **once at boot** and cached by callers (`feature-flags.ts:1-6`). A toggle
  must not flip mid-session — one session must never run half its writes down each code path.
- **C3** `navigator.storage.estimate()` is already inert on desktop (`storage-quota.svelte.ts`
  gated on `isTauri()`), because it reports OPFS residue, not the real folder library.
- **C4** Rights/metadata write-backs are keyed partial patches
  (`.claude/rules/metadata-rights-keyed-writebacks.md`). Settings must not become a fourth,
  whole-object write path onto authored content.
- **C5** Both worker paths (`bake-async.ts`, `dzi-slice-pool.ts`) degrade **silently by design** —
  tiling must never turn a slow publish into a failed one (`.claude/rules/perf-measure-the-flow.md`).
  The counter `bakeFallbackCount()` already exists and has no reader.

## Locked Decisions

| # | Decision | Rules out | Serves |
|---|---|---|---|
| **L1** | **One panel, two labelled sections** — "This app" and "This library (<name>)". | A second settings surface inside LibraryHome; per-object settings. | R7 |
| **L2** | **Autosave cadence is exposed as named choices with a floor, no off switch.** Current 800 ms behaviour stays the default and the fastest option. | Freecut's `0 = off` (`use-auto-save.ts:21-44`); a free-form millisecond field. | R5, R8 |
| **L3** | **"Reclaim space" ships, gated behind a typed confirmation** showing the retained size and naming what is lost (the migration rollback copy). | A one-click destructive button; hiding the retained bytes entirely. | R3, R8 |
| **L4** | **Performance knobs are READ-ONLY in v1** — pool widths, DZI tile size, and `bakeFallbackCount()` are shown as diagnostics, not controls. | Sliders for `POOL_MAX`; a tile-size picker. | R4 |
| **L5** | **Flag toggles state "applies on reload" and do not take effect mid-session.** | Live-flipping `structureRevlog`; any flag read that bypasses the boot-cached const. | R6, C2 |
| **L6** | **Layout state (pane widths, collapsed rails) is NOT in the panel.** It is already directly manipulable by dragging; a numeric mirror is decoration. | A "reset layout" section; width spinners. | R7 |
| **L7** | **Settings never writes authored content.** No rights, metadata, or readings controls. | Folding `RightsEditor` or bulk-rights into settings. | R8, C4 |

## Not Doing

- **Library-scoped settings beyond publish target + unlisted default.** Everything else that looks
  library-shaped (rights, metadata, cover) already has a keyed home; moving it here would violate C4.
- **Editable performance knobs.** Deliberately deferred behind L4 — a diagnostics readout is worth
  more than a slider until someone has a measured reason to move a number.
- **Import/export of settings.** No evidence anyone needs to move preferences between machines.
- **A viewer-side settings panel.** The viewer's persisted state (aside widths, grid density) is
  reader ergonomics, not authoring configuration; different surface, different project.
- **Reclaim-space on web.** OPFS *is* the web store; there is nothing retained to reclaim. L3 is
  desktop-only and hides on web.

## Open Questions

**Blocking — both ANSWERED 2026-07-26, from source. Neither blocks planning.**

- **Does the retained OPFS copy have a cheap size measurement on desktop? Yes — and the question was
  framed backwards.** `refreshQuota` early-returns under `isTauri()`
  (`storage-quota.svelte.ts:50`), but that is an app-level choice, not an engine limitation:
  `navigator.storage.estimate()` is never called there, and nothing disables it. The stated reason is
  that on desktop the estimate "would report only OPFS CACHE residue (not the real folder library) —
  worse than nothing" (`:14-16`). For the *chip*, which is predicting whether the author's library
  will fit, that is correct. But **the residue is precisely what R3 wants to show**: L3's control is
  about reclaiming the leftover OPFS copy after the folder became canonical. So the number the chip
  deliberately refuses is the number this panel needs. L3 costs one `estimate()` call — no tree walk.
  Do NOT reuse the chip's store for it (its `usage` is pinned null on desktop by design); call
  `estimate()` directly and comment why this caller wants what the chip rejects.
- **Is `structureRevlog` still the only flag? Yes — and it is a kill-switch, not a toggle.**
  `feature-flags.ts` exports exactly one key, `archie.structureRevlog`, default **ON**, surviving
  "only as an emergency KILL-SWITCH" (`:14-19`). That weakens L5 rather than answering it: a Flags
  section holding one always-on emergency switch is a section that shows the author a lever they must
  never pull. Recommend L5 be re-decided as *no Flags section until a second, genuinely optional flag
  exists* — the kill-switch stays a console/localStorage affair, which is what an emergency switch
  should be. Flagged for the user, since L5 was theirs.

**Exploratory (answerable during implementation):**

- Where is the panel's door — the shell chrome, the Help menu (`HelpMenu.svelte` exists), or `CmdK`?
  All three are plausible; `CmdK` alone is not enough (undiscoverable).
- Should the display-name change re-attribute existing notes? Almost certainly no (attribution is
  historical fact, `collab-attribution.ts`), but confirm against the spine's contract.

## Approaches

**Considered:**

1. *One panel, two sections* — a single Settings surface, sections as headers. **Chosen (L1).**
2. *Two surfaces* — app settings in shell chrome, library settings beside Details/Rights in
   LibraryHome. Rejected: each object gets settings where it lives, which is principled, but it
   doubles the surface and the library half would duplicate publish controls that already exist in
   `Publish.svelte`.
3. *App-scoped only* — ship half, defer the IA question. Rejected: the two genuinely
   library-scoped items (publish target, unlisted default) are exactly the ones authors ask about,
   and deferring them means the panel launches without answering its most common question.

**Rationale for the chosen shape:** the panel's job is mostly *revealing* existing state, and
revelation benefits from one address. Two surfaces optimise for conceptual tidiness at the cost of
the thing the feature is for — the author finding the setting. The section header does the teaching
that a separate surface would have done structurally, at a fraction of the cost.

## Referenced documents

- `ledgers/EXPLORE-studio-folder-export-settings-2026-07-26.md` — §4 is this design's input.
- `docs/plans/native-canonical-store.md:304` — the "keep until manual clear" answer L3 implements.
- `.claude/rules/perf-measure-the-flow.md` — why both worker paths degrade silently (C5, L4).
- `.claude/rules/studio-ts-typecheck-gate.md` — the `.ts` gate (C1).
- `.claude/rules/metadata-rights-keyed-writebacks.md` — why L7 exists (C4).
- `docs/research/freecut-lessons.md` + `Prior Art/freecut/src/features/.../use-auto-save.ts` —
  the autosave control L2 deliberately diverges from.

## Traceability

**RXS** — R1→L1 (panel exists) · R2→L1+L4 · R3→L3 · R4→L4 · R5→L2 · R6→L5 · R7→L1+L6 · R8→L2,L3,L7.
No silent gaps.

**SXR** — L1→R7 · L2→R5,R8 · L3→R3,R8 · L4→R4 · L5→R6 · L6→R7 · L7→R8. No orphaned decisions.

## Next

Route: **writing-plans**. Both blocking questions are now answered (see above), so nothing gates the
plan — except that **L5 should be re-decided before it is planned**: the flags answer undercut its
premise, and L5 was a user-gated decision, so it is the user's to change rather than mine.
