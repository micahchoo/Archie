# Geo-Annotation Extension — Lightweight Design

## Manifest

**What this is:** the design for a geo-annotation extension to Archie — let an author drop pins / draw
regions on a MAP and have them stay anchored to geographic location across zoom/pan, then publish
statically. Spans Studio (authoring) and Viewer (published reader).

**Status:** PROPOSED (design only — no code written). Authored 2026-06-17.
Reconciled 2026-06-18 against two adversarial critiques (LIGHTWEIGHT + FEASIBILITY) over re-verified
live source — see **Shape Changes** at end. Verdict carried forward: the steel thread holds, but
Phase 1 was **under-priced**; this revision re-prices it honestly and cuts it to the true minimum.

**Authority:** synthesis of 6 reader findings (4 of Archie, 2 of atlasdraw) over verified source,
plus a reconcile pass that re-read `resolve.ts`, `mount.ts`, `surface.ts`, `model.ts`, `manifest.ts`,
`selector.ts`, `wadm/types.ts`, `Canvas.svelte`, `App.svelte`, `publish/site.ts`, `portable.ts`, the
installed `@annotorious/*@3.8.2` + `openseadragon@5.0.1` + `@types/openseadragon@5.0.2` dists, and the
atlasdraw `projection.ts` / `canonicalExport.ts` / `pmtiles-protocol.ts`. Every claim below now cites a
verified file:line or dist fact.

**Hard constraint:** LIGHTWEIGHT. Reuse Archie's OSD deep-zoom surface, annotorious, WADM model,
and static publish. Borrow atlasdraw's coordinate-sync *idea*, not its code. NO Excalidraw, NO
Firebase, NO real-time collab, NO MapLibre/heavy scene engine in Phase 1.

**Provenance:** every non-obvious choice cites a Prior Art axis, an ADR / Q-decision, or a verified
file:line. In-flux: the projection-vs-pixel storage fork (see Decisions D2) is the one genuinely
open design question; everything else has a defended default.

---

## Cited prior art & decisions (the constraint frame)

| Source | What it forces |
|---|---|
| **ADR-0004** (`docs/adr/0004-no-wasm-vips-tiling.md`, LOCKED) | NO in-browser tile-pyramid generation. v1 = single JPEG (~6000–8000px); escape hatch = external IIIF `info.json`; v1.1 = OffscreenCanvas slicer (unbuilt). **Map tiles must be supplied pre-made, never generated client-side.** |
| **Prior Art/17-tile-generation.md** | Confirmed: NO surveyed repo generates a pyramid in-browser; every one consumes external/pre-existing tiles. Mandates consuming external map tiles, same as IIIF consumes an external image server. |
| **Q-1 / shape-vocab** (`wadm/types.ts:9`) | v1 selector vocab = FragmentSelector (rect) + SvgSelector (polygon) ONLY — the two that round-trip losslessly through stock annotorious. Pins/regions must fit this or carry their truth elsewhere. |
| **Q-2 / ADR-0014** (`static-pages.ts`) | Self-describing static publish: zero-JS archival HTML = note text + `id=note-<logicalId>` anchors. The interactive map lives in the JS Viewer; the static page links OUT to it. Geo coords do NOT render in the zero-JS page — accepted scope cut. |
| **Q-3 / ADR-0003** (`wadm/types.ts:16`, `publish/site.ts:218`) | `@context` is page-level ONLY, never per-annotation. Snapshots are byte-stable. Any geo metadata must follow `ARCHIE_EMPHASIS`: namespaced `archie:` key, emitted ONLY when authored, pure consumers ignore it. |
| **Q-3 / archie-persistence** | Viewer reads the Studio working store LIVE — author sees published output immediately. A geo annotation that round-trips through the existing log gets this for free. |
| **ADR-0011** (`App.svelte`) | Creation is gesture-initiated, not a sticky toolbar. A pin tool adds one more `creating=` arm, not a tool registry. |
| **`ARCHIE_EMPHASIS` precedent** (`wadm/types.ts:38`, verified) | The exact, proven mechanism for a geo coordinate: optional namespaced extension, no default-serialize, byte-stable when absent, pure WADM consumers ignore it. |

---

## Steel thread

**A map is just another Archie surface.** OSD already treats every source as a flat pixel raster and
annotorious already re-anchors annotations to image-pixel coordinates on every zoom/pan — that *is*
atlasdraw's coordinate-sync, already shipped, in pixel space. So the minimal path is:

1. Teach `resolveTileSource` a third kind (`{kind:'xyz'}`) and `mount.ts:56` to hand OSD a **custom
   `OpenSeadragon.TileSource` object** (NOT a bare string — verified: `mount.ts:56` currently does
   `ts.kind==='image' ? {type:'image',url} : ts.infoUrl`, and the else branch hands OSD a *string*; a
   custom XYZ source must instead be a full object exposing `getTileUrl(level,x,y)`, `getTileWidth`,
   `getTileHeight`, `width`, `height`, `getNumTiles`/`maxLevel`, `minLevel`, `tileSize`, `getTileBounds`
   — `@types/openseadragon@5.0.2` index.d.ts:1158-1195). The map then loads as a **bounded, finite**
   pixel pyramid synthesized from the XYZ z-range — **no new coordinate-sync code, no second rendering
   surface,** but the pyramid synthesis (extent + level mapping) is real Phase-1 work (see T1, R2, R8).
2. Store the annotation geometry as **ordinary image-pixel** `xywh`/polygon selectors (unchanged WADM),
   and carry the **durable lon/lat** in an `archie:geo` extension key (the `ARCHIE_EMPHASIS` pattern) so
   the geography survives even if the map's tile baseline ever changes. Pixel selector = render path
   that every existing consumer (fitBounds, markers, IIIF publish, Mirador) reads; `archie:geo` = the
   source-of-truth anchor Archie re-projects.
3. A pin is a degenerate-but-non-zero rect. **There is NO native point/click annotation in this stack**
   (verified: annotorious@3.8.2 `ShapeType` enum = ELLIPSE/MULTIPOLYGON/POLYGON/POLYLINE/RECTANGLE/LINE
   — no POINT; the W3CImageFormat adapter has no POINT crosswalk; the `point` strings in the OSD dist are
   plugin-tools selection helpers + PixiJS internals, not an image-annotation shape). So a pin is **not**
   a one-line `creating='pin'` arm over an existing tool — it is **new gesture code** that turns a single
   click into a tiny `xywh=pixel:x,y,W,W` rect and feeds it through `session.createNote` directly. A
   region is the existing polygon. Publish, autosave, live-Viewer-read, merge — all unchanged, because the
   annotation is just another `W3CAnnotation` (rect selector) in the same append-only log.

The lon/lat↔pixel conversion is the ONLY new *math*: a pure Web-Mercator affine in
`render-core/src/geometry/geo.ts`, written fresh (~15-20 lines), used only at author-input and read-out
edges. Everything downstream operates on the pixel coords unchanged. **But "only new math" ≠ "only new
code":** Phase 1 also carries (a) the custom OSD TileSource object + bounded-pyramid level mapping,
(b) the click→tiny-rect gesture, (c) a visible/clickable pin glyph, (d) the `MountOptions`/`createMount`/
`resolveTileSource` signature widening to carry a structured descriptor, and (e) explicit `archie:tileSource`
emit+readback in `manifest.ts`. These are priced into the Phase-1 task list below.

---

## Integration points (concrete)

### (a) Map surface — render-core + render-mount

- **`packages/render-core/src/iiif/resolve.ts`** — add a third `TileSource` variant and a classification
  branch that fires **BEFORE** the IIIF catch-all (verified: the catch-all normalises anything to
  `${base}/info.json`, so an XYZ template `…/{z}/{x}/{y}.png` would be mis-classified — risk R1):
  ```ts
  export type TileSource =
    | { kind: "image"; url: string }
    | { kind: "iiif"; infoUrl: string }
    | { kind: "xyz"; template: string; width: number; height: number; tileSize?: number };
  ```
  **SIGNATURE CHANGE (verified):** `resolveTileSource(source: string)` is pure-string-in (resolve.ts:17).
  An XYZ map needs template + width + height + bounds (+ tileSize) — which a bare string cannot carry. So
  `resolveTileSource` must accept a **structured descriptor** (e.g. `string | TileSourceDescriptor`), and
  the `{z}/{x}/{y}` literal sniff is only a *fallback*; the **explicit `AObject` hint is the primary path**
  (see (e)), because a template alone also defeats `mediaTypeFromSource` (model.ts:14-22: unknown ext →
  `"image"`, so a `…/{z}/{x}/{y}.png` template mis-types as a plain image at import — the import path must
  pass the hint, not infer). Also extend `thumbnailUrl()` (resolve.ts:41) or grid thumbnails break (R3).
- **`packages/render-mount/src/mount.ts:56`** — this is **NOT** a one-liner ternary extension. Verified:
  line 56 is `const tileSources = ts.kind==='image' ? {type:'image',url:ts.url} : ts.infoUrl;` — the else
  hands OSD a **bare string**. The `xyz` case must construct a **full custom TileSource object** with the
  members OSD@5.0.1 requires (listed in Steel-thread §1). This is a new object-construction branch, not a
  ternary arm. Everything *downstream* (`createOSDAnnotator`, `fitBounds`, `markerScreenRect`,
  `imageToViewerElementCoordinates` at mount.ts:232–233) is genuinely source-agnostic and works unchanged.
- **SIGNATURE CHANGE (verified):** `MountOptions.source: string` (mount.ts:29), `createMount(el, {source,…})`
  (mount.ts:54), and `Canvas.svelte`'s `source: string` prop (Canvas.svelte:35, passed at :87) are all
  string-typed. The descriptor must be threaded through all three — either widen `source` to
  `string | TileSourceDescriptor` or add an explicit `MountOptions.tileSource` field. **`MountSurface` (the
  imperative *return* contract) is unchanged** — only the *construction-side* options widen. The earlier
  "satisfies MountSurface verbatim / no mount fork / one-liner" wording was inaccurate and is corrected here.
- **canvas identity (verified):** map annotations target a canvas IRI, not the tile template. `mount.ts:58`
  falls back to `ts.kind==='image'?ts.url:ts.infoUrl` when `opts.canvasId` is absent — wrong for a map. The
  map MUST mount with `opts.canvasId = canvasIdOf(obj.id)` (the image path already does this: App.svelte:599
  targets `canvasIdOf(n.objectId)`; Canvas.svelte:36/87 already threads a `canvasId` prop). This keeps
  publish heads-grouping correct (site.ts:230 groups by `targetSource(h) === ${baseUrl}{slug}/canvas/{obj.id}`).
- **NO new MountSurface, NO MapLibre.** The map is just a bounded OSD pixel pyramid; the construction-side
  options widen, the surface contract does not.

### (b) lon/lat stored WADM-validly

- **Canonical geometry stays pixel:** `target.selector` is a normal `W3CFragmentSelector`
  (`xywh=pixel:…` for pins/bbox) or `W3CSvgSelector` (`<polygon>` for regions). Zero change to the
  `W3CSelector` union, `selector.ts`, `fitbounds.ts:selectorOf`, the degenerate guards, the serialize
  round-trip, or static publish. Avoids the annotorious SVG-corruption trap (Prior Art/03: Ellipse→NaN,
  Path stripped) entirely.
- **Durable anchor in an extension key:** add `ARCHIE_GEO = "archie:geo"` to `wadm/types.ts` and a
  `GeoAnchor` type adapted from atlasdraw's union (`packages/geo/src/types.ts`) but re-homed onto WADM:
  ```ts
  // point: {lng,lat} | bbox: {west,south,east,north} | polyline: {coordinates:[lng,lat][]}
  // borrow the SHAPE; drop zRef/scaleMode/projection unless Phase 3 needs them (YAGNI)
  ```
  Stored on the SpecificResource target (or annotation). **Emit ONLY when authored** (byte-stable when
  absent — `ARCHIE_EMPHASIS` rule, Q-3). Pure WADM/IIIF consumers ignore it (three-tier interop, Q-3);
  Archie reads it to re-project if the map baseline changes.
- **No new `@context`.** Geo is an `archie:` extension, not a vocab term — needs no entry in the
  page-level `@context` array, preserving Q-3 and byte-stability.

### (c) Studio tool (authoring)

- **`apps/studio/src/App.svelte`** (verified: `creating=$state<DrawTool|null>`, gesture-armed per
  ADR-0011) — add a `creating='pin'` button to the "New note" block beside ▭ Box / ⬠ Outline.
- **`packages/render-mount/src/surface.ts`** — extend the `DrawTool` union (currently exactly
  `"rectangle" | "polygon"`, surface.ts:11) to add `'pin'`. **A pin is NOT a built-in annotorious tool**
  (verified: no POINT in the ShapeType enum; the create path is `annotator.on("createAnnotation")`,
  mount.ts:119, which fires only for a *drawn* rect/polygon). So `'pin'` is a **new gesture**: capture a
  single viewer click, synthesize `xywh=pixel:x,y,W,W` (W = a fixed small pixel size, see glyph below),
  and call `session.createNote({target})` **directly** — bypassing the draw tool. This is net-new
  gesture code (~one handler), not a union arm.
- **Pin visibility (NEW Phase-1 task, was deferred to 3.5 — corrected):** a sub-pixel rect on a
  web-mercator pyramid (full-res width = `256·2^maxLevel` px) is invisible/un-clickable at any fit zoom.
  The pin needs a **constant-screen-size glyph**. Use Archie's existing per-marker `FrameOverlay` /
  `MarkerStyle` machinery (surface.ts:14-31, `markerScreenRect` at mount.ts:283) to paint a fixed-size
  marker anchored to the rect's screen position — this already projects image-px → screen on every
  zoom/pan, so the glyph stays put and stays a constant size for free. (This is Archie's equivalent of
  atlasdraw's `scaleMode:'screen'`; we get it from existing machinery, not by importing atlasdraw.) The
  rect is the hit-target/anchor; the glyph is what the user sees and clicks. **A pin you cannot see or
  click is not a shipped pin** — hence Phase 1, not Phase 3.5.
- **At create:** the gesture handler computes lon/lat from the click via the new `geo.ts`
  `pixelToLngLat()` and writes both the pixel selector AND `archie:geo` into
  `session.createNote({ target })`, with `target.source = canvasIdOf(obj.id)`. The append-only log, OPFS
  autosave (800ms debounce), and live Viewer read all flow unchanged.
- **Pattern precedent:** the existing `AvEditor.svelte` (a non-OSD sibling surface swapped by media
  type, writing `t=` selectors into the same session) proves surface-swap-by-type works. The map needs
  NO sibling editor — it reuses `Canvas.svelte` because it stays on OSD.

### (d) Viewer static render (no-server)

- **`apps/viewer/src/components/Reader.svelte` → `Canvas.svelte` → `createMount`** — a map AObject flows
  through the exact same path as an image object. The mini-map locator (OSD navigator, `locator` prop)
  is the natural "where am I" affordance.
- **Tiles: FETCHED LIVE in Phase 1, not baked.** An external XYZ endpoint ships zero bytes and needs no
  tiling pipeline (ADR-0004 forbids generating tiles; PA-17 confirms consuming external is the only
  path). **Tradeoff to surface (D1):** this breaks the portable `.archie.zip`-works-offline invariant
  (`portable.ts` mints blobs precisely to avoid runtime fetches) — the map renders only when online and
  the provider is up. Phase 3 offers the offline path (baked basemap raster via the existing
  `getAsset` `/assets/` rail, or pmtiles).
- **Static zero-JS HTML** (`static-pages.ts`, ADR-0014): unchanged — note text + `note-<logicalId>`
  anchors, links OUT to the JS viewer. No map render in the archival page (accepted, Q-2). Geo pins are
  visible only in the interactive JS Viewer reading `annotations.json`.
- **Selectors stay pixel**, so `publish/site.ts` (embedded inline annotation pages) bakes the geo
  *annotation* through the existing pipeline with **zero new annotation format** (the `archie:geo`
  extension rides the byte-stable annotation path, exactly like `archie:emphasis`). **BUT the map's
  tile-source descriptor does NOT ride for free** — see (e): `toCanvas`/`objectsFromManifest` do not
  pass arbitrary `archie:*` keys through, so `archie:tileSource` needs explicit emit + readback. The
  "zero new publish format" claim is true for the annotation, false for the Object descriptor.

### (e) Object/Canvas metadata

- **`packages/render-core/src/model/model.ts`** — `AObject` has only `source:string` (model.ts:76). A map
  needs more than one string (tile template + pixel extent + geographic bounds + zoom range). Add an optional
  `tileSource?: { kind:'xyz'; template; width; height; tileSize?; bounds:[w,s,e,n]; minZoom; maxZoom }`
  descriptor (the explicit hint that lets `resolveTileSource` classify deterministically AND lets the import
  path skip `mediaTypeFromSource` inference, dodging R1).
- **`packages/render-core/src/iiif/manifest.ts` — NEW emit + readback (NOT free passthrough; verified):**
  `toCanvas` (manifest.ts:33-74) projects ONLY `id`, `format`, `width`, `height`, `service`, `thumbnail` —
  it does **not** copy arbitrary `archie:*` keys; and `objectsFromManifest` (manifest.ts:102-114) reads back
  ONLY `id`, `width`, `height`, `format`, `mediaType`. So an `archie:tileSource` written naively would be
  **silently dropped on Studio reload**. (The `ARCHIE_EMPHASIS` byte-stable precedent applies to *annotation*
  extension keys in `wadm/types.ts`, NOT to the Canvas/Object projection, which has no extension passthrough.)
  Therefore: add an explicit `archie:tileSource` **emit** in `toCanvas` (emit-only-when-present → byte-stable
  when absent, mirroring the annotation rule) and an explicit **readback** in `objectsFromManifest`, with a
  round-trip test (descriptor in → manifest → descriptor out, identical). Treat this as ~10-15 lines of new
  manifest.ts code, not a freebie.

---

## Phased plan (lightest-first)

### Phase 1 — Steel thread: XYZ basemap + point pins (live tiles)
*Goal: drop pins on a real map that stay put across zoom/pan, publish statically (online-only).*

**Phase-1 map supply is HAND-EDITED, not a UI** (scope cut, decision D7). The author does NOT get an
import form in Phase 1 — the `tileSource` descriptor is pasted as JSON / seeded in a fixture. Building a
map-import surface (template + pixel extent + geo bounds + zoom range + provider/attribution) is the
single largest unpriced item the critique caught; it is **deferred to Phase 2** and explicitly NOT in
the file count below. This keeps Phase 1 a true steel thread.

Phase-1 tasks (re-priced — each touches more than the original "~6 files" implied):
- **T1 — `mount.ts`: custom OSD TileSource + bounded pyramid (the fiddly core).** Construct the full
  custom-TileSource object (all members in Steel-thread §1) and synthesize a **finite** pyramid from the
  XYZ z-range: pixel extent = `256·2^maxZoom` at full res, OSD level↔XYZ z mapping (OSD level 0 = most
  zoomed-out ↔ XYZ z=0 = whole world), `getTileUrl` filling the `{z}/{x}/{y}` template. *Acceptance: a pin
  placed at a known lon/lat lands on the correct tile pixel at zoom N and is still at that lon/lat at zoom
  N+2* (this is R8, the real coordinate-sync correctness risk). Hard-fix ONE bounds + ONE zoom range in v1.
- **T2 — `resolve.ts`: descriptor-aware `resolveTileSource` (signature widens) + `xyz` variant + thumbnail arm.**
- **T3 — descriptor threading: `MountOptions` / `createMount` / `Canvas.svelte` props** widen to carry the
  descriptor; set `canvasId = canvasIdOf(obj.id)` on map mounts.
- **T4 — `model.ts` + `manifest.ts`: `AObject.tileSource` descriptor + explicit `archie:tileSource`
  emit/readback + round-trip test** (NOT free passthrough).
- **T5 — `geometry/geo.ts` (NEW, pure): fresh spherical-mercator `lngLatToPixel`/`pixelToLngLat`** given
  the fixed extent (~15-20 lines; borrow only `normalizeLng` + the canonicalExport X/Y formula as reference).
- **T6 — `wadm/types.ts`: `ARCHIE_GEO` const + `GeoAnchor` type** (point only for P1).
- **T7 — Studio pin gesture: `surface.ts` `'pin'` + App.svelte button + click→tiny-rect→`createNote`
  (net-new gesture, no built-in point tool).**
- **T8 — pin glyph: fixed-screen-size marker via existing `FrameOverlay`/`MarkerStyle`** so the pin is
  visible and clickable (was Phase 3.5; pulled forward because a pins-only slice is exactly the case that
  needs it).
- Tiles fetched live from an external XYZ endpoint. **Honest count: ~8-9 files across render-core,
  render-mount, render-svelte, wadm, apps/studio (4-5 packages), plus 2 new pure files (geo.ts + the
  TileSource builder).** Larger than the original "~6 files, 2 packages" — that estimate omitted the glyph,
  the gesture, the descriptor threading, and the manifest emit/readback.
- **Ships:** pins anchored to geography (round-trip verified), authored in Studio, rendered + visible +
  clickable in the JS Viewer, byte-stable publish. Map supplied by hand-edited descriptor.

### Phase 2 — Map-import UI + regions + geo-aware fit
*Goal: author creates a map AObject from a form; draw polygon regions; navigation frames by geo bbox.*
- **Map-import surface (the deferred Phase-1 weight, now priced here):** a Studio form/flow to capture
  the `tileSource` descriptor — tile template, pixel extent, geographic bounds `[w,s,e,n]`, zoom range,
  and provider/attribution — and to route it past `mediaTypeFromSource` (which would otherwise mis-type a
  `{z}/{x}/{y}` template as `"image"`, model.ts:14-22). This is a real Studio subsystem, not a gesture arm.
- Region = existing polygon SvgSelector + `archie:geo` bbox/polyline (no annotorious corruption — it's a
  plain polygon). `geo.ts` gains bbox/polyline conversion.
- `fitbounds.ts`: geo bbox → pixel box → `fitBounds` (selectorBBox already does pixel; only the
  author/read edges touch geo). Optional: Section camera (ADR-0005) frames a map region.
- Degenerate guards: note `isDegenerateSelectorValue` (selector.ts:67-71) checks only empty `<path d>`,
  empty `<polygon points>`, and literal NaN — it does **not** reject zero-area rects. If zero-area pins
  must be rejected, that is NEW validation; and the guards must learn the `archie:geo` value format. ~5-6 files.

### Phase 3 — Offline / self-hosted basemap (portable.zip works offline)
*Goal: restore the self-contained-static-artifact invariant for maps.*
- Option A (lightest): bake a single static basemap raster as an `/assets/region.jpg`, ride the existing
  `getAsset` `/assets/` rewrite rail in `publish/site.ts` + the blob-mint mirror in `portable.ts`. Subject
  to ADR-0004 ~8000px cap.
- Option B (heavier, defer): bundle a `.pmtiles` file + the **`pmtiles` npm package** (a range-reader),
  wired into the OSD custom TileSource's `getTileUrl`/`getTileData`. **Correction (verified):** atlasdraw's
  `pmtiles-protocol.ts` is NOT the donor — it is 31 lines that do
  `import maplibregl from 'maplibre-gl'; maplibregl.addProtocol('pmtiles', protocol.tile)`, i.e. it registers
  the scheme ON MapLibre and is worthless for an OSD TileSource. The reusable artifact is the `pmtiles`
  package itself; the OSD adapter is fresh code. NOT MapLibre.
- ~~Optional Phase 3.5~~ **(folded into Phase 1, T8):** the constant-screen-size pin glyph was originally
  deferred here. It is now a Phase-1 task because a pins-only slice is exactly the case that needs it —
  a geographically-scaled point marker is sub-pixel on a mercator pyramid. Achieved via Archie's existing
  `FrameOverlay`/`MarkerStyle` machinery, NOT by importing atlasdraw's `scaleMode`.

---

## Decisions the user must make

- **D1 — Tile source: live external XYZ vs baked/self-hosted (the central LIGHTWEIGHT tradeoff).**
  Default: Phase 1 = live external XYZ (zero bytes, needs network at view time, **breaks offline
  `.archie.zip`**); Phase 3 = baked raster for offline. Confirm: is offline/portable REQUIRED for the
  map surface in v1, or acceptable to defer? (atlas:geo-sync R1, viewer-publish R1, ADR-0010.)
- **D2 — Anchor storage: pixel-only vs pixel+`archie:geo` vs geo-native selector.**
  Default (recommended): pixel selector (max reuse, zero publish change) + `archie:geo` durable anchor
  (robust against map-baseline drift, byte-stable). Alternatives: pixel-only (lng/lat derived & fragile,
  archie:wadm-model R6) or a new geo W3CSelector (cleaner but touches selectorBBox/fitbounds/guards/
  serialize — heavier). Confirm the hybrid is acceptable.
- **D3 — Projection / CRS.** Default: hard-assume Web-Mercator (EPSG:3857) for v1 — keeps the affine to
  one formula, LIGHTWEIGHT. Add a CRS field only if non-mercator basemaps are needed. Confirm.
- **D4 — Phase-1 scope: pins only, or pins + regions?** Default: pins only (thinnest shippable slice);
  regions in Phase 2. Confirm or pull regions forward.
- **D5 — Map granularity: per-Object surface (like AV swap) vs per-Exhibit overview (pins from many
  objects on one map).** Default: per-Object (matches the AV precedent, no new App.svelte topology).
  Per-Exhibit has NO existing precedent and is heavier. Confirm.
- **D6 — Basemap provider + terms (HARD PREREQUISITE, not just a preference).** If live XYZ (D1): which
  provider (OSM/MapTiler/etc.)? No provider is yet confirmed to permit static-site embedding with the
  required CORS headers + attribution terms. This must be resolved *before* T1 can be tested against a
  real endpoint — a provider that blocks cross-origin tile reads or forbids static embedding kills the
  Phase-1 demo. Pick and verify one provider (e.g. the OSM tile policy, or a MapTiler/Stadia key) before building.
- **D7 — Phase-1 map supply: hand-edited descriptor (default) vs build the import UI now.** Default
  (recommended, LIGHTEST): Phase 1 author pastes/seeds the `tileSource` JSON; the import form is Phase 2.
  This is the single largest weight cut. Confirm the hand-edited path is acceptable for the v1 steel
  thread, or accept that Phase 1 grows by a full Studio import subsystem.

---

## Borrow vs Skip (atlasdraw)

**BORROW (the *idea* — most "borrowed" code is actually written fresh; ~20-30 lines reused as reference):**
- The project↔unproject sync *concept* — but realized via OSD's `imageToViewport*` /
  `viewportToImage*`, NOT MapLibre. annotorious already runs the "pump" on OSD viewport events for free.
  **Correction (verified):** atlasdraw's `projectPoint`/`unprojectPoint` (projection.ts:42,74) are thin
  delegates over a **live MapLibre `map.project()`/`map.unproject()`** — they CANNOT be lifted without
  MapLibre. So `geo.ts` is **net-new code** (standard spherical-mercator forward/inverse), not a borrow.
- The anchor-union *shape* (point / bbox / polyline) — re-homed onto a WADM `archie:geo` extension,
  with lng/lat instead of Excalidraw element fields.
- The "store geo as truth, derive pixels" discipline (atlasdraw zeroes scene coords, lets the pump
  fill them; canonicalExport stores viewport-independent coords). Archie: store pixel selector +
  `archie:geo`, re-project on read.
- **The only literally-reusable lines:** `normalizeLng` (projection.ts:24, ~1 line) and the
  `canonicalExport` mercator X/Y formulas (`((normalizeLng(lng)+180)/360)·256` and the
  `(0.5 − log((1+siny)/(1−siny))/(4π))·256` Y, canonicalExport.ts:14,19) — used as a **reference** for the
  fresh `geo.ts`, not copied wholesale.

**SKIP (the hard-constraint violators):**
- Excalidraw scene engine (Archie has annotorious — atlasdraw fought pointer-event routing "a week").
- MapLibre GL + the BasemapRegistry/style-builder/style-compiler (second WebGL surface — contradicts
  "reuse OSD"). Defer pmtiles to Phase 3, and even then as a tile feed into OSD, not a second surface.
- Firebase / realtime collab / Yjs.
- Turf.js measure, route-snapping (OSRM/Valhalla).
- The two-world annotation/GeoJSON-data-layer split, `dl:` registry, homogeneous-geometry constraint,
  data-driven LayerStyle (these ingest external shapefiles/CSV — out of scope).
- `zRef` + `scaleMode:'hybrid'` + the `parseGeoCustomData` validation surface (YAGNI; revisit only if an
  "arrow that scales then clamps" requirement appears). NOTE: the basic constant-pixel pin glyph is NOT
  skipped — it is Phase-1 T8, achieved via Archie's own `FrameOverlay`/`MarkerStyle`, not atlasdraw's `scaleMode`.
- The `.atlasdraw` ZIP bundle (manifest/scene/data/files/style/thumbnail) — Archie's static publish
  already bakes tiles+JSON; only the annotation JSON + the existing manifest are needed.

---

## Key risks (verified)

- **R1 (classification order):** XYZ template must be detected BEFORE `resolveTileSource`'s catch-all,
  or `…/{z}/{x}/{y}.png` gets `/info.json` appended and silently breaks. Use an explicit AObject hint.
- **R2 (infinite map):** OSD treats every source as a finite pixel raster; a live web-mercator XYZ map
  is conceptually infinite/wrapping. Pin a fixed zoom-range + extent, present a bounded raster, accept
  no globe-wrap. Deliberate scope cut.
- **R3 (thumbnails):** new kind needs a `thumbnailUrl` arm or grids show broken images.
- **R4 (degenerate guard — CORRECTED):** verified `isDegenerateSelectorValue` (selector.ts:67-71) checks
  ONLY empty `<path d>`, empty `<polygon points>`, and literal NaN — it does **not** check rect area. So a
  1×1 pin passes (good) but so does a 0×0 rect. The pin's minimum size is therefore a **render/hit-target
  requirement (must be visible + clickable, see T8), NOT a guard requirement.** Earlier wording implied the
  guard checks area; it does not. (`archie:geo` value validation is a Phase-2 guard addition.)
- **R8 (level mapping — the real coordinate-sync correctness risk, was missing):** for pins to stay
  anchored across zoom, the synthesized pixel extent must equal the full-resolution mercator pixel size at
  `maxZoom` (`256·2^maxZoom`), AND the custom TileSource's `getTileUrl(level,x,y)` must map OSD levels to
  XYZ z correctly (OSD level 0 = most zoomed-out ↔ XYZ z=0 = whole world). Get this wrong and pins drift on
  zoom. This is T1's acceptance test and the genuine hard part of Phase 1 — not "add a kind to a union".
- **R5 (annotorious SVG corruption):** geo regions as novel SVG/path would be corrupted on round-trip
  (Prior Art/03). Mitigated: regions stay plain polygons; geo truth rides `archie:geo`, not SVG.
- **R6 (geo drift):** pixel coords drift off geography if the map extent/baseline ever changes — which
  is exactly why `archie:geo` stores the durable lng/lat alongside the pixel selector (D2).
- **R7 (offline):** live tiles break `.archie.zip` offline (D1, verified against portable.ts blob-mint
  invariant) — Phase 3 resolves.

---

## Shape Changes

Living-doc provenance. Each row records a change forced by the 2026-06-18 reconcile pass over two
adversarial critiques (LIGHTWEIGHT + FEASIBILITY), each claim re-verified against live source before folding in.

| # | Change | Why (verified) | Severity folded |
|---|---|---|---|
| 1 | Pin is **net-new gesture code**, not a `creating='pin'` union arm | annotorious@3.8.2 `ShapeType` enum has **no POINT** (Shape.d.ts); create path is `createAnnotation` for *drawn* shapes (mount.ts:119); image W3C adapter has no POINT crosswalk | FE-major-1 |
| 2 | Pin **glyph (T8) pulled into Phase 1** from Phase 3.5 | a sub-pixel rect on a `256·2^maxLevel`-wide pyramid is invisible/unclickable; pins-only is exactly the case needing a constant-screen-size marker | LW-major-2 |
| 3 | `resolveTileSource` / `MountOptions` / `createMount` / `Canvas.svelte` **signatures widen** (string → descriptor) | all are string-typed today (resolve.ts:17, mount.ts:29/54, Canvas.svelte:35/87); a descriptor cannot thread through | FE-major-2 |
| 4 | `archie:tileSource` needs **explicit emit + readback in manifest.ts** (not free passthrough) | `toCanvas` projects only id/format/width/height/service/thumbnail; `objectsFromManifest` reads back only id/width/height/format/mediaType — arbitrary `archie:*` is dropped on reload (manifest.ts:33-74,102-114) | FE-major-3 |
| 5 | `mount.ts:56` xyz branch is a **full custom-TileSource object**, not a ternary arm | line 56 else hands OSD a *bare string* (`ts.infoUrl`); OSD@5.0.1 needs getTileUrl/getTileWidth/getTileHeight/width/height/getNumTiles/maxLevel/minLevel/tileSize/getTileBounds (@types/osd@5.0.2:1158-1195) | FE-minor-4 / LW-minor-5 |
| 6 | New **R8 (OSD-level↔XYZ-z mapping)** named as T1's acceptance test | the actual coordinate-sync correctness risk; was undocumented | FE-missing |
| 7 | **R4 corrected:** guard does not check rect area | `isDegenerateSelectorValue` (selector.ts:67-71) checks only empty path/polygon + NaN; pin sizing is a render/hit requirement, not a guard requirement | FE-minor-5 |
| 8 | **D7 added** + Phase-1 map supply scoped to **hand-edited descriptor**; import UI → Phase 2 | no map-import flow exists; `mediaTypeFromSource` mis-types a `{z}/{x}/{y}` template as `"image"` (model.ts:14-22); import form is the largest unpriced weight | LW-major-1 / LW/FE-missing |
| 9 | Phase-1 file count re-priced **~6 → ~8-9 files / 4-5 packages + 2 new files** | original count omitted glyph, gesture, descriptor threading, manifest emit/readback | LW-major-1 |
| 10 | **Borrow provenance corrected:** `geo.ts` is net-new; only `normalizeLng` + canonicalExport X/Y reused as reference | atlasdraw `projectPoint`/`unprojectPoint` delegate to live MapLibre `map.project/unproject` (projection.ts:42,74) — not liftable | LW-minor-3 |
| 11 | **Phase-3 Option B donor corrected:** the `pmtiles` npm package, NOT atlasdraw's `pmtiles-protocol.ts` | that file (31 lines) is `maplibregl.addProtocol(...)` — a MapLibre binding, useless for an OSD TileSource | LW-minor-4 |
| 12 | **D6 hardened** to a prerequisite | no provider confirmed to permit static-site embedding/CORS; blocks the live-tile demo | FE-missing |
| 13 | **canvas identity stated:** map mounts with `canvasId = canvasIdOf(obj.id)` | mount.ts:58 fallback (image url/infoUrl) is wrong for a map; site.ts:230 groups heads by `canvas/{obj.id}` IRI; Canvas.svelte already threads a `canvasId` prop | FE-missing |

**Deferred risks (out of Phase 1, recorded not expanded):** map-import UI (Phase 2, D7); zero-area-rect
rejection as new validation (Phase 2); `archie:geo` guard validation (Phase 2); offline `.archie.zip`
(Phase 3, D1/R7); non-mercator CRS (D3); per-Exhibit overview map (D5). None of these grow Phase 1.

**Steel thread after reconcile:** UNCHANGED in concept — *a map is just another bounded OSD pixel raster;
annotorious's existing pixel-space re-anchoring IS the coordinate-sync; lon/lat rides an `archie:geo`
extension.* What changed is the *price*: Phase 1 is ~8-9 files (not 6), carries a net-new pin gesture +
visible glyph + descriptor threading + manifest emit/readback, and the only genuinely hard part is the
bounded-pyramid OSD-level↔XYZ-z mapping (R8). The thread still holds; it was just under-costed.
