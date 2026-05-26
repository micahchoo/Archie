# Plan — Large-media memory ceiling on publish/save

_Created 2026-05-25. Status: PLANNED. Rests on archie-persistence Q-2 (three-configs persistence) +
Q-4/CONTEXT §80 (tiling: external IIIF for giant media) + §89.1 (originals not published by default)._
_Owner note: #1 + #2 are cheap-now candidates; #3–#5 are v1.1. Build only on the user's go (gated by review)._

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

### 3. Stream the zip sink  — _the real structural fix (v1.1)_
fflate ships a streaming `Zip` / `AsyncZipDeflate` / `ZipPassThrough` API (**same dependency**, different
entry point) that emits chunks as files are added, instead of `zipSync` building one giant array. Pair with:
- **Chromium:** write chunks to a `showSaveFilePicker` `FileSystemWritableFileStream` (the same
  `createWritable` the folder backend already uses) → the zip never fully materializes.
- **non-Chromium:** no streaming download sink without StreamSaver-style service-worker interception
  (a SW + dep). Defer — this is the honest floor (see below).
- Shape: a new `StreamingZipFilesystem` (or a streaming `toZip`) behind the existing `Filesystem` seam —
  fits source-projection (new backend, same interface). Files: `packages/render-core/src/fs/zip.ts` (+ a
  streaming variant), `apps/studio/src/binding.ts` (`downloadZip` → save-to-file-handle on Chromium).

### 4. Shrink the bytes at import  — _orthogonal, partly built_
The EXIF bake already re-encodes a display master; extend it to **cap dimensions/quality** (~6000–8000px,
§80) for all image imports so a 40 MP phone photo isn't bundled full-res. Originals are **already excluded**
from publish by default (§89.1, `assets-original/`, opt-in). AV has no transcode yet (ingest gated, §152).
- Files: `apps/studio/src/bake.ts` (downscale cap), import path in `App.svelte`.

### 5. Stream OPFS → sink  — _folder-path refinement_
`readAssetBytes` reads each asset as a full `ArrayBuffer`. Have `getAsset` return a `Blob` and pipe
`blob.stream()` to the writable so even one huge file never fully materializes. Trims the last per-asset
peak on the folder path.
- Files: `packages/render-core/src/fs/seam.ts` (`FsWritable` accept a stream, or chunk-write), `site.ts`
  (`getAsset` pipe), `apps/studio/src/store.ts` (`getAsset` returns `Blob`).

## Recommended phasing

- **Now (cheap, honest, zero deps):** #1 + #2 — cover the 90% case: keep the zip small, and route to the
  streaming sink (folder) or no-bundle path (URL) when it won't be.
- **v1.1:** #3 streaming-zip-to-file-handle (structural) → #4 import downscale → #5 folder-stream refinement.

## Honest floor

A non-Chromium single-zip of a multi-hundred-MB library stays memory-bound — #1+#2 keep users out of that
corner, and that shape *wants* a folder + external IIIF, which the architecture already favors. Document the
limit; don't pretend a browser zip is a backup system.

## Q-reference

- **archie-persistence Q-2** — three-configs persistence (the two sinks this plan analyzes).
- **Q-4 / CONTEXT §80** — tiling: single-JPEG + external IIIF for giant media (mitigation #2/#4 rest here).
- **CONTEXT §89.1** — EXIF original/display-master split; originals not published by default (mitigation #4).
- **CONTEXT §152** — AV ingest (codec/size) gated; no transcode yet (bounds mitigation #4 for AV).
