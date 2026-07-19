# PROBE — annotation model → CRDT mapping

**Run:** 2026-07-18 · ticket `Archie-70e6` (map: Archie+ real-time-collab readiness, `Archie-f849`) ·
prototype `prototypes/crdt-annotation-merge/` (throwaway; `bun probe.ts`) · LOCAL only, in-memory
Yjs, no server · no flag (nothing wired into apps).

**Kill criterion (declared before any probe code; does not move):** if annotation-granular merge
does not hold — i.e. concurrent editing forces field-level CRDT semantics that require a **model
rewrite** — PARK and record. Meeting it → Status `parked`.

**Context inherited:** `ledgers/AUDIT-stable-ids.md` — annotation identity is already a global ULID
`logicalId`, and the spine is already a **version-DAG** (`wadm/types.ts:210`): each edit appends a
`rev` with a `parent`; concurrent edits become sibling revs = two heads, reconciled by
`resolveConflict`/`mergeLogs` and surfaced for MergeReview. So this probe is *confirm-and-measure*,
and the real question is **which Yjs layer**, not whether an id exists.

## Assumption ledger

| # | assumption | riskiest? | probe | result | verdict |
|---|---|---|---|---|---|
| A1 | `logicalId` (global ULID) is a stable key a CRDT can key annotations by | no | audit + both models key by it | Keys cleanly; no collision, stable across edits | **confirmed** |
| A2 | Annotation-granular merge holds **without a model rewrite** | **RISKIEST** | `probe.ts` Model B — map the append-only rev-log to a grow-only `Y.Map<rev, frozen Rec>`; drive concurrent same-field edits | Concurrent edits append **sibling revs**; after sync the log holds all 3 revs and `heads(lid-1)=2` — the exact branch `resolveConflict` handles today. The rev-log is a projection of the existing model, **not a rewrite** | **confirmed** |
| A3 | Two offline clients converge deterministically under local sync | no | `Y.applyUpdate` both directions; assert equal state | Both docs converge to the same 3 revs | **confirmed** |
| A4 | The correct layer **preserves** Archie's branch-and-review (DAG-heads) semantics | co-riskiest | contrast Model A (field-mapping) vs Model B (rev-log transport) | Model A **refuted as the layer**: mapping fields into `Y.Map` auto-merges a same-field concurrent edit to silent LWW — one author's text vanishes, no head, no MergeReview (`probe.ts` Case 2). Model B preserves both heads | **confirmed (Model B); Model A rejected)** |

## Verdict

**pursue** (2026-07-18). Kill criterion tested and **not met**: annotation-granular CRDT holds and
requires no model rewrite. The probe additionally *decided the layer*, which was the live risk:

- **Adopt Model B — Yjs (or any op-sync) as transport for the append-only rev-log**, a grow-only
  set keyed by `rev`. Archie's existing `heads`/`resolveConflict`/`mergeLogs` run **unchanged** and
  still surface concurrent edits as a reviewable branch.
- **Reject Model A — mapping annotation fields into a `Y.Map`.** It is trivial to build and it *is*
  a valid CRDT, but it silently auto-resolves a same-field concurrent edit (LWW), destroying one
  author's text and bypassing the branch-and-review semantics the collab UI depends on. Recorded so
  it is not re-invented as "the obvious Yjs way."

**What the downstream tickets inherit (with this ledger):**
- **D1 (local multi-tab live sync, `Archie-a66d`)** — now unblocked. Build it on the Model B rev-log
  transport, not field-mapping. The multi-tab demo replicates the grow-only rev-log; Archie's DAG
  merge does the reconciliation.
- **Spine gate (`Archie-494c`)** — now unblocked and sharpened. Annotations need **no** spine surgery
  (the CRDT sits beside the log as transport). The gate's real remaining question is *authored
  structure* (sections/readings ordering + the missing id-keyed merge, `AUDIT-stable-ids.md` fix
  items 2–3), which has no rev-DAG today — that is where an op-log decision actually bites.
- **B2 (merge-semantics spec, `Archie-697c`) / d71c (MergeReview UI)** — Model B keeps the branch
  that B2 specs and d71c surfaces. The live path uses the same merge contract as the async zip path;
  do not fork a second one.
- **CRDT dep** — `yjs` (+ only `lib0`) collides with **none** of the pnpm-workspace security overrides
  (`yaml`/`esbuild`/`dompurify`/`vite`/`undici`). Full advisory-level adoption vetting remains C2's job.

## Reproduce / clean up

`cd prototypes/crdt-annotation-merge && bun probe.ts`. Throwaway — delete the dir once this ledger is
read; the *answer* above is the only thing worth keeping (Model B, no rewrite).
