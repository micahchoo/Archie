# Axis 17 — In-browser tile generation / image-processing pipeline

## Focused question
When an Author drops a large image into a server-LESS PWA, where does the DZI / IIIF Image-API tile pyramid come from? Does ANY surveyed repo generate the pyramid IN THE BROWSER (OffscreenCanvas / WASM-libvips / Worker), or do they all punt to Node / a build step / a live image server?

## Headline finding
**NO surveyed repo generates a tile pyramid in the browser.** Every generator either (a) runs a live server-side IIIF image server (tiny-iiif), (b) shells out to Node `sharp` for *thumbnails only* and points at an external image service (biiif and its wrappers), or (c) is a Node SSG that explicitly relies on *pre-existing* IIIF derivatives (canopy). The closest adjacent primitive — field-studio's OffscreenCanvas-in-a-Worker — produces a SINGLE 256px derivative, not a multi-level pyramid. This gates tiled-mode v2 and is pure greenfield, but the *primitive to extend already exists in the corpus*.

## Sources surveyed
- `IIIF/tiny-iiif` — folder→IIIF setup — **y** (README + structure)
- `iiif-demo/biiif` (+ `IIIF-generator`, `IIIFtoolset`, `biiif-cli` wrappers) — derivative generators — **y**
- `IIIF/canopy-iiif` — static IIIF site generator — **y**
- `field-studio` — in-browser IIIF studio — **y** (the gold-adjacent)
- `IIIF/cozy-iiif` — IIIF consumption library — **y** (image-service classification side)
- `BIIIF/wax-tasks` — Ruby/Jekyll build-time IIIF tiling gem — **y** (coverage-sweep add; arch doc)

## Findings by source

### IIIF/tiny-iiif — server-bound IIIF Image Server, NOT in-browser
- **Tiling delegated to Cantaloupe / IIPImage** — `tiny-iiif/README.md:37` — COUPLED(server) — context: "Drag & drop images → instant IIIF Image Service powered by IIPImage or Cantaloupe." A real running server does the tiling; the PWA cannot use this.
- **Uploads converted to pyramidal TIFF** — `tiny-iiif/README.md:48` — COUPLED(server) — context: tiles are served on-the-fly from a pyramidal TIFF by the Java/C++ image server, not pre-baked in a browser. Requires "1 CPU / 2 GB RAM (2 CPU / 4 GB for Cantaloupe)" + Docker — `README.md:47`. Directly disqualifying for serverless.

### iiif-demo/biiif — Node `sharp`, thumbnails only, points at external service
- **`sharp` thumbnail generation** — `iiif-demo/biiif/Utils.ts:292`-301 (`sharp(imagePath)…resize(…fit:cover)…toFile`) — COUPLED(Node) — context: generates a single fixed-size thumbnail server-side; no tiling loop, no pyramid.
- **Emits a `level0` ImageService3 reference, does NOT create tiles** — `iiif-demo/biiif/Canvas.ts:241` (`cloneJson(imageServiceBoilerplate)`) + `iiif-demo/biiif/boilerplate/imageservice.json` (`type:ImageService3, profile:level0`) — COUPLED(Node) — context: biiif WRITES a manifest that *points* at an image service it expects to exist elsewhere; it never produces the tiles itself. This is the punt, made explicit.
- **`csv-to-biiif` also only reads metadata via sharp** — `iiif-demo/biiif/csv-to-biiif.ts:6,141` (`sharp(filePath).metadata()`) — COUPLED(Node) — context: dimension probing, not tiling.
- **`IIIF-generator` and `IIIFtoolset` nest biiif; `biiif-cli` depends on `biiif@1.0.6`** — `BIIIF/biiif-cli/biiif-cli/package.json:26` (inferred: nested `biiif/` dirs under `iiif-demo/IIIF-generator/`, `iiif-demo/IIIFtoolset/Inferrer/`) — COUPLED(Node) — context: all three are the same Node-bound sharp pipeline; not separately surveyed.

### BIIIF/wax-tasks — Ruby/Jekyll `wax_iiif` build-time tiling (server/CLI, NOT in-browser)
- **IIIF tiling via VIPS/ImageMagick wrapper at build time** — `BIIIF/wax-tasks/wax_tasks/TECHNICAL_ARCHITECTURE.md:31` (`wax_iiif: Wrapper for VIPS/ImageMagick (IIIF tiling)`) + `:80` (`wax:derivatives:iiif` rake task) — COUPLED(Ruby/CLI) — context: a Rake pre-processing task that bakes a full IIIF pyramid (incl. PDF→page split via Ghostscript, `:85`) before the Jekyll SSG build. Same COUPLED(build-tool) baseline-to-replace as the biiif/canopy Node pipelines — useful only as a spec for the pyramid output shape; not browser-runnable, contradicts the serverless target.

### IIIF/canopy-iiif — Node SSG, punts derivatives entirely (CAVEAT confirmed)
- **Build step requires Node ≥24, runs in CI/locally** — `canopy-iiif/README.md:19` (`Node.js >=24.0.0`), `:26` (`npm run dev … via app/scripts/canopy-build.mts`) — COUPLED(Node) — context: a build step, not a browser. Confirms gap; does NOT close it.
- **Explicitly relies on PRE-EXISTING IIIF derivatives** — `canopy-iiif/README.md:3` ("…add narrative context to IIIF material **without worrying about derivatives or storage**") — COUPLED(Node) — context: canopy consumes already-tiled IIIF collections; it never generates a pyramid. Do not let any survey claim canopy makes us serverless.

### field-studio — THE closest: OffscreenCanvas + Worker, but single-derivative not pyramid
- **OffscreenCanvas downscale inside a Worker** — `field-studio/src/shared/workers/ingest.worker.ts:329`-341 (`new OffscreenCanvas(…)`, `ctx.drawImage`, `canvas.convertToBlob({type:'image/jpeg'})`) — PURE — context: real in-browser raster resize, no server. This IS the liftable primitive — but it outputs ONE blob.
- **`createImageBitmap` for dimensions in a Worker** — `field-studio/src/shared/workers/ingest.worker.ts:311` — PURE — context: probes width/height client-side (the metadata half tiny-iiif/biiif do in Node).
- **Single 256px thumbnail, not a pyramid** — `field-studio/src/shared/workers/ingest.worker.ts:242` (`THUMBNAIL_WIDTH = 256`), `:419` (`generateDerivative(file, THUMBNAIL_WIDTH)`), `:440` (emits `…/full/256,/0/default.jpg`, `width:256`) — PURE — context: exactly one derivative size; no multi-level loop. The gap is precisely the missing pyramid loop on top of this primitive.
- **Dead `tile: 0.9` quality constant — anticipated tiling, never built** — `field-studio/src/shared/workers/ingest.worker.ts:180` (`IMAGE_QUALITY = { …, tile: 0.9 }`) — context: the codebase *planned* a tile path and stubbed a quality setting, but no code consumes it. Evidence the pyramid was foreseen and deferred — a stub node, not a feature.
- **Emits a `level0` ImageService served by a service worker** — `field-studio/src/shared/workers/ingest.worker.ts:440` + `field-studio/src/shared/middleware/swBridge.ts` (inferred) — COUPLED(SW) — context: viewer requests `/image-service/{id}/full/…` and a service worker answers from the stored single derivative; it fakes an Image API surface without tiles.
- **Viewer consumes tileSources, does not create them** — `field-studio/src/features/viewer/ui/organisms/viewerViewHelpers.ts:45,75` (`OsdTileSource`, `tileSources: config.tileSource`) — COUPLED(OSD) — context: OpenSeadragon takes either a `{type:'image'}` single-image source or a `level2` ImageService; tiling, if any, is the server's job. Maps to our axis-1 single-image-v1 / tiled-v2 split.

### IIIF/cozy-iiif — consumption-side image-service classification (NOT generation)
- **Classifies an ImageService as `static | dynamic | level0`** — `IIIF/cozy-iiif/src/Cozy.ts:267`-290 (`parseImageService`, `service.profileLevel === 0 ? 'level0' : 'dynamic'`) + `IIIF/cozy-iiif/src/types.ts:159`-167 (`ImageServiceResource = DynamicImageServiceResource | Level0ImageServiceResource`) — PURE — context: decides whether a viewer must request whole-image (level0, our serverless thumbnail case) or can request arbitrary tiles (dynamic, needs a live server). This is the decision our viewer needs to pick single-image vs tiled mode — but it READS an existing service, it never produces one.

## Pure-logic extractables (the gold)
| Capability | Source `file:line` | Pure? | Depends on | Extraction effort | Maps to our need |
|---|---|---|---|---|---|
| OffscreenCanvas raster downscale in a Worker | `field-studio/src/shared/workers/ingest.worker.ts:329` | PURE | browser OffscreenCanvas API | Low (copy) | The base primitive to LOOP into pyramid levels for tiled-mode v2 |
| `createImageBitmap` dimension probe in Worker | `field-studio/.../ingest.worker.ts:311` | PURE | browser API | Trivial | Client-side image sizing, replaces Node `sharp().metadata()` |
| Single-derivative + service-worker `level0` Image-API faking | `field-studio/.../ingest.worker.ts:440` (+ swBridge inferred) | COUPLED(SW) | service worker | Medium | Pattern for serving an Image-API surface with NO tiles (our v1 single-image mode) |
| ImageService level0-vs-dynamic classification | `IIIF/cozy-iiif/src/Cozy.ts:267` | PURE | `@iiif/parser` | Low | Viewer decision: whole-image request vs tile request |

## Gaps — what NO surveyed repo solves
**A multi-level tile pyramid generated entirely in the browser.** No repo loops a downscale across pyramid levels, no repo uses WASM-libvips / squoosh / wasm-vips, no repo writes DZI `.dzi` + tile folders or a level0 IIIF tile set client-side. The corpus splits cleanly into:
- **server tiling** (tiny-iiif: Cantaloupe/IIPImage),
- **Node-build thumbnails + external-service punt** (biiif family, canopy),
- **in-browser SINGLE derivative** (field-studio) — the closest, but stops one loop short of a pyramid.

The serverless-publishing story therefore has **no tile-creation story**. field-studio's `OffscreenCanvas` Worker is the liftable seed; the missing work is the pyramid loop (or a WASM-libvips drop-in) plus DZI/level0 tile emission. The dead `IMAGE_QUALITY.tile` constant shows even the closest repo foresaw this and deferred it.

## Verdict for our build (lift / study / avoid)
- **LIFT** field-studio's `generateDerivative` OffscreenCanvas+Worker primitive (`ingest.worker.ts:329`) — it is PURE and exactly our serverless raster-processing base. Extend it: instead of one 256px blob, emit a pyramid (recursive halving → DZI or IIIF level0 tile grid). This is the greenfield work axis-17 names.
- **LIFT** cozy-iiif's `parseImageService` level0/dynamic classifier (`Cozy.ts:267`) for the viewer's single-image-vs-tiled decision.
- **STUDY (don't lift)** field-studio's service-worker `/image-service/` faking — viable for v1 single-image mode (serve whole image, no tiles) but does not scale to large images; it is the interim, not the v2 answer.
- **AVOID** tiny-iiif (server), biiif/canopy Node sharp pipelines — they are the COUPLED(Node) baseline-to-replace, useful only as a spec for what tiles/manifests should look like.
- **Decision pointer:** for true tiled-mode v2 on 100 MB images, the OffscreenCanvas memory ceiling likely forces a **WASM-libvips / wasm-vips** evaluation (zero corpus prior art — pure greenfield, recommend a library-shootout when v2 is scheduled).
