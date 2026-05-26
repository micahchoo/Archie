# Gap Consolidation — Master Ledger + Orphan Hunt

**Pass purpose:** "Have we checked for ALL the gaps?" Per-axis gaps were captured; this is the cross-axis deduplicated ledger plus the ORPHAN-GAP hunt (capabilities that fall between axes and are owned by none).

**Severity rule (per `_FRAMING.md`):** BLOCKER = a locked framing decision cannot be honored without it. MAJOR = the build ships broken/unacceptable UX without it. MINOR = quality polish. Scope surveyed = v1 (single-image, no tiles) **and** v2 (multi-image switcher, tiled) per framing ("v1 = single-image; v2 = multi-image switcher").

A gap counts only if it blocks a locked decision: WADM-native (AnnotationPage / FragmentSelector + SvgSelector / TextualBody / Sound / Choice), per-image annotation scope, dual-mode serverless filesystem (FSA save + zip download), PWA / static-host publish, `exhibits.json` Gallery.

---

## Master gap ledger

Grouped under **Spine A** (serverless / in-browser pipeline), **Spine B** (lossless non-rect geometry through WADM), **Standalone** (real cross-axis gap, no spine), **Orphan** (cross-cutting concern no axis owns — see §Orphan Hunt for adjudication).

| Gap | Raised by axes | Severity | Donor in corpus? | Should-own axis |
|---|---|---|---|---|
| **SPINE A — serverless / in-browser pipeline** |
| In-browser tile-pyramid generation (DZI / level0 client-side) | 17 (headline), 16 | **BLOCKER** (v2 tiled) — *stays BLOCKER (donor PARTIAL)* | DONOR (gap-lib) PARTIAL: wasm-vips `lib/vips.d.ts:8636` `tiffsaveBuffer` w/ `tile?`/`pyramid?` opts + `crop:5706`/`extractArea:5933` — provides pyramidal-TIFF-in-buffer + region crop; **NO `dzsave`** (grep=0), clone is types-only (no `.wasm`/`.js`). Still ours: DZI/IIIF layout (pyramidal TIFF ≠ OSD-readable), the per-level tile loop, and shipping the ~13-20 MB WASM (NFR1 risk). | 17 |
| Client-side folder → static-IIIF manifest generation (FSA/OPFS, no Node) | 9, 5, 6 | **BLOCKER** — *DONOR found (algorithm-half closed)* | DONOR (gap-lib): iiif-builder `src/iiif-builder.ts:10` (`IIIFBuilder`), `:92` `createManifest` / `:72` `createCollection`, `:112` `toPresentation3` — pure `@iiif/*` deps, no `fs`/`path` in src. Provides a browser-runnable Presentation-3 Manifest+Collection builder. Still ours: the FSA/OPFS folder-walk feeding it, content-hash naming, `exhibits.json` meta-index. (Transitive `@iiif/helpers` not fs-audited.) | 9 |
| GitHub OAuth push from a backend-less SPA | 9, 6 | MAJOR | Partial: Decap CMS OAuth-from-SPA (PKCE) is the one solved piece (Spine A note, `09-...:L108`). anvil flags it unbuilt (`PUBLISHING.md:90,96`). **Severity note:** framing makes zip the zero-auth *universal default*, OAuth *opt-in* (`_FRAMING.md:L26`) — so no locked decision blocks shipping without it; MAJOR, not BLOCKER. | 9 |
| Unified `Filesystem` interface: FSA in-place save + `.zip` download behind one seam | 6, 9 | MAJOR | Greenfield (ingredients exist): immarkus FSA utils + field-studio OPFSStorage = FSA side only; Download/zip branch + unifying interface unsolved (`06-...:L65`). | 6 |
| Gallery / `exhibits.json` meta-index (exhibits-of-exhibits) | 5, 6, 9 | MAJOR | Greenfield. Every repo stops at IIIF Collection (multi-manifest, single site); none emit a multi-site index (`05-...:L57`). | 5 |
| oEmbed endpoint from a static host | 18 | MINOR | Greenfield — impossible to serve dynamically zero-server; needs build-step generator (`18-...:L49,L58`). | 18 |
| Static Content-Search 2.0 *service* (producing, not consuming) from static host | 11 | MINOR | Partial: field-studio local full-text path liftable (`field-studio/.../searchService.ts`); standards-conformant static Search service unsolved (`11-...:L55`). | 11 |
| Cold-static-host TTI benchmark (≤1.5 s NFR1 measured nowhere) | 16 | MAJOR | Greenfield — measured nowhere; anvil's first real measurement (~328 KB gz) already breaches the 240 KB budget (`anvil/.perf/baselines/2026-05-22-786bacd.md`). | 16 |
| **SPINE B — lossless non-rect geometry through WADM** |
| Pre-parse SVG to bypass broken `W3CImageFormat` adapter (Ellipse) | 2, 3, 8 | ~~BLOCKER~~ → **MAJOR** (donor closes the hard part; integration glue remains) | DONOR (gap-lib): svgpath `lib/svgpath.js:189` `toString` / `:469` `abs` / `:281` `transform`, ellipse `lib/ellipse.js:30`, arc `lib/a2c.js:114` — DOM-free string→AST→transform→string engine (the adapter's root cause is string-vs-Node); runtime-verified arc+Q preserved. Provides lossless path parse/transform/serialize bypassing the broken branch. Still ours: extract `<ellipse>`/`<circle>` attrs → path `d`, and the Annotorious-shape glue. | 2 |
| Path quadratic/smooth (`Q`/`T`) command handling | 2, 3 | ~~BLOCKER~~ → **MAJOR** (donor proven; clone needs build) | DONOR (gap-lib): points-on-path `src/index.ts:6` `pointsOnPath`→`Point[][]`; the Q/T/S/H/V/A→C conversion is in its dep path-data-parser `normalize.ts:54 (T)/:75 (Q)/:38 (S)/:88→:133 (A→arcToCubicCurves)` (read from installed copy `BIIIF/1code-0.0.49/node_modules/path-data-parser/src/normalize.ts`). Flattens any curve/arc Path to polygon rings. Still ours: sampling tolerance, polygon→`<svg>` wrap, **`npm i` the dep (points-on-path clone is source-only, no node_modules/build)**. NOTE lossy-to-polygon; svgpath is the lossless-to-path alternative. | 2 |
| Serialize direction (Annotorious→WADM) for user-drawn Ellipse/Path — untested | 2, 14, 3 | ~~BLOCKER~~ → **MAJOR** (path-layer hole closed by donor) | DONOR (gap-lib): svgpath `lib/svgpath.js:189` `toString` — runtime round-trip `parse→translate→toString` preserves both `A` and `Q` (no longer an untested hole at the path-string layer). Still ours: Annotorious-shape-geometry → svgpath calls → `<svg>` envelope → WADM `SvgSelector`. | 2 |
| Geometry-level undo over WADM `Fragment`/`SvgSelector` | 10 | MAJOR | Greenfield in-stack. anvil undo = text-field only; Excalidraw `CaptureUpdateAction + inverse-entry` is model-to-copy, not over WADM (`10-...:L71`). | 10 |
| Mutable delta/CRDT store ↔ WADM `AnnotationPage` round-trip | 10 | MAJOR | Greenfield. liiive stores binary Y.Doc + TipTap-JSON bodies, NOT WADM (`10-...:L70`). | 10 |
| Non-rect (SvgSelector) region deep-links | 8 | MAJOR | Greenfield — every addressing scheme is `xywh`-only (`08-...:L57`). "Bites us hardest" on this axis. | 8 |
| Safe SVG sanitization for non-rect shapes (same `<svg>` path is the only XSS filter) | 20, 2 | MAJOR | Partial: only field-studio `sanitizeIIIFResource` sanitizes at all; cozy/manifesto sanitize nothing (`20-...:L43`). Correct-parse + safe-sanitize + serialize must be one module. | 20 |
| Mask → SvgSelector (contour-trace / polygon emit) for auto-detected regions | 19 | MINOR (v2 AI) | DONOR (gap-lib): marchingsquares `src/isolines.js:15` `isoLines` (alias `isoContours` `:637`) → polygon-ring arrays (`ret.push:165`); `isoBands` `src/isobands.js:1038`. Pure ES, no node deps. Provides mask→`[x,y]` ring primitive. Still ours: FastSAM mask→scalar-grid adapter, ring simplify/winding, `<svg>` wrap. | 19 |
| **STANDALONE (real, no spine)** |
| Transcript / caption as first-class WADM annotation body (`supplementing`, WebVTT↔time) | 4, 19 | MAJOR | **PARTIAL — updated post-papadam-sweep.** ASR→time-coded-WebVTT generation+sync IS solved: `papadam/transcribe/worker.py:28-52,96` (real Whisper, the only working instance in corpus). Remaining greenfield: papadam stores VTT as a URL field (`papadam/api/.../archive/models.py:106-107`), NOT a WADM `supplementing` body — the VTT→TextualBody adapter is ours. | 4 |
| Typed AV source (`Sound`/`Video`) AND `SpecificResource` wrapper reconciled | 4 | MAJOR | Partial-broken: videojs-annotation writes SpecificResource + bare-string source, never typed (`04-...:L56`). | 4 |
| Multi-language `Choice` body emit + render + authoring | 13, 4 | MAJOR | Partial: manifesto `getSuitableLocale`/`PropertyValue` is liftable negotiation core; Mirador `Choice` is image-version only, not language (`13-...:L51`). | 13 |
| Cross-AnnotationPage annotation→annotation links in a *published static* exhibit | 8, 5 | MAJOR | Greenfield — anvil `goToPage` is in-app only; Research-Narratives is Supabase-backed (`08-...:L58`). | 8 |
| End-to-end select → `fitBounds` → live anchor recompute | 1, 7, 8 | **BLOCKER** — *stays open; donor PARTIAL (rect half only)* | DONOR (gap-lib) PARTIAL: canvas-panel `hooks/use-register-public-api.ts:43` `goToTarget` → impl `use-generic-atlas-props.ts:609` `world.gotoRegion({x,y,w,h})`; web-component embed `src/index.ts:2`; `region=` deep-link `web-components/image-service.tsx:205`. Provides fitBounds-equivalent for `FragmentSelector` (xywh) + embed + deep-link. Still ours: `goToTarget` is **rect-only** → SvgSelector→bbox reduction, live-anchor recompute on viewport change, `anvil://`→goToTarget bridge. | 8 |
| EXIF *metadata* ingest (camera/GPS/date → navDate/metadata) | 14 | MINOR | DONOR (gap-lib): exifr `src/highlevel/orientation.mjs:11` `orientation()`, GPS keys `dicts/tiff-gps-keys.mjs:6-7`, `DateTimeOriginal` `dicts/tiff-exif-keys.mjs:25`. Provides browser EXIF read (GPS/date/orientation). Still ours: GPS/date → `navDate`/`metadata` mapping. (Replaces field-studio's `ingest.worker.ts:351` stub.) | 14 |
| Read-side a11y: SR semantics for regions, alt-text-as-WADM-body, reduced-motion, popup/drawer focus trap | 12, 1 | MAJOR | Greenfield — Mirador ARIA *decisions* studyable, code doesn't transfer (`12-...:L56–59`). | 12 |
| In-browser OCR/HTR + ASR generation | 19 | MINOR (deferred) | Greenfield — ingest-only via alto-xml viable; generation has no corpus prior art (`19-...:L56,57`). | 19 |
| Virtualized *annotation* sidebar list (hundreds of annotations) | 16 | MINOR | Greenfield for annotations — Mirador virtualizes thumbnails only (`16-...:L60`). | 16 |
| **ORPHAN (no axis owns — see §Orphan Hunt)** |
| EXIF *orientation* flag vs stored pixel coordinates | — | **MAJOR** | DONOR (gap-lib) detection-half: exifr `src/highlevel/orientation.mjs:11` `orientation()` reads tag 0x0112; `:60` `rotation()` → `{deg,scaleX,scaleY,dimensionSwapped}`. Provides orientation DETECTION. Still ours: exifr READS only — baking the bitmap (canvas/`tiffsave` re-encode so coords match display) is ours; the geometry-breakage gap is closed only on detection. | **new bullet → axis 1 or 3** |
| Project file-format schema migration (`.anvil/` manifest/project version over time) | — | MAJOR (v2) | Greenfield in-stack; tldraw migration-sequence pattern is the external model. | **new bullet → axis 6** |
| Empty / error / loading / offline states (no annotations, failed manifest, missing image) | — | MAJOR | Greenfield. | **new bullet → axes 6 + 7** |
| Overlapping-region hit-testing / z-order click disambiguation | — | MINOR | Annotorious default (topmost). | sub-bullet → axis 2 |
| Overlay color/contrast legibility over arbitrary photos | — | MAJOR | Greenfield. | sub-bullet → axis 12 |
| Annotation grouping / layers / tags / taxonomy (organizing many) | — | MINOR (v2) | Partial: WADM `isTagging` body classifier `annomea/.../bodies.ts:41` = single tags only, not grouping. | sub-bullet → axis 6/7 |

---

## BLOCKER shortlist (cannot honor a locked framing decision without it)

1. **Pre-parse SVG to bypass broken `W3CImageFormat`** for Ellipse (Spine B) — `SvgSelector` is a locked selector type; the adapter corrupts it silently. **DONOR FOUND → downgraded MAJOR** (svgpath, runtime-verified — see `_GAP-ANSWERS.md`).
2. **Path `Q`/`T` command handling** (Spine B) — Path is a locked `SvgSelector` shape; curves are stripped today. **DONOR FOUND → downgraded MAJOR** (points-on-path / path-data-parser `normalize.ts`; clone needs build).
3. **Serialize-direction round-trip for user-drawn Ellipse/Path** (Spine B) — open hole, never tested; authoring writes WADM. **DONOR FOUND → downgraded MAJOR** (svgpath round-trip preserves A+Q).
4. **In-browser tile-pyramid generation** (Spine A) — v2 tiled mode + 100 MB drop cannot be served from a static host without it. **STAYS BLOCKER** (wasm-vips PARTIAL: pyramidal TIFF only, no DZI, binary not cloned).
5. **Client-side folder → static-IIIF generation** (Spine A) — the PWA "generate manifest in browser" model. **DONOR FOUND → algorithm-half closed** (iiif-builder, pure `@iiif/*`; folder-walk still ours).
6. **select → `fitBounds` → live anchor recompute** (Standalone) — the locked "navigable annotations = fitBounds + live anchor" decision; annomea's documented root-cause failure. **STAYS OPEN** (canvas-panel PARTIAL: rect `goToTarget` only; non-rect + live-anchor still ours).

(6 BLOCKERS originally — all spine-resident or framing-locked; none introduced by an orphan. **Post gap-lib close-loop (2026-05-24, `_GAP-ANSWERS.md`): 4 now have a confirmed donor (1,2,3,5); 2 stay open (4 tile-pyramid, 6 fitBounds-non-rect). The three Spine-B SVG-geometry BLOCKERS (1,2,3) all gained donors — svgpath is the single highest-value lib.** GitHub OAuth-from-SPA was downgraded to MAJOR: zip download is the locked zero-auth universal default, OAuth is opt-in, so shipping without it violates no locked decision.)

---

## Orphan hunt — adjudication of each candidate

**Orphan gaps found: 3 genuine** (EXIF-orientation-vs-coords · schema/format migration · empty/error/loading states), plus **3 sub-gaps** that belong inside an existing axis but are currently unenumerated (overlay-contrast → axis 12; hit-test/z-order → axis 2; grouping/taxonomy → axis 6/7).

| Candidate | Verdict | Evidence |
|---|---|---|
| Overlapping-region hit-testing / z-order | **SUB-GAP of axis 2** (not enumerated). MINOR. | Axis 2 covers Annotorious tooling but never enumerates overlap-disambiguation. Annotorious decides (topmost-drawn); corpus shows the pattern only in non-WADM editors (Excalidraw `getElementsAtPosition`, tldraw R-tree). We surface a keyboard-cycle; not a new axis. |
| Coordinate-unit integrity (px / percent / normalized surviving resize) | **COVERED-BY-DESIGN**, not an orphan. | `_FRAMING.md` + `anvil/PRD.md §8` lock **absolute pixel coordinates against the source image**; display-time scaling is the viewer's job (`03-...:L40-43`). No gap — the framing closes it. |
| Image rotation / EXIF orientation vs annotation coordinates | **ORPHAN — real, MAJOR.** | Distinct from axis-14's EXIF *metadata* ingest. Axis 1 has zero rotation content (probe empty); no axis addresses EXIF orientation=6 rotating the displayed bitmap while stored pixel coords reference the un-rotated source. Silent geometry breakage on phone-camera imports. Must add a path: normalize orientation at ingest (bake into the bitmap) before any coords are drawn. |
| Project file-format schema migration (`.anvil/` evolving) | **ORPHAN — real, MAJOR (v2 reopen).** | Only "migration" hit in any axis is *URL-state* migration (`08-...:L51`). No axis owns `.anvil/manifest.json` / `project.json` version evolution. tldraw's named-migration-sequence pattern is the external model; nothing in-stack. Author-Publishers reopening old projects across versions need this. |
| Empty / error / loading / offline states | **ORPHAN — real, MAJOR.** | "fallback" hits in axes 1/2/3/4/6/13 are language-fallback or media-fallback, not UX error-states (verified in context). Axes 6 (authoring) + 7 (read-UI) should own but enumerate neither failed-manifest, missing-image, no-annotations, nor offline UI. Public exhibits ship broken without these. |
| Annotation grouping / layers / tags / taxonomy | **SUB-GAP of axis 6/7.** MINOR (v2). | WADM `isTagging` body classifier (`annomea/.../bodies.ts:41`) handles single tags on a body, not organizing N annotations into navigable groups/layers/folders. That's an authoring/read UX concern; corpus access-control note (Figma/ArcGIS layer-level) is not WADM-native. Add as an authoring bullet, not a new axis. |
| Overlay color/contrast legibility over arbitrary images | **SUB-GAP of axis 12.** MAJOR. | Axis 12 line 65 lists SR semantics, alt-text, reduced-motion, focus management — but NOT contrast-on-photo. WCAG legibility of overlay strokes/labels over arbitrary imagery is unenumerated. Institutional-adoption gate; belongs as an axis-12 bullet. |
| Large-file / memory limits in browser PWA (100 MB drop) | **COVERED by Spine A.** | Owned by axis 17 (tile-pyramid) + axis 16 — `OffscreenCanvas` memory ceiling forces a WASM-libvips evaluation for 100 MB images (`17-...:L68`). Not an orphan. |
| Cross-image / project-level annotations | **COVERED-BY-DESIGN + axis 8.** | `_FRAMING.md:L22` locks annotations as image-level (per-AnnotationPage); project-level structure = manifest + `narrative.md`. The cross-page *link* gap is owned by axis 8 gap #2 (`08-...:L58`). The brief's "project-level annotations" phrasing is a red herring against the locked per-image decision. |

### Does any orphan warrant a NEW axis?

**No.** All three genuine orphans are single, well-bounded concerns absorbable as bullets into existing axes:
- **EXIF-orientation-vs-coords** → axis 1 (viewer) or axis 3 (data-model ingest normalization). Recommend axis 3 (it's a coordinate-integrity-at-ingest issue) with an axis-1 viewer note.
- **Schema/format migration** → axis 6 (authoring owns `.anvil/` read/write).
- **Empty/error/loading states** → split: authoring states → axis 6; read-side states → axis 7.

None is broad enough to be its own survey axis. The two-spine + standalone structure holds; the orphans are patch-bullets, not a missing 21st axis.

---

## Caveman compression (load-bearing check)

> Survey checked 20 directions. Found holes. Biggest holes: curved-shape data breaks silently; browser-makes-tiles nobody-did; browser-pushes-to-GitHub nobody-did. Between-the-directions holes nobody-owned: rotated-photo-breaks-coords; old-project-wont-open; nothing-loaded-screen-blank. Holes small enough to patch existing directions — no new direction needed.

Meaning survives — the ledger has load-bearing structure.
