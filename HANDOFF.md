# HANDOFF — Archie

**Updated:** 2026-07-19 (Studio UX overhaul session). **Branch:** `main` (pushed through
`b564ac2`). Trackers: seeds (`sd`) — map **Studio UX overhaul** `Archie-21b1`; sibling map
**collab-readiness** `Archie-f849` (another session; boundary: they own the merge contract,
UX map owns collab UI — see both maps' Notes).

## IN FLIGHT — UX overhaul implementation wave 2 (2026-07-19)

Decision phase DONE: all 13 decision tickets on `Archie-21b1` resolved + indexed
(navigation ADR-0024, safety-state, canvas trims, narrative locality, editor scope,
modality, details, publish, help, collab-maximal, bulk selection, library layout, chrome
prototype). Glossary: `CONTEXT.md`. Audit + corrections: `ledgers/UX-AUDIT-studio-wireframes.md`.

**Merged to main + pushed (wave 1, all gates green):** `fbf1d24` docs · `5ffe9b9`
save/safety-state · `f8fc422` nav/place-addressable · `f159b94` canvas/light-table-trims ·
`b564ac2` tutorial-deck deploy fix. Post-merge: svelte-check 0/11, 342/342 studio tests.

**Merged wave 2 so far:** `2c47bdb` library/home-layout (`Archie-606d` closed) ·
chrome/editor-redesign (`Archie-c7ef` + `Archie-c76d` closed; two-zone sidebar, docked
note editor, SafetyState everywhere, single ⌘S owner; review fixes `19276c4`). Gates
post-merge each time: svelte-check 0/11, 350 studio tests, studio+viewer builds. Main
also carries the sibling collab session's merges (render-core/spine, no studio overlap).

**Agents running (worktrees; ALL worktrees spawn at stale session-start HEAD — brief them
to `git reset --hard <current main sha>` first):**
- `create-implementer` (sonnet) — `create/import-dialog`: ticket `Archie-51cc` (Variant A
  scrimmed New-exhibit dialog, three expanding paths, paste-validated IIIF, page-drop).

**Process per branch (user directive, updated 2026-07-19): AUTO-MERGE WHEN GREEN** —
code-review agent on completion → fix loop if needed → once review-clean, merge to main
WITHOUT asking → full gates post-merge → close tickets with implementer resolution
paragraphs → update map → push.

**Queued behind merges** (see `sd ready` as deps close): modality impl `5968` → publish
`1921` → round-trip collab `abf9`; beat links `696d`; a11y adoption `f260`; details `ebf4`;
legend split `adae`; glyphs `d7ab`; deck refresh `6595`; selection bar `3b03`; collab
identity `2bf1`; MergeReview+attribution `90f1` (also needs collab-readiness `697c` spec);
e2e `d80f` (needs Playwright gate).

Wireframes + collab wiring diagrams: tldraw board `archie-studio-wireframes`
(http://localhost:3002/?board=archie-studio-wireframes).

---

## COLLAB-READINESS SESSION (2026-07-18/19) — map complete; structure-DAG probe IN FLIGHT

Map **`Archie-f849`** "Archie full-stack/real-time graduation readiness (static-first)": **8/8
closed** + bug `Archie-cfc1` fixed. North star (user-set): Archie graduates to full-stack
real-time IN THIS REPO, monorepo-native (Archie+ sibling-repo concept RETIRED). Invariant:
every step ships standalone static value. All work via worktree agent → two-axis review → merge.

**Delivered (committed through `2c47bdb`+):** `ledgers/AUDIT-stable-ids.md` (ids audit) ·
`ledgers/PROBE-collab-crdt-mapping.md` (**Model B decided**: Yjs transports the rev-log,
DAG merge unchanged; Model A/field-mapping REJECTED — silent LWW loss) · D1 multi-tab live
sync 12/12 verified (`prototypes/multi-tab-live-sync/`, throwaway, uncommitted) ·
`fs/http.ts` read-only fourth backend · C2 API hygiene (sideEffects array, root barrel
121.99KB→0.57KB; `limits.ts`/`errors.ts` layer-zero; exports-map-as-contract) ·
`spine/MERGE-CONTRACT.md` 18 clauses + 50 pinned tests · OQ-1 fix (`parentsOf` shared in
log.ts; linearHead⟺headsOf structurally agree; resolved notes editable; suite **847/847**).

**Spine gate `Archie-494c` DECIDED (six fixed decisions):** structure fully collaborative ·
same DAG machinery · order = child-carried fractional key (content field, id tiebreak) ·
identity = composed branded `{exhibitId}/{localId}` (IRIs preserved; cross-exhibit move =
copy+tombstone) · referential TOLERANCE (write-time enforcement unsound under merge;
per-type read degrades + advisory MergeReview items) · deletes hide-by-ancestry (one
tombstone, atomic un-delete; explicit bulk-delete verb; write-cascade retired).

**PROBE LANDED — verdict PURSUE** (ticket `Archie-b766`, branch `probe/structure-revlog` in
worktree `agent-a4620b9ff7368be6e`, base `2c47bdb`, commits 55cb040/26d342c/d50fd01/099f622,
NOT yet merged). All four assumptions HOLD: A1 DAG primitives generalized over `DagRecord<Id>`
(AnnotationLog overloads-first + NoInfer preserve inference; 847 existing tests green
UNTOUCHED, suite 860/860); A2 seed round-trip working→publish→open deep-equal; A3 per-edit
projection ~0.1ms seed / 8–12ms synthetic-2000 (O(records×keys) scan flagged, fix in build);
A4 fractional order key + id tiebreak converges both replicas. Ledger (in worktree):
`ledgers/PROBE-structure-revlog.md` — 7 sharp edges for the build plan (tombstone carries
content vs annotation drop; un-delete first-class; persist shape NOT probed; SectionKey strip
at boundaries; note→section attribution field trips every carry sentinel).

**Two-axis review of probe: BOTH AXES DONE, CLEAN.** Spec: PURSUE honestly earned; all six
gate decisions demonstrated in tests; no existing test modified; A2 genuinely publish→open.
Standards: production changes (log/merge/heads generics) ship-worthy, zero violations, carry
sentinels intact, refactor type-only, gates re-verified independently (tsc 0, 860/860).
**Build-plan debts from review (must not inherit blind):** (1) SectionRecord mappers
(append*/resolveSectionConflict/contentOf) need rule-3 carry sentinels when promoted;
(2) NoInfer/foreign-record rejection + R=never hazard need @ts-expect-error negative pins;
(3) sectionKey containment needs a negative test; (4) replace per-key headsOf scan
(single-pass group-by) before logs grow.

**AWAITING USER — checkpoint 1: pursue/park verdict presented.** On pursue: chart
structure-DAG build plan as tickets, show shape (checkpoint 2) → implementer agents in
worktrees → two-axis review per landing → merge. Probe branch NOT merged yet — merge/absorb
decision is part of build-plan chartering (A1 generics are candidate-to-keep; probe slice is
throwaway).

**Ops (verified this session):** worktrees ALWAYS stale (5/5) — Step 0 reset + file-existence
check in every brief. Review agents must END with SendMessage to main (plain text lost).
Concurrent sessions share this checkout: merges may no-op "Already up to date" (verify via
gates+log, don't re-merge); `sd create` can triple-fire (dedupe, keep earliest). OQ-2..6
recorded unfixed in MERGE-CONTRACT.md. Cross-map: collab identity SoT = `Archie-d71c`;
MergeReview `90f1` inherits cfc1's close-reason notes.

---

## OLDER STREAM (2026-07-05, different session) — publish-to-web BUILD

Preserved from the prior handoff; may be stale — verify against `worktree-publish-to-web`
worktree and `docs/plans/PUBLISH-TO-WEB-PLAN.md` before resuming. Waves 0–2 were nearly
done (Tasks 1–9 committed: types `106dd23`, git2 spike `eec8768`, Tauri commands
`75a5620`/`7b034fd`/`681e3f0` + review fixes `c6ba97f`, ensureRepo `70a831e`, gh_push_tree
`f72f0ba`, deployToPages `7d71882`, sign-in `a646760`). `ledgers/PROBE-publish-to-web.md`,
`DIVERGENCES.md`, `PRFAQ.md` in the tree belong to that stream.
