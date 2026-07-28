# PROBE ledger — Archie-b766: sections as rev-logged structure records

Map: Archie-f849 (spine-gate enactment). Decided semantics: spine gate Archie-494c (six, fixed).
Branch: `probe/structure-revlog` off base `2c47bdb`. Commits: `55cb040` (A1 generics),
`26d342c` (slice + harness), `d50fd01` (NoInfer tightening).
Artifacts: `packages/render-core/src/spine/structure-probe.ts` (+ `.test.ts`, 13 probe tests),
generic edits in `spine/log.ts` / `spine/merge.ts` / `spine/heads.ts`.

**Kill criterion (fixed):** park if the seed library cannot round-trip working→publish→open
losslessly from per-record rev-logs, OR structure-edit projection cost degrades interactivity
(flag >16ms per edit-projection on the seed exhibit).

| # | Assumption | Riskiest? | Probe | Result | Verdict |
|---|-----------|-----------|-------|--------|---------|
| A1 | log/merge/heads primitives generalize over a record interface with ZERO annotation-behavior change; merge-contract suite (847) stays green untouched | **YES** | Type-parameterized the pure DAG primitives (`append`, `parentsOf`, `linearHead`; `lineage`, `ancestors`, `commonAncestor`, `headsOf`, `mergeLogs`, `classifyMerge`, `classifyLogical`, `conflictTiebreak`; `projectHeads`) over `DagRecord<Id extends string>` (logicalId/rev/parent/mergeParents/modifiedAt/lastEditor/deleted). Chose GENERIC over adapter — smaller and honest: content helpers (`appendNew/Edit/Delete`, `resolveConflict`) stay annotation-only. Strictness preserved by (a) concrete `AnnotationLog` overloads listed FIRST on `linearHead`/`headsOf`/`classifyLogical` (empty-array literals would otherwise infer `R = never`), (b) `NoInfer` on second params so mixing record types is a compile error, (c) `@ts-expect-error` probe proving a `SectionKey` is rejected on an annotation log, (d) compile-time guard `AnnotationRecord → DagRecord` in log.ts. No test file touched; full suite **860 passed** = 847 existing + 13 probe. `pnpm -r typecheck` exit 0. | **HOLDS** |
| A2 | Seed library round-trips losslessly | no | Verbatim copy of the seed (voynich 6 sections + 11 folio objects; fixture can't be imported across tsconfig `rootDir`) authored as a real rev-log (create v1, edit v2 per section), projected to working `Section[]`, pushed through the existing `libraryToZip` → `loadLibrary` path; deep-equal vs the same path fed today's plain `Section[]`. | Projection output deep-equals the authored seed sections EXACTLY (pre-publish). Opened-probe library deep-equals opened-baseline library (whole object). One shared caveat, not a divergence: publish rewrites `archie:` cites in section prose into viewer URLs for BOTH paths, so opened prose ≠ authored prose on either path (existing behavior, site.ts link seam). | **HOLDS** |
| A3 | Projection perf within bars | no | `performance.now` around `projectSections`; per-edit on seed, and 50 full projections on synthetic 100×20. | Verbatim (full-suite run): `[PROBE A3] seed exhibit (6 sections, 112 records after 100 edits): projection avg 0.067ms, max 1.226ms over 100 edit-projections` (avg 0.067–0.088ms across three runs). `[PROBE A3] synthetic (100 sections x 20 revs, 2000 records): projection avg 8.041ms, max 11.663ms over 50 projections` (avg 8.0–12.3ms, max up to 15.3ms across runs). Seed-exhibit per-edit projection is ~0.1ms — nowhere near the 16ms bar. FINDING: the synthetic case sits close to the bar because `projectSections` calls `headsOf` per key and `headsOf` filters the whole log per call — O(records × keys), same shape as annotation `projectHeads`. A single-pass group-by makes it O(records); do that in the build, don't inherit the quadratic scan. | **HOLDS** (with the O(n·k) note) |
| A4 | Child-carried fractional key gives deterministic stable order under concurrency | no | Hand-rolled base-36 `orderKeyBetween` (midpoint, no dependency, keys never end in '0'; 50-deep dense-insert property check). Concurrent reorder of the SAME section on two replicas → real DAG conflict; concurrent inserts at the same slot → equal keys. | Both merge directions project the IDENTICAL row sequence pre-resolution (plural heads shown, flagged `conflicted`); `classifyLogical` says `conflict`; `resolveSectionConflict` merge node collapses to one head on both replicas after log exchange, same final order key. Equal-key concurrent inserts converge to the same sequence via the key (id) tiebreak: `["sa", "ins-alice", "ins-bob", "sb", "sc"]` on both replicas. | **HOLDS** |

Also demonstrated (slice shape, not ledger rows): hide-by-ancestry — ONE section tombstone
hides its notes at read (`noteHiddenByStructure`), zero cascade writes to note records, and
`appendUndeleteSection` atomically restores content (deep-equal) and visibility; referential
tolerance — a dangling `objectId` projects `missingObject: true`, reference kept raw for
repair, never a throw; flag `archie.structureRevlog` exists, default off, wired into nothing.

## Overall verdict: PURSUE

Neither kill-criterion arm fires: the seed round-trip is lossless (A2 deep-equal), and seed-
exhibit edit-projection is ~0.1ms (bar: 16ms). All four assumptions hold, including the
riskiest (A1) with the contract suite green and untouched.

## What the build plan should know (sharp edges)

1. **Overloads are the strictness trick, and they're load-bearing.** The generic-only signature
   breaks existing tests: `linearHead([], id)` infers `R = never` from the empty-array literal.
   Concrete `AnnotationLog` overloads first + `NoInfer` on non-log params restore today's exact
   inference. Any further generalized function needs the same two moves.
2. **Tombstone content divergence.** The probe's section tombstone CARRIES content (annotation
   tombstones drop it) so un-delete is a one-append lossless revive. The build must pick one:
   carry-on-tombstone (simple, bigger records) or parent-walk revive (parity with annotations).
   Also: structure needs un-delete as a first-class op — annotation `appendEdit` hard-refuses
   tombstoned heads ("resurrection undefined in v1"); that rule cannot be inherited verbatim.
3. **Projection cost is O(records × keys)** via per-key `headsOf` (annotation `projectHeads`
   has the same shape). Fine at seed scale (0.07ms), ~8–12ms at 2000 records — replace with a
   single-pass group-by before structure logs get big, or cache heads per key.
4. **Identity bridging.** Log identity is the composed `SectionKey` (`{exhibitId}/{localId}`);
   today's persist/publish grammar (manifest Ranges, `Section.id`) keeps the LOCAL id —
   projection strips the prefix (`localSectionId`). Working.ts/persist touchpoints will need
   the same strip at every boundary that serializes working `Section[]`, and `sectionKey()`
   must stay the only composer (it rejects `/` in localId — containment, same trust posture as
   the tauri-fs seam).
5. **Persist shape not probed.** The probe log lives in memory; `spine/persist.ts`
   (`serialize`/`deserialize`, history pages, content-first-index-last ordering) is
   annotation-shaped. A structure log needs its own page shape + the same carry-sentinel
   discipline (`model/carry.ts`) on every SectionRecord mapper — the probe's `contentOf` and
   append helpers are exactly the boundaries that need sentinels when promoted.
6. **Publish prose rewriting applies to sections already** (`archie:` cites in section prose are
   rewritten at publish). Rev-logged prose keeps RAW refs in the log (source), rewritten only in
   projections — same policy the annotation history sidecar already follows.
7. **Notes don't yet carry a section attribution** — hide-by-ancestry is proven as read-
   derivation with harness-supplied attribution. The build adds the note→section field
   (mirroring `reading`), which is a new AnnotationRecord field ⇒ every carry sentinel
   (`_editCarry`, `_deleteCarry`, `_mergeCarry`, serialize/deserialize) forces a decision —
   that's the compiler guard doing its job, budget for it.

Gates (verbatim): render-core `Test Files  78 passed (78)` / `Tests  860 passed (860)`
(= 847 existing + 13 probe, no existing test modified); `pnpm -r typecheck` exit 0.

## ENACT (Archie-b0b1, 2026-07-20) — grill verdict ENACT

The ~1,400 lines the PURSUE verdict green-lit (studio `structure-session.svelte.ts` /
`structure-reconcile.ts` / `structure-import.ts` over render-core `spine/structure*`) shipped dark
behind `structureRevlogEnabled()` — default-off, activated only by a console `localStorage` flip. Two
changes turned it on for real:

1. **Asymmetry closed FIRST.** The publish/export leg (`publish/site.ts` `getStructure`) wrote
   `{slug}/structure/history/` driven by log EXISTENCE, but the import leg
   (`ingest-flows.ts` `replaceProjectFrom`) required the flag. A library published carrying section
   history was therefore silently DROPPED on a default reopen — the export wrote history the import
   refused to read. The import merge is now UNGATED (existence-driven, mirroring export); the dead
   `structureRevlog` field is off `IngestContext`. `structure-export-roundtrip.test.ts` /
   `replace-structure.test.ts` now prove the round trip over a NON-flag path.
2. **Flag defaulted ON, retired as an opt-in.** `structureRevlogEnabled()` reads default-true via
   `persisted.ts` `safeGet` (`!== "0"`); `archie.structureRevlog = "0"` is the emergency KILL-SWITCH
   (forces the pre-revlog array-only path). Failure (absent / storage-denied / garbage) falls toward ON.

### Author-facing surface: NO read/restore capability exists yet — UI is the follow-up

The enact scope asked for the minimal honest author-facing surface, exposing restore/view **only where
`structure-session` already supports it**. It does not. Its entire public API is:

| Method | Shape | Purpose |
|--------|-------|---------|
| `ensureLoaded` / `apply` | load / commit | the write path (seed-from-array, reconcile appends) |
| `conflictedLocalIds` | `Set<localId>` | plural-head EDIT GATE — already surfaced (NarrativeEditor `conflictedIds`) |
| `tombstonedKeys` / `hiddenIds` | `Set` | internal hide-by-ancestry note filtering |
| `isCorrupt` | `boolean` | torn-store status — marked "future surfacing", NOT yet rendered |

None of these is a user-facing **history view** (enumerate a section's revisions — who/what/when) or a
**restore** (revert a section to a prior revision). The raw `SectionLog` carries the full history and
`spine/structure` has the DAG primitives (`headsOf`, `lineage`/`ancestors` per probe A4), but
`structure-session` surfaces none of them for that, and there is **no restore-to-prior-rev append helper
at all** — annotation `appendEdit` even hard-refuses tombstoned heads (probe sharp-edge #2). Building
view/restore therefore means adding new methods to `structure-session` AND to render-core `spine/structure*`
— inventing features across two packages, which the enact scope explicitly forbids.

So the honest minimum shipped is exactly: **flag-on + asymmetry-closed**, with the section history now
kept (append-only) and round-tripping through publish/import for every exhibit by default. The
**author-facing history view/restore UI is the follow-up.** A next ticket needs, in order: (a) a
`structure-session` read method projecting a section's rev timeline over the existing `spine/structure`
lineage primitives; (b) a first-class restore op (`appendUndeleteSection` exists for un-delete; a
"restore to rev N" append does not — design it against the merge contract, same as resolve-conflict is
d71c/90f1 territory); (c) the NarrativeEditor surface itself (existing studio idioms, WWWWH-first copy).
The already-built, unrendered `isCorrupt` torn-store status is the one non-inventing signal a minimal
UI could surface first.
