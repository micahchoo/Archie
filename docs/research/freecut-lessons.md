# Freecut lessons: memory, storage, import, export, transcoding for Archie

**Question:** what can [freecut](https://github.com/walterlow/freecut) — a local-first,
browser-based multi-track video editor (WebCodecs + Web Workers + OPFS + File System Access,
zero uploads) — teach Archie about memory, storage, import, export, and transcoding?
**Method:** deep-research workflow (2026-07-20, run `wf_148ce59d-ec5`): 5 search angles, 22
sources fetched, 104 claims extracted, top 25 adversarially verified (3 skeptic votes each) —
**25 confirmed, 0 refuted**. Every freecut claim was checked against a local clone at commit
`a3ecfce` (2026-07-10); freecut pins mediabunny 1.50.3. Line numbers cite that commit.
**Companion doc:** [browser-storage-quota.md](browser-storage-quota.md) (same day) — freecut is
a live specimen of that doc's "promote the FSA folder to primary store" recommendation.

> **Erratum (2026-07-20, same evening — verified by a working-tree audit):** a concurrent
> session's storage batch superseded this report's Archie-current-state claims the same day.
> Now FALSE: "zero `navigator.storage.persist()` calls" (built: `storage-quota.svelte.ts:59-67`,
> fired on first asset write), "quotaOkFor preflights" (replaced by attempt-and-catch,
> Issue 26 / merge `847c6a8`), and the `binding.ts:163` OPFS cite (working store mounts in
> `store.ts:38-41`). Rank 2's "extend tmp+replace to FSA/OPFS" is also a non-issue: FSA/OPFS
> `createWritable()` is spec-atomic on close (swap-file) — the tauri-fs-seam rule documents
> exactly this. The freecut-side findings stand. Follow-ups resolving open question 4:
> [freecut-gaps.md](freecut-gaps.md) (undo/history, schema versioning, headless, proxies —
> source-depth) and [freecut-unverified-claims.md](freecut-unverified-claims.md) (recovered
> unverified claims).

## The three lessons that change Archie's code now

1. **Archie stores durable libraries in evictable storage and never asks for persistence.**
   OPFS is quota-bound and wholesale-deleted on clear-site-data; non-persisted origins can be
   evicted under storage pressure. Archie's web studio puts libraries in OPFS
   (`apps/studio/src/binding.ts:163`) with **zero `navigator.storage.persist()` calls anywhere**
   (verified across `packages/render-core/src/fs/` and `apps/studio/src/`). Freecut's answer is
   architectural, not a flag: OPFS holds only regenerable caches (waveforms, filmstrips);
   durable state lives in a user-chosen FSA workspace folder. Cheapest first step: call
   `persist()` and surface persistence status; the full move — FSA-folder-primary with OPFS
   demoted to cache — is the same promotion browser-storage-quota.md already argues for on
   quota grounds, and `packages/render-core/src/fs/fsa.ts` already exists.

2. **If AV transcoding/frame work ever lands, the stack is settled: WebCodecs via mediabunny,
   not ffmpeg.wasm.** Freecut ships zero ffmpeg (grep of its lockfile: 0 hits); mediabunny
   covers MP4/MOV/WebM/MKV/HLS/WAVE/MP3/Ogg/ADTS/FLAC/MPEG-TS across 25+ codecs, with tiny
   per-codec wasm plugins (`@mediabunny/aac-encoder`, `mp3-encoder`, `ac3`, `prores`) filling
   exactly the gaps browsers leave. Container muxing is an explicit WebCodecs *non-goal*, so
   this class of userland library is mandatory, and MDN itself now recommends mediabunny as
   the demuxer. Vendor benchmark ~67× faster than ffmpeg.wasm (independent tests: ~8–15× —
   direction robust, multiplier not).

3. **AV ingest can get metadata + posters nearly free, today.** Mediabunny reads lazily
   ("creating an Input performs zero reads"; bounded 8 MiB read cache) — duration, dimensions,
   rotation, sample rate come off a Blob without decoding. Freecut's import worker is the
   template (`src/features/media-library/workers/media-processor.worker.ts:411-515`), and its
   `CanvasSink` thumbnail path (`thumbnail-generator.ts:62-68` → WebP) is the lowest-effort
   extension of Archie's baked-thumbnail approach to video objects. Mediabunny's `CustomSource`
   (`getSize` + `read(start, end)`) maps directly onto Archie's `Filesystem` interface, so one
   adapter serves all four backends. Studio's `ingest-flows.ts` currently extracts nothing
   from AV files.

## Ranked findings

All confirmed 3–0 unless noted. "Conditional" = binds only if Archie adds frame-level AV
features (today video plays via HTML5 `<video>`; no `VideoFrame` is ever touched).

| # | Lesson | Freecut mechanism | Archie mapping |
|---|--------|-------------------|----------------|
| 1 | OPFS is evictable; durable ≠ OPFS | OPFS = cache only (`waveform-opfs-storage.ts`); durable = FSA workspace | `persist()` + quota UI now; FSA-primary later. Web studio only — Tauri writes real disk |
| 2 | Storage tiering + atomic JSON writes (2–1 vote) | tmp+replace writes (`workspace-fs/fs-primitives.ts:1-15`); IndexedDB stores *only* FSA handles (`handles-db.ts`); interval autosave, minutes, 0=off (`use-auto-save.ts:21-44`) | Tauri backend already atomic (tauri-fs-seam rule); delta = extend tmp+replace to FSA/OPFS backends. Archie's 800 ms debounced change-driven autosave (`exhibit-session.svelte.ts:74`) already beats interval-style; optional safety-net interval save is the only gap |
| 3 | Lazy AV metadata probing | `media-processor.worker.ts:411-515`, `fastMetadata` option for index-less formats | New capability for `ingest-flows.ts`; `CustomSource` wraps the `Filesystem` seam, `UrlSource` covers HTTP backend |
| 4 | Posters/filmstrips via `CanvasSink`, worker-capable | `thumbnail-generator.ts:62-68`, `filmstrip-extraction-worker.ts:202-209` (streaming timestamps, poolSize 4); yields `OffscreenCanvas` off-DOM | Extends baked thumbnails to video; handles resize+rotation so callers never touch raw `VideoFrame`s |
| 5 | WebCodecs-first transcoding, tree-shaken codec plugins | Five `@mediabunny/*` packages pinned 1.50.3; `Conversion` API with `onProgress` + `cancel` (`proxy-generation-worker.ts:262-297`) | The answer to browser-storage-quota.md's "transcoding is not worthless" — a TIFF/media transcode path without ffmpeg.wasm |
| 6 | Runtime codec probing + fallback chains are mandatory | Per-codec `canEncodeVideo` probes, `DEFAULT_FALLBACK_CODEC_ORDER`, ProRes→AVC, HEVC→H.264, **test-encode of a blank frame** because declarative checks lie (`client-renderer.ts:113-233`, `render-support.ts:261-306`) | Spec guarantees *no* codec ("Implementers are free to support… none at all"). Any Archie WebCodecs path must probe, never assume. Conditional |
| 7 | `VideoFrame.close()` is correctness, not hygiene | Close-on-every-path: LRU caches close on eviction (`scrubbing-cache.ts:225,231,252`), try/finally in orchestrator, `AudioData` closed in waveform worker | Reference-counted GPU/decoder memory, not GC-managed; <100 unclosed frames can crash; unclosed frames stall the decoder (~10-frame pool). Conditional |
| 8 | Backpressure-aware bounded-memory export | Awaited `add()` at queue depth 1 (`render-support.ts:50-59`); `StreamTarget` (4 MiB chunks) onto OPFS writable — WritableStream backpressure throttles the *encoders*; `BufferTarget` only as no-OPFS fallback (`export-output-target.ts:74-101`) | The AV-render analogue of Archie's streamed zip discipline. Conditional on awaited submission + interleaved tracks |
| 9 | Streaming I/O everywhere — **Archie already at parity** | All 7 `Input` sites use streaming sources; no path buffers a whole video | Archie's fflate streaming zip (`fs/zip-stream.ts`, commit `5725f02` removed the 1 GiB ceiling) is the same invariant. Confirmatory: don't regress |
| 10 | Fastest OPFS path = `SyncAccessHandle` in a dedicated worker | `opfs-worker.ts` (`createSyncAccessHandle` ×5 sites) | Archie uses async main-thread `createWritable` (`fs/fsa.ts:15`) — fine for its small-JSON write profile; revisit only if large AV blobs cause jank |
| 11 | `UrlSource` = prior art for `HttpFilesystem`; carries a latent bound-fetch seam | Adaptive range prefetch (64 MiB cache, parallelism 2); `fetchFn ?? fetch` object-stored (mediabunny `source.ts:899`) — currently invoked in the browser-safe bare form | Exactly the shape the bound-fetch-defaults rule governs; if Archie adopts mediabunny, bind the injected fetch (`globalThis.fetch.bind(globalThis)`) |

## Where Archie already does it as well or better

- **Streamed export:** fflate streaming zip with no eager ceiling (`5725f02`) ≥ freecut's StreamTarget discipline.
- **Atomic writes:** Tauri temp-then-rename (tauri-fs-seam) matches freecut's tmp+replace — freecut just applies it to *all* backends.
- **Autosave:** change-driven 800 ms debounce beats freecut's minutes-granularity interval.
- **Corrupt-read tolerance:** per-item skip-and-report (render-core-data-integrity rule) has no freecut equivalent in verified findings.

## Caveats

- Mediabunny's 67×/470× figures are self-published, best-case GPU-encode (RTX 4070); Remotion's independent benchmark shows ~15×, others ~8× — direction robust, multiplier not.
- "WebCodecs-native" means WebCodecs-*first*: the `@mediabunny/*` plugins are wasm coders for browser gaps; hardware acceleration is best-effort per spec.
- Rank 2 carried a 2–1 vote; the dissent was framing (Archie is not autosave-less), which the merged claim now reflects.
- Ranks 5–8 are conditional on Archie ever touching frames/transcode.
- OPFS eviction exposure is web-studio-only; Tauri writes real disk.
- Freecut's undo/history, project schema/versioning, and headless render build produced **no surviving verified claims** — unanswered, not disconfirmed (see open questions).
- Freecut line numbers drift with upstream commits; all cited at `a3ecfce`.

## Open questions

1. `persist()` + quota UI, or full FSA-folder-primary? What's the real eviction incidence for Archie's users?
2. Can `CustomSource` cleanly wrap the `Filesystem` seam across all four backends, and what is mediabunny's bundle-size/licensing cost in studio?
3. Would SyncAccessHandle-in-worker measurably improve persist latency, or is it only justified once large AV blobs flow through ingest?
4. Freecut's undo/history, project file schema, and headless build (`headless/`, Docker) remain unstudied — each could inform Archie's spine/history and publish pipelines.

## Sources

Primary: freecut clone (`a3ecfce`) + [repo](https://github.com/walterlow/freecut);
[mediabunny](https://github.com/Vanilagy/mediabunny) + [docs](https://mediabunny.dev/)
([reading](https://mediabunny.dev/guide/reading-media-files),
[StreamTarget](https://mediabunny.dev/api/StreamTarget),
[CanvasSink](https://mediabunny.dev/api/CanvasSink),
[codecs](https://mediabunny.dev/guide/supported-formats-and-codecs));
[W3C WebCodecs spec](https://www.w3.org/TR/webcodecs/) (WD 2026-07-08) +
[explainer](https://github.com/w3c/webcodecs/blob/main/explainer.md);
[Chrome WebCodecs best practices](https://developer.chrome.com/docs/web-platform/best-practices/webcodecs);
MDN ([Using WebCodecs](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API/Using_the_WebCodecs_API),
[codec selection](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API/Codec_selection),
[quota/eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria));
[web.dev OPFS](https://web.dev/articles/origin-private-file-system) +
[persistent storage](https://web.dev/articles/persistent-storage);
[WHATWG File System spec](https://fs.spec.whatwg.org/).
Secondary: [Remotion webcodecs benchmark](https://github.com/remotion-dev/webcodecs-benchmark),
[Remotion misconceptions](https://www.remotion.dev/docs/webcodecs/misconceptions),
webcodecsfundamentals.org.
