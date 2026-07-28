# Axis 11 — Search & discovery (full-text + visual similarity + IIIF Content Search + faceted browse)

## Focused question
How do prior-art repos make annotation/metadata content findable — full-text indexing, visual/region similarity search, IIIF Content Search API, faceted gallery browse — and what is PURE-liftable for an Exhibit that wants to be a research instrument, not just a viewer?

## Sources surveyed
- `IIIF/browser-visual-search` — FastSAM+CLIP+onnxruntime-web in-browser region embedding/similarity — **opened** (`src/`)
- `IIIF/iiif-visual-search` — Astro/React UI wiring of browser-visual-search — **opened** (hook)
- `field-studio` — flexsearch + Content Search 2.0 client + facet computer — **opened** (gold)
- `tropy` — claimed flexsearch+ALTO; **opened** — flexsearch ABSENT, ALTO-only
- `IIIF/clover-iiif` — Content Search UI/index — **opened** (`search-helpers.ts`, `ContentSearch.tsx`)
- `IIIF/mirador` — Content Search API client (protocol slice only) — **opened** (`actions/search.js`)

## Findings by source

### IIIF/browser-visual-search — PURE region→similar-region ML (the gold; already in corpus, unconnected to annotation)
- **CLIP region embedding** — `IIIF/browser-visual-search/src/embedding/embed.ts:54` — PURE (depends: onnxruntime-web) — context: crops a bbox to a 224² CLIP tensor with ImageNet mean/std, runs ONNX, L2-normalises a 512-dim vector. `embedImage(blob, bbox)` takes EXACTLY a Region bbox — maps 1:1 to embedding a drawn SvgSelector/FragmentSelector region.
- **Cosine nearest-neighbours** — `IIIF/browser-visual-search/src/search-index/index.ts:63` — PURE — context: dot-product (vectors pre-normalised) over all segment embeddings, sort, top-K. Region→similar-regions in one function.
- **FSA-persisted embedding store** — `IIIF/browser-visual-search/src/search-index/index.ts:157` — PURE — context: `index.json` (per-image segment bbox+area+row) + flat `embeddings.bin` Float32 blob written via File System Access API — same `FsaFilesystem` persistence model anvil already uses; `.visual-search/` sibling to `.anvil/`.
- **FastSAM auto-segmentation** — `IIIF/browser-visual-search/src/segmentation/segment.ts:14` — PURE (depends: onnxruntime-web) — context: detects candidate regions in-browser → bbox list. Feeds AI-assisted authoring (axis 19); here it's the *index build* source. Batch embed at `embedding/embed.ts:74`.

### field-studio — Content Search API 2.0 client + local full-text index + facets (framework-agnostic, single best lift)
- **Content Search 2.0 remote client** — `field-studio/src/shared/services/searchService.ts:167` — PURE — context: `queryRemoteSearch(serviceId, {q,motivation,date,user}, authToken)` builds URLSearchParams, bare `fetch`, parses the AnnotationPage response. This is the IIIF Search protocol with ZERO React/Svelte — mirador/clover do the same coupled to Redux/Vault.
- **AnnotationPage→results parse + paging** — `searchService.ts:193` — PURE — context: `parseSearchResponse` walks `page.items`, `page.partOf.total`, `page.next.id`, lifts TextQuoteSelector highlights from the extended `annotations` array. Conformant Search 2.0 response handling.
- **Annotation/metadata → index entries** — `searchService.ts:46` — PURE — context: `buildIndexEntries` extracts label/summary/metadata/annotation-body+tag fields (per-language) from IIIF entities into flat searchable rows. THIS is the closing-the-loop wiring: TextualBody + tags become full-text searchable. Maps directly to our per-image AnnotationPage bodies.
- **Additive scoring + snippet highlight** — `field-studio/src/shared/lib/search/queryEngine.ts:61` — PURE — context: tokenise → field-weighted additive score (exact 100 / startsWith 50 / contains 20 / metadata+body 5 / token 10), tie-break alpha, `extractSnippet` (`:139`) with `…`-elision. Wholesale liftable client-side ranker.
- **FlexSearch candidate narrowing** — `field-studio/src/shared/lib/search/searchIndex.ts:95` — PURE (depends: flexsearch lib) — context: forward-tokenised FlexSearch narrows candidates before the O(n) scorer; falls back to full set on empty (preserves substring matching). Library dep, not framework coupling.
- **Facet count derivation** — `field-studio/src/shared/lib/search/facetComputer.ts:27` — PURE — context: `computeFacets(results, dimensions)` counts distinct accessor values per dimension (entityType/field/language). Drives faceted gallery browse over `exhibits.json` with no backend.
- **TextQuoteSelector highlight helpers** — `searchService.ts:133,145` — PURE — context: `extractHighlight`/`generateHighlight` build prefix/exact/suffix from selector OR raw offsets — bridges local-index and remote-Search-API results into one highlight shape.

### tropy — ALTO transcription ingest (NOT flexsearch — brief assumption corrected)
- **ALTO OCR ingest** — `tropy/src/commands/transcription/create.js` — inferred: COUPLED(Electron/redux) — context: ALTO-XML → transcription text. The full-text *source* for OCR'd canvases, but no search index in tropy. `tropy/src/components/transcription/alto.js` renders it. NOTE: brief claimed "flexsearch + ALTO" — `grep flexsearch tropy/src` = 0 hits. ALTO ingest is the only finding here; relevant to axis 19 (auto-transcript → body), not a search-index lift.

### clover-iiif / mirador — Content Search protocol shape only (redundancy guard: UI/i18n/a11y → other axes)
- **Snippet windower** — `IIIF/clover-iiif/src/lib/search-helpers.ts:1` — PURE — context: `getSearchResultSnippet` word-boundary-aware context window around a match. Smaller cousin of field-studio's `extractSnippet`; field-studio's is richer (structured prefix/exact/suffix), prefer it.
- **Content Search request/state protocol** — `IIIF/mirador/src/state/actions/search.js:11` (request/receive/failure/remove) + service-id resolution `IIIF/clover-iiif/src/components/Viewer/InformationPanel/ContentSearch/ContentSearch.tsx:95` (`painting.service[0].id || ['@id']`) — COUPLED(React/Redux/Vault) — context: how to *find* the SearchService on a canvas's painting annotation and the request/receive/error state machine. Study for protocol; field-studio already gives the framework-agnostic version. (Full search UI/sagas covered by clover/UV read-side axes.)

### papadam — server-side SQL full-text search (vs client-side donors)
- **Scoped `icontains` annotation search** — `papadam/api/papadapi/annotate/views.py:55-75`; `papadam/api/papadapi/common/functions.py:47-75` — COUPLED(Django ORM) — query by name/tags, scope filter (selected/all/my/public collections). Server SQL, paginated; transcript-content search planned (ARCHITECTURE.md archive picker). clover/mirador own client-side search; papadam owns the server-full-text shape (relevant if we ever add a backend).

## Pure-logic extractables (the gold)
| Capability | Source `file:line` | Pure? | Depends on | Extraction effort | Maps to our need |
|---|---|---|---|---|---|
| Region CLIP embedding | `browser-visual-search/src/embedding/embed.ts:54` | PURE | onnxruntime-web + CLIP onnx | Low (copy fn) | Embed a drawn Region for visual search |
| Cosine top-K NN | `browser-visual-search/src/search-index/index.ts:63` | PURE | — | Trivial | Region → similar regions across exhibit |
| FSA embedding store (json+bin) | `browser-visual-search/src/search-index/index.ts:157` | PURE | FSA API | Low | `.visual-search/` sibling to `.anvil/` |
| FastSAM auto-segment | `browser-visual-search/src/segmentation/segment.ts:14` | PURE | onnxruntime-web | Med (model host) | Index-build region source / axis-19 |
| Content Search 2.0 client | `field-studio/src/shared/services/searchService.ts:167` | PURE | fetch | Trivial | Query remote IIIF SearchService2 |
| AnnotationPage parse + paging | `searchService.ts:193` | PURE | — | Trivial | Conformant Search 2.0 response handling |
| Body/metadata → index entries | `searchService.ts:46` | PURE | — | Low | Make TextualBody + tags full-text searchable |
| Additive scorer + snippet | `field-studio/.../queryEngine.ts:61` | PURE | — | Trivial | Client-side ranked full-text over bodies |
| FlexSearch narrowing | `field-studio/.../searchIndex.ts:95` | PURE | flexsearch | Low | Scale full-text past O(n) scan |
| Facet count derivation | `field-studio/.../facetComputer.ts:27` | PURE | — | Trivial | Faceted gallery browse over `exhibits.json` |
| Highlight helpers (selector/offset) | `searchService.ts:133,145` | PURE | — | Trivial | Unify local + remote result highlights |

## Gaps — what NO surveyed repo solves
- **PRIMARY (the closing-the-loop opportunity, named in brief): visual similarity search is not wired to annotations.** `browser-visual-search` segments+embeds *arbitrary* regions; it never ingests an existing AnnotationPage's Regions, nor lets a user select a drawn Region and find similar ones. `field-studio` makes annotation *text* searchable but has zero visual search. NO repo connects detection→annotation→discovery. The two halves are both PURE and both in-corpus; the join is greenfield (embed each Region's bbox via `embedImage`, store keyed by annotation id, NN on select).
- **SECONDARY: no repo PRODUCES Content Search 2.0 responses from a static host.** Every client (field-studio remote path, mirador, clover) *consumes* a `SearchService2` endpoint that presumes a server. A serverless exhibit must either (a) ship a pre-built static index queried client-side (field-studio's local path — the viable route) or (b) emit a static `AnnotationPage` snapshot per query — neither is demonstrated. The local full-text path is liftable; the standards-conformant static Search *service* is not solved anywhere surveyed.

## Verdict for our build (lift / study / avoid)
- **LIFT wholesale:** `field-studio` `searchService.ts` + `queryEngine.ts` + `facetComputer.ts` + `searchIndex.ts` — a complete framework-agnostic full-text + facet + Content-Search-2.0 layer that already understands IIIF entities and WADM bodies. Drop in, feed it our per-image AnnotationPage bodies.
- **LIFT + JOIN:** `browser-visual-search` `embed.ts` + `search-index/index.ts` — pure region embedding/NN with FSA persistence matching anvil's filesystem model. The build work is the *join* to annotation Regions, not the ML.
- **STUDY (protocol only):** mirador `actions/search.js` request/receive state machine + clover service-id resolution — for how to locate and call a remote SearchService when an imported manifest has one. Don't lift (React/Redux/Vault).
- **AVOID as a search source:** tropy — no index; ALTO ingest belongs to axis 19. Brief's "tropy flexsearch" claim is incorrect (0 hits).
