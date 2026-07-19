# AUDIT — stable ids on every mergeable unit

**Ticket:** `Archie-2767` (map: Archie+ real-time-collab readiness, `Archie-f849`), wayfinder:research.
**Method:** two parallel read-only code audits of `packages/render-core/src` (+ studio assignment
sites) 2026-07-18 — one mapping per-unit identity, one hunting positional/index-derived keying.
**Domain SoT consulted:** `CONTEXT.md` (Exhibit = stable slug; Object = stable exhibit-nested id, ADR-0001).

## Answer (the verdict A1 and the spine gate inherit)

**Annotations are already CRDT-ready. Authored structure is not — but the gap is ordering and
merge machinery, not missing ids.**

- **Annotation identity is the gold standard**: a globally-unique branded ULID `logicalId`, id-keyed
  through the *entire* spine (log, heads, merge, serialize, deserialize, persist), reconstructed on
  reload from the `archie:logicalId` extension — never from array position. The annotation-granular
  CRDT path A1 hypothesizes is **structurally supported today**.
- **Exhibit/Object/Section/Reading carry stable ids too**, but with two real gaps for concurrent
  editing: their ids are only **exhibit-local** (not globally unique), and their **order is pure
  array index** with no order key. Worse, authored structure has **no id-keyed merge layer at all** —
  `library.json` is whole-file last-writer-wins, unlike the version-DAG the annotation spine runs.

So the audit does not hand A1 a pile of "mint ids" fixes. It hands it a sharp boundary: the
annotation layer is ready; the **authored-structure layer is the harder, separate problem** — which
is exactly the spine-decision-gate's territory, not the annotation probe's.

## Per-unit identity

| Unit | id : type | Generated | Stable across edit + reload? | Uniqueness scope |
|---|---|---|---|---|
| **Exhibit** | `ExhibitId` (branded) | slug-derived `ex-${slug}` (`App.svelte:646`; brand `brand.ts:26`) | Stable — never reminted; rename ≠ re-slug | **Library-global** ✅ |
| **Object** | `ObjectId` (branded) | ordinal `o${n}`, n=len+1 (`ingest-flows.ts:137-142`) | Stable — not reminted on reorder; reload recovers id from canvas IRI (`manifest.ts:133,179`) | **Exhibit-local only** ⚠ |
| **Section** | plain `string` (unbranded) | `s-${ts36}-${rand36}` (`App.svelte:422`) | Stable — reload via `/range/{id}` tail (`manifest.ts:283,362`) | Exhibit-local; **unbranded** ⚠ |
| **Reading** | plain `string` (unbranded) | human slug from name, fallback `r${n}` (`ReadingsEditor.svelte:27,36`) | Stable — mint-once, rename ≠ re-id | Exhibit-local registry; **unbranded** ⚠ |
| **Annotation** | `LogicalId` (branded ULID) | `mintLogicalId` (`brand.ts:66`), minted in `appendNew` (`log.ts:91`) | Stable — edits append `rev`, keep `logicalId`; verbatim via `archie:logicalId` | **Global** ✅ |

## Two premise corrections (load-bearing — they retarget the map)

1. **`creator?` is inert; the real author id already exists.** `creator?: unknown` on
   `W3CAnnotation` (`wadm/types.ts:142`) is a WADM passthrough **never read anywhere** in render-core,
   studio, or viewer. Archie's actual author identity is a *separate*, **already-populated** field —
   `lastEditor: ClientId` on `AnnotationRecord` (`wadm/types.ts:225`), serialized as
   `archie:lastEditor`. → **There is no "never-populated identity field" to fill for annotations.**
   This refutes the DIVERGENCES.md observation that seeded map ticket **B1**.
2. **Reading is not owner-less.** The "Reading has no owner" reading of `model.ts:144` was a misread
   of a doc comment about *Notes*: a Note's Reading membership (`record.reading`) is optional
   (belongs to one Reading *or none*). The Reading itself always has a stable id and is owned by its
   Exhibit (`Exhibit.readings[]`, `model.ts:168-170`).

## Positional / ordering hazards (stable ids, but order is array index — no order key)

- Exhibit gallery order = emit-time array index (`iiif/exhibits.ts:41`; `model.ts:182` "Array order = display order").
- Section spine order = `sections[]` index → `"archie:order": index` (`manifest.ts:325`, `279`, `343`).
- Object / Reading order = array position only (`model.ts:165-170`, `working.ts:106-110`).
- **Structural:** `workingToLibrary`/`libraryToWorking` are 1:1 positional `.map` transforms
  (`working.ts:163,224`); authored structure persists as ordered arrays with **no id-keyed
  reconciliation** — whole-file LWW. (Matching *within* the transform is by each unit's own id/slug,
  so it is not an index-*matching* bug; it is a missing-merge-layer bug.)
- Low-risk single-element IIIF assumptions (one body/target per canvas): `manifest.ts:170,363`,
  `deserialize.ts:95`, `static-pages.ts:47` — display/import, not cross-unit identity.

## Clean cells (already concurrent-safe — do not disturb)

- Annotation spine fully id-keyed by `logicalId`+`rev`: `log.ts`, `heads.ts:20-28`,
  `merge.ts:17-127,139-146,228-233` (`resolveConflict`/`classifyMerge` match by rev/logicalId),
  `serialize.ts:87-101`, `deserialize.ts:140-151` (`fromHistory` dedupes by rev — order-independent).
- History pages keyed by `logicalId` (`persist.ts:50,58,110,121`; `history/{logicalId}.json`,
  index = `Record<logicalId,url>`) — addressable by stable id, never page+position.
- Import round-trips recover ids from IRIs, not fresh mints: `objectsFromManifest` (`manifest.ts:179`),
  `sectionsFromManifest` (`manifest.ts:361-362`); `annotationsFromManifest` keyed by object/reading id.
- `mergePublishedIndexes` reconciles exhibits by `slug` (`publish/merge.ts:42,45,54`); only the
  `order` re-numbering (`merge.ts:52`) is positional.

## Fix items (recorded — NOT to be pre-built; they are A1 / spine-gate input)

1. **Global-uniqueness for Object/Section/Reading** when they become mergeable across exhibits — either
   compose a global key (`{exhibitId}/{localId}`) or promote to branded global ids. Not needed while a
   CRDT scopes per-exhibit.
2. **An explicit order key** per ordered unit (fractional index / list-CRDT position) to replace array
   index — the prerequisite for conflict-free reorder/insert. This is a latent correctness smell even
   before collab (concurrent tabs, undo).
3. **An id-keyed merge layer for authored structure** paralleling the annotation spine — the big one,
   and squarely the **spine-decision-gate's** question (`Archie-494c`), gated on A1's granularity verdict.

**Do not act on 1–3 now.** Whether authored structure becomes collaborative at all is downstream of
A1 (annotation granularity) and the spine gate. Pre-building an order-key/merge layer before those
verdicts is exactly the "don't pre-build op-log machinery" trap the worklist names.
