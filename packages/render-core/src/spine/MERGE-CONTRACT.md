# The annotation merge contract

**What this is.** The single, testable specification of how Archie's annotation versions merge —
extracted from the code that implements it (`log.ts`, `merge.ts`, `heads.ts`, plus the carry
sentinels those files hold). It exists because the SAME contract serves two delivery paths: the
async zip round-trip (a teacher merges student `.archie.zip`s — `classifyLogical`/`mergeLogs`) and
the live/multi-tab path (concurrent sibling revs over a synced rev-log — `headsOf` +
`resolveConflict`; proven in `ledgers/PROBE-collab-crdt-mapping.md`, Scale-up section). Neither
path may fork its own semantics; both are specified here, once.

**Who reads it.** Anyone building a consumer of the merge layer (MergeReview UI, live-sync
transport, zip import) or changing the spine. Every clause below is a pinned, numbered behavior
(C1…C18) with the implementing `file:line` and a characterization test carrying the clause id in
its name (`merge-contract.test.ts`; coverage table at the bottom). Change a behavior and its test
fails; that is the point — this document describes what the code DOES, and where what it does looks
wrong, the clause says so and the issue is logged under **Open questions**, not silently smoothed
over.

**The model in one paragraph.** A note is a `logicalId` (global ULID). Its history is a set of
`AnnotationRecord`s in an append-only log; each record is a DAG node with a per-record-unique
`rev` (ULID) and a `parent` rev (`null` for the root) — see `../wadm/types.ts:204-246`. Concurrent
edits of the same note produce **sibling revs** = plural **heads** (records no other record points
at). Merging two logs is a set union by `rev`; conflicts are never auto-resolved — a human collapses
plural heads into one **merge node** carrying `mergeParents`. `version` is a human-facing citation
ordinal, not identity. `modifiedAt` is an in-card tiebreaker hint, never an auto-resolution signal
(clock skew = silent data loss — `../wadm/types.ts:204-208`).

---

## A. Appending versions (the write primitives)

### C1 — Creation appends a v1 root
`appendNew` (`log.ts:90-109`) appends a record with `version: 1`, `parent: null`, `deleted: false`,
a freshly minted ULID `rev`, and a freshly minted `logicalId` unless the caller supplies one.
Optional content fields (`body`, `motivation`, `reading`, `emphasis`, `wholeObject`, `geo`) are
emitted only when set (byte-stability). The returned log is a NEW frozen array; `append`
(`log.ts:26-28`) never mutates its input.

### C2 — An edit is a single-parent child of the single head
`appendEdit` (`log.ts:156-186`) reads the note's single head (via `linearHead`, C4) and appends
`version: head.version + 1`, `parent: head.rev`, `deleted: false`, fresh `rev`. Content fields
carry forward from the head unless the input overrides them; for `reading`/`emphasis`/`geo`,
`undefined` = carry forward, `null` = clear, value = set (`log.ts:163-168`); `wholeObject`
normalizes to `true | undefined` (`false`/`null` clear it). An edit never carries `mergeParents` —
a named `{drop}` in the `_editCarry` sentinel (`log.ts:133-149`; see C14). Editing a tombstoned
note throws (`log.ts:158-160`; resurrection is undefined in v1).

### C3 — A delete is a tombstone version, never a removal
`appendDelete` (`log.ts:217-233`) appends `deleted: true`, `version: head.version + 1`,
`parent: head.rev`, keeping ONLY `target` (for citation/dereference) — the six content fields are
deliberate named drops in `_deleteCarry` (`log.ts:198-214`). Deleting an already-tombstoned note
throws (`log.ts:219-221`).

### C4 — Writes require a single head; the plural-head refusal is a feature
`linearHead` (`log.ts:41-61`) returns the one version no other version of that note references as
`parent`. It throws on: an absent note (`log.ts:43-45`); PLURAL heads (`log.ts:50-52`) — so
`appendEdit`/`appendDelete` refuse to write into an unresolved branch, and UIs must gate editing
while a conflict is open (verified live in `ledgers/PROBE-collab-crdt-mapping.md`); and zero heads
= a cyclic DAG, reported as corruption rather than guessed around (`log.ts:57-59`).
**⚠ Known defect — see OQ-1:** `linearHead` builds its referenced-set from `parent` pointers ONLY
(`log.ts:46-48`), ignoring `mergeParents`, so it ALSO throws on a note whose branch was already
resolved (C12). Current behavior — pinned by test — is that a resolved note cannot be edited or
deleted, and `classifyLogical` (C11) throws on any log containing a past resolution.

## B. Deriving current state (the read projections)

### C5 — Heads are the unreferenced tips, mergeParents-aware
`headsOf` (`merge.ts:106-111`) returns the note's versions that no version of the same note
references via `parent` OR `mergeParents` (`parentsOf`, `merge.ts:41-43`). Plural heads = an
unresolved concurrent branch. An absent note yields `[]` (no throw). Tombstone heads are included
— filtering deleted state is the projection's job (C6). Unlike `linearHead` (C4), `headsOf` counts
`mergeParents` as references, so a resolved note has exactly one head.

### C6 — The heads projection is deterministic and tombstone-hiding
`projectHeads` (`heads.ts:20-29`) maps the whole log to its live heads: per logicalId, every
non-deleted head (plural heads all appear — honest degradation), sorted by `(logicalId, rev)` so
the output is independent of log record order. It is idempotent: projecting the projection returns
the same set.

## C. Merging logs (the async-zip path)

### C7 — mergeLogs is a set union by rev; on collision, local wins
`mergeLogs` (`merge.ts:114-128`) unions two logs deduping by `rev`: every local record in local
order, then each incoming record whose `rev` was not seen. Shared history appears once. A `rev`
collision with DIFFERENT content keeps the LOCAL record and silently drops the incoming one — revs
are unique by construction (ADR-0003) so a content-differing collision is corrupt/forged input
(pinned; see OQ-2). Output is frozen.

### C8 — mergeLogs algebra: set-commutative, idempotent, associative — NOT sequence-commutative
`mergeLogs(a, b)` and `mergeLogs(b, a)` contain the same SET of records but in different array
order (`merge.ts:117-126`: local order first). All downstream semantics are order-independent —
`headsOf` (C5), `classifyMerge` (C10), and `projectHeads` (C6, which sorts) give identical answers
either way — so the union is commutative where it matters, and only there. `mergeLogs(a, a)`
returns exactly `a`'s records (idempotent); merging the same log again adds nothing.

### C9 — Ancestry: lineage is primary-chain-only; ancestors and merge-base are multi-parent
`lineage` (`merge.ts:25-38`) walks self-then-`parent` to the root, cycle-guarded — it does NOT
follow `mergeParents` (documented at `merge.ts:87-88`). `ancestors` (`merge.ts:46-59`) is the
proper-ancestor set (excludes self) following `parent` + `mergeParents`. `commonAncestor`
(`merge.ts:89-103`) picks the shared ancestor minimizing summed BFS distance from both heads
(`ancestorDepths`, `merge.ts:64-84`, also multi-parent), or `null` for unrelated histories. A rev
reachable only through a `mergeParents` edge IS an ancestor and CAN be the merge-base.

### C10 — Classification is ancestry-only: identical / fast-forward / conflict
`classifyMerge` (`merge.ts:140-147`): same rev → `identical`; one head an ancestor of the other →
`fast-forward` with `ahead` = the descendant (no conflict card); otherwise `conflict` with
`base` = `commonAncestor` (C9), which is `null` when the heads share no history (e.g. two roots,
C18). `modifiedAt` plays no part (C16).

### C11 — classifyLogical is the per-note zip entry point over individually-linear inputs
`classifyLogical` (`merge.ts:160-169`): a note present in only one log is `only-local` /
`only-incoming` (the common disjoint case); present in neither throws; present in both classifies
the two heads (C10) against the union (C7). Both inputs are REQUIRED to be individually resolved —
it reads each side's head via `linearHead`, so a side with plural heads throws (C4).
**⚠ Via OQ-1 this currently also throws when a side's log contains an already-resolved branch.**

## D. Resolving a branch (the merge node)

### C12 — Resolution appends one multi-parent merge node with a deterministic primary
`resolveConflict` (`merge.ts:229-265`) requires ≥ 2 heads (else throws, `merge.ts:231-233`). It
sorts the heads by `rev` (plain lexicographic, `merge.ts:234`); the FIRST is the **primary**:
`parent = primary.rev`, `mergeParents` = the remaining heads' revs in sorted order
(`merge.ts:251-252`). `version = max(head versions) + 1` (`merge.ts:236,250`), `deleted: false`
always, fresh `rev`, `modifiedAt` = resolution time. Works for any head count (three-way and up).
After it, `headsOf` returns exactly the merge node (C5), and the node behaves as a normal parent
for FURTHER branching: a later sibling of a pre-resolution head conflicts against the merge node
with the shared head as base, and resolving again nests cleanly (resolve-then-resolve).
Note: revs are time-prefixed ULIDs (`../wadm/brand.ts:71-77`), so "lexicographically-first" in
practice means "minted earliest" — see OQ-4 on the tension this carries.

### C13 — Omitted resolution content defaults to the primary head's
`body`, `target`, and `motivation` on the merge node come from `resolution.*` when supplied, else
from the PRIMARY head (`merge.ts:237-238,256-258`). This is a deterministic default, not a merge:
the non-primary heads' content is retained only in history. The conflict-card UI is expected to
pass the user's chosen/merged content; the default exists so a headless resolution is still
deterministic. **⚠ If the primary head is a tombstone, the default body is `undefined` — see OQ-3.**

### C14 — reading/emphasis/wholeObject/geo carry through resolution, compiler-guarded
The four interpretive fields come from `resolution.*` when supplied, else are INHERITED from the
first head in sorted order that carries the field — ANY head, not just the primary
(`merge.ts:241-246`), so "has a reading" vs "no reading" keeps the reading instead of dropping it
on rev ordering. When two heads carry DIFFERENT values, the lexicographically-first carrier wins
(same sorted order as C12). The full field inventory is compiler-guarded by the `_mergeCarry`
sentinel (`merge.ts:200-216`) — `satisfies Record<keyof AnnotationRecord, CarryDisposition>`
(`../model/carry.ts:18`), per `.claude/rules/render-core-data-integrity.md` #3. Dispositions: every
field is `"carry"` (identity/DAG fields re-minted or computed; content fields resolved-or-defaulted
as above); the sentinels with named `{drop}`s are the edit (`mergeParents`, `log.ts:138`) and the
tombstone (the six content fields, `log.ts:203-213`).

### C15 — Tombstones and branches: delete-vs-edit is a real (part-hidden) conflict
A concurrent edit and delete of the same note are sibling heads: `headsOf` reports both (C5) while
`projectHeads` shows only the live edit (C6) — the viewer renders one note, but writes are blocked
by C4 until resolved. `resolveConflict` over a branch containing a tombstone produces a LIVE node
(`deleted: false` unconditionally, `merge.ts:255`); there is no way to resolve a branch TO deleted
in one step — the API shape implies resolve-live-then-`appendDelete` (currently impossible per
OQ-1). The tombstone contributes nothing to field inheritance (it has no content fields, C3).

## E. Cross-cutting invariants

### C16 — modifiedAt is an in-card tiebreaker ONLY
Classification (C10) and resolution (C12) never read `modifiedAt`; a later timestamp does not
fast-forward or win anything (`../wadm/types.ts:204-208,223-224`). The ONLY sanctioned use is
`conflictTiebreak` (`merge.ts:176-178`), a UI hint inside a conflict card that prefers the later
`modifiedAt` and returns its FIRST argument on ties. Callers must surface both sides regardless.

### C17 — version is a citation ordinal, not identity; identity is rev, everywhere
`version` is NOT unique under concurrency (sibling heads share it) and is never renumbered — that
would break citation integrity (`log.ts:1-9`, Q-6; `../wadm/types.ts:217-218`). Everything that
must dedupe or address records does so by `rev`: `mergeLogs` (C7), `indexByRev`
(`merge.ts:18-22`), and `fromHistory` (`../spine/deserialize.ts:140-151`), which reconstructs the
log from history pages deduping by `rev` in first-seen order, independent of page iteration order —
a doubled page collapses, while distinct revs sharing `(logicalId, version)` (a genuine unresolved
branch) are preserved.

### C18 — A duplicate explicit logicalId creates a second root (unguarded)
`appendNew` accepts an explicit `logicalId` and performs no existence check (`log.ts:90-91`): a
second `appendNew` with the same id appends a second `parent: null` root. The note then has two
heads with NO shared ancestry — `classifyMerge` reports `conflict` with `base: null` (C10), and
`resolveConflict` will collapse them like any branch. Pinned as current behavior; see OQ-5.

---

## Open questions (found while extracting; NOT fixed — behavior above is pinned as-is)

**OQ-1 — `linearHead` ignores `mergeParents`: a resolved note is uneditable (BUG).**
`log.ts:46-48` collects only `parent` pointers, so after `resolveConflict` the non-primary head
(referenced only via the merge node's `mergeParents`) still looks unreferenced: `linearHead` sees
{merge node, non-primary head} = plural and throws, while `headsOf` correctly reports one head
(C5). Consequences, all proven by test (C4/C11 tests): `appendEdit` and `appendDelete` throw on
any note with a resolved branch in its history — resolution permanently locks the note; and
`classifyLogical` throws on any log containing a past resolution, breaking the async-zip path
post-resolve. `session.ts` (`edit` → `appendEdit`) inherits this, so the studio, too. The fix
direction is obvious (share `parentsOf`), but it is a behavior change — out of scope for this
characterization.

**OQ-2 — `mergeLogs` rev-collision keeps local content unchecked.** Two records with the same
`rev` but different content merge to the LOCAL one with no equality check or report (C7). By
construction this "can't happen"; when it does (corrupt or forged zip), divergence is silent.
Worth deciding: assert-equal, or report like `AnnotationsCorruptError` does for pages.

**OQ-3 — A tombstone primary yields a live, body-less merge node.** In a delete-vs-edit branch
where the tombstone's rev sorts first, a resolution that omits `body` defaults it from the
tombstone — which has none — producing `deleted: false` with no body while the surviving edit's
body sits in history (C13/C15, pinned). Deterministic, but arguably the least useful default; a
conflict card that always supplies content masks it.

**OQ-4 — The "deterministic primary" is wall-clock-flavored.** Primary = lexicographically-first
`rev`, and revs are time-prefixed ULIDs, so the default-content donor (C13) is in practice the
EARLIEST-minted head. This never auto-resolves anything (both sides still surface, C16) — the
contract's promise is determinism given the revs, not clock-independence of the default. Stated so
nobody mistakes it for a violation of the modifiedAt doctrine, and nobody relies on
"first = oldest" as a semantic guarantee.

**OQ-5 — `appendNew` does not guard against a duplicate explicit `logicalId`** (C18). Callers
minting fresh ids are safe; an importer replaying ids could silently fork a note into a
base-less branch. Decide: throw, or document as the intended "adopt this id" affordance.

**OQ-6 — Delete-vs-edit conflicts are invisible to viewers.** `projectHeads` hides the tombstone
head (C15), so nothing in a pure read path signals the branch; only a write attempt (C4) or
`headsOf` reveals it. MergeReview (`Archie-d71c`) should read `headsOf`, not `projectHeads`, for
conflict discovery — `session.conflicted` already does.

## What the spine gate (Archie-494c) inherits

If authored structure (sections/readings — today whole-file LWW, `ledgers/AUDIT-stable-ids.md`)
gets the same rev-log treatment, the clauses split cleanly:

- **Transfer as-is:** C1-C5, C7-C12, C16-C17 — they are content-agnostic DAG semantics (append,
  heads, union-by-rev, ancestry, classification, merge-node shape). The record type changes; the
  contract doesn't.
- **Need re-derivation:** C13-C14 — the carry/default dispositions are per-field decisions; a
  section record's fields (title, object membership, ORDER KEY) each need a sentinel entry and an
  inherit-vs-primary-default choice. Order is the hard one: array-index order (the audit's fix
  item 2) has no per-field carry at all — concurrent reorders need an order-key merge rule this
  contract does not contain.
- **Break / must be fixed first:** C4's OQ-1 — structure edits after a resolution would hit the
  same lock; fix `linearHead` before reusing the write primitives. C6/C15's tombstone-hiding also
  needs rethinking for structure (a deleted section hides its children, not just itself).
- **New clauses needed:** cross-record invariants (a note's `reading` pointing at a reading
  record; a section's object list) — this contract is strictly per-logicalId and has no
  referential-integrity story across notes.

## Coverage (clause → characterization test in `merge-contract.test.ts`)

| Clause | Test(s) |
|---|---|
| C1 | `C1 — creation appends a v1 root` (2 tests) |
| C2 | `C2 — an edit is a single-parent child of the single head` (3 tests) |
| C3 | `C3 — a delete is a tombstone version` (2 tests) |
| C4 | `C4 — writes require a single head` (3 tests, incl. OQ-1 pin) |
| C5 | `C5 — heads are the unreferenced tips, mergeParents-aware` (3 tests) |
| C6 | `C6 — the heads projection is deterministic and tombstone-hiding` (2 tests) |
| C7 | `C7 — mergeLogs is a set union by rev; local wins collisions` (3 tests, incl. OQ-2 pin) |
| C8 | `C8 — mergeLogs algebra` (3 tests) |
| C9 | `C9 — ancestry` (3 tests) |
| C10 | `C10 — classification is ancestry-only` (3 tests) |
| C11 | `C11 — classifyLogical` (3 tests, incl. OQ-1 pin) |
| C12 | `C12 — resolution node shape and deterministic primary` (4 tests) |
| C13 | `C13 — omitted resolution content defaults to the primary head's` (2 tests) |
| C14 | `C14 — field carry through resolution` (3 tests) |
| C15 | `C15 — tombstones and branches` (3 tests, incl. OQ-3 pin) |
| C16 | `C16 — modifiedAt is an in-card tiebreaker only` (3 tests) |
| C17 | `C17 — version is a citation ordinal; identity is rev` (3 tests) |
| C18 | `C18 — duplicate explicit logicalId creates a second root` (1 test, OQ-5 pin) |

Existing suites (`merge.test.ts`, `heads.test.ts`, `log.test.ts`, `resolve.test.ts`,
`deserialize.test.ts`) predate this contract and overlap several clauses; they are untouched and
remain authoritative for what they pin. This file's suite adds the clause-labeled layer.
