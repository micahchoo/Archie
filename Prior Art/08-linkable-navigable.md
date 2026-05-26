# Axis 08 — Linkable / Navigable Annotations

## Focused question
How do prior-art repos make annotations addressable and navigable — a URI/URL scheme for a region, a prose link that pans/zooms the canvas to a region (the `fitBounds` lesson), annotation→annotation links, and link "scent" (fig-chips/glyphs) in prose?

## Sources surveyed
- `annomea` — read-side linking audit + ported `anvil://` parser & NarrativePane — **y (deep)**
- `anvil` — the planned product: `anvil://` grammar, IIIF Content State URLs, fitBounds-on-select, scroll-sync — **y (deep)**
- `quire` — `ref` shortcode (prose→region link) + `canvas-panel.js` viewport driver — **y (deep)**
- `canvases-annotations-sharing/Research-Narratives` — node-graph spatial connections + `zoomToFeature` (maplibre, not OSD) — **y**
- `juncture` — Vue visual-essay + OSD/annotorious viewer — **y (shallow): no prose-link→region-nav contract found**
- `BIIIF/beehive_poster_viewer` — OSD + Annotorious-OSD poster viewer, shareable viewport URLs — **y (shallow, coverage-sweep add)**

## Findings by source

### annomea — read-side linking root cause + the ported scheme
- **`anvil://` 5-kind URI parser** — `annomea/src/data/anvil-uri.ts:51` (`parseAnvilUri`), `:124` (`buildAnvilUri`) — **PURE** — context: byte-identical copy of anvil's grammar (annotation/image/section/region/tour); region form carries `<hash>:<xywh>`. The lift-able addressing primitive.
- **Narrative link delegation** — `annomea/src/viewer/NarrativePane.svelte:80-110` — COUPLED(Svelte) — context: click-delegate parses `anvil://`, dispatches `annotation`→`onAnnotationRef`, `region`→`onRegionRef(xywh)`, `image`→`onImageRef`, `section`→in-pane scroll. The `[fig:]` chip handler (`:85-92`) is the link-scent affordance.
- **Canvas→narrative scroll-sync controller** — `annomea/src/viewer/NarrativePane.svelte:139-151` (`scrollToRef`/`setActiveRef`) + scroll-spy IntersectionObserver `:159-209` — COUPLED(Svelte) — context: host drives pane scroll on selection; rAF-coalesced spy highlights the in-view ref WITHOUT pan/zoom (passive — pan reserved for explicit clicks). This is the audit-#2/#4 fix, already built.
- **ROOT-CAUSE lesson (the whole axis)** — `annomea/READ-SIDE-LINKING-NARRATIVE-AUDIT.md:21` — inferred — context: navigable annotations require `fitBounds` + live anchor recompute, not just selection wiring. annomea selected-without-panning (`openAnnotation` had no fitBounds); anvil calls it on every selection. **The defining constraint for our build.**

### anvil — the canonical patterns
- **fitBounds-on-select** — `anvil/app/src/App.svelte:1115` (`viewer.annotator.fitBounds(id)`, try/catch `:1117-1118`) + `anvil/app/src/embed/EmbeddedReader.svelte:326,440,461,703` — COUPLED(Annotorious/OSD) — context: the actual pan/zoom-to-region call. `fitBounds` can throw on unresolvable geometry → wrap in try/catch, selection still succeeds.
- **Live popup-anchor recompute** — `anvil/app/src/embed/EmbeddedReader.svelte:522-523` (`viewer.addHandler('animation'…)` + `'viewport-change'`) — COUPLED(OSD) — context: re-derives the popup reference rect on every viewport motion so the popup tracks the region during pan/zoom (audit #4).
- **Canvas→narrative scroll-sync** — `anvil/app/src/embed/EmbeddedReader.svelte:563-567` (`selectionChanged`→`getElementById('anvil-ref-N')`→`scrollIntoView`) + `:374` selection handler — COUPLED(Svelte/Annotorious) — context: selecting a region scrolls the prose to its mention; emits `anvil-ref-N` ids in the renderer.
- **urn → narrative-ref resolver** — `anvil/app/src/lib/select-mention.ts:14` (`selectMention`) — **PURE** — context: given the refs list + selected urn, picks which prose mention to scroll to (first-match by doc order; ADR-0015 §F3 defers richer tiebreakers). Pure array scan, zero framework deps.
- **IIIF Content State deep-link URL** — `anvil/app/src/lib/share-url.ts:35` (`encodeContentState`), `:62` (`decodeContentState`), `:85` (`detectLegacyAnnotationParam`) — **PURE** — context: encodes annotation+canvas+selector as `?iiif-content=<base64url(JSON)>` per IIIF Content State (ADR-0022). **The standards-aligned, cross-tool URL form** — the only addressing here that other IIIF viewers can consume.
- **fig-chips + per-kind link glyphs** — `anvil/app/src/lib/NarrativeRenderer.svelte:41-45` (`[fig:id]`→`<span class="fig-chip">`◉), `:75-81` (`anvil-link-<kind>` + `anvil-ref-N` id emission), `:272-281` (◉/▦/§ glyph CSS) — COUPLED(Svelte) — context: the link-SCENT layer — readers SEE which prose spans are clickable region refs. annomea's renderer was stripped of this (audit #3).

### quire — prose→region link contract (a near-exact analog)
- **`ref` shortcode** — `quire/packages/11ty/_plugins/shortcodes/ref.js:60-83` — COUPLED(11ty) — context: prose-side `{% ref fig="x" anno="…" region="x,y,w,h" %}` emits `<a class="ref" data-annotation-ids data-region data-on-scroll>`. Directly mirrors our `anvil://region/<hash>:<xywh>` — region = `"x,y,width,height"`.
- **region-string → target parser** — `quire/.../application/canvas-panel.js:53` (`getTarget(region)` → `{x,y,width,height}`) — **PURE** — context: parses the comma xywh string; lift-able, same job as our FragmentSelector `xywh=` split.
- **link→viewport drive + URL sync** — `quire/.../canvas-panel.js:242-269` (`.ref` click/scroll → `goToFigureState`), `:127-128` (`params.set('region', …)`), `:298-314` (drives `canvas-panel` web component to the region) — COUPLED(canvas-panel WC) — context: the click→fitBounds equivalent AND writes `?region=` to the URL — region focus IS URL state. `data-on-scroll` variant uses IntersectionObserver, matching annomea's scroll-spy.

### Research-Narratives — graph-node spatial connections (different metaphor)
- **node↔region connection store + zoom-to** — `src/components/ResearchMap.svelte:52-94` (`$connections` set, source/target node+anchor) + `src/components/nodes/MarkupNode.svelte:131` (`zoomToFeature(feature, map)`) — COUPLED(Svelte/maplibre) — context: annotation↔annotation links modeled as graph edges between narrative/annotation nodes; clicking flies the map to the feature.
- **geometry→viewport-center** — `src/utils/mapMovements.mjs` `zoomToFeature` — **PURE-ish (Turf dep)** — context: Polygon/Line/Point → `centerOfMass` → `flyTo`. Maps to "given a region geometry, where do I center the viewport" — but it's maplibre geo, not OSD image-pixel space; algorithm transfers, API doesn't.

### BIIIF/beehive_poster_viewer — shareable viewport-state URL (zoom + bounds + lang), no prose-link contract
- **Shareable URL captures zoom level + viewport bounds** — `BIIIF/beehive_poster_viewer/beehive_poster_viewer/README.md:10` — COUPLED(OSD/Annotorious-OSD) — context: a chain-link button generates a URL "pointing to the specific portion of the poster... including the zoom level and boundaries" — same deep-link-to-region intent as anvil's IIIF Content State URL, but encodes raw OSD viewport (zoom+bounds) rather than a standards `iiif-content` selector. Validates the shareable-region-URL affordance; not a cross-tool-consumable form.
- **`?poster=&lang=` query-param routing** — `BIIIF/beehive_poster_viewer/beehive_poster_viewer/README.md:15-18` — COUPLED(static) — context: poster selection + narrative language are URL params (`/posterViewer/?poster=mr&lang=es`). Narrative is a separate XML file defining scenes/order/text/boundaries (`:26`) — a markup-driven narrative model, not prose-link→region. Honest finding: linkable at the *document/viewport* level, no per-region prose-anchor contract.

### juncture — shallow surveyed, no region-nav found
- **OSD + annotorious viewer** — `juncture/components/Image.vue:2-5,71-73` — COUPLED(Vue/OSD) — context: loads annotorious-openseadragon 2.5.3; has an annotation navigator (next/prev cursor, `:27-43`). Surface scan found **no prose-link→region viewport-nav contract** (no `data-region`, no fitBounds-from-text). VisualEssay (`:53-73`) does scroll/entity events, not canvas region nav. Honest finding: juncture's text↔image link is entity/scroll-driven, not region-addressed.

### papadam — DB-FK links (media↔annotation, threaded), no URI scheme, no fitBounds
- **Cross-media + threaded annotation links** — `papadam/api/papadapi/media_relation/views.py:97-115` (`media_ref` → another MediaStore); ARCHITECTURE.md:207-208 (`reply_to` threaded annotation→annotation) — COUPLED(Django) — links are server DB FKs queried via REST, NOT a deep-linkable URI scheme. No `anvil://`-style addressing, no `fitBounds` (papadam is temporal/media, not spatial). anvil's URI + fitBounds-on-select story is unchallenged.

## Pure-logic extractables (the gold)
| Capability | Source `file:line` | Pure? | Depends on | Extraction effort | Maps to our need |
|---|---|---|---|---|---|
| `anvil://` 5-kind URI parse/build | `annomea/src/data/anvil-uri.ts:51,124` | PURE | none | trivial (copy) | Our region/annotation/section/image addressing grammar verbatim |
| IIIF Content State deep-link encode/decode | `anvil/app/src/lib/share-url.ts:35,62` | PURE | none (btoa/atob) | trivial (copy) | Standards-aligned `?iiif-content=` URL — cross-tool shareable region links |
| Legacy `?annotation=` URL detect | `anvil/app/src/lib/share-url.ts:85` | PURE | none | trivial | URL-state migration on load |
| urn → narrative-ref resolver | `anvil/app/src/lib/select-mention.ts:14` | PURE | a `NarrativeRef[]` type | trivial | Canvas-select → which prose mention to scroll to |
| region-string `"x,y,w,h"` → target | `quire/.../canvas-panel.js:53` | PURE | none | trivial | Parse FragmentSelector `xywh=` for fitBounds |
| geometry → viewport-center | `Research-Narratives/.../mapMovements.mjs` | PURE-ish | Turf | low | Center-of-region math (re-impl in pixel space) |

## Gaps — what NO surveyed repo solves
1. **Non-rectangle (SvgSelector) region deep-links.** Every region-addressing scheme surveyed is **xywh-only**: anvil's `anvil://region/<hash>:<xywh>`, quire's `data-region="x,y,w,h"`, IIIF Content State's FragmentSelector. None addresses a polygon/ellipse/Path region by selector — a reader can't deep-link to a non-rect drawn shape. Given our locked `SvgSelector` support + the round-trip FAIL on Ellipse/Path, **this is the gap that bites us hardest**: navigable links to non-rect regions are unsolved prior art.
2. **Cross-AnnotationPage annotation→annotation links in a PUBLISHED exhibit.** anvil has `urnToHash`+`goToPage` for multi-image (in-app, `EmbeddedReader.svelte:407` page handler); Research-Narratives links nodes via a server-backed graph (Supabase). No surveyed repo does annotation→annotation links *across pages of a static, serverless published exhibit*.

## Verdict for our build (lift / study / avoid)
- **LIFT verbatim:** `anvil-uri.ts` (the grammar — already proven, already copied into annomea) and `share-url.ts` (IIIF Content State — the only cross-tool standards URL). Both PURE, both ours, zero risk.
- **LIFT (small):** `select-mention.ts` and quire's `getTarget` — trivial pure helpers.
- **STUDY as the load-bearing lesson:** the annomea audit root-cause — `openAnnotation` MUST call `fitBounds(urn)` (try/catch) + recompute the popup anchor on `animation`/`viewport-change`. Selection-without-pan is the documented failure; do not repeat it. Quire's `ref`→`canvas-panel` flow is the cleanest end-to-end analog (prose link → region nav → `?region=` URL sync) and validates `data-region`/`data-on-scroll` as the wiring shape; adapt its IntersectionObserver scroll-trigger (anvil/annomea already converged on the same).
- **AVOID:** juncture's entity/scroll model (no region addressing) and Research-Narratives' server-graph (Supabase-backed, violates our serverless constraint) as link-architecture templates — borrow only the pure geometry math.
