# Spike 0004 — Library-level Gallery + baked image index (SCALE-GALLERY Phase 3)

**Date:** 2026-07-05 · **Status:** SPIKE — design only, no code touched.
**Origin:** `docs/plans/SCALE-GALLERY-PLAN.md` Phase 3 (80–86) + `docs/adr/0023-library-level-image-index.md`.
Built on the incremental-publish machinery (spike-0002). Hands off `App.svelte`/`ExhibitOverview.svelte` (1.2/1.3 agent).

## 1. Image index — schema, source, and the incremental-survival proof

**Filename:** `images.json` at the tree root, alongside `collection.json`/`exhibits.json`
(`site.ts:210-213`, all written in the library-global always-rewritten tier). **Versioned** with `stamp()`
(`migrate.ts`) exactly as `exhibits.json` is (`site.ts:213`) — a compatibility surface (ADR-0023 §Context).

**Shape** (entry per Object, flattened in library order → per-exhibit reading order):
```jsonc
{ "schemaVersion": <n>, "images": [
  { "objectId": "o1", "exhibitSlug": "a", "title": "Photo 1",
    "thumbnail": "a/assets-thumb/photo.jpg", "width": 4000, "height": 3000 } ] }
```
`objectId`+`exhibitSlug` drive the click-through route (§2); `title` = the object label; `thumbnail` = the
published ref; `width`/`height` OPTIONAL (omitted when the source had none — the `incompleteCanvases` case,
spike-0002). Exhibit titles are NOT duplicated (the wall already loads `exhibits.json`).

**Built by reading the published MANIFESTS after the write loop, NOT the in-loop projections.** This is the
load-bearing decision: an incremental publish `continue`s past skipped exhibits (spike-0002 `site.ts:272`), so
their projected objects are never in hand. A `buildImageIndex(fs, library, baseUrl)` that iterates
`library.exhibits`, reads each `{slug}/manifest.json`, and projects the canvas items
(`canvas.id`→objId, `canvas.label`→title, `canvas.thumbnail[0].id`→thumbnail, `canvas.width/height`) is correct
uniformly: scoped exhibits' manifests are freshly written, skipped exhibits' are the untouched prior ones. Cost
= O(exhibits) small-JSON reads per publish — the same tier as `loadAllLogs` (spike-0002), acceptable for an
always-rewritten projection. Emit near the sitemaps (`site.ts` bottom), after the loop.

**Chain proof (thumbnail ref survives a byte-pass-skipped incremental publish):** the ref points at
`{slug}/assets-thumb/{name}`, written once by the asset pass (`site.ts:277`) and NOT rewritten on a JSON-only
save. The manifest's `canvas.thumbnail` carries that published path (`manifest.ts:105-108`), and on an
incremental JSON-only rewrite the recover-from-manifest path re-emits it verbatim (spike-0002 defect-4 fix
mirrors the published thumbnail exactly). Skipped exhibits' manifests are never touched. So `buildImageIndex`
reading `canvas.thumbnail` gets a live ref whose bytes are on disk. Reading the canvas DIRECTLY (not via
`objectsFromManifest`, which recovers ONLY baked `/assets-thumb/` thumbs, `manifest.ts:152-153`) also means
remote-IIIF objects keep their DERIVED thumbnail URL (`manifest.ts:106-108`) — every object gets a wall thumb.

## 2. Viewer read path — one fetch, lazy grid, existing route

`loadGallery()` (`published.ts:199`) reads `exhibits.json` today. Add `loadImageIndex()`: one `fetchJson`
of `images.json`, returns `null` on 404. The Gallery landing (`Gallery.svelte`, cards today `:34-37`) grows a
two-view toggle (**Exhibits** cards / **All images** wall) + one search box (§4). The wall renders index entries
in a `content-visibility` grid with `<img loading="lazy" decoding="async">` — the exact `ObjectGrid.svelte:73`
pattern (`content-visibility:auto; contain-intrinsic-size`), so the DOM stays bounded at hundreds of images.
**Degradation (ADR contract):** `images.json` missing (older tree) → hide the "All images" toggle; cards still
work from `exhibits.json`. **Click-through: no new route.** `#/<slug>/o/<objectId>` already exists
(`CiteCard.svelte:20`) and `ViewerShell` already parses `route.objectId` and mounts the exhibit at it
(`ViewerShell.svelte:283,287`). So a wall click = `location.hash = #/${slug}/o/${objectId}`.

## 3. Studio side — OPFS-direct, congruent shape, cross-exhibit nav

`LibraryHome` already receives every exhibit + its objects (`exhibits: ExhibitMeta[]`,
`LibraryHome.svelte:48`), so it needs no new data source — Studio reads OPFS LIVE, never the baked index (the
index is a publish artifact; unpublished edits would make it stale). **Cover thumbs:** the cards view already
renders `ex.cover` (`Gallery.svelte:34` is the viewer twin; Studio's `LibraryHome` cards `:222-235` are
text-only) — give each card a cover = explicit exhibit cover if set, else first object's baked thumb via
`readThumbUrl(slug, name)` (`store.ts:311`, per-slug so it reaches ANY exhibit's assets, not just the current
one). **All-images wall:** flatten `lib.meta.exhibits` → `{ objectId, exhibitSlug, title, thumb, width, height }`
— identical shape to §1's index entry, so a **shared `GalleryWall.svelte`** renders both (Studio feeds OPFS
blob URLs, viewer feeds baked refs). **Perf:** resolving thumbs for 50+ objects mints 50+ blob URLs pinning OPFS
Files — virtualize (content-visibility) and lazy-mint thumbs on visibility + revoke on unmount (congruent with
Phase 1.2's lazy-master minting). **Click-through:** wall image → that exhibit's editor at that object. App
owns navigation (`openExhibit(slug)` then `openObject`/`switchObject` + `view="editor"`); `LibraryHome` emits a
new `onopenobject(slug, objId)` the Phase-3 impl wires (I don't edit App — 1.2/1.3 agent's file).

## 4. Search — one shared title-substring primitive

Both views share ONE search box filtering the ACTIVE view (plan :26-28): cards → filter exhibits by title;
wall → filter images by title. **Semantics: case-insensitive substring, NFKD-normalized** (strip combining
marks so "Müller"↔"muller"). This is DISTINCT from the existing MiniSearch index (`search-index.ts`), which is
full-text over annotation PROSE/tags — a different corpus; don't reuse it for short titles. Extract a pure
`matchesTitle(title, query)` helper (headless, testable) and use it in the viewer Gallery, the Studio wall, AND
the Studio overview toolbar (spike-0003 §4 proposed the same primitive — **unify them into one definition**,
render-core or a shared util).

## 5. Implementation sketch, phasing, tests

Phasing follows the plan (index emission → studio gallery → viewer parity):
- **P3a — index emission (render-core):** `buildImageIndex` + `ImageIndex` type (new `iiif/image-index.ts` or in
  `exhibits.ts`), `site.ts` emits `images.json` after the loop; `matchesTitle` in a shared util. ~70 LOC. Tests
  (headless, MemoryFilesystem, the spike-0002 `site.test.ts` pattern): index lists every object across
  exhibits in library+reading order; thumbnail refs match the manifests; **survives an incremental publish that
  skips an exhibit's byte passes** (publish full → note-edit incremental → assert `images.json` still lists the
  skipped exhibit's objects with intact refs); missing-dimensions objects omit width/height; `matchesTitle`
  unit tests (case/diacritics/substring).
- **P3b — Studio Gallery (`LibraryHome` + shared `GalleryWall`):** visual cards (cover thumb, count,
  last-edited), the wall, the toggle + search. ~150 LOC + styles. Headless: `matchesTitle` + any card/wall
  data-shaping reducer; browser-only (manual, as the overview is): thumb minting, virtualization, DnD-free.
- **P3c — Viewer parity:** `loadImageIndex` + wall view in `Gallery.svelte` reusing `GalleryWall`, degradation.
  ~80 LOC. Tests: `loadImageIndex` returns null on 404 (degradation); wall renders index entries; click sets the
  `#/<slug>/o/<id>` hash.

## ADR-0023 amendments to make BEFORE implementing

1. **Add optional `width`/`height` to each entry** — ADR lists only id/slug/title/thumbnail; the wall needs
   aspect ratios for a justified/masonry layout without per-thumb measurement + layout shift. Cheap (the
   manifest already has them).
2. **Pin the format specifics the ADR left open** (it calls the format a compatibility surface): filename
   `images.json`, a `stamp()` schema-version marker, and ordering = library order then per-exhibit reading order.
3. **Note the thumbnail-ref source**: the index copies the manifest's `canvas.thumbnail` (baked local OR derived
   IIIF URL), so remote-source objects with no baked derivative still get a wall thumbnail — a small extension of
   the ADR's "thumbnail ref = the `assets-thumb/` path" wording.

No amendment forces a redesign — all three are additive shape decisions best pinned in the ADR before the format ships.
