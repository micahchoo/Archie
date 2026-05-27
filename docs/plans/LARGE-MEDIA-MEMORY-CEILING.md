# Plan — Large-media memory ceiling on publish/save

_Created 2026-05-25. Status: **ALL of #1–#5 BUILT** (#1+#2 2026-05-26 · #3+#4+#5 2026-05-27; browser-verify owed
for the FSA/canvas paths). Rests on archie-persistence Q-2 (three-configs persistence) + Q-4/CONTEXT §80 (tiling:
external IIIF for giant media) + §89.1 (originals not published by default)._

_BUILT #5 (OPFS→sink stream): store `readAssetBlob(slug,name)` returns the OPFS `File` (a LAZY Blob, never
`.arrayBuffer()`'d); App's `getAsset` callbacks now use it. `site.ts` already passed the payload straight to
`FsWritable.write`, and `fsa.ts` already forwards it to `createWritable().write(blob)` — so the FSA folder backend
now STREAMS each asset OPFS→disk with no JS-heap materialization (NO seam change was needed — simpler than the plan
anticipated). Headless guard: a `getAsset` returning a Blob writes identically (site.test.ts +1, core 324). **HONEST
SCOPE: this eliminates the per-asset heap peak on the FOLDER path only. The zip path's ZipFilesystem Map still
holds all bytes (the zip needs them at serialize time) — #3 streams that Map OUT without a 2× copy, but the Map
itself remains; a deeper fix (interleave publish+zip so assets never all reside) is a future structural item, not #5.**_

_BUILT #4 (import downscale): pure core `fitWithin(w,h,maxDim)` + `exceedsCap` + `MAX_MASTER_DIM=6000`
(`geometry/downscale.ts`, 13-case corpus: no-op-under-cap · boundary · never-upscale · landscape/portrait/square ·
40 MP case · aspect-within-1px · rounding · ≥1 clamp · zero-safe). `bake.bakeDisplayMaster(file, {maxDim, mime,
quality})` draws at the capped dims (default still full-PNG → backward-compatible). `addObjectFromFile`: the EXIF
path now caps too (original still preserved); a non-rotated import over 6000px downscales to a display master
**preserving the source format** (JPEG stays JPEG — re-encoding to PNG would bloat), no separate original kept
(§80: the bundle is a display image, not an archive — the user's full-res source stays on disk; giant → external
IIIF). core 323 (+13) · Studio builds 202 mods._

_BUILT #3 (streaming-zip-to-file-handle): core `ZipFilesystem.streamZip(sink)` (fflate streaming `Zip` +
`ZipPassThrough`, serial-drain, store-not-deflate; `fs/zip.streaming.test.ts` 7-case round-trip corpus) +
`libraryToZipFs` (returns the unserialized fs); studio `binding.saveZipToDisk` streams to a Chromium
`showSaveFilePicker` `FileSystemWritableFileStream`, else falls back to the eager `toZip()`+download. App's
`download()` + `downloadProjectZip()` route through it; the #1 size guard now applies to the EAGER path only
(streaming removes its 2× premise). **HONEST SCOPE: this drops peak ≈2× → ≈1× on Chromium — it removes the zip
serialization copy, NOT the in-memory file Map, which #5 (OPFS→sink stream) addresses. Non-Chromium stays
memory-bound (the honest floor).**_

_BUILT: **#1** — `store.assetSize` (metadata-only File.size) + `App.estimateLibraryBytes`/`zipSizeOk` guard the
THREE in-memory zip sinks (`download`, `downloadProjectZip`, and via it `saveProject` file/non-Chromium branches);
over ~250 MB it confirms + steers (Chromium → folder/streams-to-disk; else → link-by-URL). Folder sink unguarded
(already streams). **#2** — the +Object URL input nudges "large media is best linked by URL" (references, never
bundles). No core change, no deps._

## Problem

The whole publish/save path is **in-memory**: OPFS bytes → `Uint8Array` → fflate → `Blob` → download.
A multi-hundred-MB library can strain browser memory; there is **no size limit or streaming** today
(confirmed: grep found no size guard anywhere in `packages/render-core/src` or `apps/studio/src`).

**The load-bearing fact — two sinks, opposite memory profiles:**

| Sink | Path | Peak memory | Status |
|---|---|---|---|
| **Folder** (Chromium) | `publishLibrary(new FsaFilesystem(handle), …)` → `createWritable().write()` per file | ≈ one asset (file-by-file to disk, GC'd between) | **Already mitigated** |
| **Zip** (non-Chromium + Download) | `libraryToZip` → `ZipStore.files: Map<string,Uint8Array>` (whole tree) → `zipSync` (a 2nd full copy) | ≈ all bytes + the zip copy (~2×) | **The ceiling** |

So `fsa.ts:14-17` already streams; `zip.ts:10` (`Map`) + `zip.ts:105` (`zipSync`) accumulate. The strategy:
**push big libraries toward the streaming sink · make the zip sink stream · shrink the bytes · warn cheaply.**

Distinction that bounds the whole problem: **imported assets** (`source = "/assets/{name}"`, OPFS bytes)
are copied into the artifact by `getAsset` (`site.ts:121-133`); **external-URL media** (the `/av` mp3,
pasted IIIF `info.json`) is referenced, never bundled — zero memory, any size.

## Mitigations (cheapest → deepest)

### 1. Pre-save size estimate + route  — _cheap, no deps, highest value_
Before a zip Save (and on folder bind), sum `fileHandle.getFile().size` across assets — **metadata only,
no byte read** (confirmed: OPFS `File.size` needs no `arrayBuffer()`; `store.ts` would add a size-only
variant beside `readAssetBytes`). Over a threshold, warn + steer: Chromium → "bind to a folder (streams to
disk)"; non-Chromium → "link large media by URL instead."
- Prior art: CONTEXT UX principle #2 (surface decisions at the moment they acquire meaning).
- Files: `apps/studio/src/store.ts` (size-only reader), `apps/studio/src/App.svelte` (`saveProject` guard),
  `LibraryHome.svelte` (the warning copy). No core change.
- Tradeoff: a heuristic, not a fix — but it keeps users out of the failure corner and tells the truth.

### 2. Don't embed large media — link it  — _already first-class_
The external-URL path exists today (`/av` mp3; external IIIF `info.json`; URL/path import in `addObject`).
Make "paste a URL" the **recommended** path for big files; the artifact carries the reference, not the bytes.
- Prior art: CONTEXT Q-4/§80 ("giant images via pasted external `info.json`"); the existing `/av` exhibit.
- Files: import UI affordance in `App.svelte` (+Object form) — copy/emphasis, not new plumbing.
- Tradeoff: durability becomes the open web's (the link can rot) — acceptable per the linkability frame.

### 3. Stream the zip sink  — _✅ BUILT 2026-05-27 (browser-verify owed). The real structural fix._
fflate ships a streaming `Zip` / `AsyncZipDeflate` / `ZipPassThrough` API (**same dependency**, different
entry point) that emits chunks as files are added, instead of `zipSync` building one giant array. Pair with:
- **Chromium:** write chunks to a `showSaveFilePicker` `FileSystemWritableFileStream` (the same
  `createWritable` the folder backend already uses) → the zip never fully materializes.
- **non-Chromium:** no streaming download sink without StreamSaver-style service-worker interception
  (a SW + dep). Defer — this is the honest floor (see below).
- Shape: a new `StreamingZipFilesystem` (or a streaming `toZip`) behind the existing `Filesystem` seam —
  fits source-projection (new backend, same interface). Files: `packages/render-core/src/fs/zip.ts` (+ a
  streaming variant), `apps/studio/src/binding.ts` (`downloadZip` → save-to-file-handle on Chromium).

### 4. Shrink the bytes at import  — _✅ BUILT 2026-05-27 (browser-verify owed)_
The EXIF bake re-encodes a display master; now ALL image imports cap the longer edge at `MAX_MASTER_DIM`
(6000px, §80 lower bound — the value that bites on a 40 MP photo) so a phone photo isn't bundled full-res.
Pure dim math (`fitWithin`/`exceedsCap`) is headless-tested core; the canvas re-encode is `bake.ts`. Non-rotated
over-cap imports downscale preserving the SOURCE format (JPEG→JPEG, no PNG bloat). AV has no transcode yet
(ingest gated, §152).
- Files: `packages/render-core/src/geometry/downscale.ts` (+test), `apps/studio/src/bake.ts` (cap+mime), import path in `App.svelte`.

### 5. Stream OPFS → sink  — _✅ BUILT 2026-05-27 (browser-verify owed). Folder-path refinement._
`readAssetBytes` read each asset as a full `ArrayBuffer`; `getAsset` now returns the OPFS `File` via
`readAssetBlob` (lazy Blob). The seam already forwarded the payload to the writable, and `fsa.ts` already
forwards it to `createWritable().write(blob)` — so the FSA folder backend now streams each asset OPFS→disk with
no JS-heap materialization. **No `FsWritable` change was needed** (the plan over-anticipated a chunk-write API).
Trims the last per-asset heap peak on the folder path; the zip/memory backends still materialize (they need the bytes).
- Files: `apps/studio/src/store.ts` (`readAssetBlob`), `apps/studio/src/App.svelte` (`getAsset` → `readAssetBlob`),
  `packages/render-core/src/publish/site.test.ts` (Blob-return guard). `seam.ts`/`fsa.ts` unchanged.

## Recommended phasing

- **Now (cheap, honest, zero deps):** #1 + #2 — cover the 90% case: keep the zip small, and route to the
  streaming sink (folder) or no-bundle path (URL) when it won't be.
- **v1.1:** ~~#3 streaming-zip-to-file-handle~~ ✅ → ~~#4 import downscale~~ ✅ → ~~#5 OPFS→sink stream~~ ✅ **ALL BUILT 2026-05-27.** Memory arc complete (browser-verify owed; honest floor below stands for the zip path).

## Honest floor

Post-#1–#5 end-state, by sink:
- **Folder (Chromium FSA) — effectively constant memory.** Per-file streaming (`fsa.ts`) + per-asset OPFS→disk
  streaming (#5) means neither the JSON tree nor any single asset is fully heap-resident. This is the recommended
  path for large libraries (and the git/GH-Pages on-ramp).
- **Zip download (Chromium) — ≈1× the (downscaled) library.** #3 streams the archive OUT to a file handle (no 2×
  serialization copy), but the `ZipFilesystem` Map still holds all bytes until written. #4 shrinks those bytes at
  import; #1 guards/steers over ~250 MB. Removing the Map itself needs interleaving publish+zip (assets never all
  reside) — a deeper structural item, deliberately NOT in this plan.
- **Zip download (non-Chromium) — memory-bound floor.** No streaming download sink without a StreamSaver-style
  service worker. #1+#2 keep users out of the corner; the shape *wants* a folder + external IIIF (which the
  architecture favors). Document the limit; don't pretend a browser zip is a backup system.

## Q-reference

- **archie-persistence Q-2** — three-configs persistence (the two sinks this plan analyzes).
- **Q-4 / CONTEXT §80** — tiling: single-JPEG + external IIIF for giant media (mitigation #2/#4 rest here).
- **CONTEXT §89.1** — EXIF original/display-master split; originals not published by default (mitigation #4).
- **CONTEXT §152** — AV ingest (codec/size) gated; no transcode yet (bounds mitigation #4 for AV).
