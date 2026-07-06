# ADR-0023 — Library-level image index baked into the published tree

**Status:** proposed (2026-07-05, grill — user-gated; implementation not started)

## Context

The Library-level **Gallery** (the reserved glossary term — `.scratch/CONTEXT.md` §74) is growing
an **all-images wall**: every Object across every Exhibit, browsable and searchable, with
**Studio/Viewer parity** (grill decision, `docs/plans/SCALE-GALLERY-PLAN.md`). Studio can build
this view from OPFS directly. The published Viewer cannot: its library landing reads only
`exhibits.json` (`apps/viewer/src/published.ts:200-213`), a projection that knows Exhibit titles
and counts but nothing about individual Objects.

Two ways for the published wall to learn what Objects exist:

1. **Eager-fetch every Exhibit manifest at landing.** No format change, but O(exhibits) fetches
   before the wall paints — precisely the eager-loading disease the same plan cures elsewhere
   (`read.ts` loads everything up front; Phase 1 exists because of it). Cost grows with the
   Library forever.
2. **Bake a library-level image index at publish time.** One small fetch; the publish pipeline
   already walks every Object (it bakes per-object thumbnails), so emitting the index is a
   cheap projection of work already done — the same build-time-projection pattern as
   `exhibits.json` itself (CONTEXT §111).

This is the one hard-to-reverse choice in the plan: published trees live on static hosts and in
`.archie.zip` files in the wild; whatever shape ships becomes a compatibility surface.

## Decision

The publish pipeline emits a **library-level image index** alongside `exhibits.json`: one entry
per Object across the Library. The Viewer's Gallery wall renders from this index alone; full-res
assets and annotations load only on click-through into the owning Exhibit (existing per-exhibit
path, unchanged).

Contract mirrors `exhibits.json`: a **generated build artifact, a projection of the Library** —
never authored, never the source of truth, safe to regenerate on every publish.

**Pinned format** (spike-0004, 2026-07-05 — this file is a compatibility surface, so pinned
before first ship):

- **Filename:** `images.json` at the published root, beside `exhibits.json`/`collection.json`.
- **Version marker:** same `stamp()` versioning convention as `exhibits.json`.
- **Entry:** `{ objectId, exhibitSlug, title, thumbnail?, width?, height? }` — width/height are
  the manifest's canvas dimensions when known, so the wall can lay out a justified grid without
  per-thumbnail measurement or layout shift. `thumbnail` is OPTIONAL (implementation finding,
  2026-07-05): the manifest carries one only for baked-asset objects and IIIF-service sources —
  plain external rasters and AV objects have none, and consumers show a placeholder or derive at
  runtime. Every entry stays searchable by title regardless.
- **Ordering:** flattened library order, then per-exhibit reading order — the index is already
  display-ordered; consumers don't re-sort.
- **Thumbnail ref source:** the published manifest's `canvas.thumbnail` — a baked
  `{slug}/assets-thumb/{name}` path for imported assets, or a derived IIIF thumbnail URL for
  remote objects. (Broader than this ADR's original "baked-thumbnail ref" wording: remote
  Objects get wall thumbnails too.)
- **Build source:** the index is built by reading each exhibit's *published* `manifest.json`
  after the write loop — uniform for both freshly-written and incrementally-skipped exhibits,
  and the thumbnail ref provably survives byte-pass-skipped publishes (the recover path re-emits
  `canvas.thumbnail` verbatim).

## Consequences

- The Viewer wall costs one index fetch + lazily-loaded thumbnails regardless of Library size;
  no per-exhibit manifest fetches at landing.
- Every publish rewrites the index (it is a whole-library projection). The Phase 1 incremental
  autosave must treat it like `exhibits.json`: a small always-rewritten projection, exempt from
  dirty-tracking (rewriting one small JSON per save is fine; re-tiling images is not).
- Older published trees lack the index. The Viewer must degrade: no index file → hide the wall
  (cards view still works from `exhibits.json`). No migration required.
- Thumbnail refs make the index mildly coupled to the baked-thumbnail layout (`assets-thumb/`);
  the ref is a path within the published tree, resolved the same way `object.thumbnail` already
  is in `MediaThumbnail.svelte`.

## Alternatives rejected

- **Eager manifest fan-out (option 1):** reintroduces the load-everything pathology this plan
  exists to remove; unbounded landing cost.
- **IIIF Collection as the index:** a Collection lists Manifests, not Canvases — it cannot carry
  the per-Object entries the wall needs without non-standard stuffing. `exhibits.json` already
  occupies the "rendered browse surface" role distinct from IIIF Collection (CONTEXT §74);
  the image index extends that precedent rather than bending the standard.
