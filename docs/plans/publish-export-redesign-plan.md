# Publish/Export Redesign — Implementation Plan

> **For agentic workers:** Use executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax.
> Spec: `docs/plans/publish-export-redesign.md` (locked decisions LD1–LD5 are constraints, not open).

**Goal:** An author publishes changes to their library's remembered home in ≤2 clicks, and reaches
file exports (.zip / single .html / folder-with-viewer / deposit bag) from the same `Publish ▾`
entry without the two jobs interleaving.

**Architecture:** `Publish.svelte` (1568 lines, `menuPhase` state machine at `:231`, the "choose"
wall at `:604–722`) stays the single-scrim shell and router; the wall is replaced by three focused
components — `ExportMenu.svelte` (artifacts), `SetupFlow.svelte` (first-run destination/quality,
one question per screen), `PublishSheet.svelte` (home card) — all fed by the existing verdict
model (`export-surface.ts` `rowsFor`/`chooseInitial`/`isPublishable`) and the existing home memory
(`deploy/remembered.ts`; `deploy-flows.svelte.ts:169` already calls `rememberTarget` on deploy
success). The GitHub wizard states (`publish-machine.svelte.ts`, resume set `isResumableState:50`,
Archie-7d9b) are reused untouched.

**Tech stack:** Svelte 5 runes, studio vitest, Playwright e2e (`STUDIO_E2E_PORT`, config
`apps/studio/e2e/playwright.config.ts`).

**Gates for every wave:** `pnpm --filter @archie/studio run check` (0/0),
`cd apps/studio && pnpm typecheck`, `cd apps/studio && pnpm exec vitest run`. Any prop-wiring or
visibility claim additionally needs a browser drive ([[svelte-no-typecheck-net]]).

---

## File structure

| File | Responsibility |
|---|---|
| `apps/studio/src/Publish.svelte` (modify) | Scrim shell, single-scrim invariant, router: home? → PublishSheet : SetupFlow; `export` phase → ExportMenu; wizard/progress phases unchanged |
| `apps/studio/src/ExportMenu.svelte` (create) | Artifact list + sheets: zip (reuses `ZipExportFields.svelte`), viewable pair (single .html / folder-with-viewer), deposit bag; greyed-with-reason rows |
| `apps/studio/src/SetupFlow.svelte` (create) | First-run: destination screen (from `rowsFor`) → auth/folder handoff → quality screen (only when it matters) |
| `apps/studio/src/PublishSheet.svelte` (create) | Home card: URL, last published, facts once, [Publish changes], [View site], Preview, "Change where this publishes…" |
| `apps/studio/src/export-surface.ts` (modify) | Add `qualityMatters(destination, probe)`; copy constants move to sentence case |
| `apps/studio/src/deploy/remembered.ts` (modify) | Add `forgetTarget(libraryId)` and a `publishedAt` timestamp on `rememberTarget` |
| `apps/studio/e2e/publish-surface.spec.ts` (create) | Drives entry menu, setup path, export menu, refusal cross-link |

---

### Task 1: Decision record — mint Q-15

**Orient:** Downstream plans must be able to cite the surface shape as a stable constraint, not prose.
**Flow position:** Wave 0, no code flow — governs all later tasks.
**Skill:** `none`
**Files:** Modify: `docs/decisions/archie.md`

- [ ] Read `docs/decisions/archie.md`, confirm next free Q-N. Verified 2026-07-28: highest existing is Q-14 (drive harness) — mint Q-15.
- [ ] Add Q-15: "Publish surface = remembered-home card + export menu (spec LD1–LD5); rules out per-run destination choice and the one-wall dialog."
- [ ] Run: `node scripts/doclint.mjs` Expected: PASS. Commit `docs(decisions): Q-15 publish surface shape`.

### Task 2: Home memory — `forgetTarget` + `publishedAt`

**Orient:** The publish sheet needs "last published" and "Change where this publishes…" needs a way to clear the home; `remembered.ts` has neither.
**Flow position:** Wave 0, contract producer (remembered.ts → PublishSheet, SetupFlow).
**Skill:** `tdd`
**Files:** Modify: `apps/studio/src/deploy/remembered.ts`, `apps/studio/src/deploy/deploy-flows.svelte.ts:169` (pass timestamp) · Test: `apps/studio/src/deploy/remembered.test.ts` (extend; create if absent)

<contracts>
**Downstream (remembered → sheet/setup):**
- `rememberedTarget(libraryId): { target: DeployTarget; url: string; publishedAt?: number } | null`
- `forgetTarget(libraryId): void` — after it, `rememberedTarget` returns null
- Invariant: records written by the OLD shape (no `publishedAt`) still load — field is optional, never assumed.
</contracts>

- [ ] Failing tests: forget clears; remember stamps `publishedAt`; a legacy record without the field round-trips.
- [ ] Implement; wire the timestamp at the existing `rememberTarget` call (`deploy-flows.svelte.ts:169`).
- [ ] Run: `cd apps/studio && pnpm exec vitest run src/deploy` Expected: PASS. Full gates. Commit.

### Task 3: ExportMenu extraction [CHANGE SITE]

**Orient:** Exports must stop sharing a wall with site publishing (R3) — this moves them, behavior-preserving, into their own component; the zip sheet keeps `ZipExportFields.svelte` and its handlers byte-for-byte (R7).
**Flow position:** Wave 1: Publish.svelte router → **ExportMenu** → existing sinks (`downloadProjectZip`, `exportSelfContained`, deposit callback, `localPublishFolder` as one-off viewable copy).
**Upstream contract:** Receives `probe: ArchiveProbe`, the sink callbacks Publish.svelte already holds (`ondeposit`, `onexportselfcontained`, zip handlers), and `onback`.
**Downstream contract:** Calls the SAME `publish-flows` functions the wall calls today — no new sink logic.
**Skill:** `tdd` (logic) — visibility claims verified by drive, not svelte-check
**Files:** Create: `apps/studio/src/ExportMenu.svelte` · Modify: `apps/studio/src/Publish.svelte` (`menuPhase` gains `"export"`; move `zip-options` `:726`, `done-download` `:744`, `done-deposit` `:847` blocks and the deposit/single-file buttons `:702–722`) · Test: extend `apps/studio/src/Publish.test.ts`

- [ ] Move markup + handlers; the viewable pair renders as siblings: "Single .html file" and "Folder with built-in viewer" (the latter = existing folder one-off, greyed-with-reason where `folderSinkSupported()` is false).
- [ ] Run gates. Drive (run-app skill or e2e): open Export menu → zip sheet renders, deposit reachable. Expected: every artifact reachable in ≤2 clicks from the menu.
- [ ] Commit.

### Task 4: SetupFlow — first-run, one question per screen [CHANGE SITE]

**Orient:** A first-time publisher answers where → auth → quality (only if it matters), instead of reading 15 blocks (R2, R4, R5).
**Flow position:** Wave 2: Publish.svelte router (no home) → **SetupFlow** → existing wizard (`menuPhase "wizard"`) / folder flow.
**Upstream contract:** `rowsFor(probe, tier)` rows — every row rendered, unavailable rows quiet (muted, sentence case, reason on the row, NEVER red caps).
**Downstream contract:** hands the chosen destination to the same handlers the wall used; `chooseInitial` still pre-selects; `isPublishable` still gates the button.
**Skill:** `tdd`
**Files:** Create: `apps/studio/src/SetupFlow.svelte` · Modify: `apps/studio/src/Publish.svelte` (choose wall replaced for the no-home path), `apps/studio/src/export-surface.ts` (add `qualityMatters(dest, probe): boolean` — true iff tiers differ in whether they fit the destination's cap or the destination is size-priced) · Test: `apps/studio/src/export-surface.test.ts`

- [ ] TDD `qualityMatters`: GitHub + archival-doesn't-fit → true; zip → true (size shown); folder → false.
- [ ] Build the stepped screens; quality screen renders ONLY when `qualityMatters`; facts appear once per screen.
- [ ] Run gates + drive: with no remembered target, `Publish ▾ → Publish` lands on destination screen; picking GitHub enters the existing wizard. Commit.

### Task 5: PublishSheet — the home card [CHANGE SITE]

**Orient:** The ≤2-click publish (R1): home set → one compact sheet, one primary button. The machine's auth/progress/repo-picker states are entered, never modified (R7).
**Flow position:** Wave 3: Publish.svelte router (home set) → **PublishSheet** → machine `update-confirm`/`publishing` states.
**Upstream contract:** `rememberedTarget(libraryId)` (Task 2 shape) + `probe` facts.
**Downstream contract:** [Publish changes] enters the machine exactly where the current re-deploy path does; "Change where this publishes…" calls `forgetTarget` then routes to SetupFlow; [View site] uses the machine's `openExternal` (hostname-pinned, Archie-2139).
**Skill:** `tdd`
**Files:** Create: `apps/studio/src/PublishSheet.svelte` · Modify: `apps/studio/src/Publish.svelte` · Test: extend `apps/studio/src/Publish.test.ts`

- [ ] Sheet shows: URL, "Last published <relative time>" (absent for legacy records — show nothing, not "never"), size + upload estimate + "carries its own viewer" once.
- [ ] Run gates + drive: with a remembered target, opening Publish lands on the sheet; Publish changes reaches `update-confirm`; Change-where lands on SetupFlow. Resume invariant (Archie-7d9b): reopening mid-publish still lands on progress, bypassing the sheet.
- [ ] Commit.

### Task 6: Entry point — `Publish ▾` [CHANGE SITE]

**Orient:** One header button carries both verbs (LD4); today's button opens the wall directly.
**Flow position:** Wave 4: editor header → **Publish ▾ menu** → Publish.svelte with an `intent` ("publish" | "export").
**Skill:** `none` (wiring; drive-verified)
**Files:** Modify: `apps/studio/src/App.svelte` — the header entry is the `publish-signal` button at `:2280` (`onclick` → `ensurePub().then((p) => p.openMenu())`; `openMenu` is `publish-flows.svelte.ts:726`, a DIFFERENT function from `openPublish:834`). The `<Publish>` mount props sit near `:2797` (`onenterweb={p.openPublish}`). Locate by `grep -a -rn "publish-signal" apps/studio/src` — NOT by grepping `openPublish`, which never surfaces the button. Also modify: `apps/studio/src/Publish.svelte` (accept `intent` prop, default "publish"). NUL-byte warning: `publish-flows.svelte.ts` contains NUL bytes — plain `grep` returns zero matches on it; always `grep -a`.

- [ ] Split-button: primary = Publish (sheet or setup), menu item = "Export a copy…" (ExportMenu).
- [ ] Run gates + drive: both entries land on the right surface; a prop typed but not destructured is exactly the [[svelte-no-typecheck-net]] class — the drive is the gate, not svelte-check.
- [ ] Commit.

### Task 7: Copy pass, refusal cross-link, dead code, e2e

**Orient:** R4/R5/R6 finish here: quiet copy everywhere, the single-file refusal routes to its sibling, the old wall dies, and the flows get a pinned e2e.
**Flow position:** Wave 5: all nodes — final pass.
**Skill:** `shadow-walk` after implementation; copy via product-copy skill
**Files:** Modify: `apps/studio/src/Publish.svelte` (delete dead choose-wall markup; refusal at `:429` gains "…or export the folder with built-in viewer" routing to ExportMenu), copy strings in `export-surface.ts` `DESTINATION_BLURB`/`TIER_BLURB` · Create: `apps/studio/e2e/publish-surface.spec.ts`

- [ ] e2e (distinct `STUDIO_E2E_PORT`, [[viewer-e2e-shared-port]]): no-home → setup screens; export menu → zip sheet; refusal copy names the sibling (assert string; the 770MB trigger itself is not fixture-reachable — [[playwright-count-does-not-wait]] discipline: assert states, never bare counts).
- [ ] Red-green each new e2e assertion (inject, watch fail, restore — commit before probing).
- [ ] `grep -c "menuPhase === \"choose\"" apps/studio/src/Publish.svelte` Expected: 0. Full gates + shadow-walk of both verbs. Commit.

---

## Execution waves

- Wave 0: Tasks [1, 2] (parallel) — no dependencies
- Wave 1: Task [3] — depends on Wave 0 (Q-15 citable; no code dependency on Task 2)
- Wave 2: Task [4] — depends on Wave 1 (router shape)
- Wave 3: Task [5] — depends on Wave 2 (SetupFlow exists for Change-where) and Task 2
- Wave 4: Task [6] — depends on Waves 1–3 (both surfaces exist)
- Wave 5: Task [7] — depends on all

Every wave lands green on all gates before the next starts (≤5 files per wave, per repo phase discipline).

## Open questions

### Flow contracts
- Q: Does anything besides `deploy-flows.svelte.ts:169` write remembered targets? (assumed no — verify with grep before Task 2.)
- Q: Where exactly does the re-deploy path enter the machine (`update-confirm` vs `computeInitial`)? Task 5 must enter the same state; read `publish-machine.svelte.ts:238–292` first.

### Per wave
- **Task 3:** does `onexportselfcontained` (single .html) already carry its own progress phase, or reuse `working`? Read `Publish.svelte:417–435` before moving.
- **Task 5:** legacy remembered records lack `publishedAt` — sheet copy for that case is "show nothing" (decided above); confirm no other consumer asserts on the field.
- **Task 6 (blocking for that task only):** which component renders the header Publish button — resolve by grep at execution; if the answer is "3+ files", stop and surface before editing.
- **Folder-as-home** (persisted directory handle) is **Not Doing** in this plan — the folder destination stays available in Setup and as a one-off viewable copy; re-picked each time. v2 candidate.

## Artifact manifest

<!-- PLAN_MANIFEST_START -->
| File | Action | Marker |
|------|--------|--------|
| `docs/decisions/archie.md` | patch | `Q-15` |
| `apps/studio/src/deploy/remembered.ts` | patch | `forgetTarget` |
| `apps/studio/src/ExportMenu.svelte` | create | `viewable copy` |
| `apps/studio/src/SetupFlow.svelte` | create | `qualityMatters` |
| `apps/studio/src/export-surface.ts` | patch | `qualityMatters` |
| `apps/studio/src/PublishSheet.svelte` | create | `Change where this publishes` |
| `apps/studio/src/Publish.svelte` | patch | `intent` |
| `apps/studio/e2e/publish-surface.spec.ts` | create | `publish-surface` |
| `.seeds/issues.jsonl` | wire | `plan:publish-export-redesign` |
<!-- PLAN_MANIFEST_END -->

Seeds DAG (scheduler state; the plan is the spec): Task 1 = Archie-5aee, Task 2 = Archie-7941,
Task 3 = Archie-30df, Task 4 = Archie-0a9f, Task 5 = Archie-68c1, Task 6 = Archie-43f2,
Task 7 = Archie-bce2. Deps mirror the waves; `sd ready` currently offers the two Wave 0 tasks.

## Q-Reference summary

| Decision ID | Title (short) | Applied in |
|---|---|---|
| Q-15 (minted, Task 1) | Publish surface = home card + export menu | Tasks 3–7 |
| Q-12 | Desktop GitHub token persists in OS keyring | Task 5 (reuses machine auth unchanged) |
| Q-13 | Deploy upload is single-pack git2 push | untouched — constraint that Task 5 adds no new upload path |

Non-Q constraints carried: single-scrim invariant (`Publish.svelte:6`), resume set Archie-7d9b
(`publish-machine.svelte.ts:50`), hostname-pinned `openExternal` Archie-2139, greyed-with-reason
c367 (spec LD5).

## Shape changes

| Date | Role | Summary |
|---|---|---|
| 2026-07-28 | author | Q-14 was already minted (drive harness, 2026-07-22); the surface-shape decision renumbered to Q-15 throughout. |
| 2026-07-28 | author | Review fixes: Task 6's entry point corrected to the `publish-signal` button (App.svelte:2280, `p.openMenu()`) — grepping `openPublish` never finds it; R7 tags added to Tasks 3/5; NUL-byte grep warning added for publish-flows.svelte.ts. Reviewer: 1 blocker, 2 notes, all other checks pass. |
