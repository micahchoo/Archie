# Axis 14 — Import / format interop & round-trip

## Focused question
How do prior-art repos INGEST existing data (IIIF manifests, W3C/legacy annotations, Tropy exports, CSV/spreadsheet, EXIF, OCR/ALTO) and round-trip with other tools — so adoption has an on-ramp and an exit story?

## Sources surveyed
- `IIIF/cozy-iiif` — IIIF manifest parse/normalize (P2→P3), resource-from-URL — **opened**
- `IIIF/annotorious` — W3C selector parse/serialize (the round-trip fidelity locus) — **opened**
- `IIIF/manifesto` — IIIF model lib (language maps) — **opened (thin for this axis)**
- `field-studio` — exceljs metadata export + exifreader EXIF — **opened**
- `tropy` — alto-xml OCR ingest, jsonld, edtf dates, JSON-LD export schema — **opened**
- `IIIF/mirador` — loading external (P2/P3) annotation lists — **opened**

## Findings by source

### cozy-iiif — IIIF manifest parse/normalize, the P2→P3 on-ramp
- **Parse any URL → typed resource (Manifest/Collection/Image)** — `IIIF/cozy-iiif/src/Cozy.ts:31` (`parseURL`) + `:89` (`parse`, branches on `@context`/`type`) — PURE — context: drops a bare URL, fetches, classifies, normalizes. This is exactly our "ingest an existing manifest" entry point.
- **Presentation 2 → 3 normalization** — `IIIF/cozy-iiif/src/Cozy.ts:2` (`convertPresentation2` from `@iiif/parser`) — PURE — context: legacy P2 manifests upgraded to P3 transparently; our AnnotationPage export must be P3, so ingest must normalize P2 too.
- **Image-service identification (level/version from any service URL)** — `IIIF/cozy-iiif/src/core/image-service.ts:19` (`parseImageService`), `:11` (`isImageService`), `:60`/`:91` (URL builders) — PURE — context: classifies IIIF Image API level0/1/2 + v2/v3 — the consumption side of tiled-mode v2.
- **Import external W3C annotations onto a canvas/manifest** — `IIIF/cozy-iiif/src/helpers/import-annotations.ts:40` (`importAnnotationsToCanvas`), `:67` (`...ToManifest`, associates by `target.source`) — PURE — context: attaches an AnnotationPage with `{canvas.id}/.../page/pN` naming — maps to our per-image AnnotationPage scope.
- **Fetch + recursively follow `next`/`partOf` annotation pages** — `IIIF/cozy-iiif/src/helpers/fetch-annotations.ts:10` (`fetchAnnotationPage`, throttled paging) `:56` (`isOnThisCanvas` target filter) — PURE — context: hydrates external annotation lists; our consumer can reuse for ingesting third-party WADM pages.

### annotorious — W3C selector parse/serialize (round-trip fidelity money lines)
- **Parse W3C `SvgSelector` → shape** — `IIIF/annotorious/packages/annotorious/src/model/w3c/svg/SVGSelector.ts:205` (`parseSVGSelector`), dispatch to `:28` polygon / `:41` `parseSVGEllipse` / `:174` `parseSVGPathToPolygon` — PURE — context: **these are the exact loci of the `_FRAMING.md` Ellipse/Path silent-corruption verdict** (Ellipse→NaN, Path Q/T curves stripped via `pathParser.ts:162 parsePathCommands` which handles only M/L/H/V/C/Z — no Q/T/S/A).
- **Serialize shape → W3C selector** — `SVGSelector.ts:231` (`serializeSVGSelector`) + `fragment/FragmentSelector.ts:69` (`serializeFragmentSelector` → `xywh=pixel:`) — PURE — context: `_FRAMING.md` marks the SERIALIZE direction (user-drawn Ellipse/Path → WADM) **UNTESTED** — this is the open hole.
- **Parse `FragmentSelector` `xywh`** — `fragment/FragmentSelector.ts:31` (`parseFragmentSelector`, regex strips `pixel:`/`percent:`) — PURE — context: rect ingest; PASS per verdict.
- **Top-level W3C adapter** — `model/w3c/W3CImageFormatAdapter.ts:22` (`W3CImageFormat`), `:36` parse / `:89` serialize — PURE — context: the documented-for-built-in-shapes-only adapter (anvil R7); wraps body/user parse from `@annotorious/core`.

### tropy — OCR/ALTO ingest, JSON-LD round-trip, EDTF dates
- **ALTO OCR XML → plain text** — `tropy/src/commands/transcription/create.js:2,28` and `commands/api/transcription.js:3,21` (`Document.parse(data).toPlainText()` from `alto-xml` pkg) — PURE (the `alto-xml` lib; tropy's call is COUPLED(redux-saga)) — context: ingest OCR/HTR transcripts → a TextualBody. NB: `components/transcription/alto.js` is only the React renderer, not the parser.
- **JSON-LD normalize/expand on import** — `tropy/src/common/import.js:8` (`normalize`, injects `@context`/`@graph`, `expand`) using `common/json.js:36` (lazy-loaded `jsonld.expand`) — PURE-ish (jsonld lib) / COUPLED(tropy ontology) — context: how Tropy ingests its own JSON-LD; pattern for our WADM JSON-LD ingest.
- **JSON-LD export schema (the round-trip contract)** — `tropy/src/common/export.js:3` (`ctx` item/photo/note context shapes), `:50` (`props`) — COUPLED(tropy ontology) — context: defines the exact export format other tools must read — our exit-story analogue is the AnnotationPage shape.
- **EDTF date parse/format** — `tropy/src/format.js:1,11,17` (`edtf(value)` + `edtfFormat`) — PURE (the `edtf` lib) — context: normalize fuzzy/historical dates (`created`/`navDate`) — directly reusable for WADM date fields & axis-15 provenance.

### field-studio — spreadsheet + EXIF (one real, one stub)
- **Excel/CSV metadata export** — `field-studio/src/features/export/model/directExports.ts:58` (`serializeMetadataCSV`, PURE), `:142` (`downloadMetadataExcel`, lazy `import('exceljs')` → workbook) — `serialize*` PURE / download COUPLED(browser) — context: metadata exit story (CSV/xlsx); our Gallery/metadata export can lift the pure serializer.
- **EXIF extraction — STUB, dep declared but never wired** — `field-studio/src/shared/workers/ingest.worker.ts:350` (`extractMetadata`) `:351` literal comment `// In a real implementation, we'd use ExifReader`; only file name/size/type pushed — **inferred-gap (opened, confirmed)** — context: `exifreader` is a declared dep with zero parse logic. EXIF→IIIF metadata is unsolved in the corpus.

### mirador — loading external (legacy) annotation lists
- **Crosswalk by type: P3 AnnotationPage vs P2 OpenAnnotation list** — `IIIF/mirador/src/lib/AnnotationFactory.js:10` (`determineAnnotation` branches on `json.type === 'AnnotationPage'` else `AnnotationList`) — PURE — context: canonical "load a legacy `oa:` annotation list" path — our backward-compat ingest.
- **Legacy selector handling incl. `oa:Choice` + `oa:SvgSelector`** — `IIIF/mirador/src/lib/AnnotationResource.js:78` (Choice→default), `:95` (SvgSelector), `:105` (fragmentSelector) — PURE — context: real-world dirty-data selector extraction from P2 lists. (a11y/i18n facets of mirador covered by axes 12/13.)

### manifesto — thin for this axis
- **Language-map flatten (multi-lang label ingest)** — `IIIF/manifesto/src/LanguageMap.ts` (`getValue`) — inferred PURE — context: cozy-iiif already covers IIIF parse via `@iiif/parser`; one citation suffices, not padding.

### papadam — tarball I/O + W3C-shaped emit on its OWN schema (not lossless WADM)
- **Import/export + W3C template-fill serializer** — `papadam/api/papadapi/importexport/` (tasks.py/serializers.py); `papadam/api/papadapi/annotate/models.py:155-180` — COUPLED(Django) — tarball import/export of archive+annotations, plus a deepcopy-into-`annotation_structure.json` emit. Interop is on papadam's own schema (temporal target, CRDT-backed), NOT lossless WADM round-trip — annotorious `W3CImageFormat` still owns SVG-selector interop.

## Pure-logic extractables (the gold)
| Capability | Source `file:line` | Pure? | Depends on | Effort | Maps to our need |
|---|---|---|---|---|---|
| Parse arbitrary URL → typed IIIF resource | `cozy-iiif/src/Cozy.ts:31,89` | PURE | `@iiif/parser`, `@iiif/presentation-3` | Low (use lib) | Ingest existing manifest |
| P2→P3 manifest normalization | `cozy-iiif/src/Cozy.ts:2` | PURE | `@iiif/parser` | Low | P3-conformant ingest |
| Image-service level/version classify | `cozy-iiif/src/core/image-service.ts:19` | PURE | `@iiif/presentation-3` | Low | Tiled-mode v2 source detect |
| Import W3C annotations → canvas/manifest | `cozy-iiif/src/helpers/import-annotations.ts:40,67` | PURE | — | Low | Per-image AnnotationPage attach |
| Recursive annotation-page fetch (`next`/`partOf`) | `cozy-iiif/src/helpers/fetch-annotations.ts:10` | PURE | `p-throttle` | Low | Ingest third-party WADM pages |
| Parse/serialize W3C SvgSelector + xywh | `annotorious/.../svg/SVGSelector.ts:205,231` `fragment/FragmentSelector.ts:31,69` | PURE | DOM (parse expects Node) | Med (fix Ellipse/Path) | WADM round-trip — fidelity fix |
| ALTO OCR XML → text | `tropy/.../transcription/create.js:28` | PURE (`alto-xml`) | `alto-xml` | Low | OCR/HTR → TextualBody |
| EDTF historical-date parse/format | `tropy/src/format.js:11,17` | PURE (`edtf`) | `edtf` | Low | WADM/provenance dates |
| CSV/Excel metadata serialize | `field-studio/.../directExports.ts:58,142` | PURE (CSV) | `exceljs` (xlsx) | Low | Metadata exit story |
| P3-vs-P2 annotation-list crosswalk | `mirador/src/lib/AnnotationFactory.js:10` | PURE | — | Low | Legacy `oa:` ingest |

## Gaps — what NO surveyed repo solves
- **EXIF → IIIF/WADM metadata ingest is unsolved.** field-studio declares `exifreader` but `ingest.worker.ts:351` is a stub; no other repo extracts EXIF. Camera/GPS/capture-date → `navDate`/metadata is greenfield.
- **No lossless non-rect SvgSelector round-trip.** Annotorious parse corrupts Ellipse/Path (verdict) and the serialize direction is untested — the single biggest fidelity hole. Every other repo (mirador, cozy) only *reads* selectors; none fixes the Ellipse/Path corruption.
- **No Recogito/Hypothesis-specific adapter** in corpus — only generic W3C/oa parsing (mirador, annotorious). Their non-standard bodies (Hypothesis `tags`, Recogito relations) would drop silently.

## Verdict for our build (lift / study / avoid)
- **LIFT:** `cozy-iiif` parse/normalize/import helpers (`Cozy.ts`, `image-service.ts`, `import-annotations.ts`, `fetch-annotations.ts`) — closest fit to our ingest needs, PURE, already P3-native via `@iiif/parser`. `edtf` and `alto-xml` libs directly. field-studio's pure CSV serializer.
- **STUDY (then fix):** annotorious `SVGSelector.ts` parse/serialize — must repair the Ellipse/Path branch (`parseSVGEllipse:41`, `parseSVGPathToPolygon:174`, `pathParser:162` lacks Q/T/S/A) and add a pre-parse-SVG mitigation per `_FRAMING.md`; verify the untested serialize direction. mirador `AnnotationFactory` for the legacy-list crosswalk shape.
- **AVOID:** relying on field-studio EXIF (stub) or tropy's ontology-coupled JSON-LD export schema as-is (COUPLED(tropy)); build our own EXIF reader and reuse only the `edtf`/`jsonld` normalize *pattern*, not the schema.
