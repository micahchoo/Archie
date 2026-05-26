# Axis 01 — deep-zoom-viewer (OpenSeadragon core)

## Focused question
How do prior-art repos set up OpenSeadragon for single-image AND tiled (DZI / IIIF Image API) sources serverlessly, and how do they sync viewport events to annotation anchors?

## Sources surveyed
- `IIIF/cozy-iiif` — PURE IIIF Image-API tile-source resolution — opened: y
- `IIIF/immarkus` — React OSD tileset bridge — opened: y
- `field-studio` — OSD init + tile-source switch + viewport→overlay sync (Svelte) — opened: y
- `IIIF/liiive` — collaborative OSD, viewport→cursor recompute (React/zustand) — opened: y
- `osd-audio-video` — plain-HTML OSD bootstrap (multi-canvas strip) — opened: y
- `IIIF/openseadragon.github.com` — OSD source/docs — not deep-read (focused Q is about *usage*; OSD events cited via call-sites)

## Findings by source

### IIIF/cozy-iiif — PURE IIIF Image-API → tile/region URL resolution
- **info.json URL normalize** — `src/core/image-service.ts:8` — PURE — context: `normalizeServiceUrl` appends `/info.json`; our v2 tiled mode feeds exactly this to OSD `tileSources`.
- **service version+level parse** — `src/core/image-service.ts:19` — PURE — context: detects Image-API v2/v3 + `level0/1/2` from `profile`; drives static-vs-tiled decision.
- **single-image-vs-tiled discrimination** — `src/core/canvas.ts:54` (`toCozyImageResource`) — PURE — context: classifies a painting body into `static` / `dynamic` / `level0` from presence+level of an ImageService. This IS our single-image (static) vs tiled (dynamic) mode switch, framework-free.
- **region/tile URL builder** — `src/core/image-service.ts:60,91` (`getImageURLFromService`, `getRegionURLFromService`) — PURE — context: builds `{id}/{region}/{size}/{rot}/default.jpg`; level0 snaps to nearest predefined size. Reusable for thumbnails/region crops.

### IIIF/immarkus — React → OSD tileset bridge (the smallest possible adapter)
- **CozyCanvas → OSD tileSources** — `src/utils/iiif/getOSDTilesets.ts:3` — PURE-pattern, COUPLED-return(OSD) — context: maps cozy `image.type`: `dynamic`/`level0` → `serviceUrl` (OSD fetches info.json); `static` → `{type:'image', url}`. 9-line proof that cozy-iiif + OSD compose directly. Direct model for our resolver.

### field-studio — OSD init + serverless tile-source switch + viewport sync (Svelte 5)
- **OSD init options** — `src/features/viewer/ui/organisms/viewerViewHelpers.ts:72` — COUPLED(OSD) — context: canonical `OpenSeadragon({...})` — `prefixUrl` to CDN, gesture settings, navigator, `crossOriginPolicy:'Anonymous'`, `minZoom/maxZoom`. Copy-able config baseline for our viewer.
- **single-image-vs-tiled resolver** — `viewerViewHelpers.ts:146` (`resolveOsdTileSource`) — PURE-pattern, COUPLED-return(OSD) — context: priority chain blob URL → IIIF `serviceId/info.json` → painting-body URL → null. The exact serverless mode-switch our v1/v2 needs (local file → static image; IIIF service → tiled). PURE priority logic, OSD-shaped output.
- **viewport→overlay live recompute** — `src/features/viewer/ui/molecules/MeasurementOverlay.svelte:127` — COUPLED(OSD) — context: `addHandler('animation'|'zoom', recompute)` + `viewport.viewportToImageCoordinates`. The live-anchor-recompute mechanism the `_FRAMING.md` fitBounds lesson demands, applied to a measurement overlay (not yet to annotation anchors).
- **viewport-change sync between viewers** — `ComparisonViewer.svelte:181,199` — COUPLED(OSD) — context: `addHandler('viewport-change', …)` mirrors `zoomTo`/`panTo` with a reentrancy guard. Pattern for multi-image/split-screen.
- **fitBounds NOT wired** — `src/app/adapters/viewerEditorInstance.svelte.ts:76` — COUPLED — context: `// TODO: Wire when ViewerView exposes OSD fitBounds callback`. field-studio has the overlay-recompute half but NOT the select→fitBounds half. The lesson, unsolved here too.
- **retry on open-failed** — `viewerViewHelpers.ts:116` — COUPLED(OSD) — context: re-`open()` w/ backoff; robustness for flaky serverless tile hosts.

### IIIF/liiive — collaborative OSD; viewport-event → live coordinate recompute (React/zustand)
- **viewport→cursor recompute** — `…/_components/room-ui/live-cursors/live-cursors.tsx:34` — COUPLED(OSD) — context: `addHandler('update-viewport', …)` recomputes each peer cursor via `viewport.imageToViewerElementCoordinates`. This is structurally the viewport-event→anchor-recompute we need — image-space coords reprojected to screen on every pan/zoom (just anchoring cursors, not annotation regions).
- **screen→image inverse** — `…/_hooks/use-awareness.ts:78` — COUPLED(OSD) — context: `viewerElementToImageCoordinates` for click→image-space (drawing/anchor authoring).
- **viewer as global store** — `…/_hooks/use-viewer.ts:12` — COUPLED(zustand) — context: thin zustand singleton holding the `OpenSeadragon.Viewer`; how a React app shares one viewer instance app-wide.

### osd-audio-video — plain-HTML serverless OSD bootstrap
- **CDN OSD + multi-canvas strip** — `multi-canvas-strip.html:219,314` — COUPLED(OSD) — context: `<script src=cdnjs…openseadragon 5.0.1>` + `OpenSeadragon({ tileSources: CANVASES.map(c => ({type:'image', url:c.tile})) })`. Zero-build serverless bootstrap; reference-strip + `addHandler('page', …)` for multi-canvas paging (multi-image v2 model).
- **non-image canvases overlay OSD** — `multi-canvas-strip.html:316` — COUPLED(OSD) — context: audio/video pages render a static `{type:'image'}` thumbnail into OSD, then DOM-overlay the real player. Pattern for mixed-media exhibits on one OSD instance.
- **audio/video-canvas.html do NOT use OSD** — `audio-canvas.html`, `video-canvas.html` (grep `OpenSeadragon(` = 0) — context: bespoke waveform/video viewers, not OSD. Only `multi-canvas-strip.html` boots OSD — don't re-walk the other two for axis-① evidence.

## Pure-logic extractables (the gold)
| Capability | Source `file:line` | Pure? | Depends on | Extraction effort | Maps to our need |
|---|---|---|---|---|---|
| static/dynamic/level0 image classification | `cozy-iiif/src/core/canvas.ts:54` | PURE | `@iiif/presentation-3` types | Low (copy fn) | single-image vs tiled mode switch |
| info.json URL normalize | `cozy-iiif/src/core/image-service.ts:8` | PURE | none | Trivial | feed OSD `tileSources` for IIIF Image API |
| Image-API version+level parse | `cozy-iiif/src/core/image-service.ts:19` | PURE | none | Low | decide tiled vs static; pick region builder |
| region/size URL builder | `cozy-iiif/src/core/image-service.ts:60,91` | PURE | none | Low | thumbnails, region crops, level0 size-snap |
| tile-source priority resolver | `field-studio/…/viewerViewHelpers.ts:146` | PURE-pattern (OSD-shaped output) | OSD `tileSources` shape | Low (logic lifts; retype output) | blob→IIIF→fallback→null serverless switch |
| cozy→OSD tileset map | `immarkus/…/getOSDTilesets.ts:3` | PURE-pattern | cozy types + OSD shape | Trivial | the 9-line cozy↔OSD glue |
| viewport-event→coordinate recompute | `liiive/…/live-cursors.tsx:34`; `field-studio/…/MeasurementOverlay.svelte:127` | COUPLED(OSD) | live `Viewer` | Medium | live anchor recompute on pan/zoom (the lesson) |

## Gaps — what NO surveyed repo solves
**select-annotation → `fitBounds` → live-anchor recompute, end to end.** The two halves exist *separately and in different repos*: (a) live coordinate recompute on `update-viewport`/`animation` (liiive `live-cursors.tsx:34`; field-studio `MeasurementOverlay.svelte:127`) — but anchoring *cursors/overlays*, not annotation regions; (b) `fitBounds`-on-select is explicitly a TODO in field-studio (`viewerEditorInstance.svelte.ts:76`) and absent everywhere else. No repo wires selecting a WADM annotation → pan/zoom canvas to its region → keep the region anchor live across subsequent viewport changes. This is precisely the `annomea` read-side-linking root cause and our differentiator — we must build it; prior art only supplies the reprojection primitives (`viewportToImageCoordinates` / `imageToViewerElementCoordinates`).

## Verdict for our build (lift / study / avoid)
- **LIFT (PURE):** cozy-iiif's `image-service.ts` + `canvas.ts:toCozyImageResource` — the entire static/dynamic/level0 classification + info.json/region URL building. Framework-free, already on our `@iiif/presentation-3` base. Replaces hand-rolled tile-source logic.
- **LIFT (pattern):** field-studio `resolveOsdTileSource` priority chain (blob→info.json→painting-body→null) and immarkus's 9-line `getOSDTilesets` — together the minimal serverless single-vs-tiled switch.
- **STUDY:** field-studio `initializeOsd` options as our OSD config baseline; liiive `live-cursors`/`use-awareness` for the viewport-event reprojection primitives we'll wire to annotation anchors; osd-audio-video `multi-canvas-strip` for plain-HTML/CDN bootstrap + multi-canvas paging (v2).
- **AVOID re-walking:** OSD core source (focused Q is usage, not internals); `audio-canvas.html`/`video-canvas.html` (no OSD); liiive's zustand `use-viewer` store (Svelte runes replace it).
