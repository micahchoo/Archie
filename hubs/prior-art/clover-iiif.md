---
updated: 2026-07-28
---
# clover-iiif
> *What does clover-iiif do in Archie's territory — and where is it not a donor?*

clover-iiif (Samvera, `3.9.2`) is a React IIIF viewer: `@iiif/helpers` Vault for normalization,
OpenSeadragon for deep zoom, Stitches for CSS, shipped as eight npm subpaths **plus** an unlisted
UMD web component. It is strictly **read-only** — no authoring, no write path of any kind (see
Stated absences). Everything below was verified against the clone at
`/mnt/Ghar/2TA/DevStuff/Annotators/Image/IIIF/clover-iiif` on 2026-07-28; the chrome-placement rows
come from `ledgers/REVIEW-canvas-chrome-dock-2026-07-26.md` and were re-opened during this pass.

## Verified claims (line-cited)

### Architecture & IIIF
- `src/context/viewer-context.tsx:11` — `import { Vault } from "@iiif/helpers/vault";`. The Vault
  lives **in React state**; components pull entities by id rather than walking the manifest.
- `src/lib/iiif.ts:140-141` — Presentation 2 is upgraded explicitly, context-sniffed:
  `convertPresentation2(json)` from `@iiif/parser/presentation-2` (imported `:10`).
- `src/lib/iiif.ts:33-34` — `getInfoResponse` fetches `info.json` itself and hands OSD the **parsed
  object** (`src/components/Image/OSD/OSD.tsx:157-158` `addTiledImage({ tileSource`). Same shape as
  Archie's `fetchRemoteJson` data-tile-source route in [[tauri-csp]].

### Annotation surface
- `src/lib/annotation-helpers.ts:76`, `:84`, `:89` — one parser handling `PointSelector`,
  `SvgSelector` and `FragmentSelector` targets. The most directly reusable shape on this page.
- `src/hooks/use-iiif/getAnnotationResources.ts:33`,`:40` — embedded vs referenced AnnotationPages
  are branched on `annotationPage.items.length > 0`; an empty `items` means "go `vault.load` it".
- **Two different overlay mechanisms, and one avoids `addOverlay` entirely.** Rects go through
  `src/lib/openseadragon-helpers.ts:130` `viewer.addOverlay(div, rect);`; SVG selectors go through a
  vendored svg-overlay plugin that appends **one** `<svg>` to the OSD canvas
  (`src/lib/openseadragon-svg.ts:43` `this._viewer.canvas.appendChild(this._svg);`, provenance at
  `:1-2`). The single-layer path structurally cannot hit [[osd-overlay-wrapper]]; the rect path can.
- `src/components/Viewer/InformationPanel/Annotation/Item.tsx:182-184` — `imageUri` comes from the
  annotation **body's own id**; `Image.tsx:16-19` is a clickable captioned tile, structurally
  Archie's own `NoteMedia`.
- `src/lib/annotation-helpers.ts:117-118` — a Vault artifact worth knowing: it normalizes `&t=`
  query-param targets to a SpecificResource **without a selector** (it only splits on `#`), so time
  has to be re-extracted from `source.id`.

### Chrome placement (the original question)
- `Viewer.tsx:180-184` — `<ViewerHeader>` and `<ViewerContent>` render as flex-column siblings.
- `Header.styled.ts:59` (the one under `src/components/Viewer/Viewer/…`) —
  `backgroundColor: "transparent !important"`; `Viewer.styled.tsx:41` — `PanelToggle` is an opaque
  plate over the canvas.
- Inside `Main` (`Viewer.styled.tsx:15-22`, used only at `Content.tsx:128-163`): `<Painting>` and
  `<MediaWrapper>` are flow siblings in a column — clover docks its item strip **below** the canvas.

### Embed & packaging
- `src/web-components/clover-viewer.tsx:41` — `shadow: false,`. The web component uses **no shadow
  DOM**, so host page CSS reaches straight into it. Archie's embed made the opposite call (ADR-0019).
- `build/build.mjs:143-146` — the WC build aliases `react → preact/compat`; the custom-element
  registration is a vendored fork whose provenance is stated at
  `src/lib/preact-custom-element/README.md:3-4` (adapted from IIIF Canvas Panel).
- **Nothing is code-split.** `build/base-config.mjs:104` and `:117` both set
  `inlineDynamicImports: true` (ESM and CJS); `build/build.mjs:170` repeats it for the UMD WC. The
  npm builds externalize OSD instead (`base-config.mjs:19` inside `FORCED_EXTERNALS`), but
  `build/build.mjs:167` sets `external: []` for the web component — so **the UMD embed inlines
  OpenSeadragon with no lazy boundary at all.**

### Testing
- `src/setupTests.ts:6-9` — **verified: it does neuter canvas**, and the stub is a bare empty object:
  `HTMLCanvasElement.prototype.getContext = () => { return {} as any; };`. Plus `ResizeObserver`
  (`:18-28`) and `IntersectionObserver` (`:30-43`). Environment is jsdom (`vitest.config.mjs:13`).
  71 unit test files, none able to exercise layout or hit-testing.
- `playwright/e2e/wc.spec.ts:11-13` — the browser gate's only load-bearing assertion is
  `customElements.get('clover-viewer')`, i.e. *the script parsed and registered*. The
  `toHaveCount(1)` above it matches a tag **hardcoded in the static fixture**
  (`playwright/html/index.html:15`) and passes whether or not anything rendered. Nothing asserts a
  canvas painted. Textbook [[drive-must-not-recreate-the-thing-under-test]] vacuity.
- `playwright/playwright.config.ts:26` — `reuseExistingServer: !process.env.CI`, the same shared-port
  shape as [[viewer-e2e-shared-port]].

## Stated absences
- **No authoring, no persistence, no write path.** `grep -rniE "annotorious|createAnnotation\(|
  saveAnnotation|deleteAnnotation\(|method: *[\"'](POST|PUT|PATCH|DELETE)" src/` (test files
  excluded) → **empty**. Reducer cases named `updateAnnotations` mutate local React state only.
- **No bundle-size gate of any kind.** `grep -rniE "size-limit|bundlesize|bundlewatch|maxSize|
  gzipSize" package.json build/ .github/` → **empty**. Nothing here is a donor for `eagerGzKB`
  ([[archie-viewer-eager-closure]]).
- **No lazy boundary on the canvas path.** Zero `React.lazy` in `src/`; the only `await import(` are
  `hls.js` at `Player.tsx:83` and `ContentResource.tsx:48`. OpenSeadragon is statically imported at
  7 sites including `viewer-context.tsx:7` — the state module itself, so anything touching viewer
  state pulls OSD eagerly.

## What citations of it may NOT support
- "clover-iiif tabulates it at `:78-89`" is **false** — that range is a bullet list, not a table
  ([[prior-art-citation-discipline]]).
- "clover has no note-media feature" is **false** — see `Item.tsx`/`Image.tsx` above.
- ADR-0019's claim that `Main` (`Viewer.styled.tsx:15-22`) "makes the header and content column
  siblings" is **wrong** — `Main` is the header's *sibling's interior*, used only inside
  `ViewerContent`. The actual sibling-maker is `Wrapper` (`Viewer.styled.tsx:125-127`, `:138-141`).
- There are **two** `Header.styled.ts` files (the other at `src/components/Slider/Header/`) — always
  disambiguate the path before citing.
- A 2026-07-28 edit claimed the clone was absent from disk. **False** — it is at `IIIF/clover-iiif/`,
  516 files. Run `ls`/`find` before writing an absence claim.
- **Do not cite `src/lib/retry.ts` as a resilient-fetch donor.** It is inert at both call sites:
  `getInfoResponse` (`src/lib/iiif.ts:37-44`) catches its own error and **resolves `undefined`**
  rather than rejecting, so `retry`'s `catch` (`retry.ts:8`) never fires. `OSD.tsx:154-155` wraps it
  in `retry(…, 3, 1000)` and then guards `if (!tileSource) return;` — the guard proves the authors
  know it resolves undefined. A transient `info.json` failure gets **one** attempt, not four. This
  is exactly [[prior-art-citation-discipline]]'s "grep where it is USED": the definition reads
  robust, the call site is a no-op.
- **Do not cite its annotation-body render path as a sanitization donor.** `HTML.tsx:16` and
  `PlainText.tsx:23` both hand annotation body text to `dangerouslySetInnerHTML` with no sanitizer in
  their import graph; DOMPurify exists in the tree but is wired only into `src/lib/html-element.ts`
  (which itself returns unsanitized HTML during SSR, `:21`) and `useMarkdown.tsx`. `PlainText` is the
  sharper one — it renders a **`text/plain`** body as HTML after a `\n → <br />` replace (`:11`).
  Archie's lesson is the seam, not the bug: sanitize where the body is rendered, not where the
  manifest metadata is.
- Its own error handling is a stated non-donor: `src/components/Viewer/index.tsx:549` promises "a
  user-friendly error as a functional component" and `:553-554` renders `<></>` after a
  `console.log`. A failed manifest is a blank page. Same shape again at `:564-565`.
