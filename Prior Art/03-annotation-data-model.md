# Axis 03 — Annotation Data Model (W3C WADM, selectors, scope)

## Focused question
How do prior-art repos model annotations as W3C WADM — AnnotationPage structure, FragmentSelector (`xywh=`) vs SvgSelector, TextualBody, multi-body, multi-language Choice — and what serialize/parse logic is PURE and lift-able? How do they handle IIIF Presentation 3.0 conformance?

## Sources surveyed
- `annomea` — own Svelte app; pure WADM read/write utils — **y** (richest PURE source)
- `IIIF/cozy-iiif` — TS IIIF lib over `@iiif/presentation-3`; AnnotationPage construction + fetch — **y**
- `IIIF/immarkus` — React annotator; WADM JSON-LD export + IIIF import — **y**
- `wadm-roundtrip` — round-trip prototype + verdict — **y**
- `IIIF/iiif-manifest-editor` — Vault normalized-entity store — **n** (models IIIF *resources*, not WADM annotations → axis ⑥)
- `IIIF/liiive` — server-side annotation persistence — **n** (storage layer → axis ⑩)

## Findings by source

### annomea — own app, explicitly-pure WADM utilities (the gold)
- **`createAnnotationPage` builder** — `annomea/src/data/wadm.ts:6` — PURE — context: emits a conformant `AnnotationPage` with `@context: anno.jsonld`, `type`, `creator`, `items[]`. Exactly our export top-level (one AnnotationPage per image).
- **`fragmentSelector(x,y,w,h)`** — `annomea/src/data/wadm.ts:19` — PURE — context: builds `FragmentSelector` with `conformsTo: media-frags` and rounded `xywh=` value. Our axis-aligned-rect selector, lift verbatim.
- **`svgSelector(svg)`** — `annomea/src/data/wadm.ts:28` — PURE — context: wraps an SVG string into `SvgSelector` (no parse). Our circle/point/polygon/Path selector container — but note: it does NOT parse/validate the SVG (see gap).
- **`createAnnotation(id, source, selector)`** — `annomea/src/data/wadm.ts:60` — PURE — context: minimal `Annotation` with `target: {source, selector}`, `motivation: describing`. Our per-region annotation factory.
- **`annotationUrn(hash, index)`** — `annomea/src/data/wadm.ts:55` — PURE — context: `urn:anvil:annotation:{hash}:{index}` — content-hash-keyed stable IDs; directly serves our content-hash AnnotationPage naming.
- **`title`/`describing`/`hasContent`** — `annomea/src/data/wadm.ts:34,39,48` — PURE — context: extract top-level `name` (annotation title, NOT a TextualBody) vs joined `describing`-body text. Encodes the Anvil/Annotorious title-vs-note distinction we need.
- **`asBodies`/`withBodies` (body↔array normalization)** — `annomea/src/data/bodies.ts:10,18` — PURE — context: single-body-or-list ↔ array, the inverse pair. Header documents that THREE modules drifted before this was extracted — proves this is load-bearing and worth lifting as one canonical module.
- **`isMedia`/`isDescribing`/`isTagging`/`bodyText`** — `annomea/src/data/bodies.ts:26,34,41,46` — PURE — context: body classifiers; `isDescribing` is lenient on missing `type` (Annotorious omits it) but excludes media + Choice so a purposeless media body is never mis-read as a note. Our multi-body discrimination logic.
- **WADM type surface** — `annomea/src/shared/types.ts:37,43,55,69,81` — PURE — context: `FragmentSelector`, `SvgSelector`, `WadmTextualBody` (with `language`), `WadmSoundBody` (spells **Sound** not Audio, per glossary), `WadmChoiceBody { items: WadmTextualBody[] }`. Our exact target type model.
- **Sound/Video/Image body rendering** — `annomea/src/viewer/popup.ts:50,68,70` — COUPLED(DOM) — context: filters media bodies and renders `<audio>`/`<video>`. Proof multi-body media is wired read-side (relevant to axis ④); logic trivial to re-port.

### cozy-iiif — IIIF library, AnnotationPage construction + collection pagination
- **AnnotationPage builder + namespaced page-ID minting** — `IIIF/cozy-iiif/src/helpers/import-annotations.ts:9,40` — PURE — context: builds `{id, type:'AnnotationPage', items}`, mints IDs as `{canvas.id}/{ns}/annotations/page/p{n}` by scanning existing pages for highest index (UUID fallback). A naming convention alternative to our content-hash; the page-construction shape matches Presentation 3.0.
- **Annotation→canvas association by target source** — `IIIF/cozy-iiif/src/helpers/import-annotations.ts:67` — PURE — context: groups annotations by `target.source` to attach to the right canvas. Our per-image-scope routing (which AnnotationPage an annotation belongs to).
- **`fetchAnnotations` — embedded / referenced / `partOf` collection** — `IIIF/cozy-iiif/src/helpers/fetch-annotations.ts:10,71` — PURE-ish (uses `fetch`) — context: resolves the three WADM page shapes incl. paginated AnnotationCollection (`first`/`next` walk) and filters `isOnThisCanvas`. The most complete Presentation-3.0 annotation-resolution logic surveyed; lift the shape-discrimination, swap `fetch` for our loader.

### immarkus — React annotator, WADM JSON-LD export + IIIF import
- **WADM JSON-LD export** — `IIIF/immarkus/src/store/export/exportAnnotationsAsJSONLD.ts:10` — COUPLED(React/store+DOM) — context: flat `W3CAnnotation[]` export (a bare array, NOT an AnnotationPage) via blob download; crosswalks internal IDs → Canvas URI. Confirms a flat-array export is the easy default — and that it is NOT Presentation-3.0-conformant (we need the AnnotationPage wrapper).
- **Content-hash via `murmurhash`** — `IIIF/immarkus/src/pages/images/IIIFImporter/importAnnotations.ts:1` — PURE (pattern) — context: hashes for stable naming. A liftable content-hash approach (cf. annomea's URN).
- **Parse via Annotorious `parseW3CImageAnnotation`** — `importAnnotations.ts:4,50` — COUPLED(Annotorious) — context: delegates WADM→shape to the SAME `W3CImageFormat` family `_FRAMING.md` flags as lossy on non-rect SVG. Do not treat as canonical.
- **Lossy body crosswalk** — `importAnnotations.ts:73` — PURE but LOSSY — context: drops every non-text body and concatenates remaining TextualBodies to one comment; strips HTML to innerText. A clear anti-pattern for our multi-body/Sound/Video requirement.
- **Multi-body classify helpers** — `IIIF/immarkus/src/utils/annotation.ts:4,32` — PURE — context: `getEntityBodies`/`getLastEdit` filter bodies by `purpose`/`source` and reduce timestamps across bodies. Liftable multi-body querying if we add classifying bodies.

### wadm-roundtrip — round-trip prototype, verdict already in `_FRAMING.md`
- **`normalizeFragmentValue`** — `wadm-roundtrip/index.html:263` — PURE — context: `xywh=pixel:` → `xywh=` (pixel is default unit). The exact cosmetic normalization that makes Rect round-trips lossless; lift for our comparator.
- **`structuralDiff` / `normalizeBody`** — `wadm-roundtrip/index.html:253,267` — PURE — context: selector-type + body (object↔array, drop auto-IDs) + motivation + SVG-whitespace diff. A ready-made WADM equivalence checker for our test harness.
- **Selector test fixtures (Rect/Polygon/Ellipse/Path)** — `wadm-roundtrip/index.html:125,146,163,180` — PURE (data) — context: canonical FragmentSelector + SvgSelector input shapes; reusable conformance fixtures. **Verdict (`wadm-roundtrip/README.md`):** Rect+Polygon PASS; Ellipse+Path FAIL (silent geometry corruption — adapter's SVG parser expects a DOM Node, gets a string).

### papadam — NEGATIVE/adapter donor: W3C-shaped emit, NOT WADM-native (mismatch flag)
- **W3C template-fill serializer** — `papadam/api/papadapi/annotate/models.py:155-180` + `annotate/annotation_structure.json` — PURE(template-fill) — `copy.deepcopy(ref_json)` then sets `target.id`, `target.selector.value`, `body[].value`. Emits a W3C-*shaped* JSON on read; storage is custom (`media_target="t=22.5,37"` temporal FragmentSelector, `annotate/models.py:64`) + a binary Y.js CRDT blob, **NOT** a WADM `AnnotationPage`. **Anti-example** for conformance; useful only as an "adapt-to-W3C-at-serialize-time" pattern. Real WADM lives in cozy-iiif/manifesto.

## Pure-logic extractables (the gold)
| Capability | Source `file:line` | Pure? | Depends on | Extraction effort | Maps to our need |
|---|---|---|---|---|---|
| AnnotationPage builder | `annomea/src/data/wadm.ts:6` | PURE | none | trivial (copy) | Export top-level, Presentation-3.0 conformant |
| FragmentSelector builder | `annomea/src/data/wadm.ts:19` | PURE | none | trivial | `xywh=` axis-aligned rects |
| SvgSelector wrapper | `annomea/src/data/wadm.ts:28` | PURE | none | trivial | circle/point/polygon/Path container (no parse — see gap) |
| Annotation factory | `annomea/src/data/wadm.ts:60` | PURE | none | trivial | per-region annotation |
| Content-hash URN | `annomea/src/data/wadm.ts:55` | PURE | hash fn | trivial | content-hash AnnotationPage naming |
| Body↔array normalize pair | `annomea/src/data/bodies.ts:10,18` | PURE | none | trivial | multi-body serialize/parse (single canonical module) |
| Body classifiers (media/describing/tagging) | `annomea/src/data/bodies.ts:26,34,41` | PURE | none | trivial | multi-body discrimination, Annotorious-lenient |
| WADM type surface (Choice/Sound/lang) | `annomea/src/shared/types.ts:37,55,69,81` | PURE | none | trivial | our exact model types |
| AnnotationPage ID minting (namespaced) | `cozy-iiif/.../import-annotations.ts:9` | PURE | none | low | alt naming convention; page shape |
| target.source → canvas routing | `cozy-iiif/.../import-annotations.ts:67` | PURE | none | low | per-image scope routing |
| AnnotationPage resolution (embedded/ref/partOf+pagination) | `cozy-iiif/.../fetch-annotations.ts:10` | PURE-ish | `fetch` | low (swap loader) | full Presentation-3.0 page-shape handling |
| `xywh=pixel:` normalization | `wadm-roundtrip/index.html:263` | PURE | none | trivial | lossless Rect comparison |
| WADM structural-diff / body-normalize | `wadm-roundtrip/index.html:253,267` | PURE | none | low | round-trip test harness |
| content-hash (murmur) pattern | `immarkus/.../importAnnotations.ts:1` | PURE | murmurhash | trivial | stable naming alternative |

## Gaps — what NO surveyed repo solves
1. **Multi-language `Choice` is typed but never emitted or rendered.** annomea defines `WadmChoiceBody { items: TextualBody[] }` (`shared/types.ts:81`) and only *excludes* it in a predicate (`bodies.ts:35`); no module builds or renders a `Choice`. immarkus/field-studio "Choice" hits are IIIF Presentation *label* Choice (manifest-level), not annotation-body multi-lang. **No surveyed repo round-trips a multi-language annotation body.** Build-it-ourselves territory.
2. **Lossless non-rect `SvgSelector` (Ellipse/Path) — unsolved everywhere.** annomea's `svgSelector` only wraps a string (no parse — `wadm.ts:28`); immarkus delegates to the Annotorious `W3CImageFormat` family that `_FRAMING.md` proves silently corrupts Ellipse (`NaN`) and Path (Q/T curves stripped); cozy doesn't touch geometry; wadm-roundtrip *documents* the failure (`README.md`) but does not fix it. The recommended pre-parse-SVG-ourselves mitigation exists in no repo.
3. **No repo emits a Presentation-3.0 `AnnotationPage` export *with* lossless non-rect selectors** — immarkus exports a bare flat array (not even wrapped); annomea/cozy build correct page shapes but inherit gap #2. The conformant-wrapper + lossless-geometry combination is unmet.

## Verdict for our build (lift / study / avoid, and why)
- **LIFT (verbatim):** `annomea/src/data/wadm.ts` + `bodies.ts` + the WADM types in `shared/types.ts`. They are explicitly pure, self-documented, already encode our title-vs-note and Sound-not-Audio decisions, and the bodies-module header records the exact drift bug that justifies one canonical module. This is our data-model spine.
- **LIFT (low effort):** cozy-iiif `fetch-annotations.ts` page-shape resolution (embedded/referenced/`partOf` pagination) — the most complete Presentation-3.0 annotation-resolution logic surveyed; swap `fetch` for our loader. And wadm-roundtrip `normalizeFragmentValue` + `structuralDiff` for our round-trip test harness/fixtures.
- **STUDY:** cozy-iiif `import-annotations.ts` namespaced ID minting + `target.source` routing — useful patterns for per-image scope, but our content-hash URN (annomea) is the chosen naming.
- **AVOID:** immarkus `crosswalkAnnotationBody` (drops all non-text bodies — fatal for our multi-body Sound/Video model) and any reliance on Annotorious `parseW3CImageAnnotation`/`W3CImageFormat` as the *canonical* lossless adapter for non-rect SVG (proven corruption). Wrap/pre-parse SVG ourselves for Ellipse/Path, per `_FRAMING.md` mitigation.
