# Prior-Art Survey — Index & Coverage Matrix

**Date:** 2026-05-24 · **Scope:** all repos under `Image/` surveyed against the 10 feature axes ("future paths") of the planned IIIF tool (OSD + Annotorious viewer; CMS gallery + exhibit-making UI; published exhibit viewer; multi-media + multi-object; project/image-level annotations; linkable/navigable; WADM; web-publishable serverless).

**How to read:** survey is decomposed by *axis* (column), not by repo. Each axis file is a citation matrix of `file:line` sources tagged **PURE** (lift-able, framework-agnostic) vs **COUPLED** (entangled with a framework). Start here, then open the axis file you care about. Framing (own-project decisions + WADM verdict) is in `_FRAMING.md`; dispatch contract in `_DISPATCH-CONTEXT.md`; the 10 second-order axes are defined in `11-20-NEW-AXES.md`; the every-repo coverage proof is in `_COVERAGE.md`; the cross-axis gap ledger + orphan hunt is in `_GAPS.md`; the libraries cloned to *answer* those gaps are in `_GAP-ANSWERS.md`; and the late-discovered `papadam` platform's cross-axis profile is in `_PAPADAM.md`.

**Two exit conditions (both met):**
1. *Every path referenced + sourced* — 20 surveyed axes (1–20), each with multiple real `file:line` sources (14–38 refs/axis); 7 further paths named-and-deferred (21–27, overflow); meta-check below shows the core decision surface is saturated. ✅
2. *Every repo touched* — `_COVERAGE.md`: 76 candidate repos, 43 cited / 3 added / 30 justified-out / 0 unclassified. ✅

## Coverage matrix

| # | Axis | File | Sources | PURE extractables | Reuse verdict |
|---|------|------|:---:|:---:|---|
| 1 | Deep-zoom viewer (OSD) | `01-deep-zoom-viewer.md` | 6 | 6 | **LIFT** cozy-iiif classify + field-studio resolver stack |
| 2 | Annotation tools (Annotorious) | `02-annotation-tools.md` | 7 | 6 | **AVOID** unwrapped `W3CImageFormat`; build SVG pre-parse |
| 3 | Annotation data-model (WADM) | `03-annotation-data-model.md` | 6 | 14 | **LIFT** annomea `wadm.ts` spine + cozy-iiif page resolver |
| 4 | Multimedia A/V | `04-multimedia-av.md` | 7 | 8 | **STUDY** own prototypes; mostly **BUILD** |
| 5 | Multi-object / collections | `05-multi-object-collections.md` | 7 | 6 | **LIFT** cozy-iiif Collection/Manifest/TOC traversal |
| 6 | Authoring CMS | `06-authoring-cms.md` | 7 | 8 | **LIFT** OPFS+FSA writers; **STUDY** manifest-editor Vault |
| 7 | Published read UI | `07-published-read-ui.md` | 5 | 7 | **LIFT** juncture scroll-spy + region parser |
| 8 | Linkable / navigable | `08-linkable-navigable.md` | 5 | 6 | **LIFT** anvil `anvil://` + IIIF Content State; learn fitBounds |
| 9 | Web-publishable / serverless | `09-web-publishable-serverless.md` | 7 | 4 | **LIFT** tiny-iiif builders + anvil CI; **BUILD** in-browser gen |
| 10 | State-mutation patterns | `10-state-mutation-patterns.md` | 9 | 8 | **STUDY** liiive Yjs + excalidraw undo; **BUILD** WADM bridge |

## Top gold (the strongest single source per axis)

1. `IIIF/cozy-iiif/src/core/canvas.ts:54` — `toCozyImageResource` static/dynamic/level0 classification = single-image-vs-tiled switch (PURE).
2. `field-studio/node_modules/@annotorious/annotorious/src/model/w3c/svg/SVGSelector.ts:39-45` + `pathParser.ts:167` — the exact Ellipse→NaN and Path→MoveTo-only corruption sites.
3. `annomea/src/data/wadm.ts:19` — `fragmentSelector`/`createAnnotationPage`/`svgSelector`/`annotationUrn` lift-verbatim WADM spine.
4. `BIIIF/videojs-annotation/src/js/lib/w3c.js:15-56` — PURE media-fragment codec (`t=…&xywh=percent:`), only reusable AV↔WADM round-trip in the corpus.
5. `IIIF/cozy-iiif/src/Cozy.ts:155-260` + `core/manifest.ts:3-121` — Collection→items, Manifest→canvases+ranges, recursive TOC (PURE).
6. `field-studio/src/shared/services/opfsStorage.ts:18-101` + `IIIF/immarkus/src/store/utils.ts:44-74` — PURE OPFS store + single-flight debounced FSA writer.
7. `juncture/components/VisualEssay.vue:232-245` + `Image.vue:567-629` — scroll-spy + `parseRegionString`→`fitBounds` (PURE).
8. `annomea/src/data/anvil-uri.ts:51,124` + `anvil/app/src/lib/share-url.ts:35,62` — `anvil://` grammar + IIIF Content State deep-links (PURE).
9. `IIIF/tiny-iiif/tiny/src/pages/api/_ops/_templates.ts:5-48` + `anvil/template/.github/workflows/scripts/build-manifest.sh:14-24` — Presentation-3 builders + bash gallery-index generator (PURE).
10. `liiive-client/.../annotation-store-adapter.tsx:81-111` + `excalidraw/.../store.ts:40-73` — origin echo-suppression + inverse-entry undo (PURE).

## Cross-cutting GAPS — white space no surveyed repo solves

Clustered by the build effort they imply. **These are the "what's missing."**

**A. Serverless / in-browser pipeline (axes 5,6,9) — the largest greenfield.**
- In-browser, server-free **folder → static-IIIF generation**: every generator (biiif, tiny-iiif, canopy, IIIFtoolset) is Node/Python-bound. None run client-side from an FSA/OPFS folder.
- **GitHub OAuth push from a backend-less SPA**: zero surveyed code demonstrates it; anvil itself flags it unbuilt.
- A single **`Filesystem` interface unifying FSA in-place save (Chromium) + `.zip` download (Firefox/Safari)** — ingredients exist, the unifying seam doesn't.
- The **Gallery / `exhibits.json` meta-index** (exhibits-of-exhibits) — distinct from an IIIF Collection; nobody generates it.

**B. Lossless non-rect geometry through WADM (axes 2,3,8,10) — the geometry spine.**
- No repo **pre-parses SVG to bypass the broken `W3CImageFormat` adapter** for Ellipse; nobody handles Path `Q`/`T` curves. The `_FRAMING.md` mitigation is unbuilt everywhere.
- **Non-rectangle (SvgSelector) region deep-links**: every addressing scheme surveyed is `xywh`-only.
- **Geometry-level undo over WADM selectors**: nobody (undo is text-field or full-snapshot only).
- No repo **round-trips a mutable store ↔ WADM `AnnotationPage`** (liiive uses Yjs blobs, not WADM).

**C. Navigation wiring (axes 1,7,8).**
- End-to-end **select-annotation → `fitBounds` → live anchor recompute**: halves exist separately; nobody wires the whole (the annomea read-side root cause).
- **Bidirectional scroll-sync with an active-ref highlight**: every repo does one direction; none applies `.active` to matched prose.

**D. A/V annotation (axis 4) — genuinely thin.**
- **Transcript/caption as a first-class WADM body** (`supplementing` motivation, WebVTT/`<track>`): now PARTIAL — `papadam/transcribe/worker.py` does real Whisper ASR→time-coded WebVTT (the only working transcript pipeline in the corpus), but stores it as a URL field, not a WADM body; the VTT→`TextualBody` adapter is still ours.
- Production libraries never tag `target.source.type` as `Sound`/`Video` (only our throwaway prototypes do).
- OSD + A/V coexistence is only *probed*, not solved.

**E. Multi-language (axis 3).**
- WADM **`Choice` multi-lang body** is typed but never emitted or rendered in any surveyed repo.

## CLONE-NEXT — what kinds of apps to clone for the next survey round

The corpus is strong on IIIF tooling / OSD / Annotorious / manifest editing and weak exactly where the gaps are. Targeted clones, by gap:

- **Gap A (serverless gen + GH push + FSA):** Canopy IIIF, Wax (Minicomp), backend-less GitHub-push CMSs — Decap/Netlify CMS, Prose.io, TinaCMS, StackEdit; FSA-heavy SPAs — tldraw, Photopea.
- **Gap B (geometry / SVG selectors / WADM stores):** full **Recogito-JS / Annotorious** monorepo (not just the OSD plugin), **RecogitoStudio**, Hypothesis client (`h`); SVG path libs — svgpath, svg-path-parser, paper.js; WADM-native stores — anno (Annotorious core), Yjs/Automerge demos.
- **Gap C (scroll-sync / scrollytelling):** Scrollama, Knight Lab StoryMap, idyll; IIIF storytelling — **Exhibit.so**, **Storiiies** (+ Storiiies Editor), **Clover IIIF**, **Theseus/Annona**.
- **Gap D (A/V + transcript sync):** **Aviary**, **OHMS** (transcript↔time sync — the exact gap), **Hyperaudio-lite**, **Scalar** (USC multimedia scholarly publishing), **Clover IIIF** (IIIF AV viewer), Universal Viewer (AV).
- **Gap E (multi-lang):** Mirador (IIIF i18n + Choice), Universal Viewer locale handling.

**Selection rule for the next round:** prefer (1) IIIF-domain exhibition/curation platforms we have NOT yet cloned (Exhibit.so, Storiiies, Clover, Wax, Mirador, Universal Viewer) and (2) single-purpose PURE-logic libs for the geometry/scroll/transcript gaps. Avoid more general-purpose canvas apps (excalidraw/tldraw/FossFLOW/Graphite already covered the state-mutation axis).

## Provenance

Decomposed by feature axis (advisor directive). Framing digested from own projects (anvil, annomea, field-studio) + `canvases-annotations-sharing/Annotation-sync-mutation-research` + `wadm-roundtrip` verdict → `_FRAMING.md`. 10 axis surveyors dispatched in 2 waves of 5, each consuming `_DISPATCH-CONTEXT.md`, writing one citation-matrix file, returning a ≤200-word digest. Citations are surveyor-opened `file:line` (a few stale own-project line numbers were grep-corrected by surveyors and noted in their files). Axis-10 CRDT-vs-folklore call rests on primary code (advisor was rate-limited for that agent).

---

# Wave 3 — second-order axes (11–20) + closeout

These axes go beyond the literal feature brief to the paths a real platform grows into. Defs in `11-20-NEW-AXES.md`; 10 new prior-art repos were cloned to source them (`scratch/clone-log.txt`). All thin/gap-heavy results are *findings*, not gaps in the survey.

## Coverage matrix (axes 11–20)

| # | Axis | File | PURE | Reuse verdict / headline |
|---|------|------|:---:|---|
| 11 | Search & discovery | `11-search-discovery.md` | 11 | **LIFT** field-studio Content-Search client + browser-visual-search cosine-kNN; visual-search↔annotation join is greenfield |
| 12 | Accessibility & keyboard nav | `12-accessibility.md` | 5 | **LIFT** OSD built-in keymap; SR semantics for regions + alt-text-body = greenfield (thin) |
| 13 | i18n / localization | `13-i18n-localization.md` | 5 | **LIFT** manifesto `getSuitableLocale` + LanguageMap parse; multi-lang `Choice` body = greenfield (gap E confirmed) |
| 14 | Import / interop | `14-import-interop.md` | 10 | **LIFT** cozy-iiif P2→P3 + tropy ALTO/edtf; EXIF ingest unsolved (field-studio stub) |
| 15 | Provenance / citation | `15-provenance-citation.md` | 7 | **STUDY** anvil palimpsest ADR (deferred) + quire CSL; DOIs/region-citation/edit-history = greenfield |
| 16 | User-experienced perf | `16-performance-ux.md` | 8 | **LIFT** vite manualChunks + lazy-OSD + IntersectionObserver; **anvil already 328 KB > 240 KB budget** |
| 17 | In-browser tile generation | `17-tile-generation.md` | 3 | **BUILD** — ZERO repos tile in-browser; extend field-studio OffscreenCanvas worker to a pyramid |
| 18 | Embedding / ecosystem | `18-embedding-ecosystem.md` | 5 | **LIFT** clover custom-element + Content-State attribute; oEmbed = greenfield |
| 19 | AI-assisted authoring | `19-ai-authoring.md` | 8 | **LIFT** browser-visual-search FastSAM+CLIP in-browser; mask→SvgSelector contour-trace = greenfield |
| 20 | Security & sanitization | `20-security-sanitization.md` | 10 | **LIFT** field-studio `sanitizeSvg` + decap PKCE OAuth; one-pass safe-parse+sanitize of non-rect SVG = greenfield |

## The two gap-spines (the consolidated white space)

Wave-3 findings collapse into two cross-cutting spines that recur across many axes — these are where the build has *no donor*:

**Spine A — Serverless / in-browser pipeline** (axes 5,6,9,11,16,17,18): in-browser **tile-pyramid generation** (axis 17 — nobody, the headline gap), client-side folder→IIIF, unified **FSA-save + zip-download** filesystem, `exhibits.json` gallery index, oEmbed + Content-Search **from a static host**, cold-host TTI never measured. Decap supplies the one solved piece — **OAuth-from-SPA (PKCE)**.

**Spine B — Lossless non-rect geometry through WADM** (axes 2,3,8,17,19,20): the Annotorious adapter **silently corrupts Ellipse/Path** (`annotorious/.../svg/SVGSelector.ts` + `pathParser.ts`), nobody pre-parses to bypass it, the same `<svg>` path is also the **only (weak) XSS filter** (`annotorious/.../svg/SVG.ts`), auto-detection yields only rect bboxes (no **mask→SvgSelector**), no **SvgSelector deep-links**, no **geometry-level undo**, no **CRDT↔AnnotationPage** round-trip. One module must own correct-parse + safe-sanitize + serialize for non-rect shapes.

(The original axis-1–10 gaps A–E remain — see above; they are subsumed by these two spines plus the A/V transcript gap (axis 4) and multi-lang Choice (axis 13).)

## Meta-check — "all paths explored?"

Per the exit rule (stop when a fresh pass yields no new *core* path): the wave-3 findings produced **no new core product axis** — they reinforced spines A and B and the already-named overflow. The long-tail paths that *did* surface are named here so they are referenced, not missed, and deliberately deferred:

- **21 Collaboration UX** (presence/comments/roles — `papadam` + liiive are the donors) · **22 Rights & licensing** · **23 Analytics** · **24 Print/PDF/offline export** · **25 Mobile/touch** · **26 Theming/white-label** · **27 Community/crowdsourced annotation + moderation** (emergent from the security + collab findings).
- Niche tails noted but not promoted: Linked-Open-Data / schema.org machine-readability of published exhibits; preservation/archival-package (OAIS/BagIt) export; programmatic/notebook API. Each is a *variant* of an existing axis (14/15/9), not a new surface.

**Verdict:** the core decision surface (20 surveyed + 7 referenced-deferred + 2 gap-spines) is saturated; a further meta-pass yields only variants of named axes. Both exit conditions met.

## Late discovery (coverage sweep)

`papadam` (top-level clone, fork of PLASMA/papad — NOT in `_FRAMING.md`'s own-project set) is the most feature-complete annotation **platform** in the corpus. A dedicated cross-axis sweep (`_PAPADAM.md`) found real signal on **13 axes** — best-donor for ④ A/V, ⑥ authoring, ⑦ read-UI, ⑩ state-mutation (production Y.js persistence bridge `crdt/src/index.ts:105-165`), ⑲ AI, ⑳ security (multi-tier JWT); citations were appended to 11 axis files (03,04,05,06,07,10,11,13,15,19,20). Caveat: papadam emits **W3C-*shaped* JSON over a CRDT-blob store, NOT WADM `AnnotationPage`-native** — an anti-example for axis ③. Its `transcribe/worker.py` (real Whisper ASR→WebVTT) partially closes the gap-D transcript hole. `BIIIF/wax-tasks` (build-time VIPS/IM tiling) → axis 17. `BIIIF/beehive_poster_viewer` (OSD + Annotorious-OSD viewer w/ shareable zoom+bounds URLs) → axis 8. The `cas/*` entries (recogito2, weavejs, penpot, tldraw) are empty 0-file clone stubs — correctly out-of-scope.

## Gap-answering round (libraries cloned to close the gaps — `_GAP-ANSWERS.md`)

After the gap ledger, 7 targeted libraries were cloned and verified against the BLOCKERs. **4 of 6 BLOCKERs now have a confirmed donor:**

- **B1 + B3 — non-rect SVG parse + serialize round-trip** → **`svgpath/`** (`lib/svgpath.js`, runtime-verified arc+Q survive transform). DOM-free, tiny — hits the exact string-vs-DOM-Node root cause of the `W3CImageFormat` failure. *Most valuable lib of the round.*
- **B2 — Path `Q`/`T` handling** → **`points-on-path/`** (its `path-data-parser` normalizes Q/T/S/A→cubic, arcs via `arcToCubicCurves`) — turns a corrupt Path into a lossless polygon.
- **B5 — client-side folder→static-IIIF manifest** → **`IIIF/iiif-builder/`** (`@iiif/builder`, pure, no `fs` in src — runs in-browser).
- **mask→SvgSelector** (axis 19) → **`marchingsquares/`** (`isoContours`); **EXIF orientation orphan + axis-14 stub** → **`exifr/`** (reads `Orientation`/GPS/date — baking the bitmap stays ours).

**2 BLOCKERs stay open** (honest negative): **B4 in-browser tiling** — `wasm-vips` was over-sold: NO `dzsave`, only pyramidal-TIFF OSD can't read, and its real `.wasm` (~13–20 MB) blows the 240 KB budget → still greenfield. **B6 select→fitBounds→live-anchor** — `IIIF/canvas-panel` gives a rect-only region API, partial. Updated donor cells are in `_GAPS.md`.
