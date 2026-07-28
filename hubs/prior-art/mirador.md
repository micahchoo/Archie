---
updated: 2026-07-28
---
# mirador
> *How does mirador draw and hit-test annotations without `addOverlay` — and what does that cost?*

Mirador 4.0.0 is the reference IIIF viewer: React + Redux (thunk + saga), manifesto.js, a
`components/` → `containers/` → `state/` split built around a plugin extension point. It is
**read-only** — annotation *creation* is deferred to the separate `mirador-annotations` plugin, which
is not a dependency here. Its one architecturally distinctive choice, and the reason this page is
worth reading: it never calls `viewer.addOverlay`. Verified against the clone at
`/mnt/Ghar/2TA/DevStuff/Annotators/Image/IIIF/mirador` on 2026-07-28 (no `node_modules/`, no `dist/`
— everything here is static reading). Chrome-placement rows come from
`ledgers/PRIORART-chrome-placement-2026-07-26.md`.

## Verified claims (line-cited)

### The overlay decision, and its consequences
- **One `<canvas>` portalled into OSD's canvas, painted in 2D** — `AnnotationsOverlay.jsx:239-251`
  is a `ReactDOM.createPortal(<div …><canvas /></div>, viewer.canvas)`. The viewport transform is
  hand-synced (`src/lib/OpenSeadragonCanvasOverlay.js:97-98` translate + scale), from a **vendored**
  plugin whose provenance and reason are stated at `:4-7` ("Existing repository is not published as
  an npm package"). SVG selectors are re-drawn by parsing and replaying `<path d>`
  (`src/lib/CanvasAnnotationDisplay.js:138-142`).
- **Because there is no overlay element, there is no wrapper div — and no hit-testing either.**
  Clicks arrive as an OSD event (`AnnotationsOverlay.jsx:209` `viewer.addHandler('canvas-click', …)`)
  and consumption is signalled back with `:130` `event.preventDefaultAction = true;`. Hit-testing is
  hand-written: `isPointInPath` for SVG, arithmetic for `xywh` (`:20-32`).
- **Overlapping annotations are disambiguated by a 360-sample circle score with a doubling radius**
  — the design rationale is in-source at `:136-145` ("figure out how many points around a circle are
  inside the annotation shape… if there's a tie, make the circle bigger and try again"), loop at
  `:151`, doubling at `:166-169`.
- `src/config/settings.js:555` — `zoomPerClick: 1, // disable zoom-to-click`. They remove OSD's
  click-to-zoom by config rather than fighting it; double-click zoom is reimplemented separately.

### Annotation reading & normalization
- `src/lib/MiradorCanvas.js:46-51` and `:55-59` — v2 `otherContent` and v3 `annotations` are read
  off `this.canvas.__jsonld`, i.e. **manifesto's private field**. The abstraction doesn't cover
  annotations, so they reach around it.
- `src/lib/AnnotationFactory.js:15-21` — v2/v3 is a runtime type sniff (`json.type ===
  'AnnotationPage'`) into two parallel class hierarchies, **not** a converter. `AnnotationItem` (W3C)
  and `AnnotationResource` (oa) expose the same getter names with no shared interface and no
  compiler — duck-typed parity, the failure mode Archie's `carry.ts` sentinels exist to prevent
  ([[render-core-data-integrity]]).
- `src/state/sagas/annotations.js:29-33` — embedded vs referenced is branched on `if
  (!annotation.items)`, exactly clover's rule from the other direction.
- `src/lib/htmlRules.js:10-13` — annotation HTML is DOMPurify'd against a named IIIF-derived
  allowlist (`ALLOWED_TAGS: ['a','b','br','i','img','p','span']`), selected by
  `settings.js:445 htmlSanitizationRuleSet: 'iiif'`. **This is the sanitization donor
  [[clover-iiif]] is not.**

### IIIF & OSD plumbing
- `src/lib/iiif.js:4-7` — image-service discovery in one function tolerating both profile styles
  (`isImageProfile` **or** `isImageServiceType`).
- `src/lib/ThumbnailFactory.js:10-16` — a stated manifesto bug workaround: normalized URLs strip `#`
  values, so `#level1`/`#level2` profiles must be special-cased before `isLevel0ImageProfile`.
- `src/lib/MiradorCanvas.js:71` — the v2/v3 `Choice` gap is admitted in-source: "TODO Clean up the
  following hack as soon as manifesto.js provides any information if an annotation body is a Choice
  option".
- **Two library-mutates-your-store hazards, both found the hard way, both fixed by a copy.**
  `src/components/OpenSeadragonTileSource.jsx:53-54` — `// OSD mutates this object, so we give it a
  shallow copy`; `src/state/selectors/manifests.js:12-13` — `structuredClone` before
  `Utils.parseManifest` "to prevent Manifesto from mutating the json". Archie holds parsed IIIF in a
  store the same way; both seams are worth an explicit check.

### Chrome placement (the original question — verdict is SPLIT)
- **Panels dock**, via a real flex tree: `Window.jsx:114-128` nests `<ContentRow><ContentColumn>`
  (both defined `:46`, `:50`) around `StyledPrimaryWindow`; `PrimaryWindow.jsx:106-115`. The sidebar
  is a MUI `Drawer` (`WindowSideBar.jsx:7` `styled(Drawer, …)`, `:27` `variant="persistent"`) whose
  Paper is a `Nav` forced `position: 'relative !important'` (`:13-16`, passed in at `:30-34`) —
  the `!important` exists specifically to escape MUI's default fixed positioning.
- **The canvas's OWN control bar overlays**: `position:absolute; bottom:0; width:100%; zIndex:50` at
  50% alpha (`WindowCanvasNavigationControls.jsx:18-31`), a child of the OSD viewer section
  (`OpenSeadragonViewer.jsx:18-22`) — the alpha exists so the image shows through.
- Mirador's default OPEN state is a bare canvas: `settings.js:521`
  `thumbnailNavigation.defaultPosition: 'off'`, `:483` `window.sideBarOpen: false`.

### Packaging & the size gate
- `package.json:21` — two builds in sequence from one entry: `vite build --config vite.config.js &&
  vite build --config vite-umd.config.js`. The UMD config sets `emptyOutDir: false`, so **the `&&`
  ordering is load-bearing**. Host contract is `Mirador.viewer({ id })` on a div (`src/init.js:6` →
  `src/lib/MiradorViewer.jsx:21`) — not a web component, no shadow DOM.
- `src/components/WindowViewer.jsx:6` — `const OSDViewer = lazy(() => import('../containers/
  OpenSeadragonViewer'));` — the same lazy-canvas boundary Archie's embed has, one of 8 in `src/`.
- **`bundlewatch.config.json` is 9 lines and gates exactly one number**: `dist/mirador.min.js` ≤
  `700 KB` (`:4-6`), wired via `package.json:28` `"test": "npm run build && npm run lint && npm run
  size && vitest run"`. It measures the **whole UMD bundle**, uncompressed, with no per-chunk
  breakdown, and never measures `mirador.es.js` at all — so **moving OSD from lazy to eager would
  change it by zero**. Mirador has Archie's lazy architecture and the `totalGzKB`-shaped gate that
  [[archie-viewer-eager-closure]] proves cannot see a leak.

### Testing
- vitest + **happy-dom** (`vitest.config.ts:36`), 190 test files, `shuffle: true`.
- **`Path2D` is stubbed as an empty class** — `setupTest.js:24-29` `class Path2D { }` /
  `global.Path2D = Path2D;`. `isPointInPath` appears exactly **once** in the whole repo, the
  production line `AnnotationsOverlay.jsx:24`, and in **zero** tests. The SVG draw path is explicitly
  switched off: `__tests__/src/lib/CanvasAnnotationDisplay.test.js:72` `describe.skip('svgContext',`.
  Net: the click path described above — the most intricate code in the project — has no gate that
  can see it.
- `__tests__/integration/tests/annotations.test.js:6-8` pastes the resulting flake's stack into the
  test file: `// TypeError: Cannot read properties of null (reading 'translate')` at
  `OpenSeadragonCanvasOverlay.js:95` — i.e. `context2d` is null in the DOM environment.

## Stated absences
- **Core mirador cannot author annotations.** `grep -rnE "method: *['\"](POST|PUT|PATCH|DELETE)"
  src/` → empty; `grep -rn "createAnnotation\|updateAnnotation\|deleteAnnotation" src/` → empty. The
  action-type enum (`src/state/actions/action-types.js:7-14`) carries only fetch/select/hover cases.
  `mirador-annotations` is named once in the repo, in `.github/ISSUE_TEMPLATE/annotations.md:3`, and
  is **not** a dependency.
- **Zero real-browser testing.** `grep -rniE "playwright|puppeteer|cypress|selenium|webdriverio"
  package.json .github/ vitest.config.ts` → empty. `__tests__/integration/` is React Testing Library
  in happy-dom, not a browser.
- **No two-directions scroll problem to solve.** `ScrollTo.jsx:35-49` is `getBoundingClientRect` math
  + `scrollTo`, with no suppression and no IntersectionObserver anywhere near it — scroll drives the
  canvas, the canvas never drives scroll. Mirador is **not** a donor for
  [[wall-clock-quiet-is-a-load-sensitive-gate]]'s guard; it has no occasion for one.

## What citations of it may NOT support
- "Mirador docks its chrome" as one unqualified sentence — the verdict is **SPLIT**: structural
  panels dock, the canvas's own control bar overlays. Citing one half misrepresents the system.
- "Mirador solves the `addOverlay` wrapper problem" — it **avoids** the problem by never creating an
  overlay element, and pays for it with hand-rolled hit-testing (`:20-32`), a 360-sample
  disambiguation heuristic (`:136-145`), and no test that can exercise either. It is a legitimate
  fork in the road, not a fix Archie can borrow: **DOM overlays give you free hit-testing plus
  [[osd-overlay-wrapper]]; a canvas layer gives you neither.**
- Its `bundlewatch` entry is **not** precedent for a bundle ratchet that catches eager leaks — see
  the size-gate row above.
- `scripts/container-lint.js` looks like a gate and **cannot fail a build**: `grep -n
  "process.exit\|exitCode\|throw" scripts/container-lint.js` → empty; the only violation signal is
  `console.error` at `:15`. So `npm test` exits 0 with red text on screen. Same family as
  [[post-review-fixes-are-unreviewed]]'s "a gate that cannot fail is not a gate".
- **A deliberate divergence, not an oversight on either side:** `settings.js:552`
  `preserveImageSizeOnResize: true` is mirador's shipped default, where `hubs/reading.md` records
  Archie trying it and measuring it **worse** (17/20 → 9/20). Worth knowing mirador has no hit-test
  gate (see Testing) that could have measured it either way — so this is not evidence against
  Archie's measurement.
- A 2026-07-28 edit claimed the clone was absent from disk. **False** — `IIIF/mirador/`, 717 files,
  its own `.git/`. Run `ls`/`find` before writing an absence claim.
