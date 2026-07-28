# PROTO — probe the folder, recommend a tier and a destination (Archie-7280)

**Run:** 2026-07-27 · branch `proto/folder-probe` (isolated worktree, base `d15b928`) · shipped:
`apps/studio/src/archive-probe.ts` + `archive-probe.test.ts`, and the measurement harness
`scripts/perf/webptier{.html,bench.ts}` / `webptierrun.mjs`. No UI — Archie-c367 builds the surface,
and nothing here touches `App.svelte`.

Two halves. **H2 pinned the web tier's encode parameters by measurement**, which Archie-4b0a
explicitly deferred to this ticket. **H1 turned that number, plus the destinations' real published
limits, into a pure estimator** whose output shape is what c367's mock consumes.

---

## H2 — the web tier is pinned at **2400 px / quality 0.80**

### What was measured, and through what

`canvas.toBlob(…, "image/webp", q)` in real Chromium — the encoder Archie actually ships
(`apps/studio/src/bake.ts:45` for the display master, `tiff-transcode.ts:72` for the TIFF path). Not
`cwebp`: Chromium's canvas encoder is libwebp with its own method and segment defaults, so a CLI
`-q 80` is a different number, and pinning against it would pin the wrong parameter.

**Six real digitization masters**, not synthetic noise. `PROBE-tiling-threshold-2026-07-27.md` had to
caveat its byte figures precisely because its masters were generated; that caveat is closed here.
The corpus samples the classes a small institution actually holds, and each is downloaded on first run
from a URL recorded in `webptierrun.mjs`:

| master | source | size |
| --- | --- | --- |
| parchment manuscript folio | Yale IIIF `1006076` — the repo's own Voynich seed (`apps/viewer/fixtures/voynich.ts:22`) | 2972×3766, 2.20 MB |
| wide manuscript foldout | Yale IIIF `1006194`, same digitization run | 4972×3738, 3.84 MB |
| B&W large-format film scan | Lange, *Migrant Mother* (LOC FSA, via Commons) | 3840×4929, 3.87 MB |
| oil on canvas | Van Gogh, *Wheatfield with Crows* (Google Art Project) | 3508×1669, 2.80 MB |
| letterpress incunabulum page | Commons, *Valerius Flaccus Argonautica* | 3922×4688, 5.12 MB |
| herbarium sheet | Commons, *Dracophyllum fiordense* lectotype | 10175×7534, 8.62 MB |

The masters are **not committed** — multi-MB, and the licences are the institutions'. The runner
fetches and caches them; if a URL rots, replace it with another master of the same class.

Each (master × maxDim × quality) records bytes **and SSIM against a same-dimension lossless PNG
round-trip**, so the number isolates *encoder* loss from *downscale* loss. Comparing a 1600 px WebP
against the 6000 px master would conflate the two and make every quality look equally bad.

### The measured table

Pooled over 6 masters × 3 output dimensions, n=18 per quality.

| quality | bpp mean | bpp range | SSIM mean | SSIM worst master |
| --- | --- | --- | --- | --- |
| 0.70 | 0.1092 | 0.0364–0.2023 | 0.9317 | 0.8813 |
| **0.80** | **0.1476** | 0.0500–0.2345 | **0.9555** | **0.9182** |
| 0.90 | 0.2445 | 0.0911–0.3608 | 0.9839 | 0.9634 |
| 0.92 | 0.2742 | — | 0.9887 | — |

**The finding that makes the two parameters separable: bytes-per-pixel is essentially FLAT across
output dimension at fixed quality.**

| | 1600 px | 2400 px | 3200 px |
| --- | --- | --- | --- |
| bpp @ q0.8 | 0.1496 | 0.1500 | 0.1432 |
| SSIM @ q0.8 | 0.9553 | 0.9556 | 0.9558 |

So `maxDim` is purely a total-bytes lever and `quality` is purely a per-pixel lever, and each can be
pinned against one boundary rather than traded off against the other.

### The boundary both parameters were pinned against

Archie-34a2's own reference point — **1,000 images at 4000×6000** — costed at every swept pair,
against GitHub Pages' published **1 GB** site limit:

| | q0.70 | q0.80 | q0.90 |
| --- | --- | --- | --- |
| 1600 px | 0.18 GB | 0.24 GB | 0.39 GB |
| **2400 px** | 0.40 GB | **0.54 GB** | 0.89 GB |
| 3200 px | 0.67 GB | 0.91 GB | 1.52 GB |

**(2400, 0.80) is the largest swept pair that leaves the reference library under 1 GB with real
headroom.** The two nearest alternatives both lose the free destination once thumbnails, pages and
the viewer bundle are counted on top: q0.9 lands at 0.89 GB and 3200 px at 0.91 GB, each with under
12% of the ceiling left. Going the other way, 1600 px would give up half the linear resolution to buy
headroom nobody needs.

The fidelity price of stopping at q0.80 rather than q0.90 is **+0.028 mean SSIM for +66% bytes**. The
hardest class is fine-grained texture, not text: the worst master at q0.8 is the B&W film scan
(0.9190, grain is the first thing a lossy encoder discards) with the parchment folios at 0.936–0.937,
while the letterpress page — the one I expected to suffer — scores **0.9961**, because flat paper with
sharp black text is easy for WebP.

**This CONFIRMS Archie-4b0a's ~2400 px / q0.8 starting point rather than moving it.** What is new is
the criterion: the ledger now says *why* those values and *what breaks* if either moves.

### An independent check that the corpus is representative

Raw RGB (3 bytes/px — an uncompressed TIFF, arithmetic not measurement) over the archival WebP master
at q0.92 came out at **7.7–15.0×** across the five within-cap masters. `tiff-transcode.ts`'s own
header records **8–15×** from the real Gawan Museum import of 375 digitization masters. Two
independent measurements, on different corpora, same range. (The herbarium sheet's 90× is excluded
from that claim: it is also downscaled 10175→6000, so it is not a like-for-like transcode ratio.)

### What H2 does NOT establish

- **SSIM is a proxy, not an eye.** No human compared the q0.8 and q0.9 renders side by side at
  viewing size. The 0.9190 worst case is inside the conventional "good" band and outside the ≥0.95
  "visually near-identical" one, and that gap is a judgement this ledger makes explicitly rather than
  hides: the web tier is a *derivative* with originals always retained (`ingest-flows.ts:522`), so a
  visible-under-scrutiny loss is a different bargain than it would be for a master.
- **Six masters is a sample, not a population.** The bpp range is 4.7× wide (0.050–0.235), which is
  the honest uncertainty on any single-object estimate; it narrows fast over a library.
- **No audio or video was encoded.** The Opus figure below is arithmetic on a bitrate, not a measured
  transcode.

---

## H1 — the probe engine

`probeArchive(files, opts)` takes an enumerated folder and returns folder shape, both tier estimates,
a fit/no-fit verdict per (destination × tier) with a reason, and a recommended pair. Pure and DOM-free
beside `folder-import.ts`, whose classification helpers it **delegates to** — so the probe and the
import can never disagree about what gets imported.

### Measured, modelled, or exact — the estimator says which

This distinction is the design. A probe that presents a model as a measurement is worse than one that
refuses to guess.

| what | how | grounding |
| --- | --- | --- |
| a within-cap image at archival | **exact** — the file's own size | `bakeDisplayMaster` re-encodes only above the cap and preserves the source mime (`bake.ts:80-98`) |
| any audio/video at archival | **exact** — the file's own size | `ingest-flows.ts:461-467` stores AV as-is, no transcode, no cap |
| any image at web | **modelled** — capped pixels × 0.1476 | H2 above |
| a TIFF or over-cap image at archival | **modelled** — capped pixels × 0.2971 | H2; TIFF has no browser decoder so `transcodeTiff` always fires |
| audio at web | **arithmetic** — seconds × 32 kbps | Archie-4b0a's decided factor; see below |
| video at either tier | **exact, unchanged** | no transcode exists yet (Archie-7e6f) |
| file counts | **exact arithmetic** over `site.ts`'s writes | cross-checked, below |
| tile counts | **exact** — `dziPyramid` | `PROBE-tiling-threshold` verified these match the real slicer at every dimension |

`ArchiveProbe.confidence.imagesSampledFraction` carries how much of the image population was actually
measured, so a surface can say "estimated" when it is estimating.

### Sampling: each unsampled file is anchored to its OWN size

The ticket asks what the probe must sample to be accurate without reading 31 GB. The answer here:
sample dimensions on a subset, derive **pixels-per-source-byte** from that subset, and apply it to
each unsampled file's own byte count. That beats "assume every image is the median size" — a folder
mixing 2 MB and 20 MB scans keeps its spread, because every estimate is anchored to a fact about that
file. With no sample at all the fallback is the ingest cap, which **over-states**; that direction is
deliberate, because an over-stated estimate refuses a destination the archive might have squeaked
into, where an under-stated one promises a route that does not exist.

### The file-count model reconciles with a measured tree

Read from `site.ts`'s own write calls: **7 fixed** (`collection.json`, `exhibits.json`, `index.html`,
`sitemap.txt`, `sitemap.xml`, `images.json`, `archie.json`) **+ 3 per exhibit** (`manifest.json`,
`index.html`, `history/index.json`) **+ 3 per object** (`annotations.json`, master, thumbnail).

For `PROBE-tiling-threshold`'s 2-exhibit × 3-object library: 7 + 6 + 18 = **31**, which is exactly the
untiled file count that ledger measured by walking a real published tree. Two independent
derivations — reading the writer, counting the output — agree, and the test asserts it.

### Destination limits, read from the source on 2026-07-27

- **GitHub Pages** — "Published GitHub Pages sites may be no larger than 1 GB"; source repos have a
  recommended 1 GB limit; deployments time out at 10 minutes.
  (`docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits`)
  Per-file: warning above 50 MiB, **blocked above 100 MiB**; repos "ideally less than 1 GB, and less
  than 5 GB is strongly recommended". (`.../managing-large-files/about-large-files-on-github`)
  A **derived** ceiling sits beside these: `ghpages.ts:202` uses no `base_tree`, so every republish
  re-uploads every blob at ~80 content-writes/min. 4,800 files is an hour of uploading, which is a
  refusal in practice even though GitHub never says no.
- **Cloudflare R2** — **$0.015 / GB-month** Standard, **10 GB-month free**, egress free, usage rounds
  **up** to the next GB. Class A operations (a PUT) are $4.50/million with 1 M free/month, so even a
  100k-file library stays inside the free operation tier and pays storage only.
  (`developers.cloudflare.com/r2/pricing`, page last updated 2026-05-28)
- **Zip** — `ZIP_FORMAT_LIMITS` from `fs/zip.ts`: 65,535 entries / 4 GiB. **Taken as a parameter**, so
  Archie-1cf0's Zip64 writer is one argument away rather than a code edit. The tiling threshold is a
  parameter for the same reason (Archie-53e3).
- **Folder** — no size limit, but gated on `folderSinkSupported()` = desktop or Chromium. **Object
  storage is gated on the same capability**, because decision 11 means Archie writes a folder and
  hands over an `rclone` command rather than touching credentials. That is what makes "no route at
  all" reachable on Firefox/Safari, and the probe reports it as a blocker rather than hiding it.

### The recommendation rule

Walk destinations best-first — **GitHub Pages → object storage → folder → zip** — and at the first
destination where any tier fits, prefer **archival**, with two exceptions.

*Object storage above the folder* is deliberate: the map's goal is "a viewable website", and a folder
on your own disk is not one. It is a staging step or a route for someone who already has a host.

The two exceptions both came out of printing the probe's real output for the worked inventories, and
each corrected a rule that read fine in the abstract:

1. **File blow-up.** "The folder has no size limit" is not "any tier is sensible on a folder". At
   today's `TILE_MIN_EDGE` a 10,000-master archive publishes ~5.96 M files at archival against ~30 k
   at web — 198×. That is not fidelity, it is the DZI file-count tax, and file count is the binding
   constraint this whole map rests on. Ceiling: 10×. It becomes **inert** once Archie-53e3 raises the
   local threshold, at which point archival is preferred again — asserted in the suite so the ceiling
   is not mistaken for a permanent veto.
2. **Cost.** Preferring archival is wrong when archival turns a free route into a paid one. 200 hrs of
   oral history is 118 GB of WAV ($1.64/mo) against 2.7 GB of Opus (free). *"Free and good, or paid
   and archival?"* is the exact question the ticket says the institution CAN answer — so silently
   answering "paid" answers the wrong one. Where both tiers cost the same (video, which no tier
   shrinks) the test does not fire and archival wins, which is correct.

### What the probe says, on the worked inventories

```
### 300-file photo folder — 750 MB, 4000px JPEG
  archival   750 MB    910 files       web   182 MB    910 files
  => GitHub Pages / archival
     "Your archive fits at full fidelity — 750 MB. Free — 750 MB of the 1 GB GitHub Pages allows."

### 10,000-file / 20 GB TIFF archive — 6000x4500 masters
  archival   291 GB  5,960,043 files   web   5.9 GB  30,043 files
  NO github-pages (both tiers) · NO zip archival (5,970,043 files past 65,535) · NO zip web (26 GB past 4 GB)
  => object storage / web  —  free, under the 10 GB tier
     "Full fidelity would fit here, but it slices every image into deep-zoom tiles —
      5,960,043 files against 30,043 files at web quality. Your originals stay on your disk either way."

### AV-heavy — 200 hrs WAV + 20 photos
  archival   118 GB    676 files       web   2.7 GB    676 files      driver = audio
  => object storage / web  —  free
     "Full fidelity would fit here, but 118 GB costs about $1.64/month to host, where 2.7 GB at
      web quality is free. Your originals stay on your disk either way."

### 12 hrs video + 50 photos
  archival    96 GB    199 files       web    96 GB    199 files      driver = video
  => object storage / archival  —  about $1.30/month
     "…Your 12 video files publish unchanged at both qualities — that is what sets the size here."
```

The last one is the ticket's own worked example, reproduced by the rule rather than special-cased.

---

## Gates

| gate | result |
| --- | --- |
| `cd apps/studio && pnpm exec vitest run` | **1044 tests / 79 files passed** (51 of them this ticket's) |
| `cd apps/studio && pnpm typecheck` | clean, exit 0 |

### The red-green found a real hole in the suite

First injection — `WEB_TIER.bytesPerPixel` 0.1476 → 0.30 — left **all 46 tests GREEN**. Every
estimator assertion computed its expected value *from the constant it was meant to check*, so the
suite could not see a constant that had drifted from the sweep. This is the tautology class this
repo's rules keep catching, and it was live in the first commit.

Four assertions were added that carry the measured numbers as **literals**, keep the point estimate
inside its own measured range, and — the one that matters most — pin the **decision criterion**: the
1,000-image reference library must stay under 1 GB with headroom. Re-proven:

| injection | result |
| --- | --- |
| `bytesPerPixel` 0.1476 → 0.30 | **3 fail** (was 0) |
| `WEB_TIER_OPUS_KBPS` 32 → 128 | **2 fail** |
| `WEB_TIER.maxDim` 2400 → 3200 | **4 fail** |

---

## Open, and deliberately not closed here

- **Opus is arithmetic, never encoded.** 32 kbps is the spoken-word figure Archie-34a2's own
  arithmetic uses (100 hrs ≈ 60 GB WAV → ~1.4 GB Opus is 32 kbps), and the ratio the probe reports is
  1411/32 = 44× against the map's rounded "~40×". A music-heavy collection wants ~96 kbps and would
  land 3× larger. `opusKbps` is a parameter; **nobody has measured an actual Opus encode of real
  archive audio**, and no transcode path exists yet to measure.
- **The viewer bundle is not in the file model.** Decision 2 says every export bundles the viewer;
  `site.ts` does not write it yet (Archie-e09d). A handful of files and ~264 KB, and the estimates are
  low by exactly that.
- **`practicalFileCeiling` = 4,800 is derived, not published.** GitHub states no file-count limit; the
  number is one hour at the measured ~80 writes/min. It is the one destination constant in the module
  that is a judgement rather than a citation, and it is labelled as such in the source.
- **The probe was never driven in a browser.** It is pure and unit-tested; the sampling seam
  (who decodes which images, and how many) is c367's and the create-dialog's problem, and the cost of
  that sampling on a 10,000-file folder is unmeasured.
- **BEFORE or AFTER ingest** — the ticket's own open sub-question — is answered structurally rather
  than argued: `ProbedFile` is what a `webkitdirectory` pick or a Tauri directory walk already yields,
  so the probe runs before a byte is ingested. Whether the create dialog can afford to sample
  dimensions at that moment is the untested half.
