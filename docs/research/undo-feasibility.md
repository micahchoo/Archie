# Undo on the annotation spine: freecut's gesture snapshot vs. a RecordsDiff stack

**Question (Archie-0f72):** freecut's undo is a gesture-scoped snapshot with reference-equality dedup
and a ring-buffer cap. Archie-69a6 built the other candidate — a tldraw-shaped `RecordsDiff` stack —
against the real spine. Which pattern fits `AnnotationSession`, what would each cost, and what is it
blocked on?

**Scope:** technical feasibility only. Whether authors want undo, and what it should be called in the
UI, are explicitly out of scope and are not argued either way below.

**Method:** direct source read of the freecut clone at `a3ecfce` under `Prior Art/freecut/`, every
claim cited `file:line` in that tree; and measurement against the working Archie-69a6 prototype
(`packages/render-core/src/session/{records-diff,undo}.ts`, 234 non-comment lines, 41 tests green in
`src/session/`). Where a claim below is a measurement it names the test; where it is a reading it
names the file. Two claims that the recommendation rests on were red-greened rather than asserted.

## The one incompatibility, and it is not about cost

Both candidate patterns were designed against a **mutable store**, and Archie has none.

freecut's `restoreSnapshot` is a sequence of writes: `setItems`, `setTracks`, `setTransitions`,
`setKeyframes`, `setMarkers`, `setCompositions`, `setFps`, `setCurrentFrame`
(`src/features/timeline/stores/commands/snapshot.ts:124-162`). tldraw's is the same move through
`store.put` / `store.remove`. Archie's spine is an append-only version DAG (ADR-0003, the keystone
decision) — a record, once appended, stays — so **neither pattern can be ported as written**.

What both *can* do is move a **projection overlay**: a per-note "show this instead / show nothing"
layer between the log's head records and the editing surface. Undoing a create hides the note; every
version of it stays in `session.entries`. That is the same move Archie already makes for a delete (a
tombstone hides a note without erasing its history), lifted one layer up. Archie-69a6 proves it
works: `undo.test.ts` asserts, for create/edit/delete, that the surface changes and
`session.entries` is byte-identical afterwards.

So the question is not *whether* the log survives — it does under either pattern — but **what the
overlay holds**: one whole projection array (freecut) or a per-logicalId diff (tldraw/69a6).

## What each pattern is, in Archie's terms

| | freecut snapshot | RecordsDiff stack (69a6) |
| --- | --- | --- |
| an undo entry holds | one reference to the whole `notes()` array | `{added, updated, removed}` keyed by logicalId |
| capture cost | free — `session.notes()` is already memoized (`spine/head-index.ts:161-164`) | O(1) per mutation: pre/post head via `conflictHeads` → `HeadIndex.headsOf`, a map read (`head-index.ts:185-187`) |
| undo cost | O(1) — swap one array reference | O(entries in the diff) |
| entry memory | one pointer; records structurally shared | one pointer per touched note; records structurally shared |
| dedup | `snapshotsEqual` compares by `===` (`snapshot.ts:169-189`) | none needed — see below |
| cap | `undoStack.slice(-(maxHistory - 1))`, default 50 (`timeline-command-store.ts:141`, `settings-store.ts:151`) | **absent in the prototype** |
| gesture scoping | pre-capture at drag start, one `addUndoEntry` at drag end (`keyframe-graph-panel.tsx:635-650`) | `mark(id)` / pending-diff flush — same shape, already built |
| per-context isolation | `stacksByContext`, parked and swapped on navigation (`timeline-command-store.ts:39-43,253-284`) | free in Archie — one manager per `AnnotationSession`, and Studio already holds one session per exhibit |

Three things this table gets right that the summary in `freecut-gaps.md` §Area 1 rounds off, and
they matter to the port:

1. **`snapshotsEqual` is not purely reference equality.** It is `===` on fifteen fields *plus* a
   `JSON.stringify` comparison for `busAudioEq` and a structural `projectMetadataEqual`
   (`snapshot.ts:184,187`) — because those two fields are rebuilt on restore and would otherwise
   never compare equal. The exception is the interesting part: **reference dedup breaks the moment
   anything on the snapshot is reconstructed rather than carried.**
2. **The dedup does not transfer to Archie at all.** freecut's `execute` records an entry only when
   the action changed something (`timeline-command-store.ts:137`), and a no-op action leaves every
   store array at its old reference. In Archie *every* `editNote` appends a version record, so the
   head is a new object and the projection always differs. There is no no-op to catch by reference;
   catching one would need content comparison, which is a different and more expensive thing. Do not
   port this as a win — it is a win for a store that mutates in place, not for a log that appends.
3. **`maxUndoHistory` is a live user setting, not a constant** — a settings subscription re-trims the
   stacks when the cap is lowered mid-session (`freecut-gaps.md` records this for the zundo-backed
   project-list store; the timeline store reads it per push at `timeline-command-store.ts:138,240`).

## What decides it: Archie has merge, freecut does not

freecut is single-user with no concurrent-edit model. Archie has `importChanges`, which merges a
colleague's log and replaces the session's log wholesale (`session/session.ts:236-242` →
`setLog` → a rebuilt `HeadIndex`).

A **whole-projection snapshot taken before that merge is stale afterwards**: restoring it would hide
every note the merge brought in. A **per-logicalId diff is not** — it overrides only the ids the
author actually touched, and everything else flows through.

Measured, red-green (`undo.test.ts`, *"an outstanding undo survives a colleague's merge"*): with the
per-id overlay, an undone note stays hidden and the merged note appears — `["theirs"]`. With the
overlay invalidated on any log-side change (the snapshot-shaped behaviour, injected) the assertion
goes red with `["mine-undone", "theirs"]`, the undone note resurrected by someone else's edit.

That is the deciding difference, and it is structural rather than a matter of tuning.

## Blockers

**Not blocked on the signals layer.** Studio's reactivity does not read array identity at all — it
reads an explicit revision counter: `let rev = $state(0)` with `const bump = () => { rev += 1; … }`
(`apps/studio/src/App.svelte:1109-1110`), consumed as `$derived.by(() => { void rev; return
sess.session.notes()… })` (`:1400`). An undo manager integrates by calling the same `bump()`. No
signals primitive is required, and the `@tldraw/state` port sketched in
`ledgers/RESEARCH-tldraw-source-scout-2026-07-22.md` §1 is not a prerequisite for either pattern.

**Not blocked on manager decomposition.** The prototype wraps `AnnotationSession` from outside and
`session.ts` is untouched. Decomposing the session was not needed and would not help.

**The one real cost is that there is no change-notification seam.** tldraw accumulates history from
`store.onChange(source: 'user', diff)`; `AnnotationSession` emits nothing, so every mutation has to
go through the wrapper instead. That is **18 call sites in two files**: `App.svelte` `:564, :945,
:1003, :1324, :1330, :1631, :1652, :1660, :1669, :1682, :1704, :1714, :1728, :1738, :1760, :1769`
and `ingest-flows.ts` `:1072, :1121`. (A bare
`grep -c 'session\.createNote|editNote|deleteNote'` reports 21 across five files — three of the
hits are *comments* in `library-meta.svelte.ts:107`, `conflict-gate.ts:3` and `csv-import.ts:22`
that name the methods in prose. The enumerated list above is the checkable one.)

Mechanical, reviewable, and the kind of sweep where a missed site fails **silently** — the edit lands
in the log and is simply absent from history. If this is built, the cheap insurance is a
session-level change callback rather than trusting a grep, so a new call site cannot bypass history
by omission.

**The blocker that neither pattern solves: undo does not survive a reload.** Measured
(`undo.test.ts`, *"THE BOUNDARY"*): create → undo → `save()` → `AnnotationSession.load` → the note is
back on the surface. The overlay is in memory and the log is the only durable thing, so reopening
re-projects every head including the undone one. freecut has the same property and treats it as a
decision — its history is in-memory Zustand and `clearHistory` wipes on project load
(`timeline-command-store.ts:201-210`) — but freecut's *document* is also mutable and saved, so
nothing reappears there. In Archie the undone note **comes back**, which is a user-visible
correctness question rather than a missing convenience. Closing it means one of:

- append a tombstone on undo-of-create (durable, but redefines undo as a new authored act, and makes
  redo an un-delete);
- persist the overlay beside the log (a new durable artifact, and a merge-contract question — whose
  overlay wins when two authors exchange logs);
- accept it and scope undo to "within a session", stated in the UI.

That choice is a product/architecture decision, not an implementation detail, and it is upstream of
building either pattern properly.

## Effort

| | freecut snapshot | RecordsDiff stack |
| --- | --- | --- |
| core, from scratch | ~80 lines | 234 lines — **already written and green** (Archie-69a6) |
| tests | ~80 lines | 252 lines, written |
| remaining to production | ring cap; the 18 call sites; `bump()` wiring; the reload decision | ring cap; the 18 call sites; `bump()` wiring; the reload decision |

The implementation delta between the two is roughly 150 lines. Everything expensive — the call-site
sweep and the reload question — is **identical for both**, which is why effort is not the deciding
axis here.

## Recommendation

**Take the RecordsDiff stack; take three things from freecut on top of it.**

The diff shape is the one that survives Archie's merge model, and that is not a preference — a
snapshot-shaped overlay demonstrably resurrects an undone note when a colleague's changes arrive.
The snapshot pattern's headline advantages (free capture, structural sharing, O(1) undo) are either
matched by the diff version or, in the case of reference-equality dedup, do not transfer to an
append-only log at all.

What freecut still supplies, and the prototype lacks:

1. **The ring-buffer cap** (`slice(-(maxHistory - 1))`, default 50). The prototype's stack is
   unbounded; a long session accumulates one entry per mark forever. Cheapest real gap to close.
2. **Gesture scoping as a habit, not just an API.** `mark`/flush already exists; freecut's
   discipline is that the *drag handler* captures at start and commits once at end
   (`keyframe-graph-panel.tsx:635-650`), so a 300-frame drag is one undo step. Archie's region-draw
   and region-move gestures need exactly this, and getting it wrong is how undo becomes useless
   rather than how it breaks.
3. **Per-context stacks.** freecut parks stacks by composition; Archie gets this free by holding one
   manager per `AnnotationSession`, but it must be *deliberate* — a single app-wide manager across
   exhibit navigation would restore one exhibit's content while another is live, which is the exact
   hazard `timeline-command-store.ts:8-13` documents.

**Do not build any of it until the reload question is decided.** Everything above is sound and none
of it stops an undone note reappearing when the author reopens the exhibit.

## Not verified

- The 18-call-site sweep is **counted, not attempted** — no estimate of how many carry a gesture
  boundary that needs a `mark()` rather than a bare mutation.
- Undo interacting with **conflict resolution** (`session.resolve`) is untested; only `importChanges`
  was measured. `resolve` also goes through `setLog`, so the same per-id reasoning should hold, and
  "should hold" is exactly the claim that has not been run.
- No **perf measurement at scale**. The per-mutation cost is O(1) by construction (`headsOf` is a map
  read) and `head-index.perf.test.ts` is unchanged at 4/4, but no benchmark drives the manager
  itself, and per [[perf-measure-the-flow]] §1 a structural argument is not an end-to-end figure.
- The prototype is **not wired to Studio** and has never run in a browser. Nothing here is a claim
  about `$derived` behaviour, only about what the core would hand it.
