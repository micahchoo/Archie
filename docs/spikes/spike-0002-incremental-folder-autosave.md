# Spike 0002 — Incremental folder autosave (SCALE-GALLERY Phase 1.1)

**Date:** 2026-07-05 · **Status:** SPIKE — design only, no code touched.
**Origin:** `docs/plans/SCALE-GALLERY-PLAN.md` Phase 1.1 · **Reads with:** `docs/adr/0023-library-level-image-index.md`

## Question

`autosaveToFolder` (`apps/studio/src/binding-store.svelte.ts:176`) fires on every debounced note
save (`exhibit-session.svelte.ts:64`) and reruns the FULL publish pipeline —
`writeToFolder → writeTree (publish-flows.svelte.ts:165) → publishLibrary (site.ts:205)` — over the
whole Library per edit. Design the minimal correct increment. Do not implement.

## 1. What one `publishLibrary` run writes

**Library-global (root), all small JSON/text — cheap, always rewrite** (`site.ts:210-213, 438-442`):
`archie.json` (constant marker), `collection.json`, `exhibits.json`, `index.html`, `sitemap.txt`,
`sitemap.xml`. ADR-0023's future `image-index.json` joins this tier (ADR §Consequences: "treat it
like `exhibits.json` — small always-rewritten projection, exempt from dirty-tracking").

**Per-exhibit, under `{slug}/`** (the `for (const exhibit of library.exhibits)` loop, `site.ts:232-436`):

| Output | Source of truth | Cost |
|---|---|---|
| `assets/{name}` (`:251-254`) | OPFS bytes via `getAsset`→`readAssetBlob` (`store.ts:284`, lazy Blob) | **byte-copy of every master, every save** |
| `{name}_files/…` / `{objId}_files/…` DZI pyramid (`:263, :297`, `writeTilePyramid :169`) | `tileObject`/`tileRemote` (`publish-flows.svelte.ts:63,90`) — `createImageBitmap` + `sliceToDzi` from scratch | **DOMINANT: CPU re-decode + re-slice, 100s–1000s of tile writes, per image >4096px edge** |
| `assets-thumb/{name}` (`:273`) | OPFS pre-baked bytes via `getThumbnail`→`readThumbBytes` (`store.ts:304`) | small byte-copy |
| `manifest.json` (`:428`) | `toManifest(manifestExhibit)` + `embedHeadsIntoManifest` — **depends on BOTH the object projection AND the exhibit's log heads** | small JSON |
| `canvas/{objId}/annotations*.json` (`:415,423`) | exhibit log (`projectHeads`) | small JSON, fanned out |
| `annotations/history/{index,logicalId}.json` (`:356-357`) | exhibit log (`toHistory`) | small JSON |
| `annotations/{narrative,readings/*}.json`, `readings.json` (`:369-384`) | exhibit structure | small JSON |
| `index.html` static archival page (`:435`) | exhibit log note texts | small text |
| `assets-original/{name}` (`:333-345`) | opt-in `getOriginal` — **NOT in the autosave/`writeTree` path** (`STATIC_PAGE_OPTS` omits it) | n/a here |

Plus a per-run cost outside `site.ts`: `writeTree` calls `deps.loadAllLogs()` (`publish-flows.svelte.ts:167`)
— reads **every** exhibit's annotation history from OPFS, even for a one-exhibit edit.

## 2. Anything already skippable? No.

No content addressing, no existence checks, no hashes anywhere. `tileObject` re-slices
unconditionally (no persisted tile cache — confirmed: nothing in `store.ts` writes `_files`/dzi).
`getAsset` re-copies identical master bytes every save. And `publishLibrary` has **zero `.remove()`
calls** — a full republish never cleans orphans, so today deleting an object/exhibit already leaves
stale `{slug}/canvas/{objId}/`, `assets/`, `_files/` behind. Incremental design must FIX this, not
inherit it.

## 3. Where change-tracking hooks in

All Studio mutations already funnel through two stores, both with a persist seam we can tap:
- **Annotation edits** → `exhibit-session save()` (`exhibit-session.svelte.ts:57`) → the ONLY caller of
  `autosaveToFolder`. Dirty granularity: the one `currentSlug`.
- **Structure/metadata** → `library-meta.svelte.ts` reducers: `patchObject/patchExhibit` (:51-52),
  `reorderObjects` (`App.svelte:492`→`patchExhibit`), `appendObject` (:55), `removeObject` (:61),
  `addExhibit`/`removeExhibit` (:56,60), `patchLibrary` (:50). Each fires `onAfterPersist`→`bnd.touch()`
  (`App.svelte:75`) — marks `dirty` but does NOT currently trigger the folder mirror.

A **dirty-set at (slug, objId) granularity** lives naturally in the binding store beside `folderFs`,
accumulated by these reducers and drained + cleared by `autosaveToFolder`.

## 4. Minimal correct increment per mutation class

| Mutation | Rewrite | Skip | Remove |
|---|---|---|---|
| **note add/edit/delete** (hot path) | that slug's `manifest.json`, `canvas/{obj}/*`, `history/*`, `narrative.json`, `index.html` + global | **all asset/tile/thumb passes, all other exhibits** | — |
| **object add** | that slug: manifest + NEW object's `assets/`,`_files/`,`assets-thumb/`, its canvas pages + global | other objects' bytes/tiles | — |
| **object remove** | that slug's manifest + global | all bytes/tiles | orphaned `canvas/{obj}/`,`assets/{name}`,`assets-thumb/{name}`,`{name}_files/` |
| **object reorder** | that slug's `manifest.json` + global | **all bytes/tiles** (order is manifest-only) | — |
| **exhibit meta** (title/desc/sections/rights) | that slug: manifest, index.html, narrative/readings + global | bytes/tiles | — |
| **library meta** | global only (`collection`,`exhibits`,`index.html`,`sitemaps`,image-index) | **every exhibit dir** | — |
| **exhibit add** | new `{slug}/` full + global | — | — |
| **exhibit remove** | global | — | `rm -rf {slug}/` |

**The correctness trap** (linchpin): `manifest.json` must be rewritten on a note edit (heads are
embedded inline, `:427`), and the manifest carries the asset-REWRITTEN object sources + `tileSource` +
baked `thumbnail` (`site.ts:255-277`). Rebuilding it from the working model would re-emit raw
`/assets/` sources and drop `tileSource`/`thumbnail` — because those publish decisions (tiled? has
thumb?) aren't persisted in the model. **Recovery:** `objectsFromManifest` (`manifest.ts:145`) already
round-trips `source`, `tileSource` (:148,164), and the baked `thumbnail` (:152-153,165) — it's what
`loadLibrary` uses. So when the asset pass is skipped, recover the projected objects by reading the
EXISTING published `manifest.json`, rebuild the bare manifest from them + the model's order, re-embed
fresh heads, write. No bytes touched, projection preserved.

## 5. Recommended design

Grow `publishLibrary` one optional param — **backward compatible**: absent = today's full projection,
so the GH/zip/preview paths (`libraryToZipFs`, `projectSite`, `collectSiteFiles`) pass nothing and are
untouched.

```ts
interface IncrementalScope {
  exhibits: Set<string>;              // slugs whose exhibit-dir JSON/HTML to rewrite; others skipped whole
  reassets: Set<string>;             // subset whose asset+tile+thumb byte passes must run; else recover
                                     // objects via objectsFromManifest(existing manifest)
  removedExhibits?: string[];        // rm -rf {slug}/
  removedObjects?: { slug: string; objId: string; assetName?: string }[]; // orphan cleanup
}
// PublishOptions gains: incremental?: IncrementalScope
```

Behaviour when `incremental` is set: library-global writes always run (cheap, ADR-0023-mandated);
the per-exhibit loop processes only `exhibits`; inside a processed exhibit the asset/`tileObject`/
`tileRemote`/thumb passes run only if `reassets.has(slug)`, else objects come from the existing
manifest; then removals. Binding store maintains the set, `autosaveToFolder` builds scope
(note-edit slug → `exhibits` only, structure ops add to `reassets`/removals), calls the incremental
write, clears the set on success. `loadAllLogs` → load only the dirty slugs' logs.

**Size:** ~1 new param + ~40 LOC of branching in `site.ts` (guard the two byte passes, add a
recover-objects branch, add removal handling); ~30 LOC dirty-set in `binding-store.svelte.ts`; wire
the reducers in `library-meta.svelte.ts`/`App.svelte` (~20 LOC). ~4 files, ~90 LOC.

**Rejected alternatives.** (a) *Persist per-object tiled/thumb flags in the model* to rebuild the
manifest purely — more invasive, duplicates state the published manifest already holds; the
`objectsFromManifest` recovery is free. (b) *Content-hash every asset/tile and skip unchanged writes* —
solves the wrong axis: hashing still re-decodes+re-slices to compare, and the dirty-set already knows
nothing changed without touching bytes. (c) *Separate lightweight "mirror annotations only" writer
outside `publishLibrary`* — forks the projection, violates the one-projection invariant
(`publish-flows.svelte.ts` deliberately routes folder/zip/GH/memory through one `publishLibrary`).

**Crash consistency.** FSA `createWritable()` writes a temp + atomic-renames on `close()`
(`fsa.ts:15-19`) — each file is individually atomic, but there is NO cross-file transaction (same as
today's full publish). A partial incremental write leaves a mix of new+old files; the next full ⌘S
(or any re-save) reconciles. Acceptable: the incremental set is a strict subset of what the existing
full publish already writes non-transactionally. No existing atomicity convention to preserve beyond
per-file `writable().close()`.

**Test strategy.** Unit (`site.test.ts` pattern, MemoryFilesystem): publish full → capture tree →
mutate one note → incremental-publish with `{exhibits:{slug}}` → assert only that slug's JSON/HTML
changed, asset/`_files` bytes byte-identical (spy the `tileObject` callback: **0 calls**), manifest
`tileSource`/`thumbnail`/`source` preserved via the recover path. Removal test: incremental with
`removedObjects` → orphan dirs gone. Equivalence oracle: full-publish tree == sequence of incremental
publishes applied to the same mutations (modulo orphan cleanup, which incremental does better).
