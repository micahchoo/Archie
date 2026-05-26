# PLAN — Phase 2: Adopted-core milestone (the working tool)

Decomposer pass (writing-plans). Phase 2 = the thin annotate→publish-to-GH-Pages tool, ZERO
inventions (strategy §25-33). Studio + Viewer may proceed in PARALLEL now that `@render/svelte`
exists (strategy §45) — but the SOURCE side (persistence) comes before the UI projection (Q-5).

## The cut: machine-verifiable SOURCE vs browser/human PROJECTION

Per source-before-projection (Q-5) + the LLM-reliability split (strategy §89): build and
unit-test the **persistence + IIIF + publish-zip source** autonomously; the **UI** (editor,
reader, layouts, chooser) + **dogfood + bundle measurement** are browser/human (an LLM can't
visually verify OSD render or run the dogfood). The reducibility classifier (§117) routes each.

### Machine-verifiable leaves (this session can do these — donor-defined / corpus-testable)
```
TASK P2-1  annotation persistence round-trip (the on-disk spine form)
  implements:    ADR-0003 (Q-3), Q-5
  donor:         anvil storage/core.ts (dir constants), annotations.ts (validateAnnotationPage)
  write-targets: packages/render-core/src/spine/persist.ts + persist.test.ts
                 + packages/render-core/src/spine/deserialize.ts + deserialize.test.ts
  change:        fromHeadsPage/fromHistory (WADM AnnotationPage -> AnnotationRecord[], the inverse
                 of serialize.ts); writeAnnotations(fs,dir,log)/readAnnotations(fs,dir) over the
                 Filesystem seam writing {dir}/{canvas}.json (heads) + annotations/history/*.json
                 + index.json. Round-trip: log -> write -> read -> same log (modulo order).
  acceptance:    RUN `pnpm --filter @render/core test persist deserialize` → round-trip green.

TASK P2-2  IIIF projection (Library Collection / Exhibit Manifest / Canvas / exhibits.json)
  implements:    ADR-0001 (Q-1, exhibit-nested), CONTEXT exhibits.json
  donor:         greenfield-per CONTEXT (the survey's MAJOR greenfield gap — nobody emits a
                 multi-exhibit index); IIIF Presentation 3 spec
  write-targets: packages/render-core/src/iiif/{manifest.ts,collection.ts,exhibits.ts} + tests
  change:        pure builders: toManifest(exhibit,objects), toCollection(library,exhibits),
                 toExhibitsJson(library) (the Gallery source — top-level `library` object, explicit
                 order, first-class cover/title/description, reserved `presentation` ns per UX-Q7).
  acceptance:    RUN `pnpm --filter @render/core test manifest collection exhibits` → green.

TASK P2-3  storage backends behind the Filesystem seam
  implements:    ADR-0003 storage row (Q-5), UX-Q2 three-configs
  donor:         anvil storage/backends/{test.ts (in-memory), fsa.ts}
  write-targets: packages/render-core/src/fs/{memory.ts, zip.ts} + tests (FSA backend = browser,
                 logic only here)
  change:        MemoryFilesystem (promote the seam.test double — Playground/tests); ZipFilesystem
                 (read/write a .archie.zip via fflate — DownloadFilesystem core, node-testable).
                 FSA backend (FileSystemDirectoryHandle wrap) declared; real picker = browser.
  acceptance:    RUN `pnpm --filter @render/core test memory zip` → backends satisfy the seam +
                 round-trip a file tree.

TASK P2-4  publish zip primitive
  implements:    Publish = zip-primitive + per-host adapters (CONTEXT)
  donor:         greenfield; fflate
  write-targets: packages/render-core/src/publish/zip.ts + test
  change:        assemble a published-site file tree (Viewer output + WADM files) into a zip
                 (the architectural primitive). GH-Pages Contents-API adapter = thin, network =
                 browser; the zip ASSEMBLY + file tree is node-testable.
  acceptance:    RUN `pnpm --filter @render/core test publish` → zip round-trips the file tree.
```

### Browser/human PROJECTION leaves (epic — NOT this session; need a real browser + dogfood)
- Studio editor (adopt anvil canvas+sidebar / AnnotationForm / List / NarrativeEditor) via `@render/svelte`.
- Viewer reader (adopt annomea 3-state pane + popup/drawer) as Astro+Svelte islands.
- Single + Grid layouts; "Open folder / Open zip" chooser; GH-Pages publish walkthrough.
- **DOGFOOD + measure the REAL bundle** (strategy §33 response tiers). ← the Phase-2 value gate, human-run.

## Sequence
P2-1 → P2-2 → P2-3 → P2-4 (source spine, this session, each test-first). Then the UI/dogfood
epic is handed to the browser/human. Phase-2 "done" (the dogfood gate) is a human milestone.

## Backlog — Studio UX + real fixtures (user-requested 2026-05-25)

Surfaced from dogfooding the multi-exhibit Studio. P2-5 is a real BUG (degrades the core editing
loop) → do FIRST. P2-8 unblocks meaningful dogfooding (toy SVGs → real exhibits).

```
TASK P2-5  BUG: the annotation (WADM) edit form closes after every change  [FIX APPLIED — needs browser confirm]
  ROOT CAUSE (confirmed by tracing): the form is `{#if sel}` with `sel = notes.find(logicalId ===
                 selected)`. Each edit → applyForm → bump → the `annotations` $derived changes →
                 Canvas $effect calls `surface.setAnnotations()` → Annotorious replaces the set and
                 fires a DESELECT → Canvas.svelte `controller.onSelectChange((id)=>selected=id)`
                 sets `selected=null` → `sel` undefined → the form unmounts. (Not a focus/re-key
                 issue — the form was unmounting.)
  FIX (apps/studio/src/App.svelte): added `editing` $state that the FORM derives from, and an
                 effect `$effect(() => { if (selected !== null) editing = selected; })` — editing
                 follows real selections but ignores the null deselect. sel/applyForm/onDelete/list-
                 highlight/delete-btn now use `editing`; cleared on delete/switch/openExhibit.
                 Builds clean (163 modules). Doesn't depend on Annotorious internals.
  PENDING:       browser confirm — select a note, edit Comment + Tags repeatedly; form stays open.
  RELATED (not fixed): the canvas marker highlight still drops on each edit (selected→null). If it
                 annoys, fix in mount.ts setAnnotations (re-assert selection) or suppress the
                 deselect event — both Annotorious-internals-dependent, so browser-verify.

TASK P2-6  easier object CHOOSING  [DONE — thumbnail rail 2026-05-25]
  DONE:          object rail tabs now show a 40×30 thumbnail + label + note count (thumbSrc resolves
                 asset→blob / path), so objects are chosen visually not by name. Larger hit target,
                 ellipsis label + title tooltip. (Keyboard nav not added — buttons are tab-focusable.)
  symptom:       the object rail (thin header strip) is cramped; switching objects is fiddly.
  direction:     a clearer object switcher — thumbnail previews, larger hit targets, keyboard
                 nav, obvious active state. Consider a left object strip (previews) over the rail.
  donor:         anvil's object/list UI patterns.

TASK P2-7  easier object IMPORTING (beyond URL-only)
  current:       addObject is URL-only (apps/studio/src/App.svelte) + best-effort Image() dims.
  direction:     native file picker (<input type=file> / File System Access) + drag-and-drop +
                 multi-file; load bytes into the OPFS working store so local files persist (not
                 just a URL string). Capture dims/mediaType on import.
  donor:         anvil image-add flow + storage/backends/fsa.ts + handles-db.ts (Phase-2 adopted).

TASK P2-8  real exhibitable fixtures  [VOYNICH IMPORTED — one-time, per user; source B still open]
  DONE:          scripts/import-voynich.mjs (one-time, no reusable in-app importer — single fixture)
                 reads the anvil voynich-manuscript fixture → converts (SvgSelector polygon & float
                 FragmentSelector → xywh rect; "describing" body → commenting note, ** stripped),
                 parses real pixel dims from image headers, copies the 5 images into
                 apps/{viewer,studio}/public/voynich/, and emits apps/{viewer,studio}/src/voynich.ts
                 (5 objects + 25 notes). Wired: Viewer sample-data.ts renders it (slug "voynich");
                 Studio default exhibit + seed = Voynich, with a NON-DESTRUCTIVE migration (prepends
                 the Voynich exhibit if a pre-import library.json exists, so it shows without
                 clearing OPFS). Both build clean. MARKDOWN RENDERING done
                 (@render/svelte renderMarkdown + stripMarkdown, +6 tests). Source B (one.compost.digital) still open below.
  why:           replace the toy SVG samples with real content so dogfooding is meaningful.
  source A:      anvil/app/public/fixture/voynich-manuscript (LOCAL, anvil format) — Beinecke MS 408:
                 .anvil/manifest.json (hash → {path,checksum,size}); annotations/*.json (WADM);
                 narrative.md; config.toml (theme/credits/typography); images/ (5 folios) +
                 assets/sample.mp4 (AV). Build an importer: .anvil/manifest images → AObjects;
                 annotations/*.json → the exhibit AnnotationLog; config.toml → exhibit/theme meta;
                 narrative.md → Narrative sections (Phase-3 layout). Note: anvil's annotation/id
                 format may differ from Archie's rev/logicalId spine — map carefully (cite ADR-0003).
  source B:      one.compost.digital/ — a real published exhibit site; INVESTIGATE what it serves
                 (IIIF Presentation? deep-zoom tiles? plain images) via ctx_fetch_and_index (curl/
                 WebFetch are BLOCKED here). Use as a fixture AND a pure-WADM/IIIF interop target.
  acceptance:    a real fixture loads as an Archie exhibit in the Viewer (objects + annotations).
```

TASK P2-X  publish imported-file objects  [DONE 2026-05-25 — zip + GH]
  DONE (zip):    publishLibrary gained optional `getAsset(slug,name)` (PublishOptions) — writes asset
                 bytes into the tree at `{slug}/assets/{name}` (seam already supports binary) +
                 rewrites the canvas image URL to `{baseUrl}{slug}/assets/{name}`. Backward-compatible
                 (no getAsset → /assets/ left as-is). +2 core tests (site 6). store.ts
                 `readAssetBytes`; Studio Download passes getAsset → `.archie.zip` now contains
                 imported images with correct manifest URLs. (ZipFilesystem stores Uint8Array — binary OK.)
  DONE (GH):     ghpages.ts now binary-aware — `FileContent = {text}|{base64}`; collectFiles encodes
                 image/av/pdf files as base64 (chunked btoa), JSON as text; `GitTreeEntry` carries
                 content|base64; `publishToGitHub` uploads base64 entries as blobs (POST /git/blobs
                 {content,encoding:"base64"}) → sha tree entry, text inline. Studio `collectSiteFiles`
                 passes getAsset. +1 ghpages test (binary base64). Imported exhibits now publish to
                 BOTH .archie.zip and GitHub Pages. (The GitHub fetch sequence stays browser-verified.)
  why:           P2-7 stores imported images in OPFS with source `/assets/{name}`. publishLibrary
                 writes the manifest canvas image URL from object.source — an OPFS-backed
                 `/assets/{name}` can't be served from GH-Pages. So publishing an imported-file
                 exhibit produces a manifest pointing at nothing.
  change:        publishLibrary (or the Studio publish path) must copy each asset's bytes into the
                 published tree at `{slug}/assets/{name}` and ensure the canvas image URL resolves
                 there. Voynich is unaffected (its sources are real `/voynich/*` paths in public/).
  acceptance:    publish an exhibit with an imported file → the published manifest's canvas image
                 loads from the published assets path.

Sequence: P2-5 (bug, first) → P2-8 (fixtures, unblocks dogfood) → P2-7 (import UX) → P2-X (publish
imported assets) → P2-6 (choose UX).
