# papadam — single-repo cross-axis profile

> Discovered late by the coverage sweep. Most **feature-complete annotation platform** in the tree, but it is a
> **media-collaboration platform, NOT a deep-zoom IIIF image viewer.** Fork of PLASMA/papad (Janastu/Servelots).
> Stack: Django REST (`api/`) + SvelteKit PWA (`ui/`) + y-websocket server (`crdt/`) + Whisper worker (`transcribe/`) + Docker (`deploy/`).
>
> **LOAD-BEARING MISMATCH (from axis 10, confirmed):** papadam persists annotations two ways — normalized
> Django `Annotation` rows AND a **binary Y.js CRDT blob** (`YDocState.binary_state`). It does **NOT** persist a WADM
> `AnnotationPage`. It *emits* a W3C-shaped JSON by populating a template at serialize time (`annotate/models.py:155-180`),
> with a temporal target `media_target = "t=22.5,37"`. So it is a **CRDT/REST platform that adapts to W3C on read**, not a
> WADM-native store. Treat its data-model code as adapter/anti-pattern donor, never as a WADM conformance example.
>
> **DOC-vs-CODE drift (load-bearing):** `ARCHITECTURE.md` + `STATE.md` call Whisper "partial (stub) — no transcription
> logic; VTT passthrough only." **The code contradicts the docs** — `transcribe/worker.py:28-52,96` is real Whisper
> (`whisper.load_model`, `model.transcribe`, segments→VTT with `start --> end` timestamps). A surveyor trusting STATE.md
> alone would wrongly skip transcribe/. Cite the code, not the doc.

## papadam × 20 axes

| Axis | Signal? | `file:line` | PURE / COUPLED | vs existing donor |
|---|---|---|---|---|
| ① deep-zoom-viewer | **none** | — | — | No OSD/IIIF/DZI anywhere in source. Pure media (HLS) platform. OSD donors (osd-audio-video, field-studio) unchallenged. |
| ② annotation-tools | medium | `ui/.../MediaPlayer.svelte:117-120`; `annotate/models.py:64,69` | COUPLED(Svelte/HLS) | Temporal media regions only (`t=start,end`); NO SVG/Path/Ellipse drawing. Annotorious donors own the shape-selector axis. |
| ③ data-model (WADM) | medium (negative) | `annotate/models.py:155-180`; `annotate/annotation_structure.json` | PURE (template-fill) | W3C-shaped emit via JSON template, NOT AnnotationPage; temporal FragmentSelector. Adapter pattern donor; **anti-example** for conformance. cozy-iiif/manifesto own real WADM. |
| ④ multimedia-AV | **BEST (co-donor)** | `transcribe/worker.py:28-52`; `MediaPlayer.svelte:166`; `archive/views.py:375-402` | PURE (worker) / COUPLED(Svelte) | **Only repo with real ASR→VTT→time-synced caption track end-to-end.** osd-audio-video has richer temporal *authoring* UX; papadam has the *transcript pipeline* nobody else ships. |
| ⑤ multi-object/collections | medium | `exhibit/models.py:15-86` | COUPLED(Django) | Exhibit = ordered ExhibitBlock list (media|annotation), `is_public`. Server-DB curated collection. iiif-manifest-editor Vault owns normalized-store; papadam owns the *curated ordered-block* shape. |
| ⑥ authoring-CMS | **BEST (server-CMS)** | `exhibit/models.py`; `media_relation/views.py:27-115`; `ui/.../exhibits/[uuid]/edit/+page.svelte` | COUPLED(Django+Svelte) | Full group-scoped CMS: upload→annotate→thread→exhibit-build→publish, server-side paginated archive picker. The only **server-backed multi-user** authoring donor (immarkus/field-studio are local-first single-user). |
| ⑦ published-read-UI | strong | `ui/.../exhibits/[uuid]/+page.svelte`; `exhibit/models.py:19` (`is_public`) | COUPLED(Svelte) | Public exhibit read route + media player w/ captions. Server-rendered, not static. juncture/quire own static narrative; papadam owns the *server read* split. |
| ⑧ linkable/navigable | medium | `media_relation/views.py:97-115` (`media_ref` → cross-media); `crdt schema reply_to` (ARCHITECTURE.md:207-208) | COUPLED(Django) | Annotation→media and annotation→annotation (threaded `reply_to`) links exist as DB FKs. NO URI scheme, NO fitBounds (it's not spatial). anvil `anvil://` + fitBounds unchallenged. |
| ⑨ web-publishable/serverless | **none** | — | — | Opposite of serverless: requires Postgres+Redis+MinIO+y-websocket+Caddy. Confirms gap-A, does not close it. tiny-iiif/canopy own static. |
| ⑩ state-mutation | **BEST (CRDT)** | `crdt/src/index.ts:105-165`; ARCHITECTURE.md:193-223 (Y.Doc schema); `crdt/views.py:73` | PURE(adapter) / COUPLED(y-websocket) | **Production Y.js CRDT**: per-media `Y.Doc`, `Y.Text` char-merge on body, LWW on `media_target`, OR-Set tags, awareness=playback cursor, debounced binary persist to Django. Richer than liiive's Yjs (papadam adds the *server-authoritative split* + binary persistence bridge). The reference CRDT donor. |
| ⑪ search | medium | `annotate/views.py:55-75`; `common/functions.py:47-75` | COUPLED(Django ORM) | `icontains` text search + scope filter (name/tags/collections/public). Server SQL search, incl. transcript-content search planned. clover/mirador own client-side; papadam owns the *server full-text* shape. |
| ⑫ a11y | weak | `ui/.../MediaPlayer.svelte:200` (`role="alert"`); high-contrast UIConfig profile (ARCHITECTURE.md) | COUPLED(Svelte) | High-contrast CSS profile + caption track + some ARIA; full WCAG audit deferred. Mirador a11y *decisions* still the donor. |
| ⑬ i18n | medium | `ui/messages/` + `ui/project.inlang/` (Paraglide/inlang) | COUPLED(SvelteKit) | inlang/Paraglide message catalog — real multi-locale UI. NOT WADM `Choice` body-level lang. manifesto `getSuitableLocale` still owns content negotiation. |
| ⑭ import/interop | medium | `importexport/` app; `annotate/models.py:155-180` (W3C emit) | COUPLED(Django) | Tarball import/export + W3C-shaped JSON emit. Interop on *its* schema, not lossless WADM. annotorious W3CImageFormat unchallenged for SVG. |
| ⑮ provenance/citation | medium | crdt schema `created_by`/`created_at` immutable (ARCHITECTURE.md:209-210); `is_instance_admin_withheld` moderation flags | COUPLED(Django/CRDT) | Immutable author+timestamp on every annotation, server-authoritative moderation withholding. Real provenance, not citation/manifest. |
| ⑯ perf | medium | `ui/.../hls.ts` (adaptive HLS); `crdt/src/index.ts:133-160` (debounced persist) | COUPLED(HLS.js/y-websocket) | HLS adaptive streaming + 2s debounced CRDT writes + service-worker precache. Mirador virtualization owns large-manifest perf; papadam owns *media-streaming* + *sync-write batching*. |
| ⑰ in-browser-tiling | **none** | — | — | No tiling. Punts to HLS server transcode (ffmpeg ARQ worker), not in-browser. Confirms gap, no donor. |
| ⑱ embedding | **none** | — | — | No web-component, no oEmbed, no iframe contract. SPA only. clover/UV own embed. |
| ⑲ AI-authoring | **BEST (only ASR)** | `transcribe/worker.py:28-52,96` | PURE | **The only AI-authoring code in the tree: Whisper ASR generating time-coded transcript bodies.** hyperaudio-lite does transcript↔audio *sync UI* but no ASR generation. papadam is the generation half. |
| ⑳ security | strong | `crdt/views.py:35-73` (CrdtServerTokenAuth); `archive/views.py:383-384` (InternalServiceKeyAuth); `crdt/src/index.ts:77-99` (JWT verify + group check) | PURE(auth logic) / COUPLED(DRF) | JWT (drf-simplejwt, refresh+blacklist) + two static-secret service-auth classes for server→server. CSP/HSTS headers (Caddy). **Caveat:** `ALLOWED_HOSTS=["*"]` (config/common.py:77); RichTextField HTML body with no visible sanitization. decap-cms owns OAuth-from-SPA; papadam owns *multi-tier service auth*. |

## Where papadam is the BEST donor (shortlist)

1. **④ + ⑲ — ASR transcript pipeline** (`transcribe/worker.py:28-52,96` → `archive/views.py:375-402` → `MediaPlayer.svelte:166`). Whisper STT → WebVTT with real timestamps → stored → rendered as a `<track kind="captions">`. End-to-end, real, framework-light. **Nothing else in the tree generates transcripts.**
2. **⑩ — Production Y.js CRDT with a server persistence bridge** (`crdt/src/index.ts:105-165`, schema ARCHITECTURE.md:193-223). Char-level `Y.Text` body merge, LWW target, OR-Set tags, awareness=playback-cursor, debounced binary persist + server-authoritative moderation. The reference for "real CRDT, not claimed."
3. **⑥ — Server-backed multi-user authoring CMS** (`exhibit/models.py`, `media_relation/views.py:27-115`). Group-scoped upload→threaded-reply→exhibit-build→publish with a paginated archive picker. The only server-multi-user authoring donor (others are local-first single-user).

## Where papadam fills a previously-greenfield gap

- **gap-D transcript hole — PARTIAL closure (NOT clean yes).**
  - **Closed half (real code):** ASR generation + WebVTT↔time sync + caption rendering. `transcribe/worker.py:36-52` (`_segments_to_vtt` emits `start --> end`), `worker.py:96` (`model.transcribe`), `MediaPlayer.svelte:166` (`<track kind="captions">`). This is exactly the "WebVTT↔time" piece gap-D calls greenfield, and it is the **only working instance in the corpus** (hyperaudio-lite is sync-only, no ASR).
  - **Open half:** the transcript is stored as `transcript_vtt_url` URLField on the media model (`archive/models.py:106-107`), **NOT** as a WADM annotation body with `motivation: supplementing`. So gap-D's "transcript *as first-class WADM annotation body*" wording is **still open**; papadam closes the *generation + sync* but stores it as a media-attached file, not a WADM body.
  - **Lift verdict:** lift `worker.py` (PURE — Whisper+VTT, zero web-framework coupling) as the transcript-generator; then write the missing adapter `VTT → WADM TextualBody[] with FragmentSelector t=` ourselves to make it a `supplementing` body.

- **⑩ CRDT collaboration** — anvil/annomea research distilled the *patterns*; papadam is a *working* server-authoritative Yjs deployment to study against that research.

## Verdict for our build

- **Lift:** `transcribe/worker.py` (PURE ASR→VTT) — the gap-D generator. Study `crdt/src/index.ts` persistence-bridge pattern (PURE adapter logic, even if y-websocket-coupled).
- **Study, don't lift:** exhibit/media_relation CMS (Django-coupled, but the *shape* — ordered blocks + threaded replies + server picker — informs our authoring model); auth tiering (`crdt/views.py:35`).
- **Avoid / anti-pattern:** its data model as WADM reference (it isn't); `ALLOWED_HOSTS=["*"]`; RichTextField unsanitized HTML body. papadam is **not** a serverless or deep-zoom donor — wrong architecture for axes ①⑨⑰⑱.
