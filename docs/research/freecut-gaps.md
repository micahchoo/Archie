# Freecut gaps: undo/history, project schema, headless render, proxy, and the optimizations the first pass missed

**Question:** the [freecut](https://github.com/walterlow/freecut) deep-research pass
([freecut-lessons.md](freecut-lessons.md)) produced 11 verified lessons on memory/storage/
import/export/transcoding but left four areas unstudied — undo/history, project schema &
versioning, the headless render build, and proxy/preview strategy — plus it did not sweep
DESIGN/PRODUCT/CHANGELOG for optimization mechanisms or explain the `@huggingface/transformers`
dependency. What do those hold for Archie?
**Method:** direct source read of the local clone at commit `a3ecfce` (2026-07-10), the copy under
`Prior Art/freecut/`. Every claim below cites `file:line` in that tree; line numbers drift with
upstream. No adversarial verification pass — these are read-the-code conclusions, not vote-scored
claims. Where an area turned out thin, it says so instead of padding.

## The findings most likely to become Archie tickets

1. **Cache-schema-versioning: stamp regenerable caches with a version and delete+regenerate on
   mismatch.** Freecut's proxies carry `PROXY_SCHEMA_VERSION = 4`
   (`src/features/media-library/proxy-constants.ts:4`); startup deletes any proxy whose recorded
   version differs and re-derives it (`proxy-service.ts:500-512`). Archie's OPFS caches (baked
   thumbnails, and any future waveform/filmstrip cache) have no such stamp — a format change
   silently serves stale artifacts. Cheap to add, closes a whole class of "why is the thumbnail
   wrong after an update" bugs.

2. **Content-addressed dedup for baked assets.** `getSharedProxyKey` keys a proxy by
   SHA-256 `contentHash` → OPFS-path-hash+size → file-fingerprint (`proxy-key.ts:38-57`), so two
   media items with identical bytes share ONE physical proxy file. Archie already stores a
   `contentHash` concept in its published tree; the same key would let identical images across
   exhibits share one baked thumbnail / one published blob instead of duplicating.

3. **Migration refinement: normalize on every load + a `migrated` flag that forces a re-save.**
   Archie already has the tldraw-pattern `migrate(doc, migrations)` + `SCHEMA_VERSION` + `stamp`
   (`packages/render-core/src/migrate/migrate.ts`, empty registry at v1). Freecut is the mature
   version of the *same* pattern at v13 (`src/shared/projects/migrations/types.ts:13`) and adds two
   refinements worth copying: (a) a `normalizeProject` pass runs on **every** load to apply current
   defaults, independent of version bumps; (b) `migrateProject` returns `migrated: boolean`
   distinguishing a version-migration from a normalization-only change, and the caller persists the
   upgraded doc when true (`migrations/index.ts:99-117`).

4. **Blob-URL refresh on tab wake.** Browser memory pressure / tab throttling silently invalidates
   OPFS-backed `blob:` URLs during inactivity; freecut re-mints them from OPFS on wake
   (`proxy-service.ts:790-859`, `refreshAllBlobUrls`). This bites **now** anywhere Archie studio
   hands an OPFS `blob:` URL to an `<img>`/`<video>` that can outlive a throttle — a stale URL shows
   a broken image with no error. Worth an audit of studio's object-URL lifetimes.

5. **"Copy, don't recompute" export fast path.** Freecut's packet-remux path copies compressed
   packets straight through (no decode→re-encode) when the whole timeline is a single unmodified
   clip (`canvas-render-orchestrator.ts:204-276,489-492`). This is the export-side sibling of
   Archie's streamed `.archie.zip` (already at parity per lesson 9) — the transferable idea is the
   *guard*: detect the "nothing actually changed, stream the original bytes" case and skip the
   pipeline entirely.

6. **Headless = drive real Chrome, never port the engine to Node** — see area 3; a template for an
   export-fidelity CI harness or server-side exhibit rendering, and a generalization of Archie's
   existing spare-port-Vite + Playwright-from-/tmp browser-drive recipe.

## Area 1 — Undo/history architecture (RICH)

Freecut runs **two independent, in-memory undo systems**, neither persisted across sessions.

**Timeline undo is a snapshot-based command pattern — not zundo, not patches**
(`src/features/timeline/stores/timeline-command-store.ts`). The CLAUDE.md still says "Zustand +
Zundo" and the facade exposes a `.temporal` shim (`timeline-store-facade.ts:335-343`), but the real
engine is a hand-rolled command store. `execute(command, action)` captures a snapshot *before* and
*after* the action and pushes an entry only if they differ (`timeline-command-store.ts:127-151`).
Four properties are worth stealing:

- **Snapshots are references, not deep clones.** `captureSnapshot` just reads the current store
  arrays (`commands/snapshot.ts:87-117`); `snapshotsEqual` compares them with `===`
  (`snapshot.ts:169-189`). Because the domain stores update immutably (every action mints new
  arrays), an unchanged slice keeps its old reference — so a history entry costs a handful of
  pointers with full structural sharing across versions, and a no-op action is auto-deduplicated
  (equal references → not recorded). This is the cheap-history trick Archie's on-disk spine can't
  use directly (it persists), but the change-detection dedup is portable.
- **Ring-buffer cap.** `undoStack.slice(-(maxHistory - 1))` bounds memory; `maxHistory` is the
  user-configurable `maxUndoHistory`, default **50** (`settings-store.ts:151`).
- **Capture-at-gesture-start, commit-at-end = one entry per drag.** Drag operations pre-capture a
  snapshot at drag start and commit once via `addUndoEntry` (`timeline-command-store.ts:235-251`),
  so a 300-frame drag is a single undo step, not 300. Directly relevant to Archie annotation drags.
- **Per-context history.** Undo/redo is scoped per composition/sequence; inactive contexts' stacks
  are parked in `stacksByContext` and swapped on navigation (`timeline-command-store.ts:39-43,
  253-284`), so an entry captured in one editing context can never restore its content into a
  different live one. Deleting a composition drops its parked stack.

**Project-list undo is zundo `temporal`** (`src/features/projects/stores/project-store.ts:94`),
scoped by `partialize` to just `{ projects, currentProject }` — UI state (loading/error/filters) is
excluded from history (`project-store.ts:524-531`). Zundo's static `limit` was **removed** in favor
of a dynamic cap: a `setOnSave` hook trims both stacks to `maxUndoHistory`, and a settings
subscription re-trims when the user lowers the cap live (`project-store.ts:543-565`).

**Persistence:** none. Both systems are in-memory Zustand; `clearHistory` wipes on project load
(`timeline-command-store.ts:201-210`). Undo does not survive reload — the opposite tradeoff from
Archie's disk-persisted spine/history (`packages/render-core/src/spine/`). The comparison itself is
the value: freecut chose ephemeral+cheap; Archie chose durable. Freecut's reference-snapshot dedup,
ring cap, gesture-scoping, and per-context isolation are patterns to weigh against Archie's
persisted log.

## Area 2 — Project file format & schema versioning (RICH)

- **Version:** `CURRENT_SCHEMA_VERSION = 13` (`migrations/types.ts:13`). Missing `schemaVersion` ⇒
  treated as v1 (`migrations/index.ts:36`). Migrations are pure `Project → Project` fns applied in
  order, each throwing with version context on failure (`index.ts:69-82`).
- **Two-phase load:** versioned migrations (once per bump) then `normalizeProject` (every load, for
  current defaults); the `migrated` flag drives a re-save (`index.ts:99-117`). Archie's migrate.ts
  has phase one but not the every-load normalize or the re-save signal (see ticket 3).
- **Media references are indirect.** Timeline items carry a `mediaId` **string**, not a path/handle/
  hash (`src/types/project.ts:72`); `src` is a transient `blob:` URL. The durable media record lives
  in a separate store persisted to the workspace as `media/<id>/metadata.json`. That record's
  `storageType` is a tri-state — `'handle' | 'workspace' | 'opfs'` (`src/types/storage.ts:16`):
  `handle` = the user's original file via `FileSystemFileHandle`, `workspace` = a copy inside the
  workspace folder, `opfs` = generated/cached. Identity/dedup is by `contentHash` (SHA-256,
  `storage.ts:61`). This tri-state maps cleanly onto Archie's fs backends (FSA handle / workspace /
  OPFS) and its published-tree asset identity.
- **Relink/missing-media:** `Project.rootFolderHandle` + `rootFolderName` support relinking against
  a moved media root (`project.ts:30-35`); a missing source shows an on-clip relink prompt rather
  than failing silently (CHANGELOG.md:24; `runtime/composition-runtime/components/
  media-offline-placeholder.tsx`). Archie's HTTP/remote sources (Voynich IIIF) have an analogous
  "source moved/unreachable" surface worth the same explicit-relink treatment instead of a generic
  load error.

## Area 3 — Headless build (RICH, notable)

`headless/` is a Node driver (plain ESM `.mjs`) that launches headless Chrome via Playwright and
drives a UI-less harness page — `window.freecut` from `src/headless/main.ts` — which **reuses the
exact export pipeline and Zustand stores** (`headless/README.md:5-33`). The stated principle:
**don't port the browser engine to Node.** The engine depends on WebCodecs/WebGPU/OffscreenCanvas/
OfflineAudioContext; a Node reimplementation would be a fragile rewrite, so fidelity is bought by
running the real code in real Chrome (`README.md:6-12`). Four surfaces:

- `render.mjs` — render a project (or a time slice) to video/audio; media is **range-streamed** via
  mediabunny `UrlSource` over HTTP Range, so a 5-second slice of a 3 GB source renders without
  loading the whole file (`README.md:34-37`).
- `edit.mjs` — apply structural edits by driving the **real** timeline action modules, so transition
  repair, split-id rebinding, and linked-clip cascades behave exactly like the editor; dry-run by
  default (`README.md:112-130`).
- `serve.mjs` — a long-lived warm-Chrome render service with an HTTP API, avoiding per-call cold
  start (`README.md:163-189`).
- Docker on a Linux+NVIDIA host for real-GPU WebGPU effects; software WebGPU falls back with a clear
  error (`README.md:191-236`).

**Archie mapping:** Archie already lives this philosophy — `recipes/smoke.mjs`, the browser-drive
recipe, and the `embed-smoke` CI job all drive a real browser because Node is too permissive (the
`bound-fetch-defaults` rule is the scar). Freecut's headless server + range-streamed rendering is
the template if Archie wants (a) a CI harness that renders a published exhibit in real Chromium and
diffs it for fidelity, or (b) server-side rendering/export of exhibits. The "reuse the real stores
in headless Chrome" pattern is Archie's spare-port-Vite + Playwright-from-/tmp recipe generalized
into a product surface.

## Area 4 — Proxy/preview strategy (RICH)

Proxies are **preview-only** (export always uses the original full-res source —
`proxy-generation-worker.ts:5-7`). Mechanics:

- **Format:** a 960×540-bounded MP4, video-only (audio discarded), via mediabunny `Conversion` with
  `QUALITY_LOW` bitrate and a 2-second keyframe interval for responsive seeking without all-keyframe
  bloat (`proxy-generation-worker.ts:29-32,267-285`). Dimensions scale to fit, rounded even
  (`calculateProxyDimensions:164-179`).
- **Codec tier:** prefer HEVC where the platform can *hardware*-encode it (measured faster **and**
  smaller than H.264), else fall back to AVC/H.264 (universal) — probed per-machine with
  `canEncodeVideo` (`proxy-generation-worker.ts:215-231`). The chosen codec is recorded in meta, and
  a consumer skips a proxy it can't play (e.g. an HEVC proxy synced from another machine), falling
  back to source — cross-machine safe (`proxy-service.ts:74-90,514-522`).
- **When:** **on demand**, not on import — the user selects media and generates
  (`media-library.tsx:499`, `media-card.tsx:799`, `settings-dialog.tsx:549`). A `priority:
  'background'` tier exists for prewarm; a single-concurrency queue (`maxConcurrentJobs = 1`) runs
  user jobs ahead of background ones (`proxy-service.ts:175,889-940`).
- **Storage lifecycle:** OPFS `proxies/{proxyKey}/proxy.mp4` + `meta.json`, **mirrored to the
  workspace folder** so a different origin can hydrate it back into OPFS instead of regenerating
  (OPFS is per-origin; the workspace folder is shared — `proxy-service.ts:570-624,722-734`). Startup
  scans and cleans interrupted/`error`/stale-version/empty proxies; failed proxies are **not**
  auto-requeued, to avoid a deterministic failure restarting every session
  (`proxy-service.ts:478-512`). Cache-schema-versioned (ticket 1) and content-addressed
  (`proxy-key.ts`, ticket 2). Blob-URL refresh on wake (ticket 4).

**Archie mapping:** the still-image analogue is baked thumbnails (already done). This is the
on-demand transcode-to-preview template if video objects ever land; more immediately, the
cache-versioning, content-addressed dedup, cross-origin workspace-mirror hydration, and
blob-URL-refresh patterns transfer to Archie's regenerable OPFS caches and its FSA/OPFS split today.

## Area 5 — Doc sweep + `@huggingface/transformers` (MIXED)

- **DESIGN.md and PRODUCT.md are thin for this purpose** — a design-system spec (OKLCH ramp,
  typography, component rules) and a product-voice brief. No memory/storage/perf mechanisms. Noted
  so it's clear they were read, not skipped.
- **`docs/render-frame-decomposition-plan.md`** is a refactor plan for the `renderFrame` hotspot.
  One transferable idea: model a per-frame render as a `FrameRenderPass` object whose **fields are
  the per-frame state** and whose **constructor takes the stable renderer-scope deps**, so six
  nested closures aren't re-created every frame (`plan §2-3`). Minor for Archie (no per-frame
  compositing), but the "object-with-stable-deps instead of re-closured-per-call" shape is a general
  hot-loop pattern.
- **CHANGELOG optimizations not in the 11 lessons:**
  - **Packet remux fast path** (ticket 5) — `canvas-render-orchestrator.ts:204-276,489-492`; streams
    to a file target so long remuxes stay off the renderer heap (`:354`).
  - **ONNX model cache** — Cache Storage API (not OPFS/IndexedDB) for multi-hundred-MB ML weights,
    keyed by URL, with **in-flight dedup** so concurrent callers share one download
    (`onnx-model-cache.ts:124-187`), streaming into a **preallocated** buffer to avoid doubling peak
    memory on GB-scale weights (`onnx-model-cache.ts:53-90`). ("AI models cached on disk so they
    don't re-download each session," CHANGELOG.md:70.) The right storage tier + download-dedup +
    no-double-buffer pattern for any large-immutable-asset cache Archie might add.
  - **Memory-aware caches** — the filmstrip cache enforces a soft byte budget **and** watches the
    live JS heap (`performance.memory`) to trigger eviction, closing `ImageBitmap` frames on evict
    and scaling extraction concurrency down to 1–2 under memory pressure
    (`filmstrip-cache.ts:408,416-459`). Companion byte-budgeted LRUs: waveform 128 MB
    (`waveform-cache.ts:49`), gif-frame 200 MB (`gif-frame-cache.ts:23`). Archie has no heap-aware
    cache eviction today.
- **`@huggingface/transformers` 4.1.0 (transformers.js)** powers **all** on-device ML, none of it
  applicable to Archie's current image/AV *annotation* scope but useful to name: Whisper/Parakeet
  transcription (auto-captions + transcript search), scene detection via Gemma/LFM vision workers,
  CLIP embeddings for semantic scene/caption search, MusicGen generation, and Kokoro/MOSS/Supertonic
  TTS (`src/infrastructure/analysis/*`, `media-library/transcription/*`,
  `editor/services/musicgen-service.ts`; CHANGELOG.md:77,163,218,278). It runs over
  `onnxruntime-web` (pinned dev build). The **reusable** part for Archie is the surrounding infra —
  the model cache above and the worker-eviction pool below — not the models.

## Area 6 — Other notable infrastructure

- **Worker-pool management.** `createManagedWorkerPool` does acquire/release/terminate with idle
  pooling and a `maxIdleWorkers` cap (`shared/utils/managed-worker-pool.ts:32-63`). The transcription
  pool keeps **one resident worker per engine, evicted after 120 s idle**
  (`transcription/lib/transcription-worker-pool.ts:10,31-53`) — because model compile/load is the
  dominant per-job cost, a resident worker reuses its already-compiled sessions across jobs. The
  reusable lesson for Archie: for any expensive-to-initialize worker (a wasm codec, a heavy
  transform), keep it warm between jobs and evict on an idle timer rather than recreating per call.
- **Background work scheduler.** `enqueueBackgroundMediaWork` is a single-concurrency global queue
  with priority (`warm`/`heavy`), delay, and cancellation, dispatched through a preview-work budget
  so proxy/filmstrip/thumbnail work never competes with active scrubbing
  (`media-library/services/background-media-work.ts:21-134`). Archie's equivalent tension is publish/
  bake work vs. interactive studio editing; a budget-scheduled background queue is the pattern.
- **Object-URL registry.** Blob URLs are tracked centrally with metadata (storageType, opfsPath,
  size) so they can be revoked/refreshed in one place (`infrastructure/browser/object-url-registry`,
  used throughout `proxy-service.ts`) — the discipline behind "fixed decoder/video-source memory
  leaks during long sessions" (CHANGELOG.md:89). Archie mints object URLs in studio; a registry is
  cheap insurance against the same leak class.

## Where areas turned out thin

- **DESIGN.md / PRODUCT.md:** design-system and product-voice only — no optimization content.
- **render-frame-decomposition-plan.md:** one minor transferable pattern (per-frame pass object);
  the rest is freecut-specific compositing.
- **transformers.js features themselves:** out of Archie's scope; only the caching/worker infra
  around them transfers.
- **Undo persistence:** freecut deliberately does *not* persist undo — so there is no cross-session
  undo design to learn from, only the in-memory tradeoffs (which are themselves the finding).

## Sources

freecut clone `a3ecfce` under `Prior Art/freecut/` — primary files: `src/features/timeline/stores/
timeline-command-store.ts`, `stores/commands/snapshot.ts`, `stores/actions/shared.ts`,
`src/features/projects/stores/project-store.ts`, `src/shared/projects/migrations/{index,types}.ts`,
`src/types/{project,storage}.ts`, `headless/README.md`, `src/headless/main.ts`,
`src/features/media-library/{proxy-constants.ts, services/proxy-service.ts, workers/
proxy-generation-worker.ts, utils/proxy-key.ts, services/background-media-work.ts}`,
`src/shared/utils/{managed-worker-pool.ts, onnx-model-cache.ts}`,
`src/features/media-library/transcription/lib/transcription-worker-pool.ts`,
`src/features/export/utils/canvas-render-orchestrator.ts`,
`src/features/timeline/services/{filmstrip-cache.ts, waveform-cache.ts, gif-frame-cache.ts}`,
`CHANGELOG.md`, `DESIGN.md`, `PRODUCT.md`, `docs/render-frame-decomposition-plan.md`, `CLAUDE.md`.
Companion: [freecut-lessons.md](freecut-lessons.md) (the 11 prior verified lessons).
