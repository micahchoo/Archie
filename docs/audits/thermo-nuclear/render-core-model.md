# Thermo-Nuclear Review — render-core / data-model + spine

## Verdict

**APPROVE-WITH-NITS** — The model is structurally sound and the domino (see below) is genuinely minor rather than load-bearing. No blocker. Two findings deserve deliberate action before the scope grows further; the rest are nits.

---

## Baseline

| File | LOC | Flag |
|---|---|---|
| spine/serialize.ts | 248 | — |
| spine/merge.ts | 179 | — |
| spine/log.ts | 179 | — |
| spine/deserialize.ts | 103 | — |
| spine/persist.ts | 62 | — |
| spine/heads.ts | 33 | — |
| spine/index.ts | 8 | — |
| wadm/types.ts | 203 | — |
| wadm/brand.ts | 124 | — |
| wadm/index.ts | 3 | — |
| model/model.ts | 184 | — |
| model/layout.ts | 24 | — |
| link/link.ts | 151 | — |
| note/media.ts | 73 | — |
| migrate/migrate.ts | 83 | — |

**Total: ~1,658 lines across 15 files.** No file is near the 600-line watch threshold. No size flags.

---

## The Domino

**The five `withX` mutation chains in serialize.ts are a single conceptual operation — "apply extension fields from a record onto a WADM annotation" — implemented as five separate single-field functions chained four deep. Collapsing them into one `withExtensions(ann, record, { dag?, heads? })` function deletes all five private helpers, the one deprecated outlier (`withLayers`), and the unreadable chain at serialize.ts:161, while making the two call sites (`headsPageFromRecords` and `toHistory`) structurally identical and obviously correct.**

This is the domino: it resolves Finding #1 (deprecated function still in the live chain), Finding #3 (the `as unknown as Record<string,unknown>` type evasion repeated five times), and the readability smell at line 161 simultaneously.

---

## Findings (prioritized)

### **[Medium] Deprecated `withLayers` is still in the live production chain** — `serialize.ts:121–123, 161` — Standard #2 (spaghetti growth) / Standard #6 (logic in canonical layer)

`withLayers` is marked `@deprecated` and described as "superseded by `withReading`." But it is still unconditionally called at line 161 inside `headsPageFromRecords`, the heads-page production path. The deprecation comment is false assurance: the function is not sunset, it is live. Any record that still carries a `layers` field (legal: `AnnotationRecord.layers` is a kept field during the expand-and-contract rename) will have `archie:layers` emitted onto heads-page annotations. The migration (`foldLayersIntoTags`) is in `migrate.ts`, not in the serialization path — so the heads-page serializer and the migration runner are both claiming responsibility for the same transform, but they do it at different times on different code paths. The deprecation label implies the function is safe to delete; it is not.

**Remedy:** Fold `withLayers`, `withReading`, `withEmphasis`, `withGeo`, and `withProvLink` into a single `withExtensions(ann, record, opts: { includeProvLink?: boolean; dagMeta?: boolean })` function. This replaces all five helpers and the chain at line 161. The `withDagMeta` path for history annotations can use `dagMeta: true` to get all fields at once; the heads path uses the default. The `layers` question resolves naturally: either emit it (backward compat, no annotation) or omit it (post-migration, clean). Pick one, delete the deprecation annotation, and document the decision.

---

### **[Medium] DAG walk is O(n²) in log size — merge.ts is not self-indexing** — `merge.ts:14, 63` — Standard #7

`recordByRev` (line 14) is `log.find(r => r.rev === rev)` — a linear scan called inside the `ancestors` DFS and the `lineage` walk, producing O(n²) behavior per DAG traversal. Similarly, `headsOf` calls `log.filter(r => r.logicalId === logicalId)` (line 63), a full scan per logical id, called inside `projectHeads` once per distinct logical id, making `projectHeads` O(n²) in the number of notes. For Phase-0 note counts (dozens to low hundreds) this is invisible. For an exhibit with a thousand-note log (possible for dense annotation scholarship), `classifyMerge` on a conflict card and `projectHeads` on every publish will be noticeable.

The fix is cheap and does not change the data model: build a `Map<RevId, AnnotationRecord>` and a `Map<LogicalId, AnnotationRecord[]>` once at the top of each public entry point (or lazily at module boundary). `ancestors` and `lineage` use the rev-map; `headsOf` and `projectHeads` use the logicalId-map. The log is immutable (frozen arrays), so the map is safe to build once per call to a public function. This is not premature optimization — it is removing a quadratic hidden in a data structure that the architecture explicitly permits to grow.

**Remedy:** Add a private `indexLog(log)` helper returning `{ byRev, byLogical }` maps. Thread it through `ancestors`, `lineage`, `headsOf`, `classifyMerge`, and `projectHeads`. No API change, no test change — behavior is identical, complexity drops to O(n).

---

### **[Low] `as unknown as Record<string, unknown>` repeated five times to write extension fields** — `serialize.ts:123, 129, 136, 143` — Standard #5 (type contract) / Standard #4 (brittle magic)

`ArchieAnnotation` extends `W3CAnnotation`, which does not declare the `archie:*` extension keys. Five private helpers work around this by casting the annotation to `Record<string, unknown>` to write those keys. The cast is correct — the keys are valid WADM extensions — but it is structurally dishonest: the type system is not helping, it is being escaped. The extension keys are known at design time (they are module-level `const` strings in `types.ts`); they belong in the type.

**Remedy:** Extend `ArchieAnnotation` with optional extension fields for all archie: keys that appear on heads-page annotations (`archie:reading`, `archie:emphasis`, `archie:geo`, `archie:layers`). The history-page shape can use a narrower `ArchieHistoryAnnotation` (or an intersection). This makes every `withX` function a direct property assignment rather than a cast. The current approach is not a blocker — it is an invitation to mis-spell a key with no compiler catch.

---

### **[Low] `@context`-at-AnnotationPage-only invariant is enforced by convention, not structure** — `serialize.ts:84, 165, 245` — Standard #2 / Standard #5

The project invariant (Q-3, ADR-0003) states `@context` appears only at the `AnnotationPage` level, never on individual `Annotation` items. This is correct in the serializer: `recordToAnnotation` accepts an optional `withContext` flag (line 82) that defaults to false, so the normal production path never emits `@context` on items. However, the guard is a defaulted boolean on a public function signature — callers can and occasionally do pass `withContext = true` (the flag exists precisely to allow it). There is no single canonical enforcement point; the invariant is maintained by discipline across call sites.

**Deletion test:** imagine removing the `withContext` parameter. The complexity does not vanish — callers that genuinely need a standalone annotation with context (e.g., a future export that serializes one annotation as a document) lose a legitimate capability. This passes the deletion test: the flag is earning its keep. The issue is narrower — the parameter name `withContext` gives no hint that using it violates the AnnotationPage-level invariant in the normal production path.

**Remedy:** Rename to `withStandaloneContext` and add a JSDoc `@throws` or `@see` note: "Do not pass `true` for annotations that will land in a page." Minimal — but makes the invariant visible at the call site, not buried in a comment block at the top of the file.

---

### **[Nit] `foldLayersIntoTags` lives in `migrate.ts` but is called at the load boundary, not in the migration runner** — `migrate.ts:21–37` — Standard #6 (logic in canonical layer)

`foldLayersIntoTags` is a record-level transform applied at read/load time per ADR-0007. It is not registered in `MIGRATIONS` and is not invoked by `migrate()`. It lives in `migrate.ts` by folder convention but is architecturally a deserialize-time normalizer. This means the migration runner (`migrate()`) does not know about it, and a future engineer adding a `to: 2` migration may not realize a prior schema concern was already being silently handled outside the runner.

**Remedy:** Either register `foldLayersIntoTags` as a `to: 2` migration entry in `MIGRATIONS` so the runner is the single normalizer, or move it to `deserialize.ts` with an explicit comment that it is a read-boundary compat shim separate from the versioned migration runner. The current location is the worst of both worlds: named "migrate" but not wired into the migration runner.

---

### **[Nit] `lineage` in merge.ts only follows `parent`, not `mergeParents`** — `merge.ts:18–30` — Standard #3

`lineage` walks only the linear `parent` chain. `commonAncestor` (line 53) calls `lineage` to build the ancestor set for both heads and then scans for overlap. But after a `resolveConflict` (a multi-parent merge node with `mergeParents`), the lineage of a descendant of that merge node does not include the merged-in branch's ancestors — because `lineage` ignores `mergeParents`. The separate `ancestors` function does follow `mergeParents` and is used in `classifyMerge`. However, `commonAncestor` calls `lineage`, not `ancestors`, meaning it can miss the full merge history and return a shallower base than the true nearest common ancestor across a re-merge scenario.

This is not a bug in Phase-0 (conflicts are expected to be rare; re-merging an already-resolved note is more exotic). But the discrepancy between `lineage` (single-parent) and `ancestors` (multi-parent) is a design inconsistency that will surface as a correctness bug if re-merge scenarios become real. `commonAncestor` should use `ancestors` rather than `lineage` for at least one of its two lineage sets, or `lineage` should be documented as "linear-chain only, NOT suitable for merge-base computation."

**Remedy:** Either make `commonAncestor` use `ancestors` on both sides (safe, slightly more expensive), or add a clear JSDoc warning on `lineage` that it is not suitable for DAG merge-base computation and should not be called from `commonAncestor`. If the latter, rename `lineage` to `linearLineage` or `primaryChain` to make the scope obvious at the call site.

---

## Code-Judo Opportunities

**1. The five-`withX` consolidation (the Domino above)** — replacing five private functions + one 5-deep chain with one `withExtensions` call is a behavior-preserving deletion of ~35 lines and all the `as unknown` casts. This is the cleanest move in scope.

**2. `classifyLogical` inlines three `linearHead` calls that each scan the log** — `merge.ts:120–124`. After adding the `indexLog` map (Finding #2 remedy), `classifyLogical` can take pre-computed heads instead of scanning twice. Minor cleanup once the map is in place.

**3. `migrate.ts` / `deserialize.ts` boundary clarification** — the runner and the compat shim currently share a file without a structural relationship. Separating them into `migrate-runner.ts` and `migrate-compat.ts` (or registering the shim in `MIGRATIONS`) makes the load path explicit and eliminates the "why is this in migrate.ts?" confusion for the next engineer.

---

## Self-Check

**Domino — withExtensions consolidation:** Not premature extraction. The five functions share an identical shape (`(ann, record) => ann`), operate on the same types, are all private, and are already composed in a single chain. Collapsing them reduces call-site count, not increases it — locality is preserved. Seam discriminator: there is only one place these are called from (two sites, same call shape), so the new function is not a port/dispatcher abstraction, it is a deduplication of identical structure. Passes.

**Finding #2 — O(n²):** Not premature optimization. The quadratic is in the canonical projection (`projectHeads`) and the merge-base walk, both called at publish time and on every conflict card. The log is explicitly designed to grow. The fix (one `Map` build per call) is trivial and does not change the architecture. Passes.

**Finding #5 — lineage vs ancestors:** Self-check on "introduce an abstraction" — no new abstraction recommended; the recommendation is to use the existing `ancestors` function where `lineage` is currently misused, or to document the scope of `lineage` clearly. No new seam introduced. Passes.

**Finding #4 — @context invariant:** Deletion test passed (the `withContext` flag has a legitimate use case). Recommendation is rename + JSDoc, not deletion. Appropriate scope. Passes.

**Structural regressions identified:** None. No shallow module (every module hides real complexity behind a small interface). No identity passthrough. The serialize/deserialize/merge triad is genuinely deep: callers pass a log and get back a WADM page; all the DAG, collision-disambiguation, and IIIF grammar lives inside. The spine is the correct depth.
