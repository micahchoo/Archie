# HANDOFF — Archie

## COMPLETE — IIIF Collection ingest (2026-07-19, wayfinder map `Archie-b290`) — 10/10 CLOSED, MAP CLOSED ~18:35

Verify ticket Archie-9422 passed ALL browser checks (round-trip e2e, cancel/partial paths,
real remote collection, 500-exhibit smoke: NO chokepoints). Final gates: studio 646/646,
tsc 0, svelte-check 0/0, viewer astro 0/0, e2e 5/5. Committed through `7ed7345`;
LATER WORK UNCOMMITTED (cbf6 review fixes, bulk delete + exhibit-teardown.ts seam,
gallery-data search, plan amendment) — pending user ask. Remaining fog lives on the
closed map: import-batch durability across reload; bulk-edit growth; viewer-side
published-gallery provenance search. Stale detail below kept for archaeology:

Feature: pasting a IIIF Collection URL unpacks into N exhibits (ADR-0025). Session runs
implementer+reviewer subagent waves (spend-limit outage 09:41–16:48; recovered). As of
~17:40: **7/10 tickets CLOSED** (ADR 06a3 · reducer 0dfe · pure layer cc77 · multi-select
d366 · ingest glue 656a · bulk rights d2cc · picker a9e2 — each implemented, reviewed,
fix rounds landed, orchestrator-verified; latest gates 603/603 vitest, typecheck 0,
svelte-check 0/0). RUNNING: imp-progress on Archie-cbf6 (wire dormant picker props in
App/LibraryHome, in-dialog progress+cancel, 4 summary shapes each w/ Undo import →
removeExhibits, fold-ins: visible skip-detail, manifest-arm payload kills double fetch,
library-refresh check). THEN: Archie-ddaa bulk delete (unblocks on cbf6) → Archie-9422
verify (round-trip e2e + 500-exhibit smoke) closes the map. Notable new seams: CollectionPreview
contract in ingest-flows.ts; ExhibitMetaPatch clear-typing (type-test excluded from
svelte-check, see tsconfig comment); .claude/rules/studio-ts-typecheck-gate.md (NEW —
pnpm typecheck for .ts edits). All work UNCOMMITTED on `main` in the shared checkout.
Authority chain:
`ledgers/PLAN-collection-import.md` (spec, 9 locked decisions) ·
`docs/adr/0025-collection-unpacks-into-exhibits.md` · `CONTEXT.md` §Ingest (new terms) ·
seeds map `Archie-b290` (`sd list --label map:collection-import`).

**CLOSED (implemented + reviewed + orchestrator-verified, studio 530/530, check 0/0):**
- `Archie-06a3` ADR written.
- `Archie-0dfe` plural reducer `removeExhibitsIn` + store `removeExhibits` (ONE
  patch/persist/signal; per-slug onDirty verified vs sole consumer). Review: APPROVE.
- `Archie-cc77` pure layer: `classifyIiifDocument` (refusal strings pinned exact in tests);
  `collection-import.ts` `collectionToRefs` + `traverseCollection` (DFS, injected fetch,
  visited-before-fetch, depth 3 / 25-doc ATTEMPT budget `docsAttempted` / 1000-manifest
  cap → `status:"over-manifest-cap"` w/ exact total, counted skips, label trails).
  Review: APPROVE + 2 fixes landed.

**IMPLEMENTED, REVIEW LOST — resume here:** `Archie-d366` LibraryHome multi-select
(new `library-selection.ts` + 10 tests reusing overview-selection grammar; LibraryHome.svelte
+154/-2; select-all respects search; templates excluded; empty `.sel-actions` slot for later
bulk buttons). Reviewer died at spend limit with NO verdict. Unverified review points:
(a) is `pruneSelection` called anywhere or dead code; (b) Esc/⌘A deferral to App.svelte's
onGlobalKey — mount-order claim; (c) implementer says the 11 standing a11y warnings now
report 0 — reconcile with a fresh `pnpm --filter @archie/studio run check`.

**NOT STARTED (dep order):** `Archie-656a` ingest glue (UNBLOCKED — consumes
traverseCollection; spec in ticket) → `Archie-a9e2` dialog preview+picker → `Archie-cbf6`
progress/cancel/Undo → `Archie-9422` verify (round-trip e2e + 500-exhibit smoke);
`Archie-ddaa` bulk delete (needs d366+cbf6) · `Archie-d2cc` bulk rights (needs d366).

**This effort's uncommitted files:** apps/studio/src/{collection-import.ts,.test.ts (new),
iiif-import.ts,.test.ts, library-meta-reducers.ts,.test.ts, library-meta.svelte.ts,.test.ts,
library-selection.ts,.test.ts (new), LibraryHome.svelte} · CONTEXT.md · docs/adr/0025 ·
ledgers/PLAN-collection-import.md · .seeds/. Other dirty files belong to other streams
(see below) — don't touch.

**Loose ends:** `Archie-e51e` NUL byte in render-core publish/site.ts (plain grep silently
fails there — grep -a / fff; memory note updated to "recurring hazard") · rev-reducer
non-blocking nit: widen removeExhibits param to match removeObjects · map Fog: import-batch
durability, 500+ LibraryHome perf, bulk-edit growth.

---

**Updated:** 2026-07-19 late (Studio UX overhaul session, post-compaction 2). **Branch:** `main`
(pushed through `585d23b`). Map **Studio UX overhaul** `Archie-21b1` (seeds).

## UX OVERHAUL — COMPLETE: all 23 implementation tickets MERGED+PUSHED (through f520e42)

Decision phase done (14/14). ALL implementation waves merged: library home 2c47bdb ·
chrome/editor-redesign (c7ef+c76d) · create dialog 564f975 (51cc) · beats d226a4f (696d) ·
modality 5e7899b (5968; MediaPicker deleted, a11y 11->3) · legend split (adae) · publish
one-surface (1921; browser-drive verified) · selection tray (3b03) · scoped chooser (56cf;
AddMapModal deleted, 0 WARNINGS) · editable titles (46bf) · details (ebf4) · glyph labels
(d7ab) + AvEditor (ba74) · a11y epic (f260; APG grid/move-mode/listbox/numbers/roving) ·
publish Save-vocab (363e) · From-a-link (32e8) · deck refresh (6595; 5 screenshots need
human re-shoot, flagged in-file) · Playwright gate + nav e2e (d80f; 5/5) · **collab pair
a2a67eb** (2bf1+90f1; reviewer verdict SHOULD-FIX/no-blockers, S1+S2 fixed pre-merge
a1ee49b: keep() carries chosen head's C14 fields, close only at zero conflicts; follow-ups
filed: wiring rider Archie-7e5b dep-on 697c carries S3 gate-bypasses/S4 identity-lag/
synced-count/dup-ids, writer-lock name Archie-198c) · **save-verbs 2318 merged**
(copy/save-verbs; 'Done' on NoteEditor, kept/stored elsewhere + 4 sweep-found sites).
Suite: 0 errors / 0 WARNINGS (612 files), 603 unit + 5 e2e, tsc clean, build clean.
Pushed through dc18eca.

**FINAL MERGE:** round-trip package abf9 landed 71cdb07 (share/round-trip 2ab487d+580a4a7):
'Share a working copy' reframe in Publish + import-freshness.ts app-local watermark badge
('+N since your last import'; review caught first-import-must-be-silent, fixed 580a4a7;
counting delegates to collabBreakdown; dormant until an incremental-import caller — wired
through the same recordImportFreshness seam by 7e5b). Final suite: check 0/0 (614 files),
vitest 617/617, tsc clean, build clean, e2e 5/5. Duplicate save-verbs tickets 9c01/bb5d
(sd create triple-fire) closed as dupes of 2318.

**Writer-lock display-name 198c MERGED** (user said "do it"; collab/writer-lock-name
ba10fd2+573b5d1): held/beat/takeover carry name, Web Locks path gets a name-only presence
channel (never drives coordination); banners say "{Name} is editing…" w/ impersonal
fallback. Post-merge: check 0/0 (614), vitest 636/636, tsc clean, build clean, e2e 5/5.
Pushed 9419417. **REMAINING OPEN on the map:** ONLY `Archie-7e5b` wiring rider
(dep-blocked on collab-readiness 697c; carries S3 gate-bypasses, S4 identity-lag,
synced-count toast, dup-ids-to-Annotorious, noteConflicts memoization) — nothing actionable
until 697c wires zip-merge. Human action item: re-shoot 5 tutorial screenshots (flagged
in-file in docs/learn/). User UX note: Your-name field discoverability (it's inside
Library details ✎ drawer; user didn't find it unaided — candidate future ticket).

**USER RATIFICATIONS (all recorded in map):** From-a-link restored; collab collision call =
this map's single-scrim/MediaPicker-deletion stands (concurrent session's NotePicker WIP
preserved in stash 'concurrent-session WIP (App/LibraryHome) — modality merge'; must come
through modality contract); Playwright gate stood up.

**HAZARD:** opus agent died at MONTHLY SPEND LIMIT ~09:41 (outage till ~16:48); sonnet
continuation worked. If agents die with that error, finish work inline in the main session.
Worktrees always stale — reset-to-current-sha Step 0 in every brief. Shared checkout: other
sessions' WIP dirty files — stash-around for merges, commit via pathspec only.

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

**BOTH CHECKPOINTS PASSED (user: pursue; dispatch serial waves, no asking between waves).**
Build plan charted + committed (`9bdc4cd`): f1c6 generics → 08af SectionRecord → {c16d
projection, a911 persist, 6b8e attribution} → 42f3 studio flag. Probe ledger landed on main.
**Waves 1+2 MERGED.** Wave 1 `7728b08` (f1c6: DagRecord generics + 5 type pins). Wave 2:
`build/section-record` merged (fe6d06e impl + 3840a3f review fixes; 08af closed) —
`spine/structure.ts` SectionRecord family, six carry sentinels, C13/C14 resolve,
containment+parity tests, tolerant projection. Post-merge 886/886, tsc 0, root 0. Review
PASS both axes; 3 gaps closed test-only. **Wave 3 COMPLETE — c16d + a911 + 6b8e all MERGED + closed** (6b8e merge `22809e6`;
final gates 925/925, tsc 0, root 0, studio check 0 errors). Reviews clean both axes on
all three. MERGE-CONTRACT/CARRY six→seven content-fields prose fixed. session.ts
`section` threading folded into 42f3's ticket (spec-review follow-up: NewNote/NoteEdit/
resolve choice/workingAnnotations re-emit; record layer already carries losslessly).
**Wave 4 MERGED — BUILD PLAN COMPLETE.** `build/studio-revlog-flag` (b7097a8 + 2d77368)
merged after the UX session's checkout settled (auto-merged cleanly with their App.svelte
work). 42f3 closed: archie.structureRevlog flag (default OFF, off-path pinned
byte-identical), structure-reconcile array-diff → minimal appends, plural-head gating,
hidden-note filtering, session.ts section threading + new _workingAnnotationCarry
sentinel. Final gates: render-core 928/928, studio 413/413, svelte-check 0 err/3 warn,
build ok, root 0. All six build tickets (f1c6/08af/c16d/a911/6b8e/42f3) landed with
two-axis reviews clean. `Archie-2a9a` MERGED + closed (56a0332; reviews clean both axes; post-merge 928/928 +
studio 439/439, check 0/3, build ok): zip-import merges structure logs via the one
mergeLogs contract (plural heads gate in studio), exhibit delete cleans structure/
flag-independently with a race-safe forget-generation. `Archie-aef4` MERGED + closed
(cb4cd4e + d642c1f review fix; reviews clean both axes; post-merge 933/933 rc + 640/640
studio, check 0/0, build ok): publishLibrary emits structure pages via getStructure (one
hook, all sinks; existence-driven not flag-driven; archie.json-last preserved). Two-author
round-trip proven end-to-end — **conflict-safe structure exchange is LIVE, not latent.**
All-corrupt-at-publish = annotation-parity ship-what-reads but louder (both cases pinned);
annotation side's total publish-time silence filed as `Archie-a690` (open, unclaimed).
Collab-readiness map f849: enactment fully done; open children = a690 only; fog =
graduation-tier items. Map `Archie-f849`:
enactment done; remaining fog = graduation-tier items (sync server, Yjs-vs-Automerge,
writable HTTP backend, identity/presence) — unspecifiable until graduation is bet on.

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
