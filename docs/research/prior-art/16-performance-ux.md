# Axis 16 — User-experienced performance

## Focused question
How do prior-art repos keep a deep-zoom + annotation UI fast at scale — JS bundle budget, lazy/paginated manifest loading, OSD tile prefetch, virtualized annotation/thumbnail lists, perceived load on a cold static host?

> Scope: R-tree / spatial-index logic is owned by **axis 10** — referenced, not re-extracted. This slice = what the reader/author *feels*.

## Sources surveyed
- `anvil` (PRD + ADR-0002 + `.perf/`) — the planned product's own bundle budget + first measured baseline — **opened (y)**
- `IIIF/mirador` — virtualization (react-window v2) + route-level code-splitting + bundlewatch budget — **opened (y)**
- `IIIF/clover-iiif` — IntersectionObserver lazy-load primitive — **opened (y)**
- `field-studio` — Vite `manualChunks` vendor-splitting strategy — **opened (y)**
- `IIIF/universalviewer` — content-handler lazy `import()` — **opened (y)**
- `IIIF/cozy-iiif` — image-service level classification (thumbnail/dynamic resolution) — **opened (y)**

## Findings by source

### anvil — our own budget + first real measurement
- **240 KB gz bundle budget (revised from 80 KB)** — `anvil/docs/adr/0002-wrap-annotorious-and-osd-for-viewer-and-editor-canvas.md:` §7 (OSD ~150 + Annotorious ~80 + plugin-tools ~20 + wrapper ~10) — PURE (design decision) — context: the budget every other finding is measured against.
- **R3: lazy-load Path/Ellipse plugin code if the author hasn't drawn one; hard ceiling 300 KB** — `anvil/PRD.md:382` — PURE (strategy) — context: conditional plugin-tools loading is the named bundle-trim lever; not yet built.
- **NFR1: interactive ≤1.5 s, 5 MB image + 50 annotations, mid-tier laptop** — `anvil/PRD.md:304` — PURE (target) — context: the user-felt number; **measured nowhere** (see Gaps).
- **MEASURED baseline breaches the budget** — `anvil/.perf/baselines/2026-05-22-786bacd.md` — PURE (data) — context: total JS **~328 KB gz**, viewer/OSD chunk alone **265 KB gz (84.6%)**. The 240 KB budget is *already exceeded* at first measurement. Dist dominated by a **198 MB fixture** (99.4%) — cold-host transfer hazard if shipped.
- **`immediateRender: true`** — `anvil/app/src/lib/viewer.ts:91` — **PURE** (OSD flag) — context: paints the placeholder/full image immediately rather than fading tiles in; the cheapest perceived-perf win in the corpus. Lift verbatim.
- **`preload="metadata"` on Sound/Video bodies** — `anvil/app/src/lib/markdown.ts:76` — PURE — context: AV bodies fetch only metadata until played; avoids eager media download on read.

### IIIF/mirador — virtualization + code-splitting at scale
- **Route/view-level code-splitting via `lazy()`+`Suspense`** — `IIIF/mirador/src/components/WindowViewer.jsx:6` (`lazy(() => import('../containers/OpenSeadragonViewer'))`) and `PrimaryWindow.jsx:10-14` (AudioViewer, VideoViewer, GalleryView, SelectCollection all lazy) — COUPLED(React); **pattern PURE** (plain dynamic `import()` works in Svelte) — context: keeps the 265 KB OSD monster off the critical path until a canvas actually mounts. Highest-leverage split for us.
- **Virtualized thumbnail strip (react-window v2 `List`/`Grid`)** — `IIIF/mirador/src/components/ThumbnailNavigation.jsx:4,207` (+ `package.json:70` `react-window ^2.2.7`) — COUPLED(React); windowed-fixed-row *pattern* PURE-ish — context: only renders visible thumbnails for N-canvas manifests; maps to our v2 multi-image switcher / Gallery.
- **Byte budget enforced in CI** — `IIIF/mirador/bundlewatch.config.json:` (`dist/mirador.min.js` maxSize 700 KB) — PURE (config concept) — context: a budget gate; caps *bytes*, not perceived load.
- NOTE: `CanvasAnnotations.jsx` annotation list uses MUI `MenuList` (`:44`) — **not** virtualized; mirador only virtualizes thumbnails/search, not annotation bodies.
- a11y/i18n/Choice in mirador → covered by **axes 12/13**; not re-dived here.

### IIIF/clover-iiif — lazy-load primitive
- **`LazyLoad` IntersectionObserver gate (`rootMargin: "100px"`, `disconnect()` after first intersect)** — `IIIF/clover-iiif/src/components/UI/LazyLoad/LazyLoad.tsx:23` — COUPLED(React) wrapper, but the **~20-line IntersectionObserver algorithm inside is PURE** — context: defers offscreen children (thumbnails/canvas previews) until ~100 px before viewport. Lift the observer logic, not the component. Reusable hook: `src/hooks/useIntersectionObserver.ts:7`.

### field-studio — build-time vendor splitting
- **`manualChunks` splitting heavy vendors into lazy chunks** — `field-studio/vite.config.ts:21` (`vendor-openseadragon`, `vendor-annotorious`, `vendor-jszip`, `vendor-flexsearch`, etc.) — **PURE** (Vite config) — context: directly lift-able; isolates OSD/Annotorious so they cache independently and split off the entry bundle. Pairs with the lazy-import pattern.

### IIIF/universalviewer — content-handler lazy import
- **9× `import(/* webpackMode: "lazy" */ …)` content handlers** — `IIIF/universalviewer/src/content-handlers/iiif/IIIFContentHandler.ts:38-94` — COUPLED(webpack) mechanism; **pattern PURE** (Vite dynamic import is equivalent) — context: media-type viewers (AV/PDF/image) loaded on demand by content type — analogous to lazy plugin-tools by drawn-shape type.

### IIIF/cozy-iiif — resolution-aware resource model
- **Image-service level classification (`level0` static vs `dynamic`) + `getThumbnailURL`** — `IIIF/cozy-iiif/src/Cozy.ts:213,267-290`; `src/level-0/types.ts:9` — PURE (TS, no UI) — context: lets the UI request a cheap thumbnail size vs a tiled deep-zoom source per canvas — the consumption side of lazy/progressive image loading. (No `React.lazy`/code-split here; it's a model lib.)

### papadam — media-streaming + sync-write-batching perf (not virtualization)
- **Adaptive HLS + debounced CRDT persist** — `papadam/ui/src/lib/hls.ts:13-30` (`attachHls`: `Hls.loadSource`/`attachMedia`, configurable `startLevel`); `papadam/crdt/src/index.ts:133-160` (2s-debounced `Y.encodeStateAsUpdate` write) — COUPLED(HLS.js/y-websocket) — adaptive bitrate streaming + batched sync writes + service-worker precache (ARCHITECTURE.md). Owns the *media-streaming* and *write-coalescing* perf story; mirador virtualization still owns large-manifest list perf.

## Pure-logic extractables (the gold)
| Capability | Source `file:line` | Pure? | Depends on | Extraction effort | Maps to our need |
|---|---|---|---|---|---|
| Vendor `manualChunks` splitting (OSD/Annotorious isolated) | `field-studio/vite.config.ts:21` | PURE | Vite/Rollup | trivial (copy config) | Split 265 KB OSD chunk; independent caching |
| Lazy `import()` of viewer + AV containers | `IIIF/mirador/src/components/WindowViewer.jsx:6`; `PrimaryWindow.jsx:10-14` | pattern PURE (React-coupled API) | dynamic import | low (Svelte `import()`/`{#await}`) | Keep OSD off cold-load critical path |
| IntersectionObserver lazy-render gate (rootMargin pre-warm + disconnect) | `IIIF/clover-iiif/src/components/UI/LazyLoad/LazyLoad.tsx:23` | PURE (the observer algo) | DOM IntersectionObserver | low | Defer offscreen thumbnails/annotation cards |
| `immediateRender: true` OSD flag | `anvil/app/src/lib/viewer.ts:91` | PURE | OSD | trivial | Cheapest perceived-load win; already in use |
| `preload="metadata"` on Sound/Video bodies | `anvil/app/src/lib/markdown.ts:76` | PURE | HTML | trivial | Avoid eager AV download on read |
| Conditional plugin-tools load (only if shape drawn) | `anvil/PRD.md:382` (spec) | PURE (strategy) | — | medium | Trim ~20 KB plugin-tools when unused |
| Resolution-aware image-service selection (thumbnail vs dynamic) | `IIIF/cozy-iiif/src/Cozy.ts:267-290` | PURE | `@iiif/presentation-3` | medium | Request cheap thumbnail size vs deep-zoom source |
| CI byte-budget gate (bundlewatch concept) | `IIIF/mirador/bundlewatch.config.json` | PURE (config) | bundlewatch | low | Enforce 300 KB hard ceiling in CI |

## Gaps — what NO surveyed repo solves
1. **No repo measures cold-static-host time-to-interactive for a deep-zoom + annotation bundle.** `anvil/.perf` measures *build time + byte sizes*; mirador's `bundlewatch` caps *bytes*. The user-felt number anvil's NFR1 promises (≤1.5 s interactive, `PRD.md:304`) is benchmarked **nowhere** — runtime row in the baseline is explicitly "not measured." This is the honest white space for this axis.
2. **No repo configures genuine OSD *tile* prefetch / pre-warming.** anvil sets only `immediateRender` (`viewer.ts:91`); no surveyed repo sets `imageLoaderLimit`, placeholder fill, or pre-fetches tiles ahead of a pan/zoom. "OSD tile prefetch" in the brief currently has **no prior-art coverage** — OSD's own defaults are all that's used.
3. **No virtualized *annotation* list anywhere.** mirador virtualizes thumbnails/search but renders annotation bodies in a plain MUI `MenuList` (`CanvasAnnotations.jsx:44`). A project with hundreds of annotations has no prior-art windowing pattern for the *annotation* sidebar — only for thumbnails.

## Verdict for our build (lift / study / avoid)
**Headline:** the 240 KB budget is **already breached** — anvil's first real measurement is **~328 KB gz**, with the OSD/viewer chunk alone at **265 KB gz** (`baselines/2026-05-22-786bacd.md`). Every "lift" below is in service of clawing back under the 300 KB ceiling.

- **LIFT now (trivial, high-value):** field-studio `manualChunks` (`vite.config.ts:21`) + mirador lazy-`import()` of the OSD container (`WindowViewer.jsx:6`) — together these move the 265 KB OSD chunk off the entry/critical path. `immediateRender: true` is already lifted; keep it. clover's IntersectionObserver lazy-gate (`LazyLoad.tsx:23`) for offscreen thumbnails.
- **LIFT (v2):** mirador react-window virtualization for the multi-image thumbnail strip; cozy resolution-aware thumbnail vs deep-zoom selection.
- **STUDY:** mirador `bundlewatch` as the CI gate for the 300 KB hard ceiling.
- **BUILD (no prior art):** a cold-static-host TTI benchmark (gap 1) and any real OSD tile-prefetch tuning (gap 2) — both must be authored, not borrowed.
- **AVOID:** assuming the 240 KB budget holds — it doesn't, per our own data. Also: shipping the 198 MB fixture anywhere near a published Exhibit.
