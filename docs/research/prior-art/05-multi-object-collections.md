# Axis 05 — Multi-object / Collections (multi-canvas, IIIF Collection, cross-object exhibits)

## Focused question
How do prior-art repos model and navigate MULTIPLE objects/images/canvases — IIIF Collections, multi-canvas manifests, item sets, a gallery index — and how do you switch/navigate between objects in one exhibit (our v2 multi-image switcher + Gallery/`exhibits.json`)?

## Sources surveyed
- `IIIF/cozy-iiif` — PURE Collection/Manifest/Canvas/Range traversal + TOC — opened y
- `IIIF/immarkus` — React; Collection import (consumes cozy-iiif), FSA folder model — opened y
- `iiif-demo/biiif` (+ `IIIF-generator` = compiled biiif) — folder→Collection/Manifest generation — opened y
- `IIIF/tiny-iiif` — folder→manifest server ops (add/reorder/remove canvases) — opened y
- `osd-audio-video/multi-canvas-strip.html` — OSD multi-canvas switcher UI — opened y
- `tropy` — Electron item/list model (item-sets, ordered membership) — opened y
- `iiif-demo/IIIFtoolset` — py inferrer scaffolding only — opened y (no logic)

## Findings by source

### cozy-iiif — PURE IIIF traversal library (the gold)
- **Parse-by-type dispatch** — `IIIF/cozy-iiif/src/Cozy.ts:89-153` — PURE — `parse()` reads `@context`+`type`, routes Collection vs Manifest vs Image; auto-upconverts P2→P3 (`convertPresentation2`). Maps to: loading any exhibit source uniformly.
- **Collection→items traversal** — `IIIF/cozy-iiif/src/Cozy.ts:155-186` — PURE — `parseCollectionResource` uses `@iiif/parser` `Traverse({manifest})` to flatten a Collection into `CozyCollectionItem[]` (id/type/label). Maps to: Gallery / multi-manifest exhibit index.
- **Manifest→canvases+ranges** — `IIIF/cozy-iiif/src/Cozy.ts:188-260` — PURE — `parseManifestResource` builds `canvases[]` + recursive `structure` (ranges) + `getTableOfContents`. Maps to: v2 multi-image switcher's canvas list.
- **TOC tree + breadcrumbs + nav-parent** — `IIIF/cozy-iiif/src/core/manifest.ts:3-121` — PURE — recursive `buildTree`, `getBreadcrumbs(id)`, `getNavParent(canvasId)`, `getNode`, flat `index` Map. Maps to: cross-canvas navigation state + nav hierarchy.
- **Canvas image/thumbnail extraction** — `IIIF/cozy-iiif/src/core/canvas.ts:22,100` — PURE — `getThumbnailURL`, `getImages` (walks AnnotationPage painting bodies). Maps to: switcher thumbnails per object.

### immarkus — consumer of cozy-iiif Collections (the integration pattern)
- **Collection import flow** — `IIIF/immarkus/src/pages/images/IIIFImporter/ImportFromCollection.tsx:94-138` — COUPLED(React) — iterates `collection.items`, `Cozy.parseURL(item.id)` each, builds per-canvas index (`murmur.v3(canvas.id)`), persists via store. Maps to: importing a multi-manifest exhibit; PURE core is cozy-iiif underneath.
- **FSA folder = image-set model** — `IIIF/immarkus/src/model/Folder.ts:4-20` — PURE(types) — `Folder{path[], handle: FileSystemDirectoryHandle}`, `FolderItems{images, folders, iiifResources}`. Maps directly to anvil's `FsaFilesystem` Project-as-directory.

### biiif — folder→IIIF Collection/Manifest generator
- **Recursive folder→Collection/Manifest classify** — `iiif-demo/biiif/Directory.ts:55-160` — COUPLED(Node: `fs`/`glob`/`path`/`url`) — `_*` dirs = canvases ⇒ Manifest; plain subdirs ⇒ Collection; recurses. Algorithm portable, file isn't. Maps to: generating an exhibit manifest from a Project folder.
- **index.json assembly + manifests.yml merge** — `iiif-demo/biiif/Directory.ts:183-302` — COUPLED(Node) — emits collection/manifest boilerplate, adds collection/manifest items w/ thumbnails, merges external `manifests.yml` entries, sorts by label. Maps to: Gallery `exhibits.json` assembly (closest prior art, but Node-bound).

### tiny-iiif — folder→manifest mutation ops
- **Reorder canvases in manifest** — `IIIF/tiny-iiif/tiny/src/pages/api/_ops/manifest-reorder-images.ts:5-36` — COUPLED(Node fs) — splits items by imageId, splices to `moveToIndex`. Algorithm (Map + slice splice) is PURE-extractable. Maps to: reordering images in v2 switcher.
- **Add canvases to manifest** — `IIIF/tiny-iiif/.../manifest-add-images.ts:9-35` — COUPLED(Node fs) — appends `IMAGE_ITEM_TEMPLATE` canvas items. Maps to: adding images to a Project.

### multi-canvas-strip — OSD cross-object switcher UI
- **sequenceMode + reference strip** — `osd-audio-video/multi-canvas-strip.html:314-329` — COUPLED(OSD) — `tileSources: CANVASES.map(...)`, `sequenceMode:true`, `showReferenceStrip:true`. Lift-able bit = `CANVASES` data shape (per-object `{type,tile,label,source}` discriminator).
- **page-switch event wiring** — `multi-canvas-strip.html:374-400,441-446` — COUPLED(OSD) — `viewer.addHandler('page', e=>activateCanvas(e.page))`; sidebar click → `viewer.goToPage(i)`; per-type overlay activation (image/audio/video). Maps directly to: v2 multi-image switcher navigation contract.

### tropy — item-set membership model
- **Ordered list membership** — `tropy/src/models/list.js:78-118`, `item.js:151-195` — COUPLED(Electron+SQLite) — `list_items` join table with `position` column, ORDER BY position; `unlisted` query. Pattern note only (not lift-able): ordered cross-object collection membership backed by a positional index.

### papadam — server-DB curated collection (ordered blocks, not IIIF Collection)
- **Exhibit = ordered ExhibitBlock list** — `papadam/api/papadapi/exhibit/models.py:15-86` — COUPLED(Django) — `Exhibit` groups media + annotation blocks by `order`, `is_public`, group-scoped. A curated cross-object collection, but server-relational — NOT an IIIF Collection manifest. iiif-manifest-editor Vault still owns the normalized-IIIF-entity story.

## Pure-logic extractables (the gold)
| Capability | Source `file:line` | Pure? | Depends on | Extraction effort | Maps to our need |
|---|---|---|---|---|---|
| Parse+route any IIIF resource (Collection/Manifest/Image, P2→P3) | `cozy-iiif/src/Cozy.ts:89-153` | PURE | `@iiif/parser`, `@iiif/presentation-3` | Low (lib import) | Load exhibit source uniformly |
| Collection → flat item list | `cozy-iiif/src/Cozy.ts:155-186` | PURE | `@iiif/parser` `Traverse` | Low | Multi-manifest exhibit / Gallery index |
| Manifest → canvases + ranges + TOC | `cozy-iiif/src/Cozy.ts:188-260` | PURE | `@iiif/parser`, `@iiif/presentation-3` | Low | v2 multi-image switcher data |
| TOC tree + breadcrumbs + nav-parent + node index | `cozy-iiif/src/core/manifest.ts:3-121` | PURE | none (own types) | Low | Cross-canvas navigation state |
| Canvas thumbnail + painting-image extraction | `cozy-iiif/src/core/canvas.ts:22,100` | PURE | `@iiif/presentation-3` | Low | Per-object switcher thumbnails |
| FSA folder/image-set type model | `immarkus/src/model/Folder.ts:4-20` | PURE | FSA API types | Trivial | Project-as-directory (FsaFilesystem) |
| Recursive folder→Collection/Manifest classify | `biiif/Directory.ts:55-160` | COUPLED(Node) | `fs`,`glob`,`path` | Med (re-impl on FSA) | Generate manifest from Project folder |
| index.json/exhibits assembly + label sort | `biiif/Directory.ts:183-302` | COUPLED(Node) | `fs`,`url-join` | Med | Gallery `exhibits.json` assembly |
| Reorder canvases (Map + splice) | `tiny-iiif/.../manifest-reorder-images.ts:5-36` | COUPLED(Node fs) | fs | Low (core PURE) | Reorder images in switcher |

## Gaps — what NO surveyed repo solves
- **Gallery / `exhibits.json` meta-index.** Every repo solves IIIF Collection (multi-*manifest*, single site). NONE generate an index of *published exhibits* (multi-*site*, meta-level) — an exhibits-of-exhibits. biiif/IIIF-generator stop at folder→Collection; immarkus *consumes* a Collection but never emits a gallery index; tropy's lists are intra-project. Our CI-regenerated `exhibits.json` Gallery is unsolved prior art.
- **Cross-object navigation tied to per-image AnnotationPage scope.** cozy-iiif gives canvas-switch nav; none wire the switch to swapping the active per-image `AnnotationPage` (our scope model). The bridge (canvas change → load that image's AnnotationPage + `fitBounds`) is ours to build.
- **Serverless (browser-only) folder→Collection generation.** All folder→Collection generators (biiif, tiny-iiif) are Node/server-side. None run on FSA/OPFS in-browser — the algorithm must be re-implemented against `FileSystemDirectoryHandle`.

## Verdict for our build (lift / study / avoid, and why)
- **LIFT: cozy-iiif** — already a field-studio dependency; the entire Collection/Manifest/Canvas/Range/TOC traversal surface is PURE, P2→P3-normalizing, and battle-used by immarkus. Use it as the canonical multi-object read model. Top pick.
- **STUDY: biiif `Directory.ts`** — the definitive folder→Collection *algorithm* (underscore=canvas, plain-dir=Collection, recurse, label-sort, yml-merge). Re-implement against FSA for in-browser Project→manifest generation; do not lift the Node file.
- **STUDY: multi-canvas-strip** — copy the `CANVASES` data shape + `goToPage`/`page`-event contract for the v2 switcher; the OSD wiring is glue, the navigation contract is the value.
- **STUDY: tiny-iiif reorder/add ops** — clean canvas-list mutation algorithms (Map+splice) worth porting to our manifest editing; server fs is incidental.
- **AVOID lifting: tropy** — Electron+SQLite `list_items`; only the positional-membership *pattern* transfers, no code.
- **GAP TO BUILD: Gallery `exhibits.json`** — no prior art; design fresh.
