# 03 — System Design: Capabilities That Broaden Contributor Appeal Within Archie's Locked Frames

> Thread: SYSTEM-DESIGN research. Architecture-level capabilities achievable serverless.
> Sources: 11 disk prior-art files, 8 online fetches. Date: 2026-06-09.

---

## 1. Research posture

Archie's locked frames are non-negotiable:
- No runtime server. Static GH-Pages. OPFS/FSA/zip storage. Browser-only.
- Pushing to `api.github.com` is allowed (talking to a server ≠ running one).
- Client-side heavy ML that needs a backend is OUT (240 KB budget posture for app JS; WASM models are additive, lazy-loaded).
- Svelte SPA (Studio) + Astro+Svelte islands (Viewer).
- On-disk WADM / IIIF Presentation 3.

Every capability below is evaluated against this constraint. The "fits-the-frame" column is where this document does its primary work.

---

## 2. Capability clusters investigated

### 2.1 Real-time / async collaboration — CRDTs, WebRTC, the server boundary

**Async-zip DAG (decided, fits-the-frame).**
Archie's chosen collaboration model is async-zip: export a zip → hand it to a collaborator → import the returned zip → silent DAG fast-forward + conflict-card UI. This is the correct serverless-native pattern. The version DAG is append-only, never needs a sync transport.
Source: `CONTEXT.md` decisions §88 (`Prior Art/10-state-mutation-patterns.md` confirms this is the right boundary — papadam/liiive use Yjs+Hocuspocus/Supabase real-time, which is server-shaped).

**Yjs CRDTs — where the boundary lies.**
Yjs is network-agnostic. Its core CRDT encoding (`Y.Doc`, `Y.encodeStateAsUpdate`) runs in a browser with no server. `y-indexeddb` persists locally. `y-webrtc` does P2P — but requires a **signaling server** for peer discovery (WebRTC NAT traversal).
Source: y-webrtc README (online fetch): "Peers find each other by connecting to a signaling server." Public servers exist (`wss://y-webrtc-ckynwnzncc.now.sh`) — so it is *technically* serverless from Archie's perspective (we don't run the signaling server). But: signaling server dependency is an operational risk; room-scaling is poor (each peer connects to every other); and most importantly, Archie's collaboration model is async by design — same contributor is rarely online simultaneously. **Verdict: Yjs binary encoding is worth studying for the DAG merge layer (lossless state-vector exchange), but live CRDT sync is not the right fit. Async-zip is.**

**Automerge.**
Automerge ships a WASM build (`@automerge/automerge-wasm`, ~650 KB compressed). It supports `save()`/`load()` for offline-first local persistence and a compact binary diff protocol. Same conclusion: the local/offline primitive is serverless-compatible; the "sync" story assumes a relay server or WebSocket transport.
Source: Automerge README (online fetch), `Prior Art/10-state-mutation-patterns.md` papadam CRDT section.

**Conclusion on collaboration:** Archie's async-zip DAG is the right serverless-native form. The CRDT literature validates it (Yrs/Automerge binary encodings = compact diff transport = zip payload). Live co-editing is **server-shaped** — the closest serverless approximation is the merge-on-import DAG.

---

### 2.2 Identity and attribution without accounts

**Already decided: local display name on first import** (CONTEXT.md, `_SHARED-CONTEXT.md` §contributor model). Per-note `lastEditor`. No auth at Studio launch.

**What broadens appeal further:**

**GitHub OAuth PKCE from a SPA (fits-the-frame, effort=medium).**
Decap-CMS is the reference implementation: PKCE S256 flow (`crypto.subtle.digest('SHA-256',…)`), verifier in `sessionStorage`, popup `postMessage` origin check — all pure browser, no backend.
Source: `Prior Art/20-security-sanitization.md` (decap-cms section).
Archie already plans this for GitHub Pages publish (CONTEXT.md §95 — fine-grained PAT, contents:write + pages:write, 90-day). The same OAuth credential doubles as a contributor identity signal: the GitHub username becomes a citable author identity on publish, without requiring an account for local authoring. This is the **serverless identity bridge**: local display name for authoring → GitHub username surfaced on publish. No DID infrastructure needed for v1.

**DID / keypair signing (partial, high effort).**
W3C DIDs + Ed25519 keypairs allow signed WADM annotations (the `creator` Agent can carry a DID as its `id`). `crypto.subtle` is pure browser (key generation, signing, verification). This is architecturally sound within the locked frame but is greenfield — no surveyed repo implements it. It would mean each annotation body carries a detached JWS over `{id, target, body, created}`. The contributor appeal is academic integrity / citation: "this annotation is provably mine." Zooniverse-style citizen science and GLAM archives would value this.
**Verdict: Phase 2 or seed. V1 local name + GitHub OAuth username is sufficient.**

---

### 2.3 Import / interop pipelines that widen the funnel

These are all **browser-side, serverless-compatible**:

**IIIF Manifest pull (fits-the-frame, effort=low).**
`cozy-iiif`'s `parseURL` + P2→P3 normalization is PURE (no Node deps in src). Fetching a third-party IIIF manifest from a URL is the same category as fetching museum IIIF — allowed.
Source: `Prior Art/14-import-interop.md` cozy-iiif section.
Audience impact: GLAM professionals, classroom educators, DH scholars — anyone with an existing Manifest URL can bootstrap an exhibit in one paste. Massive funnel-widener for the IIIF-literate tier.

**CSV → annotation batch import (fits-the-frame, effort=low).**
`field-studio`'s `exceljs` CSV/XLSX export is the reference for shape; the import direction is the mirror. A tab-delimited CSV (`canvas_id, x, y, w, h, body_text, tags`) → bulk `AnnotationPage` entries. Non-technical contributors (archivists, teachers, genealogists) can author in a spreadsheet and import.
Source: `Prior Art/14-import-interop.md` field-studio section.

**WebVTT/SRT → WADM `supplementing` body (fits-the-frame, decided for v1).**
Already in CONTEXT.md §86. VTT cue → Note with `motivation:supplementing` at `t=start,end`. Build the adapter.

**WADM / Recogito / Hypothes.is annotation import (fits-the-frame, effort=medium).**
`cozy-iiif`'s `importAnnotations` helper + `fetchAnnotations` (recursive `next`/`partOf`) covers WADM pages. Recogito exports IIIF-compatible W3C annotations. Hypothes.is exports JSONL (not WADM-native — adapter needed). Annotorious `W3CImageFormat` handles SVG-selector round-trip.
Source: `Prior Art/14-import-interop.md`.
Audience: existing Recogito users are a high-value adjacent segment (they already annotate IIIF, they want an exhibit layer).

**Tropy / Omeka export ingest (fits-the-frame, effort=low-medium).**
Tropy: JSON-LD with `jsonld.expand` + EDTF dates (both pure libs). The `alto-xml` OCR ingest is pure. Omeka S: exports Dublin Core JSON or IIIF manifests — covered by the IIIF Manifest pull path.
Source: `Prior Art/14-import-interop.md` tropy section; `Prior Art/15-provenance-citation.md`.

**Bulk image ingest (FSA folder drop) (fits-the-frame, effort=medium).**
`immarkus`'s FSA folder-picker + field-studio's `FsaFilesystem` / OPFS storage pattern. Dropping a folder generates IIIF Canvas entries (biiif algorithm reimplemented browser-side). Audience: photographers, biology researchers, mappers with large local image sets.
Source: `Prior Art/09-web-publishable-serverless.md` Gap 1; `Prior Art/_GAPS.md`.

---

### 2.4 In-browser heavy lifting

**OffscreenCanvas DZI tiling (fits-the-frame, v1.1 decided).**
CONTEXT.md §85 confirms: v1.1 in-browser tiling = OffscreenCanvas worker pyramid, NOT libvips-WASM. Field-studio's `generateDerivative` (OffscreenCanvas+Worker, `ingest.worker.ts:329`) is the liftable seed — extend it: recursive halving → DZI level grid.
Source: `Prior Art/17-tile-generation.md` verdict; `Prior Art/_GAP-ANSWERS.md` wasm-vips partial.
**Contributor impact:** drag-and-drop any image → exhibit-ready without external tiling service. Lowers bar for biology, medical imaging, cartography, art photography.

**WASM-libvips (partial — breach risk).**
wasm-vips ships ~13–20 MB WASM — hard breach of the 240 KB NFR1 budget. No `dzsave` found in surveyed build. The `tiffsaveBuffer` pyramid loop is real but OSD cannot read pyramidal TIFF natively.
Source: `Prior Art/_GAP-ANSWERS.md` wasm-vips row.
**Verdict: Do not ship wasm-vips in main bundle. If v2 tiling outgrows OffscreenCanvas, evaluate as a lazy-loaded Worker WASM (not in app boot path).**

**ONNX/onnxruntime-web: in-browser region detection (fits-the-frame, lazy-loaded).**
`IIIF/browser-visual-search` is the reference: FastSAM segmentation + CLIP-ViT-B/32 visual embeddings, both running via `onnxruntime-web` with `executionProviders: ['webgpu','wasm']`. The ONNX model is a static `.onnx` asset — GH-Pages-servable. The models are NOT in the app boot path; they are lazy-loaded on demand.

Key capability mapping:
- `ort.InferenceSession.create(url, {executionProviders:['wasm']})` — pure browser ONNX session load. Source: `Prior Art/19-ai-authoring.md` `browser-visual-search/src/segmentation/segment.ts:8-11`.
- FastSAM → bbox → `FragmentSelector xywh=pixel:` — fits WADM. Source: `Prior Art/19-ai-authoring.md` `preprocess.ts (modelBoxToNormalisedBBox)`.
- No SvgSelector polygon — the mask IS computed but only bbox is exposed. Polygon extraction (marching-squares contour-trace) is greenfield if we want non-rect regions.

**What is feasible client-side (no backend):**
| AI capability | Model | Approx size | Fits 240 KB budget? | Verdict |
|---|---|---|---|---|
| Object/region bbox detection | FastSAM (ONNX) | ~20–40 MB | No (lazy-load only) | Y — lazy Worker |
| Image semantic embedding | CLIP-ViT-B/32 (ONNX) | ~340 MB | No | Deferred — too heavy |
| Text semantic search (local) | MiniLM/e5-small (ONNX) | ~30–90 MB | No (lazy-load only) | Y — lazy Worker |
| OCR/HTR | Tesseract-WASM | ~10 MB | No (lazy-load only) | Phase 2 seed |
| ASR / speech-to-text | Whisper-WASM | ~150–300 MB | No | Server-shaped |
| Alt-text captioning | BLIP/moondream (ONNX) | ~500 MB+ | No | Server-shaped |

**Serverless boundary for AI:** CLIP and captioning models are too large for client-side default-on use. FastSAM bbox + MiniLM annotation search are feasible as lazy-loaded opt-in workers. ASR (Whisper) and captioning are server-shaped — closest serverless approximation is: author supplies WebVTT (decided v1) or an external transcription URL.

---

### 2.5 Discoverability of a static published exhibit

**Build-time SEO / OG tags / JSON-LD (fits-the-frame, effort=low).**
The Astro Viewer build already runs per-exhibit. Adding `<meta property="og:title">`, `<meta property="og:image">` (thumbnail from exhibit cover canvas), `<script type="application/ld+json">` (Schema.org `CreativeWork` with `name`, `description`, `author`, `image`, `url`) is pure static build. Sitemap generation is Astro-native (`@astrojs/sitemap`).
Source: IIIF contributor guide (online fetch) — IIIF discovery depends on harvestable manifests at stable URLs; structured data accelerates indexing.

**IIIF Change Discovery API (ActivityStreams) — static-servable (fits-the-frame, effort=medium).**
The IIIF Change Discovery API 1.0 is an `OrderedCollection` of `Activity` objects — a paginated JSON file. This CAN be generated as a static file at publish time (Archie's publish pipeline produces it as part of the committed artifact tree).
Source: IIIF Discovery API 1.0 spec (online fetch): "The OrderedCollection and its pages are static files served over HTTP." Harvesters (aggregators like OCLC, Europeana, DPLA) can crawl static ActivityStreams pages.
Audience: GLAM institutions whose exhibits need to surface in aggregator indexes. Massive credibility signal for institutional contributors.

**oEmbed (partial — needs a build-time response file or a tiny third-party endpoint).**
oEmbed requires an HTTP endpoint that returns JSON for a given URL. A true dynamic oEmbed endpoint is server-shaped. However: the oEmbed spec's "discovery" mechanism allows a `<link rel="alternate" type="application/json+oembed" href="...">` pointing to a static pre-generated JSON file per exhibit. This is the **static oEmbed approximation** — a build step writes one `oembed.json` per exhibit (type:rich, html:`<iframe src="...">`, title, author_name). Twitter/X Card and Slack/Discord unfurl read `og:` tags (no endpoint needed). GitHub social preview reads og:image.
Source: oEmbed spec (online fetch) §2.4 Discovery.
**Verdict: Partial-fits-frame — static pre-built oEmbed JSON per exhibit covers 80% of the use case (social media unfurl, LMS embedding). True dynamic oEmbed discovery requires a registry entry or a worker. Seed a GH-Pages-hosted oEmbed registry file.**

**Embed code / iframe (fits-the-frame, effort=low).**
The Viewer already supports the portable `.archie.zip` mode. A `<clover-viewer>`-style custom element wrap (axis 18 prior art: `clover-iiif/src/web-components/clover-viewer.tsx:42`) enables `<archie-viewer manifest="…">` drop-in embeds on any site with a CDN-hosted bundle. Requires no server from the exhibit side.
Source: `Prior Art/18-embedding-ecosystem.md` clover-iiif section.

---

### 2.6 Crowdsourcing intake without a server

**Async-zip review round-trip (fits-the-frame, the native form).**
Share a zip → contributor annotates locally in their own Studio → returns a zip → owner imports. No server, no accounts. This is the correct model for serious contributors (researchers, archivists).

**GitHub Issue / PR as contribution intake (fits-the-frame, effort=low).**
A published exhibit can display a "Suggest a note" button that opens a pre-filled GitHub Issue (title, body template, exhibit ID). The exhibit owner receives the suggestion in their Issues list, adds it manually, and republishes. No backend. Contributor needs a GitHub account — friction for some but low for the target GLAM/DH/classroom audience.
This is the Zooniverse→GitHub translation: Zooniverse routes crowd contributions through a server-side review queue; the serverless equivalent is Issues-as-queue.
Source: Zooniverse about page (online fetch) — crowd contributions route through a moderation/agreement layer before acceptance; GitHub Issues is the closest zero-server equivalent.

**Form-to-zip (fits-the-frame, effort=medium).**
A published exhibit with a "Contribute a note" UI (Typeform/Netlify Forms alternative: a static form that writes to the zip on the client side, then prompts download) is technically feasible but UX is awkward. Better path: the portable Viewer mode already lets a recipient open an `.archie.zip` and add notes; the zip is then emailed/shared back. This IS the serverless crowd intake model — no form infrastructure needed.

**True server-backed crowd queue (server-shaped).**
Zooniverse, FromThePage, and Hypothes.is all require a server-side review queue, aggregation layer, and volunteer account system. The closest serverless approximation: async-zip DAG + GitHub Issues. For classroom-scale crowdsourcing this is sufficient.

---

### 2.7 Accessibility and mobile authoring

**Touch annotation (partial, effort=high).**
OSD has touch support for pan/zoom. Annotorious touch-drawing depends on pointer events — tablet stylus works; finger drawing on a small screen is harder for precise region selection. Mobile authoring is a real barrier in the current tool. Mitigation within locked frame: keyboard-navigable annotation forms, tap-to-place point annotations, mobile-responsive Studio layout. Full mobile annotation authoring is a DH community ask (especially field-based biology, genealogy, journalism).
Source: CONTEXT.md UX decisions (no mobile-first statement found — this is a documented gap).

**Responsive Studio (fits-the-frame, effort=medium).**
Svelte allows full responsive layout. The current Studio grid is desktop-first. Adapting the CMS gallery and exhibit editor for tablet-width (≥768px) broadens the classroom, journalism, and genealogy contributor segments.

---

## 3. Fits-the-frame vs server-shaped classification

| Capability | Frame | Rationale |
|---|---|---|
| Async-zip DAG collaboration | **Fits** | Native serverless form; decided |
| Local display name identity | **Fits** | Already decided |
| GitHub OAuth PKCE from SPA | **Fits** | Decap-CMS pattern; browser-only |
| DID/keypair annotation signing | **Partial** | `crypto.subtle` is browser-native; greenfield, phase 2 |
| IIIF Manifest pull import | **Fits** | Same as fetching museum IIIF; decided allowed |
| CSV → annotation bulk import | **Fits** | Pure JS, no server |
| WebVTT/SRT import | **Fits** | Decided v1 |
| WADM / Recogito annotation import | **Fits** | cozy-iiif pure library; no server |
| Tropy/Omeka JSON-LD ingest | **Fits** | `jsonld`, `alto-xml` — pure libs |
| Bulk image ingest (FSA folder) | **Fits** | Browser FSA + OPFS; greenfield build |
| OffscreenCanvas DZI tiling | **Fits** | Decided v1.1; Worker-based |
| wasm-vips tiling | **Partial** | ~13–20 MB WASM; lazy-load only; no dzsave |
| ONNX FastSAM region detection | **Fits (lazy)** | Lazy-loaded Worker WASM; not boot path |
| ONNX text search (MiniLM) | **Fits (lazy)** | Same — opt-in |
| Whisper ASR / captioning | **Server-shaped** | Model size + compute requires backend |
| Build-time SEO + JSON-LD + sitemap | **Fits** | Pure Astro build step |
| IIIF Change Discovery static pages | **Fits** | Static JSON at publish; harvestable |
| Static oEmbed JSON per exhibit | **Fits (partial)** | Build step; covers social unfurl; no dynamic endpoint |
| Custom element `<archie-viewer>` embed | **Fits** | CDN bundle + no server |
| GitHub Issue as contribution queue | **Fits** | No server; GitHub account required |
| Async-zip portable review | **Fits** | Native model |
| True crowd queue (Zooniverse model) | **Server-shaped** | Requires server-side aggregation, accounts |
| Live real-time co-editing (liiive model) | **Server-shaped** | WebSocket + signaling server; Hocuspocus |
| Touch / mobile Studio authoring | **Partial** | OSD+Annotorious pointer events; responsive layout fits |
| Tablet-responsive Studio | **Fits** | CSS/Svelte layout work |

---

## 4. Feature-candidate table

| Feature | Contributor audience | Evidence | Broadens because… | Fits locked frames? | Est. effort | Priority |
|---|---|---|---|---|---|---|
| IIIF Manifest URL import (paste-to-bootstrap) | GLAM professionals, DH scholars, educators | cozy-iiif PURE `parseURL`+P2→P3 (`Prior Art/14-import-interop.md`); IIIF guide (online) | Removes "build from scratch" barrier for anyone with an existing institutional manifest; converts IIIF-literate orgs to contributors in one step | Y — `cozy-iiif` no-Node library, fetch allowed | Low | P0 |
| CSV / spreadsheet → annotation bulk import | Archivists, educators, genealogists, journalists | field-studio exceljs export shape (`Prior Art/14-import-interop.md`); no prior-art import side exists | Non-technical contributors author in Excel/Google Sheets; zero annotation UX learning curve | Y — pure JS (`papaparse`/`exceljs`) | Low | P0 |
| Build-time SEO / JSON-LD / og-tags / sitemap | All published exhibit authors | IIIF Change Discovery spec (online); Astro `@astrojs/sitemap` native | Published exhibits become findable/shareable without extra work; social unfurl on X/LinkedIn/Slack immediately broadens audience for every contributor's work | Y — Astro build step, zero runtime | Low | P0 |
| GitHub OAuth PKCE publish + contributor identity | Any contributor who wants a public exhibit | Decap-CMS PKCE pattern (`Prior Art/20-security-sanitization.md`); CONTEXT.md §95 | Removes the "where does this live" friction; GitHub username surfaces as citable author on publish; local-name → github-identity bridge | Y — `crypto.subtle` PKCE, browser-only | Medium | P0 |
| OffscreenCanvas DZI Worker tiling (v1.1) | Biology/medical imaging, photographers, cartographers, art archivists | `Prior Art/17-tile-generation.md` field-studio liftable seed; CONTEXT.md §85 decided | Drop any image → deep-zoom exhibit without external tiling server; unlocks large-image contributor segments (microscopy, maps, artworks) | Y — Worker + OffscreenCanvas; decided v1.1 | Medium | P0 |
| WADM / Recogito / Hypothes.is annotation import | Existing annotation tool users migrating to Archie | cozy-iiif `importAnnotations` + `fetchAnnotations` PURE (`Prior Art/14-import-interop.md`); Annotorious `W3CImageFormat` SVG round-trip | Zero migration cost for contributors switching from Recogito/Hypothes.is; Recogito is the primary GLAM annotation comparator | Y — pure libs; cozy-iiif no-Node | Medium | P1 |
| Static IIIF Change Discovery ActivityStreams | GLAM institutions, aggregator-indexed collections | IIIF Discovery API 1.0 spec (online): "static files served over HTTP" | Institutional contributors gain aggregator visibility (OCLC, Europeana, DPLA); credibility signal that converts institutional Archie evaluators to adopters | Y — pure build step, static JSON | Medium | P1 |
| Static oEmbed JSON per exhibit + custom element embed | Educators (LMS), journalists (CMS), institutional sites | oEmbed spec §2.4 (online); clover-iiif web-component pattern (`Prior Art/18-embedding-ecosystem.md`) | Exhibits embed on Canvas/Moodle, WordPress, Ghost, Ghost, Substack etc.; every embedded exhibit creates a new contributor surface | Y (partial) — build step for static JSON; CDN bundle for web component | Medium | P1 |
| FSA folder → bulk image ingest (biiif algorithm browser-side) | Photographers, biologists, archivists with large local image sets | biiif `Directory.ts:55-160` algorithm (`Prior Art/09-web-publishable-serverless.md`); immarkus FSA utils | Removes the "upload to a server" step; local-folder → exhibit in one drag; unlocks field researchers, photographers, mappers | Y — FSA/OPFS; greenfield reimplementation (no lift from Node biiif) | High | P1 |
| ONNX FastSAM region bbox suggestion (lazy Worker) | Biology/medical imaging, DH region annotation | `browser-visual-search` PURE ONNX engine (`Prior Art/19-ai-authoring.md` `segment.ts:8-11`); bbox→FragmentSelector clean mapping | Lowers the "draw a region manually" barrier for non-drawing contributors; auto-suggest + confirm UX | Y (lazy-load) — static `.onnx` on GH-Pages; not boot path; ~20–40 MB | High | P2 |
| GitHub Issues as contribution intake queue | Classroom groups, community archives, casual contributors | Zooniverse model (server-shaped); GitHub Issues is the zero-server approximation | Pre-built button in published Viewer → GitHub Issue template pre-filled with exhibit context; contributor just writes the note | Y — outbound link, no server | Low | P2 |
| Async-zip portable review + conflict-card UI | All collaborative contributors | CONTEXT.md §88 decided; papadam/liiive confirm server-shaped real-time is the alternative | The native serverless collaboration model; merge panel ("Synced 42 notes from Alice · 3 need decision") makes it legible to non-technical collaborators | Y — decided core v1 | High (already planned) | P0 |
| Tablet-responsive Studio layout | Classroom students, field researchers, journalists | No mobile-first statement in CONTEXT.md — current gap | Widens mobile-contributing tier without requiring native app | Y — CSS/Svelte | Medium | P2 |
| WebVTT/SRT → WADM supplementing import | Educators, film scholars, oral historians, journalists | CONTEXT.md §86 decided | Audio/video annotation with pre-existing captions → immediate AV exhibit layer | Y — decided v1 | Low (already planned) | P0 |
| Tropy/Omeka JSON-LD ingest | Digital humanities, museum collections | tropy JSON-LD + EDTF (`Prior Art/14-import-interop.md` and `Prior Art/15-provenance-citation.md`) | Converts existing Tropy/Omeka collections to Archie exhibits; zero re-entry | Y — `jsonld`, `edtf`, `alto-xml` pure libs | Low | P2 |

---

## 5. The most-wanted capability that is genuinely server-shaped

**Live real-time co-editing (the liiive / Google Docs model).**

This is the single most-requested contributor feature in analogous tools (Zooniverse live sessions, Perusall real-time classroom annotation, Recogito collaborative projects). liiive implements it correctly with Yjs+Hocuspocus — a 58-line server.
Source: `Prior Art/10-state-mutation-patterns.md` liiive section.

Why it is fundamentally server-shaped: WebRTC P2P requires a signaling server for NAT traversal (y-webrtc README confirmed). The Hocuspocus persistence model writes a binary Y.Doc blob to object storage on every document change — not a static file. Simultaneous editing requires a broadcast relay.

**Closest serverless approximation within Archie's frame:**
The async-zip DAG with a well-designed merge UI ("Synced 42 notes from Alice · 3 need your decision") approximates the *outcome* of real-time collaboration without requiring presence. The addition of:
1. A named "merge session" UX concept — "Start a collaborative pass" → share zip → invite collaborator to download and annotate → import their return.
2. A fast-forward indicator in the Studio: "Alice added 12 notes since your last import."
3. Readings as isolated interpretive passes — collaborators work in separate Readings, never conflict.

...makes async feel intentional (scholarly peer review) rather than a degraded real-time. This reframe is available within the locked frame.

**Seed for later:** if Archie ever adds an optional server component, a minimal Hocuspocus deployment (~58 lines, `Prior Art/10-state-mutation-patterns.md` `liiive-server/src/index.ts:1-58`) is the reference. The WADM round-trip from Y.Doc binary → AnnotationPage is the unsolved gap.

---

## 6. Key system-design findings

1. **The async-zip DAG is not a degraded real-time — it IS the correct serverless-native collaboration primitive.** Yjs binary encoding validates the approach (compact diff transport = zip payload). The right investment is a better merge UX, not a sync server.

2. **IIIF Manifest pull + CSV import are the two highest-ROI contributor funnel-wideners.** Both are pure browser, low effort, and convert two large adjacent audiences (IIIF-literate institutions, spreadsheet-native non-technical contributors) with near-zero friction.

3. **OffscreenCanvas DZI Worker tiling (v1.1) unlocks the large-image contributor segments** that are currently blocked (biology, medical, cartography, fine art photography). No external tiling service = the decisive no-lock-in differentiator over every surveyed comparator.

4. **Static SEO + IIIF Change Discovery pages at build time cost almost nothing and make every exhibit findable by aggregators and search engines.** This is the discoverability layer the entire field lacks in serverless publishing tools.

5. **oEmbed is 80%-solvable serverlessly** via build-time static JSON per exhibit + og-tags (covers social unfurl). The remaining 20% (dynamic oEmbed registry for arbitrary consumer queries) is server-shaped — acceptable deferred.

6. **In-browser ONNX AI (FastSAM) is feasible as a lazy-loaded Worker** (model served as a static GH-Pages asset, not in the 240 KB boot budget). It broadens the biology/medical/fine-art annotation contributor segment significantly — but the polygon contour-trace (SvgSelector) step is greenfield if non-rect regions are needed.

7. **GitHub OAuth PKCE is the identity bridge** — local display name for authoring + GitHub username as citable public author identity. No DID infrastructure needed for v1. The same credential used for publish doubles as contributor attribution.
