# Prior-Art Survey — Axes 11–20 (the non-obvious future paths)

The first 10 axes (`00-INDEX.md`) decomposed the literal feature bullets. These 10 are the *second-order* paths — capabilities a real OSD+Annotorious exhibit platform grows into, cross-cutting concerns, and ecosystem pressures not named in the brief but inevitable. Each is surveyable in the corpus (sources listed) and several directly attack the white-space gaps from `00-INDEX.md §Cross-cutting GAPS`. Awaiting survey (wave 3).

Legend: **[corpus]** = repo already present · **[clone]** = incoming clone that strengthens this axis · **→gap** = which `00-INDEX` gap it attacks.

## 11 — Search & discovery (text + visual + IIIF Content Search)
The path from "viewer" to "research instrument": full-text annotation/metadata search, **visual similarity search** (region → similar regions), faceted browse of the gallery, IIIF Content Search API.
- [corpus] `IIIF/browser-visual-search` (FastSAM+CLIP+onnx in-browser — PURE similarity), `IIIF/iiif-visual-search`, `tropy` (flexsearch + ALTO full-text), `field-studio` (flexsearch dep).
- [clone] clover-iiif (search UI), mirador (Content Search API client).
- Why creative: the visual-search engine is *already in the corpus* but unconnected to annotation — closes the loop between detection and discovery. →A,D

## 12 — Accessibility & keyboard navigation
Screen-reader semantics for zoom regions, keyboard-only pan/zoom/annotate, alt-text as a WADM body, focus management for popup/drawer, reduced-motion. Grant/WCAG compliance gates institutional adoption.
- [corpus] `IIIF/openseadragon.github.com` (OSD a11y/keyboard options), `IIIF/immarkus`, `field-studio` (ARIA).
- [clone] mirador (strongest IIIF a11y), clover-iiif. →C

## 13 — Internationalization & localization
UI i18n, RTL, IIIF language maps, language negotiation — and the **unsolved `Choice` multi-lang annotation body** (gap E). Multilingual cultural-heritage is the default, not the exception.
- [corpus] `field-studio/i18n/`, `quire` (i18n), `_FRAMING.md` Choice decision.
- [clone] mirador (i18next + Choice rendering — the one place Choice is real), quire. →E

## 14 — Import / format interop & round-trip
Nobody starts from zero. Ingest existing IIIF manifests, Recogito/Mirador/Hypothesis annotations, Tropy exports, CSV/spreadsheet metadata, EXIF, OCR/ALTO. Interop = adoption + an exit story.
- [corpus] `field-studio` (exceljs, exifreader), `tropy` (alto-xml, jsonld, edtf), `IIIF/cozy-iiif` (manifest parsing).
- [clone] annotorious (canonical import formats), storiiies-editor. →B (round-trip)

## 15 — Provenance, citation & versioning
WADM `creator`/`created`/`modified`/`generator`, citable region URLs/DOIs, exhibit version snapshots, edit history, "as-of" views. Scholarly credibility + reproducibility.
- [corpus] `annomea/src/data/wadm.ts` (agent/date fields), `anvil` ADRs (content-hash naming = natural versioning), `quire` (citation/bibliography).
- [clone] quire (citation), wax. →B (geometry-level history)

## 16 — User-experienced performance
Narrowed to what the reader/author *feels* (R-tree/spatial-index logic stays in axis 10 — don't re-extract): JS bundle budget (anvil ~240 KB gz), lazy/paginated manifest loading, OSD tile prefetch, virtualized annotation lists, perceived load on a cold static host.
- [corpus] `anvil/.perf`, `field-studio` (build/bundle), `IIIF/cozy-iiif` (lazy resolution).
- [clone] mirador (virtualization at scale), clover-iiif.

## 17 — In-browser tile generation / image-processing pipeline
The **missing half of gap A**: an Author drops a 100 MB image into the PWA — where does the DZI / IIIF-Image-API pyramid come from with NO server? OffscreenCanvas + WASM (libvips-wasm / squoosh / sharp-wasm), progressive downscale, tiling in a Worker. EVERY generator in the corpus (biiif, tiny-iiif, canopy, IIIFtoolset) punts this to Node — the "web-publishable serverless" story currently has no tile-*creation* story, and it gates tiled-mode v2.
- [corpus] `IIIF/tiny-iiif` + `iiif-demo` generators (the Node-bound baseline to replace), `anvil` (single-image-now / tiled-later ADR), `IIIF/cozy-iiif` (image-service classification = the consumption side).
- [clone] canopy-iiif (NOTE: Node SSG — *also* punts tiling; confirms the gap, does not close it).
- Why creative: the one piece of serverless publishing no incoming clone fixes — pure greenfield. →A

## 18 — Embedding & ecosystem integration
The **`<web-component>` embed** (annomea ADR-0006 — ABSENT), oEmbed, iframe contracts, IIIF drag-and-drop / Content State sharing, WordPress/Omeka/LMS plugins. Exhibits live *inside* other sites.
- [corpus] `annomea/EMBED-AUDIT.md`, `anvil/app/src/lib/share-url.ts` (IIIF Content State), `juncture` (embed).
- [clone] clover-iiif (ships as a web component — the reference), mirador. →gap "named web-component embed"

## 19 — AI-assisted authoring
The differentiator vs. legacy IIIF tools: auto-region detection (FastSAM), auto alt-text/captioning, OCR/HTR transcription (ALTO), entity linking, CLIP embeddings for semantic search, suggested annotations.
- [corpus] `IIIF/browser-visual-search` (FastSAM+CLIP in-browser — PURE, runs client-side), `tropy` (alto-xml OCR ingest), `field-studio` (`@mariozechner/pi-agent`/`pi-ai` deps).
- [clone] (gap) consider an HTR/transcription tool next round. →A,D (auto-transcript → caption body)

## 20 — Security & content sanitization
Published exhibits display user/third-party annotations = attack surface. XSS in HTML/markdown bodies (dompurify), **SVG injection via `SvgSelector`** (untrusted `<svg>` in annotations — ties to gap B), OAuth token handling in a backend-less SPA, CORS for cross-origin IIIF.
- [corpus] `field-studio` (dompurify, isomorphic-dompurify), `annomea` (body sanitization), `anvil` (OAuth-push design).
- [clone] decap-cms (OAuth-from-SPA without a backend), annotorious (SvgSelector parse safety). →B (SVG handling is also a security surface)

---

## Candidate axes 21+ (overflow — name now, survey if scope warrants)
- **21 Collaboration UX** — presence, comments, roles/permissions, review workflow (distinct from axis-10 *state* mutation; liiive has the presence layer).
- **22 Rights & licensing** — IIIF `rights`/`requiredStatement`, per-image licenses, attribution display, takedown.
- **23 Analytics & usage** — privacy-respecting view/engagement metrics for a static-hosted exhibit.
- **24 Print / PDF / offline export** — quire's multi-format output as a preservation + citation artifact (the longevity path).
- **25 Mobile / touch & responsive** — pinch-zoom gesture conflicts between OSD and annotation drawing; small-screen narrative layout.
- **26 Theming / white-label / design system** — per-exhibit brand tokens, layout templates, dark mode, custom CSS without a rebuild (corpus-thin: `anvil/.interface-design`, `quire`, `juncture`; demoted from 17 — survey only if SaaS-ability becomes a goal).

## Provenance
Axes proposed 2026-05-24 after wave 1+2 surfaced the gaps. Selection rule: each must be (a) a genuine future path not in the original bullets, (b) sourceable in the present corpus, (c) preferably attacking a named gap. Mapped to the 8 incoming clones (`scratch/clone-log.txt`). Survey = wave 3, pending clone landing + axis-set confirmation.
