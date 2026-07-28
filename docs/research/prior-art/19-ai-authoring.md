# Axis 19 — AI-assisted authoring

## Focused question
What AI-assist for authoring exists as prior art — auto-region detection (segmentation), auto alt-text/captioning, OCR/HTR transcription, CLIP embeddings for semantic search, entity linking, suggested annotations — and crucially what runs IN-BROWSER (PURE / serverless-compatible) vs needing a server/Node?

## Sources surveyed
- `IIIF/browser-visual-search` — in-browser FastSAM segmentation + CLIP embeddings via onnxruntime-web — **y (deep, src/)**
- `IIIF/iiif-visual-search` — Astro/React consumer of the above (FSA dir-picker UI) — **y (deps + tree)**
- `tropy` — ALTO-XML OCR/transcription ingest — **y (commands/transcription)**
- `field-studio` — `@mariozechner/pi-*` deps — **y (pkg + src grep)**
- `hyperaudio-lite` — interactive transcript sync — **y (README + js/)**
- `annomea` / `anvil` — any AI-assist design — **y (grep, none found)**

## Findings by source

### IIIF/browser-visual-search — the in-browser AI gold (FastSAM + CLIP + onnxruntime-web)
- **ONNX model loading (segmenter)** — `IIIF/browser-visual-search/src/segmentation/segment.ts:8-11` — PURE — context: `ort.InferenceSession.create(url, { executionProviders: ['wasm'] })`, lazily memoized. Maps to: load FastSAM in the PWA, no server. URL is a static `.onnx` asset → GH-Pages-servable.
- **ONNX model loading (CLIP embedder)** — `src/embedding/embed.ts:9-11` — PURE — context: same pattern, providers `['webgpu','wasm']` (GPU-accelerated where available). 512-dim CLIP-ViT-B/32 visual encoder.
- **Image preprocess / letterbox→tensor** — `src/segmentation/preprocess.ts` (`letterboxToTensor`, `MODEL_INPUT_SIZE`) — PURE — context: `OffscreenCanvas` + `getImageData`, RGBA→planar RGB float32, records `scale/padX/padY` to map detections back. Maps to: image→model-input prep, pure DOM/canvas, no Node.
- **FastSAM output decode (NMS + mask)** — `src/segmentation/postprocess.ts` (`decodeDetections`, `nms`, `decodeMask`, `maskAreaInBBox`) — PURE — context: parses `[1,37,N]`+`[1,32,256,256]` YOLOv8-seg tensors → confidence filter → NMS → per-detection mask = `sigmoid(coeffs @ protos)`. **The instance mask IS computed but used ONLY for area; the polygon/contour is never extracted.**
- **bbox → normalised [x,y,w,h]** — `src/segmentation/preprocess.ts` (`modelBoxToNormalisedBBox`) — PURE — context: detection output is a normalised **axis-aligned box** → maps cleanly to our **FragmentSelector** `xywh=pixel:`. Does NOT produce **SvgSelector** geometry.
- **CLIP embedding gen + crop** — `src/embedding/embed.ts:54-71` (`embedImage`), `:74-107` (`embedBatch`), `cropToClipTensor` (`:18`), `l2Normalise` (`:46`) — PURE — context: crops bbox region, resizes to 224, CLIP-normalises (`MEAN/STD`), runs ONNX, L2-normalises. Batch path stacks `[B,3,224,224]`. Maps to: embed each detected Region for semantic search.
- **Nearest-neighbour search (cosine)** — `src/search-index/index.ts:64-83` (`nearestNeighbours`), query at `:148-154` — PURE — context: dot-product of L2-normalised vectors = cosine; sort desc, topK. Query by image OR by bbox region. Maps to: "find similar regions" — closes detection→discovery loop.
- **Index persistence (serverless)** — `src/search-index/index.ts:171-187` (save), `:187-214` (`openIndex`) — PURE — context: writes `index.json` + flat `embeddings.bin` (Float32) into a `.visual-search/` dir via **File System Access API** handle; incremental builds. Maps directly to anvil's `FsaFilesystem` / `.anvil/` persistence model.
- **Public API** — `src/index.ts` (`segmentImage`, `embedImage`, `embedBatch`, `buildFromDirectory`, `openIndex`) — PURE — context: clean lift-able surface, zero framework imports.

### IIIF/iiif-visual-search — consumer wiring (the COUPLED reference)
- **Whole-app integration** — dep `browser-visual-search@^0.2.0` (`package.json:23`); `src/hooks/use-visual-search-index.ts`, `src/lib/fs/*`, `src/components/build-index/build-index.tsx` — COUPLED(Astro/React) — context: shows the dir-picker→build→query UX over the PURE engine. Study the wiring; don't lift it (we're Svelte). a11y/embed concerns covered by axes 12/18.

### tropy — OCR transcription INGEST only (no engine)
- **ALTO-XML → plain text** — `tropy/src/commands/transcription/create.js:2,28` + `tropy/src/commands/api/transcription.js:3,21,78` — PURE(parse) but COUPLED(redux-saga/Electron) in situ — context: `Document.parse(data).toPlainText()` from `alto-xml@^1.0.1`. **Tropy does NOT run OCR/HTR** — it ingests ALTO produced by an external engine/plugin and stores the text. Maps to: if we accept ALTO, `alto-xml` → **TextualBody**; the OCR *generation* is not here.

### field-studio — NO runtime AI feature
- **pi-* deps are dev-tooling, not features** — `field-studio/package.json:50-53` (`@mariozechner/pi-agent-core`, `pi-ai`, `pi-coding-agent`, `pi-tui`) — context: grep of `src/`/`scripts/`/`bin/` finds **zero imports** — they appear only in `package.json`/`package-lock.json`. These are the *pi coding-agent CLI* (dev assistant), NOT an in-app AI authoring feature. Do not cite field-studio as AI-authoring prior art.

### hyperaudio-lite — transcript SYNC, no ASR
- **Sync + caption only** — `hyperaudio-lite/js/hyperaudio-lite.js`, `caption.js` (~10 KB, no framework, MIT) — PURE — context: aligns an *existing* transcript to media playback (word-highlight, click-to-seek). **No ASR / speech-recognition / transcript generation** anywhere. The transcript must pre-exist (axis-19 transcript *piece*, not *generation*). Maps to: caption/transcript-body playback sync, not authoring AI.

### annomea / anvil — no AI-assist designed
- grep for `fastsam|clip|onnx|segment|auto-region|alt-text|captioning|ocr` across `annomea/src`, `anvil/src`, `anvil/docs` → **no AI authoring feature or ADR**. Greenfield for us.

### papadam — BEST (and only) AI-authoring code in the corpus
- **Whisper STT transcript generation** — `papadam/transcribe/worker.py:28-52,96` — PURE — loads a Whisper model once, `model.transcribe(...)`, converts segments to time-coded WebVTT. The only generative-AI authoring code surveyed; hyperaudio-lite does transcript↔audio *sync UI* but never *generates* the transcript. Framework-light ARQ worker — directly liftable as our transcript generator. (Stale `ARCHITECTURE.md`/`STATE.md` call it a stub — code disproves that.)

## Pure-logic extractables (the gold)
| Capability | Source `file:line` | Pure? | Depends on | Extraction effort | Maps to our need |
|---|---|---|---|---|---|
| In-browser ONNX session load | `browser-visual-search/src/segmentation/segment.ts:8-11`; `embedding/embed.ts:9-11` | PURE | onnxruntime-web | Low (copy) | Run FastSAM+CLIP in PWA, GH-Pages assets |
| Letterbox preprocess + inverse map | `segmentation/preprocess.ts` (`letterboxToTensor`, `modelBoxToNormalisedBBox`) | PURE | OffscreenCanvas | Low | Image→tensor; detection→image coords |
| FastSAM decode (NMS+mask) | `segmentation/postprocess.ts` (`decodeDetections`) | PURE | none | Med | Auto-Region detection from tensors |
| CLIP embed (single+batch) | `embedding/embed.ts:54,74` (`embedImage`/`embedBatch`) | PURE | onnxruntime-web | Low | Embed Regions for semantic search |
| Cosine kNN search | `search-index/index.ts:64-83` | PURE | none | Trivial | "Find similar regions" query |
| FSA index persistence | `search-index/index.ts:171-214` | PURE | FSA API | Low | Aligns w/ `.anvil/` `FsaFilesystem` |
| bbox→FragmentSelector | `segmentation/preprocess.ts` (`modelBoxToNormalisedBBox`) | PURE | none | Trivial | Auto box → `xywh=pixel:` body |
| ALTO→text | `tropy` via `alto-xml@1.0.1` | PURE(lib) | alto-xml | Low | OCR ingest → TextualBody |

## Gaps — what NO surveyed repo solves
- **No segmentation mask → `SvgSelector` path.** browser-visual-search computes the instance mask (`decodeMask`) but discards everything except a normalised **axis-aligned bbox** — there is **no contour-tracing / polygon extraction / mask→`<svg>` serialization** anywhere in the corpus. Auto-region detection here can populate a **FragmentSelector** (rect) but NOT the non-rect **SvgSelector** (polygon/Path) our model wants. We'd have to write marching-squares contour-trace + SVG-polygon emit ourselves — and that lands squarely on the `_FRAMING.md` Ellipse/Path round-trip risk surface.
- **No in-browser OCR/HTR engine.** Tropy *ingests* ALTO; nobody *generates* it client-side. No Tesseract-wasm / TrOCR / HTR in any surveyed repo.
- **No in-browser ASR / transcript generation.** hyperaudio-lite syncs a pre-existing transcript; no Whisper-wasm or speech→text. The "auto-caption" body has no generator in the corpus.
- **No auto alt-text / image captioning model** (no BLIP/captioning ONNX) and **no entity linking** anywhere.
- **No "suggested annotation" UX** wiring detection output into an editable draft annotation.

## Verdict for our build (lift / study / avoid, and why)
- **LIFT** the entire `browser-visual-search` PURE engine (segment / embed / cosine-kNN / FSA-persist). It is genuinely framework-agnostic, serverless, and aligns with our FSA/`.anvil/` model — the single strongest AI-authoring asset in the corpus and the auto-region + semantic-search engine. Wrap its bbox output as a **FragmentSelector**-bodied suggested annotation.
- **BUILD (greenfield)** mask→contour→`SvgSelector` if we want auto-detected *polygon* Regions — corpus punts it entirely; mind the Ellipse/Path corruption verdict.
- **STUDY, don't lift** `iiif-visual-search` (Astro/React consumer) for UX flow only.
- **AVOID citing** field-studio as AI-authoring (pi-* = dev CLI, not a feature).
- **DEFER** OCR/HTR and ASR: ingest-only via `alto-xml` (PURE) is viable; in-browser *generation* is a fresh greenfield (Tesseract-wasm / Whisper-wasm) with no prior art here. hyperaudio-lite is reusable for transcript *sync*, not generation.
