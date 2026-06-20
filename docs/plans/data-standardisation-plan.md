# Data Ops + Model — Standardisation & Simplicity Plan

> Status: **PASS CLOSED 2026-06-20** — 12 of 15 items landed + verified (Wave 1 spine
> S1/S2 + data-ops B1/B2/B3 + Studio C1/C2/C3; model A3/A4). B4/B5 rejected as
> non-improvements. A1/A2/A5 (Note-trio union, AObject media union, role discriminant)
> deferred by user decision as deliberate future design+PRs — see Track A below.
> All changes UNCOMMITTED (mixed into the pre-existing dirty tree). Final green state:
> render-core 600/60 (tsc 0), studio 127/12, viewer 24/3 (tsc + astro check: 0 brand errors).
> Authored 2026-06-20.
> Goal: "optimize data ops and model for standardisation and simplicity."
> Method: three parallel read-only scouts mapped model / publish-IIIF / Studio-ingest layers.
> Governing prior art: ADRs 0003, 0005, 0006, 0007, 0017 (cite per project rule).

## Why this is a plan, not a diff (read first)

At authoring time the working tree had **71 dirty files** (several are targets here:
`model.ts`, `publish/*`, `store.ts`, `seed-data.ts`). Starting refactors on top of
uncommitted work = multiple writers + unknown blast radius (a Pre-Ship Red Line).
**First action of any execution session: commit or stash the dirty tree to a known
baseline, then run Wave 1.**

There are also pre-existing parse errors in the dirty tree (NOT from this work):
`App.svelte:1012`, `AvEditor.svelte:313`, `NarrativeEditor.svelte:161` —
"Unexpected token [-1]". Resolve or confirm-intentional before trusting a green build.

---

## The standardisation spine (cross-cutting — do these first)

These two items appear in **more than one layer's** scout findings. That recurrence is
the signal: they are the genuine shared-interface concerns, and fixing them once removes
divergence everywhere downstream.

### S1 — One W3C selector-grammar home  ·  governs: ADR-0006
`xywh=` (FragmentSelector) and `t=` (media-fragment temporal) construction is hand-rolled
in **both** `apps/studio/src/seed-data.ts` and `apps/viewer/scripts/gen-published.mts`,
plus referenced in the model. Extract `rectSel(x,y,w,h)` / `timeSel(start,end)` (and a
parser, see D5) into `packages/render-core/src/` and have all callers import them.
- Value: one place to evolve selector format; eliminates drift between Studio & Viewer.
- Risk: LOW (pure functions, characterization-testable against current output).

### S2 — One canvas-IRI minter  ·  governs: ADR-0001, ADR-0014
`canvasIdFor` exists as a helper in Viewer (`published-base.ts`) but Studio
`seed-data.ts:85` interpolates `${BASE}${slug}/canvas/` inline. Export `canvasIdFor`
from render-core; Studio imports it. Removes the BASE dependency leaking into seed code.
- Value: canonical IRI shape; self-describing-artifact invariant lives in one function.
- Risk: LOW (string construction; snapshot the emitted IRIs before/after).

---

## WAVE 1 — DONE & VERIFIED (2026-06-20)

All spine + low/medium-risk items landed, zero behavior change, all suites green and
GREW: render-core 593→601, studio 122→127, viewer 24 (tsc 0 across).
- Spine: S1 ✓ (`fragmentSelector`+`MEDIA_FRAGS_CONFORMS_TO` in geometry/mediafragment.ts;
  routed av/transcript.ts + studio seed-data rectSel/timeSel). S2 ✓ (`canvasIdFor` in
  iiif/canvasid.ts; 3-way invariant locked by a test asserting equality with
  `canvasIdMap(toManifest(...))`; manifest.ts left untouched to avoid churn; studio ×5 +
  viewer published-base.ts routed through it).
- Track B: B1/B2/B3 ✓ ; B4/B5 ✗ rejected (not real duplication).
- Track C: C1 ✓ (asset reads → `readAssetFile`+`fileToObjectUrl`), C2 ✓ (dropped dup
  `ObjectProvenance`), C3 ✓ (`parseRegion` extracted +tests).

## A3 — DONE & VERIFIED (2026-06-20). User-gated (A3+A4 approved).

Landed as ONE coordinated change (no safe intermediate existed): `foldLayersIntoTags` wired
into the deserialize/load funnel (`spine/deserialize.ts` — every load path funnels through it);
all `layers` writers/serializers/readers cut (log/merge/session/serialize/filter, studio
MergeReview); `layers?` removed from `AnnotationRecord`; `ARCHIE_LAYERS` kept as documented
read-only legacy key. Back-compat test added (old `archie:layers` JSON → tagging bodies on load).
Merge semantics preserved (layers fold into body before `resolve`). render-core 601→600
(−4 obsolete layer-assertion tests, +3 back-compat), studio/viewer unchanged. All green, tsc 0.

## A4 — DONE & VERIFIED (2026-06-20). Runtime-identical (brands erase).

Branded `Exhibit.id: ExhibitId`, `Library.id: LibraryId`, `AObject.id: ObjectId` (reused
existing `ExhibitId`; added `LibraryId`/`ObjectId` + `asLibraryId`/`asObjectId` to wadm/brand.ts).
render-core: 6 production cast sites at real parse/construct boundaries (manifest
`objectsFromManifest`, site `loadLibrary`, working `workingToLibrary`) — these are the
*value*: the only places a raw string crosses into the model are now type-pinned, and
`working.ts`'s `meta.exhibits` (bare) vs `library.exhibits` (branded) provenance split is
explicit. Plus ~135 render-core test-fixture casts + 31 viewer cast sites (fixtures, sample-data,
voynich, atlas, geo, gen-published, published.test, ExhibitView) — all type-only, no value change.
Gates: render-core tsc 0 / 600 tests; viewer tsc + astro check 0 brand errors / 24 tests; studio 127.

**Honest friction tally:** real-but-modest safety. ~6 production casts (worth it) vs ~166
mechanical fixture/test casts (one-time, shallow). Keep-or-revert is a fair call in review.

**Deferred (scope):** `Section.objectId` (cross-ref to AObject.id) is the natural next brand —
would add real confused-reference safety; `Reading.id`/`Section.id` likewise. Not done this pass.
**Latent bug spotted (out of scope):** `apps/viewer/scripts/gen-published.mts:53-54` — `'chosen'
possibly undefined` (missing null-guard on the sort result). Pre-existing; flag for follow-up.

## Track A (remaining: A1/A2/A5 — still USER GATE, not approved)

> These change the CANONICAL model shape and ripple through render-core + both apps + the
> published JSON (durability / ADR-0014 self-describing artifacts / existing published
> trees). This is a different risk class from Wave 1 (pure refactors). A3 is a contraction
> of an already-decided migration (ADR-0007) → safe to attempt under gates. A1/A2/A4/A5
> are model migrations with back-compat implications → present findings + recommendation,
> let the user set appetite/sequencing before touching the model.

Each item below touches every consumer of the type. Do them **one at a time**, behind a
characterization test of the current serialization, expand-and-contract (add new shape,
migrate readers, remove old), never in a batch. None should start until S1/S2 land and
the tree is clean.

- **A1 — Unify the Note trio.** `AnnotationRecord`, `NewNote`, `TranscriptNote` are one
  concept in three shapes. Make a discriminated union keyed by role
  (`comment|tag|describe|supplement|geo`). Governs: ADR-0003 (append-only DAG —
  the union must preserve `logicalId`/`revId` identity), ADR-0017 (supplement role).
- **A2 — Discriminate `AObject` media.** Replace 9 optional fields
  (`mediaType?`,`duration?`,`width?`,…) with `type AObject = ImageObject | AudioObject |
  VideoObject`. Kills invalid field combinations at the type level. Governs: ADR-0002.
- **A3 — Finish the ADR-0007 `layers[]` contraction.** ⚠ CORRECTED 2026-06-20 after
  investigation: `layers[]` is NOT a removable zombie — it is still live, round-tripping
  state. The expand-and-contract's *migrate-readers* step was never done; the
  `foldLayersIntoTags` shim (migrate.ts) exists but is dead code (test-only), and ADR-0007
  folds `layers → Tags`, not `→ reading` (a single-valued Reading can't absorb a
  multi-valued layer losslessly). Real contraction is 3 sequenced steps:
  1. **Wire the shim in** — call `foldLayersIntoTags` from `deserialize.ts`
     (`recordFromHistoryAnnotation`) + the OPFS load path, with a back-compat test proving
     old `archie:layers` JSON → `purpose:tagging` bodies. (Doing 3 before 1 = silent data loss.)
  2. **Cut live writers/readers** — `spine/log.ts`, `spine/merge.ts`, `session/session.ts`
     write sites; `query/filter.ts` (`layersOf`/`filterByLayer`/`allLayers`); migrate
     `apps/studio/src/MergeReview.svelte:27` off `head.layers`.
  3. **Drop** `layers?` from `AnnotationRecord` (wadm/types.ts) + `ARCHIE_LAYERS` serialize; EOL note.
  Each step its own gated PR. (Docstring already corrected to stop claiming it's wired.)
- **A4 — Brand core IDs consistently.** Extend the branded-type pattern
  (`LogicalId`,`RevId`) to `Exhibit.id`,`Library.id`,`AObject.id`; normalise casing to
  `id`/`logicalId`/`revId`. Governs: ADR-0003.
- **A5 — One `role` discriminant.** Collapse `W3CBody.purpose` / `W3CAnnotation.motivation`
  / `W3CTextualBody.purpose` into a single explicit `role`. (Depends on A1.)

## Track B — Data-ops simplification — STATUS: DONE (2026-06-20, render-core 596 green)

- B1 ✓ extracted `AnnotationPageRef` (presentation.ts); 2 inline typedefs collapsed.
- B2 ✓ mutable `annRefById` map → pure `embedHeadsIntoManifest` (byte-equivalence proven). Hotspot reduced.
- B3 ✓ extracted `toReadingCollection` (iiif/exhibits.ts) + 2 tests.
- B4 ✗ SKIPPED — no real duplication (one `rewriteArchieLinks`; portable/static do different ops).
- B5 ✗ SKIPPED — not redundant (`toRanges`→IIIFRange[] vs `sectionsToAnnotationCollection`→W3C collection; different types). A wrapper would be decorative.

### (original Track B spec, for reference)

Located in `packages/render-core/src/publish/` and `/iiif/`. `site.ts` is the flagged
hotspot (42 anti-pattern hits, centrality 85). Round-trip integrity
(`read(publish(model)) === model`) must hold after each — add the round-trip test first.

- **B1 — Extract `AnnotationPageRef` type** (define once in `presentation.ts`, export).
  Removes 4 identical inline typedefs. LOW effort, high leverage.
- **B2 — Replace the mutable `annRefById` staging Map** (`site.ts:215–324`) with a pure
  `embedHeadsIntoManifest(manifest, refs)` transform. Removes ~100 LOC of in-place
  mutation; clarifies the collection.json → per-canvas embed flow.
- **B3 — Extract `toReadingCollection(reading, id)`** in `iiif/exhibits.ts` (hand-rolled
  inline at `site.ts:264–270`). Governs: ADR-0007.
- **B4 — Unify link rewriting** into `rewriteAnnotationLinks(annotation, linkRewrite)`;
  currently 3 parallel impls (`site.ts:98`, `portable.ts:139`, `static-pages.ts:87`).
  Governs: ADR-0010 (portable read seam), ADR-0009 (canonical origin).
- **B5 — Merge `toRanges` + `sectionsToAnnotationCollection`** → `toNarrativeMeta(exhibit)
  → {ranges, collection}` (`manifest.ts:200–279`, `site.ts:279` serialize sections
  identically). Halves the section iteration. Governs: ADR-0005, ADR-0017.

## Track C — Studio ingest simplification (low risk, local)

- **C1 — Collapse 4 asset-read paths** in `store.ts:238–346` (`readAssetUrl`,
  `readThumbUrl`, `readThumbBytes`, `readAssetBlob`) into one parameterized helper
  (~120 LOC → ~40); centralise MIME restoration.
- **C2 — Import `ObjectProvenance` from core** instead of redefining
  `WorkingObjectProvenance` in `store.ts:51–58` (two identical defs that will drift).
- **C3 — Extract `parseRegion()`** from the `csv-import.ts:154–166` state machine into a
  testable helper (reusable if Viewer ever gains import). Pairs with S1's parser.

---

## Recommended execution order (waves)

1. **Wave 0 (gate):** clean the dirty tree to a baseline commit; resolve the 3 parse errors.
2. **Wave 1 — spine + safe extractions:** S1, S2, B1, C2. All LOW risk, mostly pure
   functions. Add characterization/round-trip tests, then extract. ≤5 files per phase.
3. **Wave 2 — data-ops hotspot:** B2, B3, B4, B5, C1, C3. Reduces `site.ts` centrality.
4. **Wave 3 — model normalisation (one item per PR):** A3 (zombie removal, self-contained)
   → A2 → A1 → A5 (depends A1) → A4. Each behind expand-and-contract + ADR check.

Per-app test invocation (see memory `project_archie_test_invocation`): run vitest
**per app** with `pnpm exec vitest` — the root binary fails rune tests.

## Open question for the human (sequencing, not blocking)

The 71 dirty files: are they (a) in-progress work to finish+commit first, or (b) churn to
stash? Wave 0 can't start until that's resolved. Default assumption: finish/commit them,
since several are theme + metadata-CRUD features from recent commits.
