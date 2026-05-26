# Gap Answers — Close-Loop on 7 Gap-Targeting Library Clones

**Pass purpose:** 7 libraries were cloned specifically to answer named gaps in `_GAPS.md`. This pass OPENS the function that does the job in each, verifies it actually solves the targeted gap (real `file:line`), and records what is still ours. Verdicts are skeptical: a lib counts as DONOR-CONFIRMED only if the load-bearing function was opened (and, where feasible, run).

**Date:** 2026-05-24. Method: `ctx_*` source inspection + two runtime smoke-tests (svgpath round-trip; path-data-parser normalize read).

---

## Answer table

| Gap (BLOCKER #) | Lib | Verdict | Evidence `file:line` | What it provides | What's STILL ours (1-line integration sketch) |
|---|---|---|---|---|---|
| Pre-parse SVG, bypass broken `W3CImageFormat` Ellipse (B1) | svgpath | **DONOR-CONFIRMED** | `svgpath/lib/svgpath.js:189` (`toString`), `:469` (`abs`), `:281` (`transform`), `:548` (`unarc` — optional, NOT forced); ellipse handling `svgpath/lib/ellipse.js:30`; arc-to-cubic `svgpath/lib/a2c.js:114`. Runtime: `s('M10 10 A50 50 0 0 1 90 90 Q…').translate(5,5).toString()` → `M15 15A50 50 0 0 1 95 95Q…` (arc + Q preserved). | A standalone string→AST→transform→string SVG-path engine that never touches the DOM (the root cause of the W3CImageFormat failure: parser expects a Node, gets a string). Parses Ellipse and Path, applies matrix transforms, re-serializes losslessly; arcs survive (`unarc` is opt-in). | We parse the WADM `SvgSelector` `<svg>` ourselves with svgpath BEFORE it reaches the broken adapter branch, emitting shape coords for Annotorious directly. svgpath operates on the `d` of `<path>`; we still extract `<ellipse>`/`<circle>` attrs (or convert them to a path `d`) ourselves first. |
| Serialize-direction round-trip for user-drawn Ellipse/Path (B3) | svgpath | **DONOR-CONFIRMED** | Same `svgpath/lib/svgpath.js:189` `toString` — runtime round-trip above shows A + Q both survive a parse→transform→serialize cycle. | The untested serialize hole (`_FRAMING.md:L11`) is closed for the path-string layer: svgpath produces a valid, curve-preserving `d` after edits. | We map Annotorious shape geometry → svgpath calls → `<svg>` string wrap → WADM `SvgSelector`. svgpath does the path math; the Annotorious-shape↔svgpath glue and the `<svg>` envelope are ours. |
| Path `Q`/`T` (and `S`/`A`) command handling (B2) | points-on-path | **DONOR-CONFIRMED (via its dependency)** | `pointsOnPath` entry `points-on-path/src/index.ts:6` flattens C/L/M/Z to polygon rings (`:8` `normalize(absolutize(...))`). The actual Q/T/S/H/V/A→C conversion is in its dep **path-data-parser** `normalize.ts`: `case 'Q'` `:75`, `case 'T'` `:54`, `case 'S'` `:38`, `case 'A'` `:88` → `arcToCubicCurves` `:102/:133`. (Read from the only installed copy: `BIIIF/1code-0.0.49/node_modules/path-data-parser/src/normalize.ts`.) | `pointsOnPath(d)` returns `Point[][]` — every curve/arc command flattened to polygon points. Turns a corrupt/curved Path into a lossless-enough polygon ring at chosen tolerance. | We feed the WADM Path `d` → `pointsOnPath` → polygon → WADM `SvgSelector` `<polygon>`. **Caveat:** the `points-on-path/` clone is SOURCE-ONLY (no `node_modules`, no `lib/`/`dist/` build) — its `path-data-parser` dep is not installed there; `npm i` + build needed to use it. Sampling tolerance choice and the polygon→`<svg>` wrap are ours. NOTE: this is lossy-to-polygon (flattening), whereas svgpath is lossless-to-path — pick per use. |
| In-browser tile-pyramid generation, DZI/level-0 (B4) | wasm-vips | **PARTIAL (over-sold)** | `tiffsaveBuffer` (in-memory, no FS) `wasm-vips/lib/vips.d.ts:8636` with options `tile?` `:8650`, `pyramid?` `:8662`, `tile_width/height`; `crop` `:5706`, `extractArea` `:5933`, `thumbnailBuffer` `:4517`. **NO `dzsave` under any spelling** (grep `dzsave|deep_zoom|Dzsave` = 0 hits); `ForeignDzDepth` `:2570` is only the `depth` option of `tiffsave*`, not a DZI writer. | Can build a **pyramidal tiled TIFF in a buffer** in-browser, plus region crop / thumbnail — the pyramid loop itself. | **A lot.** (1) The cloned `lib/` contains ONLY `vips.d.ts` (262 KB) — NO `.wasm`, NO `vips.js`/`vips-es6.js` — so it cannot even be smoke-tested here; real npm pkg ships a ~13-20 MB WASM (breaches the 240 KB NFR1 budget hard). (2) Pyramidal TIFF ≠ DZI/IIIF; OpenSeadragon cannot read a pyramidal TIFF natively — we either tile-slice to DZI ourselves (loop `crop`+`tiffsaveBuffer` per level/tile) or write a DZI/IIIF-Image-API descriptor layer. The pyramid arithmetic + OSD-readable layout is ours. |
| Client-side folder → static-IIIF manifest/collection (B5) | IIIF/iiif-builder | **DONOR-CONFIRMED** | `IIIFBuilder` class `iiif-builder/src/iiif-builder.ts:10`; `createManifest` `:92`, `createCollection` `:72`; serialize `toPresentation3` `:112` (delegates to `vault.toPresentation3`). Deps are pure `@iiif/parser`, `@iiif/presentation-3`, `@iiif/presentation-3-normalized`, `@iiif/helpers` — **no `fs`/`path`/`node:` in `src/`** (grep = 0). | A pure, browser-runnable Presentation-3 Manifest **and** Collection builder with a fluent callback API and normalized→JSON serialization. Replaces the Node-bound biiif algorithm referenced in the ledger. | We walk the FSA/OPFS folder ourselves (browser dir handles), feed entries into `createManifest`/`createCollection`, and write the JSON back via our `Filesystem` seam. The folder-walk, content-hash naming, and `exhibits.json` meta-index remain ours. **Transitive deps (`@iiif/helpers` etc.) not audited for fs** — out of scope for this survey. |
| select → fitBounds → live anchor recompute (B6) | IIIF/canvas-panel | **PARTIAL** | Public API decl `canvas-panel/.../hooks/use-register-public-api.ts:43` (`goToTarget`), impl `use-generic-atlas-props.ts:609` → `runtime.current.world.gotoRegion({x,y,height,width,...})`; `goHome` `:584`; web-component register `canvas-panel/.../src/index.ts:2` (`import './web-components/canvas-panel'`); `region` attribute + selector spatial `web-components/image-service.tsx:166,205`. | A real `goToTarget`/`gotoRegion` fitBounds-equivalent, a `<canvas-panel>` **web-component embed**, and a `region=` deep-link attribute. Closes the "fitBounds exists, nobody wired it" half (annomea root cause). | `goToTarget` takes a **rectangle `{x,y,w,h}` ONLY** — it covers the `FragmentSelector` (xywh) deep-link, but NOT a non-rect `SvgSelector` target. The SvgSelector→bounding-box reduction, live-anchor recompute on viewport change, and our `anvil://` URI parse→goToTarget bridge are ours. Stays MAJOR (rect half closed, non-rect half open). |
| Mask → SvgSelector contour-trace / polygon-ring (axis 19, MINOR) | marchingsquares | **DONOR-CONFIRMED** | `isoLines` (aliased `isoContours`) `marchingsquares/src/isolines.js:15`, exported `:636-637`; returns ring arrays — `ret.push(linePolygons)` `:165`, `return ret` `:174`; cell polygons are `[[x,y],…]` `:97-137`; `isoBands` `src/isobands.js:1038`. Pure ES module (`main.js` re-exports), no node deps. | `isoContours(grid, threshold)` → array of polygon rings (`[x,y]` point arrays) from a scalar grid. This is the mask→polygon-ring primitive. | We convert a FastSAM/browser-visual-search binary mask → scalar grid → `isoContours` → ring → simplify → WADM `SvgSelector` `<polygon>`. The mask→grid adapter, ring simplification/winding, and `<svg>` wrap are ours. v2/AI scope only. |
| EXIF Orientation + GPS/date ingest (orphan MAJOR + axis 14) | exifr | **DONOR-CONFIRMED (read-only)** | `orientation(input)` `exifr/src/highlevel/orientation.mjs:11` returns the `Orientation` tag (`TAG_ORIENTATION` 0x0112); `rotation(input)` `:60` maps it to `{deg, scaleX, scaleY, dimensionSwapped}`; orientation value table `dicts/tiff-ifd0-values.mjs:6` (1–8, e.g. 6 = Rotate 90 CW); GPS keys `dicts/tiff-gps-keys.mjs:6-7`, `DateTimeOriginal` `dicts/tiff-exif-keys.mjs:25`. | Browser EXIF reader: `Orientation` flag, GPS lat/long, capture date — exactly the metadata-ingest + orientation-detection the ledger names. | exifr **READS** orientation; it does NOT bake the bitmap. Normalizing the pixels (canvas redraw / `tiffsave` re-encode so stored coords match displayed image) is OURS — the orphan gap (orientation=6 rotating display while coords reference unrotated source) is closed only on the *detection* side. GPS/date → `navDate`/`metadata` mapping is ours. |

---

## BLOCKERS now answered

**4 of 6 BLOCKERS have a confirmed donor; 2 are partially answered and stay open.**

| BLOCKER | Status | Donor |
|---|---|---|
| 1 — Pre-parse SVG (Ellipse) | **FLIPPED → donor** | svgpath (runtime-verified) |
| 2 — Path Q/T handling | **FLIPPED → donor** | points-on-path / path-data-parser `normalize.ts` (arc+Q+T+S→C proven) |
| 3 — Serialize-direction Ellipse/Path | **FLIPPED → donor** | svgpath (round-trip preserves A+Q) |
| 4 — In-browser tile-pyramid | **Still BLOCKER (PARTIAL)** | wasm-vips — pyramidal TIFF only, no DZI, no binary cloned |
| 5 — Folder → static IIIF | **FLIPPED → donor** | iiif-builder (pure `@iiif/*`, no fs in src) |
| 6 — select→fitBounds→live anchor | **Still open (PARTIAL → stays MAJOR)** | canvas-panel — rect goToTarget yes, non-rect/live-anchor no |

Net: Spine B's three SVG-geometry BLOCKERS (1, 2, 3) all gain real donors — the hardest cluster in the survey is largely solved by svgpath (+ points-on-path for the polygon path). Spine A's tile-pyramid BLOCKER (4) is only half-helped. Standalone fitBounds BLOCKER (6) gets its read-side half.

---

## Integration-order recommendation

1. **svgpath first** — unblocks BLOCKERS 1 + 3 (the silent-Ellipse-corruption + untested-serialize holes), pure JS, ~tiny, runtime-verified. Build the parse/sanitize/serialize module the ledger asks for (line 33: correct-parse + safe-sanitize + serialize as ONE module) around it.
2. **points-on-path** (with `npm i` of its `path-data-parser` dep) — for the Path→polygon fallback (BLOCKER 2) where lossless path isn't needed; pairs with #1.
3. **iiif-builder** — BLOCKER 5; wire to the FSA/OPFS folder-walk once the `Filesystem` seam exists.
4. **canvas-panel** — BLOCKER 6 read-side; adopt `goToTarget` for the FragmentSelector half, then build the SvgSelector→bbox + live-anchor layer.
5. **exifr** — orphan orientation + axis 14; cheap, do at ingest alongside the bitmap-baking step (which is ours).
6. **marchingsquares** — defer to v2/AI; mask→polygon only when FastSAM lands.
7. **wasm-vips** — last and with eyes open: needs the real WASM (~13-20 MB, NFR1 risk) + a DZI/IIIF tiling layer on top of `tiffsaveBuffer`. Evaluate whether a worker-side `OffscreenCanvas` DZI slicer beats shipping libvips-WASM at all.

---

## Most valuable lib & the over-sold one

- **Most valuable: svgpath.** Single runtime-verified library that closes two BLOCKERS (1 + 3), is DOM-free (the exact root cause of the W3CImageFormat failure), tiny, and its arc handling overlaps points-on-path's territory. Highest BLOCKER-per-byte.
- **Over-sold: wasm-vips.** Targeted the headline tile-pyramid BLOCKER; delivers only pyramidal TIFF (not DZI, OSD can't read it natively), the clone is types-only (no `.wasm`/`.js` shipped, untestable here), and the real binary breaches the bundle budget. Stays a BLOCKER with extra glue required.
- **Bottlenecked second: points-on-path** — the donor logic is real and confirmed, but the clone is source-only and its arc-bearing dependency (`path-data-parser`) isn't installed in it.

## Caveman compression (load-bearing check)

> Seven libs cloned to fill holes. Five really fill their hole; one fills half; one is mostly empty box. Curved-shape-data holes (the worst) now have tools: svgpath keeps curves, points-on-path makes dots. Browser-makes-tiles hole still mostly open — box had label, no machine inside. svgpath = best tool.

Meaning survives — the answers have load-bearing structure.
