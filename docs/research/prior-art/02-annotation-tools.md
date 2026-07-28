# Axis 02 — Annotation Tools (Annotorious + drawing/shape editing)

## Focused question
How do prior-art repos draw/edit annotation shapes (Rectangle, Polygon, Ellipse, Path/Polyline) over an image, and how do they handle the Ellipse/Path SvgSelector round-trip that our own `wadm-roundtrip` verdict shows silently corrupts? Who wraps/extends `W3CImageFormat` or parses SvgSelector themselves?

## Sources surveyed
- `field-studio` — `@annotorious/openseadragon` consumer + bundled canonical Annotorious 3.x source in node_modules — **opened (y)**
- `IIIF/liiive` (liiive-client) — Annotorious + plugin-tools, own IIIF crosswalk — **opened (y)**
- `IIIF/immarkus` — React Annotorious image-annotation env — **opened (y)**
- `IIIF/browser-visual-search` — FastSAM auto-region (mask→shape) — **opened (y)**
- `BIIIF/annotorious-openseadragon-main.zip` — unzipped; it is **Annotorious 2.x (RecogitoJS-era)**, NOT the v3 `W3CImageFormat` codebase — **opened (y), not canonical for our axis**
- `IIIF/iiif-visual-search` — no own SVG/selector conversion found — **opened (y), nothing relevant**
- `annomea` — viewer is consumer-side; geometry delegated to Annotorious — **opened (y)**

## Findings by source

### field-studio — the live consumer pattern (uses `W3CImageFormat` UNWRAPPED)
- **Canonical SvgSelector parser** — `field-studio/node_modules/@annotorious/annotorious/src/model/w3c/svg/SVGSelector.ts:141` — PURE (third-party canonical, npm `@annotorious/annotorious` — NOT this repo's own code) — context: `parseSVGSelector`/`serializeSVGSelector`, the exact adapter our verdict implicates. THE round-trip code.
- **Ellipse NaN root cause** — `…/svg/SVGSelector.ts:39-45` — PURE (third-party) — context: `parseSVGEllipse` calls `parseSVGXML(value)`, which returns the `<svg>` **wrapper** node (its `firstChild` after DOMParser round-trip), then `doc.getAttribute('cx')` on the wrapper → `null` → `parseFloat(null)` → **NaN**. Mechanically explains the verdict's invisible ellipse.
- **lightpanda `lookupPrefix` throw** — `…/svg/SVG.ts:43` — PURE (third-party) — context: `parseSVGXML` calls `doc.lookupPrefix(SVG_NAMESPACE)`; lightpanda's Document lacks `lookupPrefix` → the verdict's `lookupPrefix is not a function`.
- **Path Q/T corruption** — `…/svg/pathParser.ts:167` — PURE (third-party) — context: command regex char-class is `[MmLlHhVvCcZz]` — **Q and T are absent**. A `d="M…Q…T…"` parses M, then the Q/T tail is swallowed as M's args (filtered to numbers); only the MoveTo survives. Exactly the verdict.
- **Consumer uses adapter unwrapped** — `field-studio/src/features/viewer/ui/molecules/AnnotoriousLifecycle.ts:92,101` — COUPLED(OSD/Svelte) — context: `W3CImageFormat(config.canvas.id)` passed straight to `createOSDAnnotator`, no pre-parse, no extension → **field-studio inherits the corruption**. No one in the user's own projects has mitigated it yet.
- **Adapter indirection** — `field-studio/src/features/viewer/actions/annotorious-adapter.ts:69-75` — COUPLED(OSD) — context: thin wrapper that still hands off to the same `W3CImageFormat`; tool selection via `setDrawingTool` (rect/polygon/ellipse/path tools from plugin-tools).

### IIIF/liiive — own serialize-side crosswalk (does NOT use W3CImageFormat to write IIIF)
- **Shape→SvgSelector serializer** — `IIIF/liiive/liiive-client/src/pages/[room]/_components/room-ui/room-controls/download-actions/utils/serialize-iiif.ts:14-41` — PURE-partial — context: `toIIIFTarget` hand-writes `xywh=` for RECTANGLE and `<svg><polygon>` / `<svg><ellipse cx=…rx=…>` for POLYGON/ELLIPSE. Bypasses `W3CImageFormat` serialize. **But: no Path/Polyline branch, and the ellipse output is the exact `<svg><ellipse cx=…>` string that re-triggers the parser NaN on re-load.** Serialize-only; does not mitigate parse-side.
- **Near-duplicate** — `IIIF/liiive/liiive-client/src/pages/[room]/manifest/_crosswalk.ts:70-107` — PURE-partial — context: identical `toIIIFTarget` (RECT/POLYGON/ELLIPSE, no Path). Cite once; note duplication.
- **Drawing layer** — `IIIF/liiive/.../annotatable-image/annotatable-image.tsx:4,27` — COUPLED(React) — context: `mountPlugin` from `@annotorious/plugin-tools` — same plugin-tools dependency our build plans on.

### IIIF/immarkus — geometry delegated to Annotorious; only AI region→rect is its own
- **Body helpers only** — `IIIF/immarkus/src/utils/annotation.ts:4-32` — PURE — context: getEntityBodies/getEntityTypes; **no geometry/SVG parse** — immarkus hands all shape (de)serialization to Annotorious's `W3CImageFormat`.
- **AI region→Rectangle** — `IIIF/immarkus/src/services/connectors/openai/parseResponse.ts:15-23` — PURE — context: maps a model's `{x,y,w,h}` region to a `ShapeType.RECTANGLE` with `bounds`. Auto-region source produces **rects only** — round-trip-safe by construction.

### IIIF/browser-visual-search — FastSAM auto-region as annotation source (PURE)
- **Detection decode → bbox** — `IIIF/browser-visual-search/src/segmentation/postprocess.ts:176-241` — PURE — context: `decodeDetections` filters by confidence, computes mask area, emits **bbox only** (no polygon/contour from mask). FastSAM masks are reduced to axis-aligned boxes.
- **Letterbox→normalised xywh** — `IIIF/browser-visual-search/src/segmentation/preprocess.ts:74-91` — PURE — context: `modelBoxToNormalisedBBox` undoes letterbox pad/scale, returns normalized `[x,y,w,h]` — directly mappable to our `FragmentSelector` `xywh=`. Auto-detected regions = rects = safe round-trip; no Ellipse/Path emitted.

### papadam — temporal media regions only; NO shape drawing
- **Temporal media target + segment playback** — `papadam/ui/src/lib/components/MediaPlayer.svelte:117-120`; `papadam/api/papadapi/annotate/models.py:64,69` — COUPLED(Svelte/HLS) — `media_target="t=22.5,37"` temporal selector, seek-to-start + stop-at-end loop; body is a `RichTextField`. Annotates *time*, not pixels — NO SVG/Path/Ellipse drawing at all. Does NOT challenge the Annotorious shape-selector donors; relevant only if we add temporal AV annotation.

## Pure-logic extractables (the gold)
| Capability | Source `file:line` | Pure? | Depends on | Extraction effort | Maps to our need |
|---|---|---|---|---|---|
| SvgSelector parse/serialize (the round-trip impl) | `field-studio/node_modules/@annotorious/annotorious/src/model/w3c/svg/SVGSelector.ts:141,165` | PURE (3rd-party canonical) | DOMParser, core ShapeType | Lift+fix Ellipse/Path branches | The function to re-implement/patch for our pre-parse mitigation |
| Ellipse NaN diagnosis | `…/svg/SVGSelector.ts:39-45` + `…/svg/SVG.ts:43-49` | PURE (3rd-party) | DOMParser, `lookupPrefix` | Read-only (confirms bug) | Tells us pre-parse must read `<ellipse>` directly, not adapter |
| Path command parser (M/L/H/V/C/Z) | `…/svg/pathParser.ts:162-182` | PURE (3rd-party) | regex only | Add Q/T/S/A to char-class + handlers | The exact place to extend for lossless Path |
| Shape→SvgSelector serializer (rect/poly/ellipse) | `IIIF/liiive/.../utils/serialize-iiif.ts:14-41` | PURE-partial | ShapeType enum | Lift + add Path + round coords | Model for our WADM serialize (note: ellipse string format is the broken one) |
| AI/model region → Rectangle shape | `IIIF/immarkus/src/services/connectors/openai/parseResponse.ts:15-23` | PURE | ShapeType.RECTANGLE | Trivial | Auto-region → FragmentSelector path |
| FastSAM detection → normalized xywh bbox | `IIIF/browser-visual-search/src/segmentation/{postprocess.ts:176,preprocess.ts:74}` | PURE | ONNX tensor outputs | Medium (whole pipeline) | Auto-region annotation source, rect-only = safe |

## Gaps — what NO surveyed repo solves
1. **No repo pre-parses SvgSelector to bypass `W3CImageFormat` for Ellipse** — the `_FRAMING.md` recommended mitigation is unbuilt everywhere. field-studio uses the adapter unwrapped; immarkus/annomea delegate to it; liiive only re-implements the *serialize* side (and reproduces the same broken ellipse string).
2. **No repo handles Path quadratic/smooth (`Q`/`T`) commands anywhere** — Annotorious's parser drops them; liiive omits Path entirely; FastSAM/AI sources never emit Path. Lossless Path is greenfield for us.
3. **Serialize direction for user-drawn Ellipse/Path is untested in every consumer** — liiive serializes Ellipse but no one round-trips it back through `parseSVGSelector` to verify; matches the verdict's open hole.

## Verdict for our build (lift / study / avoid)
- **LIFT (and patch):** `pathParser.ts` + `SVGSelector.ts` parse functions as the basis of our own **pre-parse-SVG-on-load** mitigation — read `<ellipse>`/`<path>` attributes from a properly-namespaced node, and extend `parsePathCommands` with Q/T (and ideally S/A) before approximating to polyline. This is the one place a real fix lives; it's third-party canonical code, so we own a fork/shim, not field-studio's repo.
- **STUDY:** liiive `serialize-iiif.ts` as the shape→SvgSelector serialize template — but **do not copy its ellipse output verbatim**; that string is what the parser chokes on. immarkus/bvs as proof that **rect-only auto-region sources sidestep the corruption** (a viable v1 fallback: restrict auto-detection to FragmentSelector rects).
- **AVOID:** trusting `W3CImageFormat` unwrapped (field-studio's current pattern) for any Ellipse/Path; the BIIIF zip (Annotorious 2.x, wrong era).
