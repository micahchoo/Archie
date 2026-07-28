---
updated: 2026-07-28
---
# universalviewer
> *What does UV's extension architecture buy it — and why is its suite not the network donor this repo said it wasn't?*

UV 4.3.0 predates the React era: jQuery + jsviews + a hand-rolled `Panel`/`BaseView` class tree, with
React 19 grafted onto exactly two leaves. Its one genuinely enviable property is **two-level lazy
loading** — a content handler is picked by data shape, then an extension by IIIF resource type, so a
page that opens a PDF never downloads OpenSeadragon. It displays annotations only as **search-hit
rectangles**; it reads no AnnotationPages off a canvas at all. Verified against the clone at
`/mnt/Ghar/2TA/DevStuff/Annotators/Image/IIIF/universalviewer` (HEAD `0142257`, no `node_modules/`,
no `dist/`) on 2026-07-28. Chrome-placement rows come from
`ledgers/PRIORART-chrome-placement-2026-07-26.md`.

## Verified claims (line-cited)

### Architecture — the lazy ladder Archie's embed rhymes with
- `src/UniversalViewer.ts:15-24` — content handlers are a registry of `() => import(…)` thunks,
  dispatched by *which key is present on the data object* (`ContentType.IIIF = "iiifManifestId"`).
- `src/content-handlers/iiif/IIIFContentHandler.ts:127-132` — the extension registry is keyed on
  **IIIF resource type**, not a viewer name (`ExternalResourceType.CANVAS → Extension.OSD`), and
  each entry is itself a lazy loader (`:77-83`).
- **The boundary is real and structurally enforced.** `grep -rn "from \"openseadragon\"" src/`
  returns exactly **one** hit — `uv-openseadragoncenterpanel-module/OpenSeadragonCenterPanel.ts:21`
  — reachable only through the dynamic `import()` at `IIIFContentHandler.ts:80`. Compare
  [[archie-viewer-eager-closure]]: same discipline, arrived at from the opposite direction (UV splits
  by *content type*, Archie by *route depth*).

### Annotation surface — search hits, not a note layer
- `src/content-handlers/iiif/extensions/uv-openseadragon-extension/Extension.ts:747-770` —
  annotations enter by exactly two doors, and both are search-shaped: `this.data.annotations`
  (host-supplied) and IIIF Content Search. Both WADM arrays and `oa` `resources` are accepted.
- **What is rendered is a bare `<div>` per rect with a `title` tooltip** —
  `OpenSeadragonCenterPanel.ts:1064-1087`: `div.className = "annotationPin"` or `"annotationRect"`,
  `div.title = sanitize(rect.chars)`, then `this.viewer.addOverlay(div, rect);`. There is no body
  rendering, no popup, no note surface.
- The closest thing to authoring is an **event emitted outward for the host to act on**:
  `OpenSeadragonCenterPanel.ts:359-363` publishes a `DOUBLECLICK` with
  `target: \`${canvas.id}#xywh=…,1,1\`` — a 1×1 point. Nothing internal consumes it; it is off by
  default (`uv-openseadragon-extension/config/config.json:12`
  `"doubleClickAnnotationEnabled": false`). **UV can point at a place and hand you the coordinate. It
  cannot draw a region, hold a body, or persist anything.**

### IIIF & OSD plumbing
- `Extension.ts:1314-1345` — the P2/P3 branch is literally `canvas.getImages()` (v2) else
  `canvas.getContent()` (v3), each walking to an image service. Note the asymmetry: only the P3 arm
  accepts a service identified by type rather than profile, so a P2 manifest advertising its
  ImageService by `@type` alone falls through to `:1365-1367` `infoUri = "lib/imageunavailable.json"`.
- `OpenSeadragonCenterPanel.ts:812-824` — three-way tile-source resolution: the fetched `info.json`
  object is handed to OSD directly when `hasServiceDescriptor`, else a Girder source, else
  `{ type: "image", url: data.id, buildPyramid: false }`.

### Chrome placement (the original question)
- **Docked ≥768px, via CSS grid**: `.mainPanel { grid-template-areas: "left center right" }`
  (`uv-shared-module/css/styles.less:114-131`); opening a panel widens `--uv-grid-left-width`
  30px → 271px (`:25-29`, `:144-150`), shrinking the centre (canvas) track.
- **Also enforced in JS, independently of CSS**: `Shell.ts:96-105` computes the main panel as
  `$element.height() − headerPanel − footerPanel − mobileFooterPanel` — the canvas is explicitly
  what is left over, not merely implied by layout.
- **Below 768px it overlays instead**: `.leftPanel, .rightPanel` become
  `position: absolute; inset: calc(5em + 8px) 0 2em; width: 100%` (`styles.less:196-207`) — full-bleed
  sheets over the canvas, selected by viewport width alone, never by config.
- Defaults trace to the literal, not a fallback: all four `is<X>PanelEnabled()` read
  `Bools.getBool(config, true)` (`BaseExtension.ts:1090-1114`), AND the shipped OSD extension config
  sets all four `true` explicitly (`config.json:8-10`, `:37`).

### Embed & packaging
- Three shipping shapes (`package.json:12-15`): `main` cjs, `module` esm, `web` → `dist/umd/UV.js`.
  The host contract is a **function call on a div** — `src/Init.ts:4-23` `init(el, data)`, used as
  `UV.init("uv", data)` from a UMD script tag (`src/uv.html:14`, `:34`).
- `src/uv.html:2` states the iframe-embed contract: the embed page "doesn't need to communicate with
  the parent page, only fill the available space and look for `#?` parameters" — the same
  no-postMessage stance Archie took for the embed (`DIVERGENCES.md` divergence 5's kill criterion).

### Testing
- **Jest with the `jest-puppeteer` preset — real Chromium, not jsdom** (`package.json:136-137`;
  `jest-puppeteer.config.js:1-13` launches 1920×1080, headless only on CI, and boots
  `npx serve dist -p 4444`). No Playwright, no Cypress.
- The surface is tiny: two e2e files plus three unit specs (`src/Utils.spec.ts` 12 lines,
  `PubSub.spec.ts` 35, `XYWHFragment.spec.ts` 26). `__tests__/configuration_options.js` is entirely
  `it.skip`, and `__tests__/test.js:1` opens with `test.skip("Configuration options", () => {});`.

## Stated absences
- **No web component.** `grep -rn "customElements.define" src/` → empty. (`customElements` appears
  only as `whenDefined` waits on *third-party* elements.)
- **No authoring, no write path.** `grep -rniE "annotorious|createAnnotation|saveAnnotation|
  deleteAnnotation" src/ package.json` → empty; `grep -rnE "method: *[\"'](POST|PUT|PATCH|DELETE)"
  src/ --include=*.ts --include=*.tsx` → empty. Every network call is a GET.
- **It does not read canvas annotations at all.** `grep -rn "AnnotationPage|otherContent|
  annotationList" src/ --include=*.ts --include=*.tsx` → **empty**. Every `canvas.getContent()` call
  in `src/` exists to find the *painting* body's format. Annotations arrive only from the host or
  from Content Search (see above). **UV is not a donor for anything about displaying authored
  annotation bodies.**
- **No bundle-size gate.** `grep -rniE "bundlesize|size-limit|bundlewatch|maxSize" package.json
  webpack.config.js esbuild.mjs .github/` → empty. `webpack-bundle-analyzer` is a declared
  devDependency that nothing wires up.
- **No persistent over-canvas chrome on the image path**: the only two `position:absolute` rules in
  the OSD centre panel are a paging button with `display:none !important`
  (`uv-openseadragoncenterpanel-module/css/styles.less:30-40`) and a loading spinner (`:224`).

## What citations of it may NOT support
- **"UV's test suite never touches the network" is FALSE, and this page corrects it.** That sentence
  is currently in [[prior-art-citation-discipline]]'s catalogue, in `_INDEX.md`, and was the previous
  headline of this page. Against UV 4.3.0 the suite is puppeteer-driven and loads **live remote
  manifests from two third-party hosts**: `__tests__/test.js:7-8`
  (`https://iiif.io/api/cookbook/recipe/0031-bound-multivolume/manifest.json`) and `:11-12`
  (`https://digital.library.villanova.edu/Item/vudl:294631/Manifest`), *used* — not merely declared —
  at `:214` and `:421`, inside active (non-skipped) `describe` blocks under the top-level
  `describe("Universal Viewer")` at `:19`. `npm test` is bare `jest`; CI runs it
  (`.github/workflows/build-test.yml`). The accurate statement is the stronger one: **UV's suite has
  no mocking layer at all and depends on live third-party hosts.**
  The correction is worth the space because of *how* it survived — it was a plausible sentence that
  agreed with what its readers already believed about a legacy viewer, and nobody re-opened
  `__tests__/`. That is the exact mechanism the rule it lives in describes.
  The original claim it was refuting ("universalviewer's suite covers this") stays refuted, for a
  **different** reason: the suite is 2 e2e files and 73 lines of unit spec, half of it skipped.
- **Do not cite `PubSub` as an event-bus donor.** `PubSub.ts:32-38`'s `unsubscribe` calls
  `handlers.splice(handlerIdx)` — one-arg `splice` deletes from that index **to the end**, so
  unsubscribing the first of three handlers kills all three; and an already-removed handler gives
  `indexOf → -1`, so `splice(-1)` removes an innocent last handler. It survives because
  `PubSub.spec.ts`'s test for it is commented out — and with a *single* handler even that test would
  have passed, since `splice(0)` and "remove all" coincide at N=1. A sibling of
  [[a-green-run-is-one-sample]]: **an assertion at N=1 is not evidence about a list.**
  `subscribeAll` (`:28-30`) is likewise a single slot, and `BaseExtension.ts:273` already occupies it
  to bridge internal→external events, so a host calling it silently kills every `uv.on(...)`
  listener on the page.
- **It is not an [[osd-overlay-wrapper]] donor — it is corroboration that nobody solved it.**
  `OpenSeadragonCenterPanel.ts:1087` calls `addOverlay` and `grep -rn "pointer-events" src/` finds
  nothing in the OSD centre panel or extension theme, so the rect divs and OSD's injected wrapper
  both sit at default `pointer-events: auto`. UV gets away with it because its overlays are
  decorative — the only click handler is on the 28×37px `annotationPin`. The corpus avoids the
  wrapper problem by never making a large overlay clickable; Archie provoked it by doing exactly
  that.
- `clearAnnotations()` (`OpenSeadragonCenterPanel.ts:1232-1234`) is `this.viewer.clearOverlays();` —
  it destroys **every** overlay, including any frame or halo a host added. Archie's per-element
  `removeOverlay` + wrapper cleanup is the right call, and this is the counterexample.
- **Its localisation is config-rewriting, and is a cautionary tale rather than a pattern.**
  `BaseExtension.ts:487-495` does `JSON.stringify(config)` → regex-replace every `$Token` →
  `JSON.parse`. Two structural costs: a translated string containing `"` or `\` corrupts the JSON and
  throws at `JSON.parse` (there is no escaping step), and substitution is global over the whole
  config, so a `$token` appearing in a URL or id is rewritten too.
- **43 `setTimeout` calls sit on the critical path** — `BaseExtension.ts:469` renders and publishes
  `CREATED` after `1`ms, `:350` waits `100` with the comment `// firefox needs this :-(`. UV is the
  corpus evidence that wall-clock guessing is what the field actually does, which is why Archie's
  arrival-based guard ([[wall-clock-quiet-is-a-load-sensitive-gate]]) claims no precedent here.
- `content-state.ts:105-112` fetches an arbitrary remote URL from a hash parameter with **no size
  cap, no content-type check, no origin restriction**. The negative example for
  [[untrusted-archive-open-seam]]'s `SRC_MAX_BYTES` + marker validation, not a donor.
- The whole viewer fails to `alert("Unable to load manifest")` (`IIIFContentHandler.ts:410`) —
  untranslated (it bypasses the `$token` system entirely), modal, and it collapses network, 404,
  malformed JSON and unsupported version into one string.
- A 2026-07-28 edit claimed the clone was absent from disk. **False** — `IIIF/universalviewer/`,
  692 files, its own `.git/`. Run `ls`/`find` before writing an absence claim.
