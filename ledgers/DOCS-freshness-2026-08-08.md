# Docs-freshness sweep — 2026-08-08

Trigger: user interjection ("a lot of the documentation might be stale") during the
architecture-deepening goal verification. Baseline: HEAD `caa3736` (deepening `8341381` +
read-path hardening). All gates green before and after this sweep (doclint 12/12, typecheck 6/6,
tests 1544/222/15/218/281/1293, cargo 38/1, verify-publish 26/26, checklist 6/6,
bundle/sync-dist/capabilities ok).

## Method

Five read-only scouts audited five disjoint doc clusters against the tree and git history; every
claim checked against code/git, never against other docs. Five fix agents then applied corrections,
each re-running doclint. The main session fixed HANDOFF.md, one agent rule, and this ledger.

## Findings

~12 HIGH, ~39 MED, ~20 LOW across ~45 files. Four clusters:

1. **State claims overtaken by commits.** HANDOFF.md's top sections described live-session work
   (uncommitted files, staged probes, an open `http.ts` relative-base finding, "still open" probes
   A/B/C/F, "8341381 shipped a red suite") — all landed in `caa3736`/`8341381`; the relative-base
   finding was fixed by the string-level `base.search(/[?#]/)` split. The deepening plan's
   "Verification record" ended "Work remains UNCOMMITTED on main (b7fb4ec)" — committed as
   `8341381`. `src-tauri/README.md` described a "not buildable" scaffold with "no custom Rust IPC" —
   the crate is CI-built and carries 8 custom commands (github/ device flow + keyring + pack-push,
   video transcode, single-instance). `hubs/data.md` said HttpFilesystem was "never built" — it is the
   tree half of the open seam. `docs/thumbnail-mitigations.md` framed WIP as uncommitted and gap-1
   (AV poster) as "Now" — both landed. `docs/state/REVIEW-COVERAGE.md` said Issue 17 (Archie-dace) was
   still open — closed 2026-07-23. README test counts (~1150) were ~3x understated — now ~3570.
2. **Dead citations after the deepening.** `PublishDialog.svelte` (deleted; now
   Publish/PublishSheet/ExportMenu/SetupFlow), `MarginColumn.svelte` (deleted), `reading-marks.ts`
   (collapsed into `reading-layer.ts`), `collab.ts` (moved render-core → apps/studio),
   `AddMapModal.svelte` (→ CreateExhibitDialog.svelte), viewer `Canvas.svelte` (→ render-svelte),
   plus ~20 shifted file:line references (re-anchored against current sources).
3. **Ticket-state errors** (verified in `.seeds/issues.jsonl`): the plan claimed Archie-e870 closed
   (OPEN — sidecar connected, real-Chromium encode still outstanding); REVIEW-COVERAGE claimed
   Archie-dace open (closed); HANDOFF-studio-preview-export claimed Archie-7b48 open (closed
   2026-07-27).
4. **Frozen docs** (ISSUES.md, PRFAQ.md) got dated CORRECTED blocks per the frozen-doc convention —
   originals preserved, no history rewrite.

## Fixes

87 edits across 40 files (+378/−244), then the main session's fixes:

| Cluster | Edits | Files |
|---|---|---|
| Root docs (README, DIVERGENCES, PRFAQ, ISSUES, rule) | 16 | 5 |
| docs/ tree (plan, CANON, thumbnail-mitigations, REVIEW-COVERAGE, adr/0019, redesign plan, strategy, harness) | 41 | 8 |
| ledgers (read-seam RESOLVED append, tauri-explore, trace, walltext, chrome-dock, preview-export) | 6 | 6 |
| hubs / .teach / recipes (data, publishing, process, verification, embed, TESTING, recipes README, EMBED, 4 .teach) | 19 | 12 |
| code-adjacent (src-tauri/README, qa hooks install, single-file-export header, driver.mjs, git2 spike) | 5 files | 5 |
| main session (HANDOFF sections 1+3 → committed state, rule last-bullet HTTP-backend claim) | 3 | 2 |
| this ledger | 1 | 1 |

CANON.md's triplicated "Cap rescale" section was collapsed to one copy and its "not yet made"
commits corrected to `4e8a353`/`6551bfc`.

## Scout false-positives caught by fix agents (audit discipline)

- SRI hashes in recipes/EMBED.md + TESTING.md were NOT stale — they verify byte-for-byte against
  the `v1.1` tag the recipes pin on jsDelivr; a HEAD rebuild differs. Kept; both recipes now note
  "recompute at each tagged release".
- `asClientId` lives at `packages/render-core/src/wadm/brand.ts:156`, not apps/studio.
- `IdentityPrompt.svelte` is imported by App.svelte only (MergeReview/LibraryHome mention it in
  comments).
- `ledgers/AUDIT-branches-2026-07-30.md` records branch deletion with the ticket open — correct
  as written (branch-closed ≠ ticket-closed).
- `/tmp/architecture-review-20260807-175201.html` belongs to a DIFFERENT project (Elicit); the
  Archie report is `/tmp/architecture-review-20260807-002529.html`.

## Not fixed (deliberate)

- `.github/workflows/checks.yml` — the two baseline steps are each triplicated (lines 198-213 /
  260-270), and `release-artifact.yml` cites `checks.yml:200` for a comment that moved to
  `:229-231`. CI hygiene, not docs; reported to the user, not edited.
- ISSUES.md/PRFAQ.md originals preserved under CORRECTED blocks (frozen-doc convention).
- Dated records keep their bodies; corrections are dated resolution notes appended.

## Verification

doclint PASS (12/12) after every cluster and after the final combined state. No code files touched
(scripts edits are doc comments only); no test/typecheck re-run needed — edit scope verified.
Declared uncommitted set (shared-worktree rule): this ledger, the 40 doc files, HANDOFF.md, the
rule, the pre-existing hub closure lines (other session), and the staged
`ledgers/PROBE-read-seam-adversarial-2026-08-08.md` (other session).
