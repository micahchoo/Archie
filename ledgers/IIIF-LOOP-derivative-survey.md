# IIIF-LOOP — Derivative pipeline survey

**Ticket:** Archie-b0e2 (survey the Gawan Museum folder + decide what the derivative
pipeline must produce and with which tools). **Date:** 2026-07-19.
**Source (READ-ONLY):** `/mnt/Ghar/2TA/BHC006_GAWANMUSEUMTRUST` — nothing in it was
written or moved.

## The answer, up front

Archie ingests **IIIF Image API (`info.json`) by reference with zero code changes** and
ingests nothing else deep-zoomable by URL. So the pipeline should produce, per image, a
**baked web-JPEG master with EXIF rotation applied and stripped**, a **thumbnail**, and —
for large images — a **static IIIF Image API level-0 tile pyramid + `info.json`**, all
served from nginx. The generated Presentation manifest points each object's source at the
level-0 **image-service base URL**; Archie's importer already prefers that (`iiif-import.ts:70`
`sourceOf`), `resolveTileSource` classifies it as `kind:"iiif"` (`resolve.ts:100`), and the
mount hands the `info.json` straight to OpenSeadragon (`mount.ts:81`). **DZI is the wrong
choice** — Archie has no `.dzi`-URL ingest path, only an internal in-browser slicer, so an
external DZI reference would need new code (details in §4).

The recommended tool is **native libvips** (`vips dzsave --layout iiif3` emits level-0 tiles
+ `info.json` in one command; `vipsthumbnail` bakes autorotated masters/thumbs) plus
**ffmpeg** for A/V. libvips is **not installed** — it must be added (`apt install
libvips-tools`). This is server-side native libvips, which does **not** contradict ADR-0004
(that ADR forbids the ~13–20 MB *WASM* libvips in the *browser bundle*; it explicitly blesses
"external IIIF for the high end" as the domain-standard pattern).

The one surprise worth flagging: **`tiny-iiif/` is not our output — it is the upstream
open-source `tiny.iiif` project** (a Cantaloupe/IIPImage dynamic IIIF server + Astro admin GUI
+ nginx + certbot, deployed via docker-compose), cloned but never run (its `data/images`,
`data/manifests`, `data/meta` hold only `.gitkeep`). It is strong prior art for the *serving
topology*, not a set of derivatives (§2).

---

## 1. Folder census

1252 files across six media collections, four `.xlsx` catalog registers, and the cloned
`tiny-iiif/` tool. Counts by collection (file mutations blocked; all read via `find`/`identify`/
`exiftool`/`ffprobe` in a sandbox):

| Collection | Images | A/V | Notes |
|---|---|---|---|
| Artifacts/ | 383 jpg, 229 tif, **84 nef** | — | + 2 `.ods` spreadsheets |
| Photo Narratives (PN)/ | 43 jpg, 146 tif | — | |
| Documents (D)/ | 15 jpg | — | |
| Extras/ | 126 jpg | 37 mov | + 1 `.ctg` |
| Audio Interviews (AI)/ | — | 3 mp3 | |
| Video (V)/ | — | 13 avi, 6 mp3 | |

**Image formats — 1027 image files:** 568 jpg (web-decodable), **375 tif + 84 nef (browser-
UNDECODABLE — must convert)**. NEF is Nikon RAW; the 84 sit in Artifacts alongside jpg/tif of
the same catalog numbers (RAW masters). TIFF does not decode in any browser.

**Size distribution** (`find -printf %s`):

| Ext | n | min | median | max | total |
|---|---|---|---|---|---|
| jpg | 568 | 0.02 MB | 3.06 MB | 8.11 MB | 1.83 GB |
| tif | 375 | 3.53 MB | 15.83 MB | 66.87 MB | 5.62 GB |
| nef | 84 | 17.76 MB | 18.36 MB | 18.98 MB | 1.51 GB |
| mov | 37 | 19.4 MB | 121 MB | **1099 MB** | 6.82 GB |
| avi | 13 | 4.84 MB | 69.9 MB | 507 MB | 1.91 GB |
| mp3 | 9 | 0.22 MB | 9.61 MB | 25.5 MB | 0.10 GB |

Raw total ≈ 17.8 GB.

**Pixel dimensions** (`identify -ping`, jpg+tif, 943 files): avg **10.5 MP**, max **35.6 MP**,
and **only 1 image exceeds 30 MP**. So "giant" images are the rare exception here, not the
rule — the tiling threshold (§3) governs how many images get a pyramid, and most of this
collection sits in the ~10 MP band.

**EXIF Orientation** (`exiftool -Orientation# -r`, jpg+tif+nef, 1027 files): **999 = 1**,
**23 absent** (treat as 1), and **5 with a real rotation** — four Orientation-8 (rotate 270°,
including two NEF), one Orientation-6 (rotate 90°). Rotation is rare but present and real
(§6), so the pipeline cannot ignore it.

**A/V formats & durations** (`ffprobe`): mov up to ~18 min, avi up to ~3.5 min, mp3/audio up
to ~15 min. Codec probe: **AVI = MJPEG video + PCM audio** (browser-undecodable), **MOV =
H.264 video + PCM audio** (video is web-friendly but the PCM audio and `.mov` container are
not universally supported). Conclusion: **every video must be re-encoded** — AVI is a full
transcode, MOV needs at minimum audio→AAC and container→MP4. mp3 audio is web-native and
passes through.

**Browser-undecodable inventory the pipeline must convert:** 375 TIFF, 84 NEF, 13 AVI, 37 MOV.

**Non-media** (ignore for derivatives, mine for metadata): four `BHC006_*.xlsx` catalog
registers at the top level plus per-collection `.ods` — these are the label/provenance source
the manifest generator should read canvas labels from.

## 2. What `tiny-iiif/` is

Not our output — the upstream **`tiny.iiif`** open-source project ("Turn a folder of images
into a working IIIF setup"), a `git`-cloned working copy. Its `README.md` and
`docker-compose.yml` describe four services: **Cantaloupe** *or* **IIPImage** (a dynamic Java
IIIF Image server that converts uploads to pyramidal TIFF and serves Image API 3.0),
a **`tiny`** Astro/React admin GUI (drag-drop → Image service + Presentation-v3 manifest),
**nginx** as reverse proxy (`location /iiif/` proxies the image server; `location /manifests/`
serves static manifest JSON), and **certbot**. Its `data/` dirs contain only `.gitkeep` — it
has been cloned but never fed images, so **it produced no derivatives**.

**Reusable?** Yes, as the *serving blueprint*, not as a generator we run as-is. Two things to
lift directly: nginx serving `/manifests/` as static files and proxying/serving `/iiif/`, and
the Presentation-v3 manifest shape (which `tiny.iiif` already emits and Archie's importer
already reads). What to *not* adopt: its **dynamic** Cantaloupe/IIPImage tile generation. The
ticket wants tiles generated **once, statically**; a live Java image server (2 CPU / 4 GB per
its own README) is heavier than needed when nginx can serve a pre-baked level-0 pyramid as
plain files. Recommendation: keep `tiny.iiif`'s nginx topology, drop the dynamic image server,
pre-bake static level-0 tiles (§3–5).

## 3. What the derivative step must produce

Per **image** (the 1027 jpg/tif/nef), server-side, once:

1. **Web-decodable master** — a **JPEG** (universally decodable; WebP saves ~25–30 % but buys
   nothing Archie needs and complicates `<img>` fallbacks — stay JPEG). **Quality 82**, **long
   edge capped at 4096 px** for the single-image (non-tiled) path. EXIF **rotation baked in and
   metadata stripped** (§6). This is the `kind:"image"` source for small/medium images and the
   thumbnail base for tiled ones.
2. **Thumbnail** — long edge **~400 px**, JPEG q80, rotation baked. Feeds Archie's rail/grid
   `<img>` (which otherwise derives `…/full/{w},/0/default.jpg` off the IIIF base —
   `resolve.ts:112` `thumbnailUrl` — but a baked thumb is cheaper and offline-safe).
3. **Static IIIF Image API level-0 tile pyramid + `info.json`** — for images above the tiling
   threshold. `vips dzsave --layout iiif3` emits the `{id}/` tile directory tree and a
   `level0`-profile `info.json` advertising the exact tile sizes on disk; OpenSeadragon reads
   it natively.

**Tiling threshold:** tile when the baked master's **long edge > 2500 px (≈ > 5 MP)**; below
that, ship the single JPEG master as `kind:"image"` (OSD pans/zooms a single JPEG smoothly to
~6000–8000 px per ADR-0004, but a 2500 px cut keeps the common ~10 MP artifact images crisp at
full zoom without a multi-MB single fetch). At this threshold the great majority of Artifacts/PN
images (median 10–16 MP) get a pyramid; Documents and small Extras stay single-image. Tiling is
driven by **rendered** pixels, so apply it *after* rotation baking.

Per **video** (all 50 avi+mov): transcode to **MP4 (H.264 high, AAC audio)**, plus a **poster
JPEG** (first keyframe). Per **audio** (9 mp3): pass through (web-native); optionally normalize.

## 4. Tile format — IIIF level-0 vs DZI (decided: IIIF level-0)

**What Archie actually ingests today**, traced through the code:

- `resolveTileSource(source)` (`packages/render-core/src/iiif/resolve.ts:84`) classifies a bare
  **string** source into one of: `{kind:"image",url}` (a known raster extension —
  `IMAGE_EXT_RE` at `resolve.ts:69` = jpg/png/webp/avif/gif/tiff/svg — or a `blob:`/`data:`
  URL), `{kind:"iiif",infoUrl}` (a URL ending in `/info.json`, **or any other `http(s)` base,
  which it normalizes to `{base}/info.json`** — `resolve.ts:98,100`). It also passes through
  two structured **descriptors** given as non-strings: `XyzTileSource` (slippy basemap) and
  `DziTileSource`.
- The mount (`packages/render-mount/src/mount.ts:76-88`) turns that into an OSD tile source:
  `image` → `{type:"image",url}`; `iiif` → **hands OSD the `infoUrl` string** (OSD fetches
  `info.json` and deep-zooms, level-0/1/2 alike); `dzi` → `dziOsdSource(ts)`; `xyz` → custom.

So the **source forms Archie supports today** are: (a) a **plain image URL**, (b) an **IIIF
`info.json` URL or bare image-service base** (→ `info.json`), (c) a **DZI** *only as an
in-memory `DziTileSource` descriptor*, and (d) an **XYZ** descriptor for basemaps.

**Why not DZI.** There is **no `.dzi`-URL branch** in `resolveTileSource`. A string like
`http://localhost/tiles/x.dzi` matches neither `IMAGE_EXT_RE` nor `/info\.json$/`, so it falls
through to `resolve.ts:100` and is mis-classified as a IIIF base → Archie would fetch
`…/x.dzi/info.json` and fail. DZI enters Archie *only* as a `DziTileSource` object stamped on
the AObject by Studio's **own in-browser slicer** at publish time (`apps/studio/src/dzi-slicer.ts`
→ `dziOsdSource`, `packages/render-core/src/geometry/dzi.ts:124`; callers are Studio-internal
only — `publish-flows.svelte.ts`, never an external URL). Ingesting an **externally generated
DZI by reference** would require new code: a `.dzi` classification in `resolveTileSource` plus a
fetch-and-parse of the `.dzi` XML into a `DziTileSource`. **IIIF level-0 needs none of that.**

**Decision: IIIF Image API level-0.** It is the only pre-tiled deep-zoom form Archie ingests by
reference with zero code change, it matches what `iiif-import.ts:70` `sourceOf` already prefers
(the image-service base over the direct content URL), it is the "external IIIF" path ADR-0004
explicitly blesses, and it is exactly what `tiny.iiif` and OpenSeadragon already speak.

## 5. Tooling

**Installed on this machine** (probed): ImageMagick 7.1.2 (`convert`/`magick`/`identify`),
`exiftool`, `ffmpeg`/`ffprobe` 7.1, Node 24.14, pnpm 11.6. **Missing:** **libvips**
(`vips`/`vipsheader`/`vipsthumbnail` all absent). The repo has **no `sharp`** dependency
(publish path uses `fflate` + OffscreenCanvas, not a native encoder).

**Recommendation: install and use native libvips** (`apt install libvips-tools`), because it is
the one tool that emits IIIF level-0 directly:

- `vips dzsave master.tif '/out/{id}' --layout iiif3 --tile-size 512` → level-0 tile tree +
  `info.json`, one command, no Java server.
- `vipsthumbnail master.tif --size 4096x4096 --rotate -o master.jpg[Q=82,strip]` → autorotated,
  EXIF-stripped web master (and again at `400x400` for the thumb). `--rotate` applies EXIF
  orientation and bakes it in.
- libvips reads TIFF and (via the RAW loader / a `dcraw`-derived step) can be pointed at NEF;
  if the NEF loader is not built in, fall back to ImageMagick or `dcraw`→TIFF→vips for the 84
  RAW files.
- ImageMagick is the installed fallback (it can `-auto-orient` and resize) but has **no IIIF
  layout** and is markedly slower on large TIFFs — use it only for RAW pre-decode, not the main
  path.
- **ffmpeg** for all A/V: `-c:v libx264 -c:a aac -movflags +faststart` to MP4, `-ss 0 -frames:v 1`
  for the poster.
- **exiftool** stays available for reading Orientation during census/QA; libvips already handles
  the bake, so exiftool is not on the hot path.

A **Node + `sharp`** pipeline (sharp is a libvips binding, and sharp's `.tile({layout:'iiif3'})`
exists) is a reasonable alternative if the generator is written in TS to share the repo's model
types — but it pulls the same native libvips underneath, so installing `libvips-tools` is the
prerequisite either way. **Prior-art check:** the repo's `Prior Art/` folder has no
IIIF/tiling/derivative material (grep returned nothing); the load-bearing prior art is
in-repo — ADR-0004 (`docs/adr/0004*.md`, "external IIIF for the high end"), the DZI internals
(`geometry/dzi.ts`, `dzi-slicer.ts`), and the cloned `tiny.iiif`.

## 6. EXIF ground truth — VERIFIED vs INFERRED

**What I VERIFIED** (constructed nothing — used a real Orientation-8 file from the folder,
`Artifacts/BHC_006_GMT_AF_310a.jpg`, "Rotate 270 CW"):

| Probe | Reports |
|---|---|
| `exiftool -ImageWidth -ImageHeight` | **4000 × 4555** (stored, pre-rotation) |
| `identify -format "%w x %h"` | **4000 × 4555** (stored, pre-rotation) |
| `identify -auto-orient -format "%w x %h"` | **4555 × 4000** (rendered, post-rotation) |

So for Orientation ∈ {5,6,7,8} (the 90°/270° cases), **raw tool dimensions and rendered
dimensions have width and height SWAPPED.** Copying `exiftool`/`identify` raw dims into a
manifest for these files would ship a transposed aspect ratio.

**What is INFERRED (spec, not headless-verified here):** Archie probes dimensions with
`new Image(); img.naturalWidth/naturalHeight` (`apps/studio/src/ingest-flows.ts:207-214`). CSS
`image-orientation` defaults to `from-image` in all current browsers (Chrome ≥81, Firefox ≥63,
Safari ≥13.1), under which the HTML spec has `naturalWidth`/`naturalHeight` reflect the
**orientation-corrected** intrinsic size — i.e. the browser would report **4555 × 4000**,
matching `identify -auto-orient`, **not** the raw stored dims. I did not stand up a headless
browser to confirm this; the rule below removes the dependency on it either way.

**The rule the manifest generator MUST follow.** Because the pipeline bakes a derivative for
every image, **bake the rotation in and strip EXIF** (`vipsthumbnail --rotate`, or
`vips dzsave` on an already-rotated master), so every derivative is Orientation-1 and its
**stored dimensions equal its rendered dimensions**. Then the generator measures **the
derivative** (or reads `Size/@Width`·`@Height` straight out of the emitted `info.json`) —
**never the original's EXIF-tagged dimensions.** This makes `width`/`height` unambiguous and
independent of any browser's orientation handling. The fallback rule, should a manifest ever
reference an un-baked original: for Orientation ∈ {5,6,7,8}, emit the **swapped** dimensions;
for {1,2,3,4} or absent, emit as-stored.

---

## Pipeline requirements — checklist for the generator-prototype ticket

**Inputs to convert (browser-undecodable):** 375 TIFF, 84 NEF, 13 AVI, 37 MOV. Pass-through:
9 MP3. Mine the four `BHC006_*.xlsx` registers for canvas labels/provenance.

- [ ] **Install libvips** (`apt install libvips-tools`) — it is currently MISSING and is the
      only installed-or-installable tool that emits IIIF level-0 directly. Keep ImageMagick as
      RAW/NEF fallback, ffmpeg for A/V.
- [ ] **Per image, bake a rotated + stripped JPEG master:** `vipsthumbnail SRC --size 4096x4096
      --rotate -o master.jpg[Q=82,strip]`. Rotation baked, EXIF removed → derivative is
      Orientation-1, stored dims == rendered dims.
- [ ] **Per image, bake a thumbnail:** same, `--size 400x400`, q80.
- [ ] **Tile large images to static IIIF level-0:** when the baked master's long edge > 2500 px,
      `vips dzsave master.jpg '/out/iiif/{id}' --layout iiif3 --tile-size 512` → tile tree +
      `level0` `info.json`. Below threshold, no pyramid — the JPEG master is the source.
- [ ] **Measure dimensions from the DERIVATIVE / `info.json`, never from the original's EXIF.**
      For the fallback case (un-baked original) swap W/H for Orientation ∈ {5,6,7,8}.
- [ ] **Transcode video:** AVI (MJPEG/PCM) and MOV (H.264/PCM) → MP4 H.264 + **AAC** audio,
      `-movflags +faststart`; emit a poster JPEG (first keyframe). Audio mp3 passes through.
- [ ] **Emit a IIIF Presentation-v3 manifest per exhibit** whose painting-annotation body, for
      each image canvas, carries a **`service` entry pointing at the level-0 image-service base
      URL** (`http://localhost/iiif/{id}`) — `iiif-import.ts:70` `sourceOf` prefers that base —
      plus post-rotation `width`/`height`. Below-threshold images may instead point `body.id`
      at the plain master JPEG URL (Archie's `kind:"image"` path). Video/audio bodies carry the
      MP4/MP3 URL, `type` sound/video, and `duration`.
- [ ] **Serve from nginx** (reuse `tiny.iiif`'s topology): static `info.json` + tile files under
      `/iiif/`, static Presentation manifests under `/manifests/`. No dynamic image server.
- [ ] **Do NOT emit DZI.** Archie has no `.dzi`-URL ingest path (`resolveTileSource` mis-types a
      `.dzi` URL as an IIIF base); a DZI reference would require new classification + `.dzi`-XML
      parsing code. Level-0 IIIF needs zero Archie changes.

**Load-bearing code citations:** `packages/render-core/src/iiif/resolve.ts:69,84,98,100,112`
(source classification + thumbnail derivation); `packages/render-mount/src/mount.ts:76-88`
(OSD tile-source construction, `iiif`→`infoUrl`); `apps/studio/src/iiif-import.ts:61-74`
(`isImageService`/`sourceOf` prefer the image-service base); `apps/studio/src/ingest-flows.ts:207-214`
(`imageDims` via `naturalWidth`); `apps/studio/src/dzi-slicer.ts` +
`packages/render-core/src/geometry/dzi.ts:124` (DZI is Studio-internal only);
`docs/adr/0004*.md` (external IIIF blessed; WASM libvips forbidden *in-browser* only).

---

## Review verdicts & corrections (adversarial review, 2026-07-19)

All seven load-bearing claims independently re-derived and CONFIRMED. Corrections and riders:

- **Census drift:** collection jpg count is 567 (568 counted a jpg inside the tiny-iiif clone) → image total 1026, orientation-absent 22.
- **"Zero code change" caveat:** holds for the deep-zoom canvas only. Studio grid (App.svelte:1013), GalleryThumb.svelte:39, viewer MediaThumbnail.svelte:13 derive `{base}/full/{240|480},/0/default.jpg` — URLs a vips level-0 tree does NOT emit (dzsave writes no `sizes`/`full` files). **Resolution: the generator must write static files at exactly `full/240,/0/default.jpg` and `full/480,/0/default.jpg` per id** (static-envelope-aligned; avoids an Archie thumbnail-import change).
- **dzsave riders:** the example command MUST pass `--id` = the served base URL per image (default emits `https://example.com/iiif`); no `sizes` array is emitted (fine — thumbnails handled above); OSD-against-vips-tree needs a smoke test in the generator ticket.
- **Tile from full resolution:** tile the rotation-baked full-res intermediate (e.g. master.tif), NOT the 4096-capped web master; evaluate the 2500px threshold on full-res rendered size.
- **CORS is load-bearing:** mount.ts:98 sets `crossOriginPolicy:"Anonymous"` — nginx must send `Access-Control-Allow-Origin` on `/iiif/` and `/manifests/` or tiles fail outright (owned by the server-config ticket).
- **tiny-iiif correction:** upstream rsimon/tiny-iiif@v0.2.0 clone; never fed images, but locally configured (nginx conf edited, compose override → host port 8090, "ports 80/443 taken" — note for nginx install).
- **Identity gaps → URL-scheme ticket:** filename/id policy must handle dirs with spaces/parens, mixed-case extensions, junk files (`.ods#`, `.ctg`); and 84 NEF duplicate jpg/tif catalog numbers → needs a master-precedence rule (one canvas per catalog number).
- **AV minor:** MOV (h264) can remux `-c:v copy` + transcode audio only; poster JPEGs are manifest-only value (viewer uses `<video preload="metadata">`).
