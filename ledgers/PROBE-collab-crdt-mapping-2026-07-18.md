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

## Scale-up confirmation — D1, browser/multi-tab (2026-07-18, ticket `Archie-a66d`)

Model B re-proven at product scale: `prototypes/multi-tab-live-sync/` (throwaway, **deleted
2026-07-26** per the clean-up note below; recoverable from git history) drove the REAL
render-core merge machinery — `appendNew`/`appendEdit` (spine/log),
`headsOf`/`resolveConflict` (spine/merge), `projectHeads` (spine/heads), nothing stubbed — over a
grow-only `Y.Map<rev, AnnotationRecord>` synced across tabs via BroadcastChannel. Verified
end-to-end by a Playwright two-tab driver (`verify-two-tab.mjs`), **12/12 checks**: live edit
propagation; concurrent same-annotation edits → 2 heads + conflict panel in BOTH tabs; resolve in
one tab → real merge node → both converge; grow-only log (5 revs, nothing overwritten).

Load-bearing findings (beyond the terminal probe):
- **Key the Y.Map by `rev`, not `logicalId`** — that is what makes it grow-only + idempotent;
  logicalId-keying would re-create Model A's LWW overwrite. Do not "simplify" this.
- **`AnnotationRecord` round-trips Yjs as a plain object** — no codec, no brand-type friction,
  `Object.freeze` harmless.
- **`appendEdit` refuses a plural-head note** (`linearHead` throws) — a feature: any live-collab UI
  must gate editing while a conflict is open and route to resolve.
- **The live path uses the SAME merge contract as async-zip** (`resolveConflict` node,
  `mergeParents`, deterministic primary = lexicographically-first head). B2/`Archie-697c` and
  MergeReview/`Archie-d71c` must spec/surface this ONE contract, never fork a second. The branch
  data MergeReview needs (body+lastEditor+rev per head) is exactly `headsOf`'s output.
- **Transport is a seam** (`RevLogTransport`): BroadcastChannel proves the logic same-browser;
  a network transport (y-webrtc/y-websocket) slots in without touching the merge layer.
- API-surface note (C2 evidence, corrected after re-test): `@render/core/spine` tree-shakes
  browser-clean for the merge path (11 modules / 3.35 KB — persist/serialize shaken out); the
  prototype's leaf imports were defensible but not necessary. The REAL surface gaps: the root
  `.` barrel is genuinely heavy (one `headsOf` import → 67 modules / 120 KB; fs seam, tauri,
  sanitize via `export *`), there is no id-constructor subpath (`asClientId`/`asLogicalId`/
  `asRevId` reachable only via the heavy root), no dist/`.d.ts` (raw-TS `main` — outside
  consumers need a TS-native toolchain), and the exports map declares only `.` + `./spine`.

Spine gate (`Archie-494c`) inherits: annotations need no spine surgery for live collab — confirmed
in-browser; the gate's open question remains authored structure only.

## Reproduce / clean up

Terminal probe: `cd prototypes/crdt-annotation-merge && bun probe.ts` — still present.

The multi-tab demo (`prototypes/multi-tab-live-sync/`, `bun run dev` + `verify-two-tab.mjs`)
was **deleted 2026-07-26**, executing this section's own instruction: both were throwaway,
to be deleted once read, with this ledger holding the answers. Its D1 ledger — the durable
write-up this prototype existed to produce — is `ledgers/TABS.md`. Recover the prototype from
git history if a re-run is ever needed.
