# PLAN — IIIF Collection ingest (collection paste → N exhibits)

Scoped 2026-07-19 via /grill-with-docs (9 branches, all confirmed). Extends the
manifest-paste import (Archie-bc01) so pasting a IIIF Collection URL unpacks it
into exhibits instead of refusing. Glossary: CONTEXT.md §Ingest ("Collection
unpacking", "Import batch").

## Locked decisions

1. **Product shape.** Collection paste → N new Exhibits appended to the current
   Library, one per member Manifest, in collection order. Collection
   label/summary is NOT imported (the library keeps its identity). Rejected:
   single-manifest picker-only; flatten-to-one-exhibit (mega-manifest shape).
2. **Nesting.** Depth-first traversal in document order, flattening all
   reachable Manifest refs. Visited-ID set (cycles + cross-branch duplicates).
   Depth cap 3 (root = 0). Capped/skipped nodes are counted and reported, never
   silent. Traversal carries each manifest's parent-collection label trail (for
   picker context + provenance stamping) even though the Library stays flat.
3. **Selection UX.** Checkbox picker in the create dialog: scrollable list
   (label + parent-collection context), all checked by default,
   select-all/none. Selection composes with pasting a sub-collection URL (any
   node is a valid paste target).
4. **Scope.** New-exhibit scope only. Add-to-exhibit keeps today's refusal
   message verbatim ("Paste the URL of a single manifest instead"). No editable
   title field for collection imports — each exhibit takes its manifest label
   (fallback: `Canvas`-style fallback already in manifestToExhibit / URL
   segment in picker).
5. **Fetch policy.**
   - Preview (paste-time, debounced + abortable): fetch collection documents
     only — depth ≤ 3, ≤ 25 collection docs, ≤ 1,000 discovered manifests
     (over-cap on manifests: refuse with count + suggest a sub-collection URL).
   - Labels two-tier: inline collection-item labels render instantly; items
     missing `label` (spec SHOULD, not MUST) show URL-segment fallback and are
     hydrated in the background via full `fetchManifestPlan` — cap 100
     hydration fetches, plan cached by URL so import never double-fetches.
   - Import (confirm-time): checked manifests only, each through the ONE
     existing fetch head `ingest-flows.ts#fetchManifestPlan` (32 MB
     `IIIF_MANIFEST_MAX_BYTES` cap applies to collection docs too).
   - Concurrency 4 (worker pool), both phases. `iiifToken`/`iiifAbort` pattern
     extends: one AbortController per phase; pool checks signal between jobs.
6. **Partial failure.** Skip-and-continue per manifest (render-core "corrupt ≠
   empty" per-item tolerance); no retry in v1. In-order commit via reorder
   buffer (fetch 4-wide, commit in collection order — same import, same library
   order every time). Progress lives in the dialog ("Importing 34 of 520…" +
   Cancel); cancel aborts in-flight, keeps committed exhibits, reports how far
   it got. Clean success → toast; any failures → ctx.alert naming each failed
   manifest (label/URL + one-line reason, truncate past ~10 with "…and N
   more"). Slug collisions: trust the existing create path's dedupe — VERIFY at
   implementation, don't redesign.
7. **Code placement** (all studio-side; render-core untouched):
   - `apps/studio/src/collection-import.ts` (NEW, pure): `collectionToRefs`
     (one collection doc → typed refs; P3 `items`, P2
     `members`/`collections`/`manifests`) and `traverseCollection` (recursion,
     visited set, caps, skip accounting) with fetch as an injected callback.
   - `apps/studio/src/iiif-import.ts`: extract shared
     `classifyIiifDocument(json) → manifest | collection | unknown`;
     `manifestToExhibit` keeps throwing on collections (its contract is one
     manifest).
   - `apps/studio/src/ingest-flows.ts` (only fetch owner):
     `fetchCollectionPreview(url)` + `newExhibitsFromCollection(refs)` (pool,
     plan cache, reorder buffer, progress callback, summary, undo slugs).
   - `apps/studio/src/create-exhibit-dialog.ts`: `previewManifest` generalizes
     to a discriminated preview (`manifest | collection | error`).
   - `apps/studio/src/CreateExhibitDialog.svelte`: picker state (checked set,
     hydration), progress/cancel state.
8. **Post-import manageability** (what keeps 520 exhibits usable):
   - `removeExhibitsIn(meta, slugs)` plural reducer
     (`library-meta-reducers.ts`, mirroring `removeObjectsIn`): one patch, one
     persist, one `signalLibraryChanged` — never 520 sequential persists.
     Deletion is metadata-only (imported media is remote).
   - **Undo import**: batch records created slugs; completion toast AND failure
     alert carry an "Undo import" action → plural remove.
   - **Provenance stamping**: each imported exhibit's description gets its
     collection trail ("From: {root} › {sub-collection}") — searchable via the
     existing unified search (Archie-2308), user-editable, no schema change.
   - **Perf smoke check** (flag, not CRUD): LibraryHome at 500+ exhibits with
     remote cover thumbs — exercise once, file follow-up only if it chokes.
   - OUT of scope: library-level exhibit reorder (import order = collection
     order is the durable answer).
9. **Bulk ops in LibraryHome** (promoted into scope as Phase 2):
   - Multi-select borrowing the `overview-selection.ts` grammar (no second
     selection idiom); select-all respects the active search filter — "search
     `Documents` → select all → act" is the flatten-mitigation workflow.
   - **Bulk delete** with two-step confirm naming the count ("Delete 15
     exhibits?"). Undo-import becomes the pre-selected special case of this
     machinery.
   - **Bulk edit = rights only** (license + credit) applied to the selection —
     the field institutional imports actually need in bulk. Title/description
     stay per-exhibit (bulk title is nonsense; bulk description would stomp
     provenance trails).

## Phases

**Phase 1 — the import pipeline** (shippable alone):
collection-import.ts (+tests), classifyIiifDocument extraction,
ingest-flows additions, dialog preview/picker/progress, `removeExhibitsIn` +
undo-import action, provenance stamping.

**Phase 2 — LibraryHome selection + bulk ops** (disjoint files):
multi-select in LibraryHome.svelte, bulk delete, bulk rights edit; rewire
undo-import to pre-select.

## Tests / gates

- `collection-import.test.ts`: P3 + P2 parsing, cycle termination, duplicate
  dedupe, depth cap, doc cap, manifest cap, skip accounting — all with fake
  fetcher.
- `create-exhibit-dialog.test.ts` (extend): collection preview states, picker
  validity, hydration fallback labels.
- ingest-flows coverage: in-order commit under out-of-order completion,
  skip-and-continue, cancel-keeps-committed, plan-cache no-double-fetch, undo
  slug recording.
- `library-meta-reducers.test.ts` (extend): `removeExhibitsIn`.
- Gate after any `.svelte` edit: `pnpm --filter @archie/studio run check`
  (svelte-check rule); tests per-app via `pnpm exec vitest`.
- e2e echo of Archie-bc01's close: Archie's own published `collection.json`
  round-trips into N exhibits matching the library that published it.

## Explicitly out of scope

Add-to-exhibit collection support (picker-as-canvas-source), retry of failed
manifests, library-level exhibit reorder, importing collection label/summary
as library identity, any render-core change.
