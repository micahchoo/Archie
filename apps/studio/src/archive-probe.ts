// Probe an enumerated folder and cost the routes out of it (Archie-7280).
//
// The question this answers, before a single byte is ingested: "2,400 files, 31 GB — which
// destinations are open to me, at what quality, for how much?" A small institution cannot answer
// "do you need object storage?"; it can answer "free and good, or paid and archival?". So this is a
// PROBE, not a questionnaire — it takes what a folder pick already hands you (names, sizes, MIME) plus
// whatever dimensions were cheap to sample, and returns costed verdicts per destination.
//
// PURE and DOM-free, like folder-import.ts beside it: no File, no canvas, no fetch. The caller
// (Archie-c367's publish surface, and CreateExhibitDialog's folder preview) does the enumerating.
//
// WHAT IS MEASURED VS. WHAT IS MODELLED — read this before trusting a number out of here:
//   - Bytes Archie passes through UNCHANGED (a within-cap image, any audio/video at archival) are
//     EXACT: they are the file's own size.
//   - Bytes Archie RE-ENCODES are modelled as pixels x bytes-per-pixel, with the bpp measured in
//     `scripts/perf/webptierbench.ts` over six real digitization masters. See
//     `ledgers/PROTO-folder-probe-2026-07-27.md` for the table and the spread.
//   - File COUNTS are exact arithmetic over what `publish/site.ts` writes, cross-checked against the
//     measured 31-file baseline in `ledgers/PROBE-tiling-threshold-2026-07-27.md`.
// An estimate is never presented as a measurement; `ArchiveProbe.confidence` carries how much of the
// image population was actually sampled.

import { MAX_MASTER_DIM, ZIP_FORMAT_LIMITS, dziPyramid, fitWithin, type ZipFormatLimits } from "@render/core";
import { inferredMime, isHiddenPath, isImportableMedia, folderNameFrom, type PickedFile } from "./folder-import.js";

// ---------------------------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------------------------

/** A file as the probe sees it: what a folder pick gives for free, plus anything cheaply sampled.
 *  `bytes` is `File.size` — free, no read. `width`/`height` cost a decode, so callers sample a
 *  subset; `durationSec` likewise. Absent values are ESTIMATED, never assumed to be zero. */
export interface ProbedFile extends PickedFile {
  /** File.size in bytes. */
  bytes: number;
  /** Pixel width, when the caller sampled it. */
  width?: number;
  /** Pixel height, when the caller sampled it. */
  height?: number;
  /** Duration in seconds, when the caller sampled it (audio/video). */
  durationSec?: number;
}

export type MediaKind = "image" | "audio" | "video";
export type QualityTier = "archival" | "web";
export type DestinationId = "github-pages" | "object-storage" | "folder" | "zip";

// ---------------------------------------------------------------------------------------------
// Measured / cited constants
// ---------------------------------------------------------------------------------------------

/** The web tier's pinned encode parameters (Archie-4b0a decided the tier; this ticket pinned the
 *  numbers). Measured 2026-07-27 by `scripts/perf/webptierbench.ts` over six real digitization
 *  masters through Chromium's `canvas.toBlob(…, "image/webp", q)` — the encoder Archie actually
 *  ships (`bake.ts:45`, `tiff-transcode.ts:72`), not `cwebp`.
 *
 *  WHY THESE TWO NUMBERS: the sweep found bytes-per-pixel is essentially FLAT across output
 *  dimension at fixed quality (q0.8: 0.1496 / 0.1500 / 0.1432 bpp at 1600 / 2400 / 3200 px), so
 *  `maxDim` and `quality` are separable levers and each can be pinned against one boundary — the
 *  1 GB GitHub Pages ceiling, on the map's own 1,000-image reference library. (2400, 0.80) is the
 *  LARGEST swept pair that leaves that library under 1 GB with headroom: 0.54 GB, against 0.89 GB at
 *  q0.9 and 0.91 GB at 3200px, both of which lose the free destination once thumbnails and pages are
 *  counted. Fidelity cost of stopping at 0.80: mean SSIM 0.9555 (worst master 0.9182) against
 *  0.9839 / 0.9634 at q0.9 — +0.028 SSIM for +66% bytes. */
export interface WebTierParams {
  /** Longer-edge cap in px. */
  readonly maxDim: number;
  /** `canvas.toBlob` quality, 0-1. */
  readonly quality: number;
  /** Measured mean WebP bytes per output pixel at `quality`. */
  readonly bytesPerPixel: number;
  /** Measured [min, max] across the corpus — the honest spread behind `bytesPerPixel`. */
  readonly bytesPerPixelRange: readonly [number, number];
}
export const WEB_TIER: WebTierParams = {
  maxDim: 2400,
  quality: 0.8,
  bytesPerPixel: 0.1476,
  bytesPerPixelRange: [0.05, 0.2345],
};

/** WebP bytes per pixel at `bakeDisplayMaster`'s default q0.92 (`bake.ts:34`) — what an ingested
 *  TIFF's archival master costs, since `transcodeTiff` re-encodes to WebP (`tiff-transcode.ts:35`).
 *  Measured as the mean over the five corpus masters that sit WITHIN the cap, i.e. re-encoded at
 *  their own size with no downscale, which is the case this models (0.2006-0.3893).
 *
 *  Independent confirmation that the corpus is representative: raw RGB (3 bytes/px, an uncompressed
 *  TIFF) over this WebP master came out at 7.7-15.0x on those five — which brackets the "8-15x
 *  smaller as WebP at visually-equivalent quality" that `tiff-transcode.ts`'s header records from the
 *  real Gawan Museum import of 375 digitization masters. Two independent measurements, same range.
 *
 *  Applied to an image ABOVE the cap this over-states (a downscaled master carries less
 *  high-frequency detail per pixel: the corpus's one over-cap sheet landed at 0.0956) — over-stating
 *  is the safe direction here, see `imageFacts`. */
export const ARCHIVAL_WEBP_BYTES_PER_PIXEL = 0.2971;

/** Opus bitrate the web tier targets for audio (Archie-4b0a: "AUDIO: IN"). 32 kbps is the
 *  oral-history / spoken-word figure the map's own arithmetic uses — 100 hrs ≈ 60 GB WAV → ~1.4 GB
 *  Opus is 32 kbps, and that ~40x is the number the tier decision was made on (Archie-34a2 MEASURED
 *  FACTS). A music-heavy collection wants ~96 kbps and would land ~3x larger; pass `opusKbps` to say
 *  so rather than editing this. */
export const WEB_TIER_OPUS_KBPS = 32;

/** Source bitrates used ONLY when a caller could not sample `durationSec` — duration is then
 *  inferred as bytes / (kbps/8). Uncompressed formats are exact by construction (WAV 44.1 kHz /
 *  16-bit / stereo = 1411 kbps); the compressed entries are the common encoder defaults. */
export const AUDIO_SOURCE_KBPS: Readonly<Record<string, number>> = {
  "audio/wav": 1411,
  "audio/x-wav": 1411,
  "audio/aiff": 1411,
  "audio/flac": 850,
  "audio/mpeg": 192,
  "audio/mp4": 160,
  "audio/ogg": 128,
  "audio/opus": 64,
};
/** Fallback for an audio MIME not in the table — the compressed middle, deliberately not the WAV
 *  figure (over-stating duration would over-state the Opus estimate). */
export const AUDIO_SOURCE_KBPS_DEFAULT = 192;

/** Long-edge : short-edge ratio assumed for an image whose dimensions were never sampled and where
 *  the sample gave no better answer. 4:3 is the digitization-master shape
 *  `PROBE-tiling-threshold-2026-07-27.md` swept. */
export const DEFAULT_ASPECT = 4 / 3;

/** Files `publish/site.ts` writes that do not scale with the library, per its own write calls:
 *  collection.json, exhibits.json, index.html, sitemap.txt, sitemap.xml, images.json, archie.json
 *  (`site.ts:320,324,654,664,665,670,678`). */
export const PUBLISH_FIXED_FILES = 7;
/** Per exhibit: manifest.json, index.html, history/index.json (`site.ts:632,651,534`). */
export const PUBLISH_FILES_PER_EXHIBIT = 3;
/** Per object: annotations.json, the master asset, the thumbnail (`site.ts:619,431,280`). */
export const PUBLISH_FILES_PER_OBJECT = 3;
// Cross-check, and the reason these three are stated rather than fitted: 7 + 2x3 + 6x3 = 31, which
// is EXACTLY the untiled file count `PROBE-tiling-threshold-2026-07-27.md` measured for its 2-exhibit
// x 3-object library. Two independent derivations (reading the writer / counting a real tree) agree.

/** Today's `TILE_MIN_EDGE` (`publish-flows.svelte.ts:163`) — an object whose longer edge exceeds this
 *  is sliced into a DZI pyramid. `PROBE-tiling-threshold-2026-07-27.md` recommends raising the local
 *  path to `MAX_MASTER_DIM`, which would make tiling inert for bulk imports; that lands in
 *  Archie-53e3, so the probe models TODAY and takes the threshold as a parameter. */
export const TILE_MIN_EDGE = 4096;

/** GitHub's published limits, read from the docs on 2026-07-27 (not recalled):
 *  - "Published GitHub Pages sites may be no larger than 1 GB."
 *  - "GitHub Pages source repositories have a recommended limit of 1 GB."
 *  - "GitHub blocks files larger than 100 MiB" (warning above 50 MiB).
 *  - "GitHub Pages deployments will timeout if they take longer than 10 minutes."
 *  docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits and
 *  .../managing-large-files/about-large-files-on-github */
export interface GithubPagesLimits {
  readonly maxSiteBytes: number;
  readonly maxFileBytes: number;
  /** Content writes per minute before GitHub's secondary rate limit bites. `ghpages.ts:202` uses no
   *  `base_tree`, so EVERY republish re-uploads every blob — this is what makes file count, not
   *  bytes, the binding constraint on this destination (Archie-34a2 MEASURED FACTS: four 6000x8000
   *  scans = 4,132 uploads ≈ a 52-minute floor). */
  readonly contentWritesPerMinute: number;
  /** Above this many files the upload time stops being reasonable — derived, not a GitHub limit. */
  readonly practicalFileCeiling: number;
}
export const GITHUB_PAGES_LIMITS: GithubPagesLimits = {
  maxSiteBytes: 1024 * 1024 * 1024,
  maxFileBytes: 100 * 1024 * 1024,
  contentWritesPerMinute: 80,
  // 80 writes/min x 60 min = 4,800 files is one hour of uploading. Past that the publish is an
  // afternoon, which is a refusal in practice even though GitHub never says no.
  practicalFileCeiling: 4_800,
};

/** Cloudflare R2 Standard, from developers.cloudflare.com/r2/pricing (page last updated 2026-05-28,
 *  read 2026-07-27): $0.015 / GB-month, 10 GB-month free, egress free, and usage rounds UP to the
 *  next GB. Class A operations (a PUT is one) are $4.50/million with 1 million free per month — a
 *  100k-file library therefore stays inside the free operation tier and costs storage only. */
export interface StoragePricing {
  readonly label: string;
  readonly usdPerGbMonth: number;
  readonly freeGbMonth: number;
}
export const OBJECT_STORAGE_PRICING: StoragePricing = {
  label: "Cloudflare R2",
  usdPerGbMonth: 0.015,
  freeGbMonth: 10,
};

// ---------------------------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------------------------

export interface ProbeOptions {
  webTier?: WebTierParams;
  /** Override the Opus target (see `WEB_TIER_OPUS_KBPS`). */
  opusKbps?: number;
  /** Ingest's longer-edge cap. Defaults to `MAX_MASTER_DIM`. */
  maxMasterDim?: number;
  /** Longer edge above which the archival tier slices a DZI pyramid. `Infinity` = never tile.
   *  Defaults to today's `TILE_MIN_EDGE`; pass `MAX_MASTER_DIM` to model Archie-53e3's recommendation. */
  tileThresholdPx?: number;
  /** Zip writer ceilings. Defaults to `ZIP_FORMAT_LIMITS` (fflate, classic zip). Archie-1cf0 swaps in
   *  a Zip64 writer, which is exactly why this is a parameter and not a hard-coded literal. */
  zipLimits?: ZipFormatLimits;
  /** What this platform can actually do. `folderSink` mirrors `folderSinkSupported()` —
   *  `isTauri() || supportsFolderPicker()`, i.e. desktop or Chromium (Archie-c85f / decision 11).
   *  Firefox and Safari get `false`, and that is what makes "no route at all" reachable. */
  capabilities?: { folderSink: boolean };
  storagePricing?: StoragePricing;
  githubLimits?: GithubPagesLimits;
  /** How many exhibits the import will produce — `folderGroupCount(files)`. Defaults to 1. */
  exhibitCount?: number;
}

// ---------------------------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------------------------

export interface FolderShape {
  name: string;
  /** Every entry handed in, including ones Archie will skip. */
  totalFiles: number;
  /** Importable, non-hidden media — what actually becomes objects. */
  mediaFiles: number;
  /** Handed in but not importable (hidden paths, sidecars, .txt, unknown types). */
  skippedFiles: number;
  images: number;
  audio: number;
  video: number;
  /** Sum of `bytes` over the media files only. */
  mediaBytes: number;
  /** Sum of `bytes` over everything handed in. */
  totalBytes: number;
}

/** What the probe learned from the files whose dimensions/durations it could read — the material for
 *  the "mostly 6000x8000 TIFF" line in the c367 mock. */
export interface FolderSample {
  imagesSampled: number;
  /** Median longer edge across sampled images, or null when none were sampled. */
  medianLongEdge: number | null;
  /** Median long:short aspect across sampled images; falls back to `DEFAULT_ASPECT`. */
  medianAspect: number;
  /** Most common image MIME, by file count. */
  dominantImageMime: string | null;
  /** Pixels per source byte, from the sampled images — how unsampled images get a pixel count. */
  pixelsPerSourceByte: number | null;
  audioSampled: number;
  videoSampled: number;
  /** Total audio seconds, sampled where possible and inferred from bitrate elsewhere. */
  audioSeconds: number;
  /** Total video seconds; null when nothing was sampled (video is never transcoded, so the probe
   *  never needs this for bytes — it is here so the surface can say "12 hrs of video"). */
  videoSeconds: number | null;
}

export interface TierEstimate {
  tier: QualityTier;
  /** Bytes of the published tree (masters, thumbnails, tiles, JSON, pages). Originals excluded —
   *  `publish` and `folder` stay lean by decision 3 on Archie-34a2. */
  publishedBytes: number;
  /** Files in that tree. */
  publishedFiles: number;
  /** Bytes of `assets-original/` — carried ONLY by destinations that opt in (the zip; a folder with
   *  `withOriginals`). The only non-regenerable bytes. */
  originalBytes: number;
  /** Published bytes attributable to each media kind — this is what lets the surface say "your video
   *  forces object storage either way". */
  bytesByMedia: Record<MediaKind, number>;
  /** The media kind responsible for most of `publishedBytes`, or null when nothing dominates. */
  driver: MediaKind | null;
  /** Tile files inside `publishedFiles` (0 whenever nothing crosses the tiling threshold). */
  tileFiles: number;
  /** Objects the import will create — one per importable media file. */
  objects: number;
}

export interface DestinationVerdict {
  destination: DestinationId;
  tier: QualityTier;
  fits: boolean;
  /** Always populated. When `fits` is false this is the greyed-out row's reason, in the user's own
   *  numbers; when true it is the fact to state beside the option. */
  reason: string;
  estimatedBytes: number;
  estimatedFiles: number;
  /** Present for object storage only. */
  estimatedMonthlyCostUsd?: number;
  /** Rough upload wall-clock where the destination has a known write rate (GitHub Pages). */
  estimatedUploadMinutes?: number;
  /** True when the destination carries `assets-original/` as well as the published tree. */
  carriesOriginals: boolean;
}

export interface ProbeRecommendation {
  destination: DestinationId;
  tier: QualityTier;
  /** One sentence, in the user's numbers, for why this pair and not another. */
  why: string;
}

export interface ArchiveProbe {
  folder: FolderShape;
  sample: FolderSample;
  tiers: Record<QualityTier, TierEstimate>;
  /** Every (destination x tier) pair, in a stable order: destinations in preference order, archival
   *  before web within each. The surface picks the column its quality toggle is on. */
  destinations: DestinationVerdict[];
  recommendation: ProbeRecommendation | null;
  /** Non-empty exactly when NO (destination, tier) pair fits — the honest dead end. */
  blockers: string[];
  /** Fraction of images whose dimensions were actually read (1 = every estimate below is grounded in
   *  real pixels; 0 = every image's pixel count was inferred from its byte size). */
  confidence: { imagesSampledFraction: number };
}

// ---------------------------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------------------------

/** The media kind ingest will treat this file as, or null when it will be skipped. Delegates to
 *  folder-import so the probe and the import can never disagree about what gets imported. */
export function probedKind(f: ProbedFile): MediaKind | null {
  if (isHiddenPath(f.relativePath) || !isImportableMedia(f)) return null;
  const m = inferredMime(f);
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("audio/")) return "audio";
  if (m.startsWith("video/")) return "video";
  return null;
}

const median = (xs: number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
};

// ---------------------------------------------------------------------------------------------
// Pixel arithmetic
// ---------------------------------------------------------------------------------------------

/** Pixels remaining after capping the longer edge to `maxDim`, for an image of `pixels` pixels at
 *  long:short ratio `aspect`. Downscale-only, mirroring `fitWithin`'s contract — an image already
 *  inside the cap is returned untouched. Working in pixels (rather than w/h) is what lets an
 *  UNSAMPLED image, whose dimensions nobody read, still be capped correctly. */
export function cappedPixels(pixels: number, aspect: number, maxDim: number): number {
  if (pixels <= 0) return 0;
  const a = Math.max(1, aspect);
  // pixels = long * short and long = a * short  =>  long = sqrt(pixels * a)
  const longEdge = Math.sqrt(pixels * a);
  if (longEdge <= maxDim) return pixels;
  const scale = maxDim / longEdge;
  return pixels * scale * scale;
}

/** Longer edge implied by a pixel count at a given aspect — for the tiling test, which is an
 *  edge-length test, not an area test. */
function longEdgeOf(pixels: number, aspect: number): number {
  return Math.sqrt(pixels * Math.max(1, aspect));
}

/** Tile files a DZI pyramid of these dimensions contains. Delegates to render-core's `dziPyramid`,
 *  whose counts `PROBE-tiling-threshold-2026-07-27.md` verified match the real slicer EXACTLY at
 *  every dimension it swept — so this is arithmetic over a checked model, not a guess. +1 for the
 *  `.dzi` descriptor written beside the tile directory. */
export function tileFileCount(width: number, height: number): number {
  if (width <= 0 || height <= 0) return 0;
  return dziPyramid(width, height).totalTiles + 1;
}

// ---------------------------------------------------------------------------------------------
// The probe
// ---------------------------------------------------------------------------------------------

const GIB = 1024 * 1024 * 1024;
const MIB = 1024 * 1024;

/** Bytes → a short human string, for the reason lines. Deliberately coarse: a probe that prints
 *  "0.97 GB" invites a precision it does not have. */
export function humanBytes(n: number): string {
  if (n >= GIB) {
    const gb = n / GIB;
    // "1 GB", not "1.0 GB" — a trailing .0 reads as precision that is not there, and it has to match
    // the way GitHub's own limit is written when the reason quotes it back.
    return `${gb >= 10 ? gb.toFixed(0) : gb.toFixed(1).replace(/\.0$/, "")} GB`;
  }
  if (n >= MIB) return `${Math.round(n / MIB)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${Math.round(n)} bytes`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

interface ImageFacts {
  /** Source pixels — sampled where possible, inferred from bytes otherwise. */
  pixels: number;
  aspect: number;
  sourceBytes: number;
  /** True when ingest re-encodes rather than storing the file as delivered: a TIFF (no browser
   *  decoder → `transcodeTiff` → WebP) or anything over the cap. */
  reencodedAtIngest: boolean;
}

function analyseSample(files: ProbedFile[]): { sample: FolderSample; kinds: Map<ProbedFile, MediaKind> } {
  const kinds = new Map<ProbedFile, MediaKind>();
  for (const f of files) {
    const k = probedKind(f);
    if (k) kinds.set(f, k);
  }
  const images = [...kinds].filter(([, k]) => k === "image").map(([f]) => f);
  const audio = [...kinds].filter(([, k]) => k === "audio").map(([f]) => f);
  const video = [...kinds].filter(([, k]) => k === "video").map(([f]) => f);

  const sampledImages = images.filter((f) => typeof f.width === "number" && typeof f.height === "number" && f.width > 0 && f.height > 0);
  const longEdges = sampledImages.map((f) => Math.max(f.width!, f.height!));
  const aspects = sampledImages.map((f) => Math.max(f.width!, f.height!) / Math.max(1, Math.min(f.width!, f.height!)));

  // Pixels per source byte from the sample, applied to each UNSAMPLED image's own byte count. This
  // beats "assume every image is the median size": a folder of mixed 2 MB and 20 MB scans keeps its
  // spread, because each file's estimate is anchored to its own size.
  const sampledPixels = sampledImages.reduce((n, f) => n + f.width! * f.height!, 0);
  const sampledBytes = sampledImages.reduce((n, f) => n + f.bytes, 0);
  const pixelsPerSourceByte = sampledBytes > 0 ? sampledPixels / sampledBytes : null;

  const mimeCounts = new Map<string, number>();
  for (const f of images) {
    const m = inferredMime(f);
    mimeCounts.set(m, (mimeCounts.get(m) ?? 0) + 1);
  }
  const dominantImageMime = [...mimeCounts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;

  const secondsOf = (f: ProbedFile): number => {
    if (typeof f.durationSec === "number" && f.durationSec > 0) return f.durationSec;
    const kbps = AUDIO_SOURCE_KBPS[inferredMime(f)] ?? AUDIO_SOURCE_KBPS_DEFAULT;
    return f.bytes / ((kbps * 1000) / 8);
  };
  const audioSeconds = audio.reduce((n, f) => n + secondsOf(f), 0);
  const sampledVideo = video.filter((f) => typeof f.durationSec === "number" && f.durationSec > 0);

  return {
    kinds,
    sample: {
      imagesSampled: sampledImages.length,
      medianLongEdge: median(longEdges),
      medianAspect: median(aspects) ?? DEFAULT_ASPECT,
      dominantImageMime,
      pixelsPerSourceByte,
      audioSampled: audio.filter((f) => typeof f.durationSec === "number").length,
      videoSampled: sampledVideo.length,
      audioSeconds,
      videoSeconds: sampledVideo.length > 0 ? sampledVideo.reduce((n, f) => n + f.durationSec!, 0) : null,
    },
  };
}

function imageFacts(f: ProbedFile, sample: FolderSample, maxMasterDim: number): ImageFacts {
  const sampled = typeof f.width === "number" && typeof f.height === "number" && f.width > 0 && f.height > 0;
  const aspect = sampled ? Math.max(f.width!, f.height!) / Math.max(1, Math.min(f.width!, f.height!)) : sample.medianAspect;
  // An unsampled image gets pixels from its OWN byte count times the sample's pixels-per-byte. With
  // no sample at all there is nothing to scale by, so fall back to the cap — which over-states rather
  // than under-states, and an over-stated estimate refuses a destination the archive might have
  // squeaked into, where an under-stated one promises a route that does not exist.
  const pixels = sampled
    ? f.width! * f.height!
    : sample.pixelsPerSourceByte !== null
      ? f.bytes * sample.pixelsPerSourceByte
      : cappedPixels(maxMasterDim * maxMasterDim, aspect, maxMasterDim);
  const mime = inferredMime(f);
  const isTiff = mime === "image/tiff" || mime === "image/x-tiff";
  return {
    pixels,
    aspect,
    sourceBytes: f.bytes,
    reencodedAtIngest: isTiff || longEdgeOf(pixels, aspect) > maxMasterDim,
  };
}

function estimateTier(
  tier: QualityTier,
  files: ProbedFile[],
  kinds: Map<ProbedFile, MediaKind>,
  sample: FolderSample,
  o: Required<Pick<ProbeOptions, "webTier" | "opusKbps" | "maxMasterDim" | "tileThresholdPx" | "exhibitCount">>,
): TierEstimate {
  const bytesByMedia: Record<MediaKind, number> = { image: 0, audio: 0, video: 0 };
  let objects = 0;
  let tileFiles = 0;
  let originalBytes = 0;

  for (const f of files) {
    const kind = kinds.get(f);
    if (!kind) continue;
    objects++;
    originalBytes += f.bytes;

    if (kind === "image") {
      const facts = imageFacts(f, sample, o.maxMasterDim);
      if (tier === "web") {
        // Every image is re-encoded to WebP at the pinned cap — measured bpp x capped pixels.
        bytesByMedia.image += cappedPixels(facts.pixels, facts.aspect, o.webTier.maxDim) * o.webTier.bytesPerPixel;
        // The web cap sits below every tiling threshold under consideration, so the web tier never
        // tiles. That is `PROBE-tiling-threshold-2026-07-27.md`'s "CONFIRMED" section, and it is
        // ENFORCED here rather than assumed: the threshold test below runs on the archival branch only.
      } else {
        const px = cappedPixels(facts.pixels, facts.aspect, o.maxMasterDim);
        // Pass-through where ingest passes through; modelled only where it re-encodes.
        bytesByMedia.image += facts.reencodedAtIngest ? px * ARCHIVAL_WEBP_BYTES_PER_PIXEL : facts.sourceBytes;
        const longEdge = longEdgeOf(px, facts.aspect);
        if (longEdge > o.tileThresholdPx) {
          const w = Math.round(longEdge);
          const h = Math.max(1, Math.round(longEdge / Math.max(1, facts.aspect)));
          const tiles = tileFileCount(w, h);
          tileFiles += tiles;
          // A DZI pyramid costs ~2.7-3.0x the master's bytes across the whole size range, measured
          // (PROBE-tiling-threshold-2026-07-27.md, "Byte overhead of tiling is a stable ~2.7-3.0x").
          bytesByMedia.image += (facts.reencodedAtIngest ? px * ARCHIVAL_WEBP_BYTES_PER_PIXEL : facts.sourceBytes) * 2.9;
        }
      }
    } else if (kind === "audio") {
      if (tier === "web") {
        const kbps = AUDIO_SOURCE_KBPS[inferredMime(f)] ?? AUDIO_SOURCE_KBPS_DEFAULT;
        const seconds = typeof f.durationSec === "number" && f.durationSec > 0 ? f.durationSec : f.bytes / ((kbps * 1000) / 8);
        // Never make a file BIGGER by transcoding it: a 64 kbps ogg re-encoded at 32 kbps Opus is a
        // real shrink, but a file already below the target is left alone (as ingest would).
        bytesByMedia.audio += Math.min(f.bytes, (seconds * o.opusKbps * 1000) / 8);
      } else {
        bytesByMedia.audio += f.bytes;
      }
    } else {
      // VIDEO IS COUNTED AT FULL SIZE AT BOTH TIERS — deliberately, and this is now a DELIBERATE
      // OVER-ESTIMATE rather than a statement of fact. Archie-7e6f shipped the web-tier transcode
      // (ffmpeg sidecar on desktop, mediabunny/WebCodecs in Chromium), so on a capable platform the
      // web tier DOES shrink video. This estimate does not model that, for a reason:
      //
      //   whether it shrinks depends on a CAPABILITY PROBE (`probeBrowserVideoCaps`) that is async
      //   and platform-specific, while `probeArchive` is pure and synchronous — and the answer
      //   differs between the machine estimating and the machine publishing.
      //
      // The error is therefore in the SAFE direction: the surface over-states the web tier's size,
      // so it recommends a destination that will certainly hold the result and never one that
      // will not. `videoTierTell` (video-transcode.ts) is the honest per-platform figure and is what
      // the copy should quote when the platform is known.
      //
      // FOLLOW-UP, named rather than silent (Archie-7e6f): thread a resolved video target into
      // `ProbeOptions` so `web` reflects `WEB_TIER_VIDEO_KBPS × duration` where a transcode is
      // actually reachable. Not done here because it changes the recommendation engine and its
      // suite, which is its own slice.
      bytesByMedia.video += f.bytes;
    }
  }

  const publishedBytes = bytesByMedia.image + bytesByMedia.audio + bytesByMedia.video;
  const publishedFiles =
    PUBLISH_FIXED_FILES + PUBLISH_FILES_PER_EXHIBIT * Math.max(1, o.exhibitCount) + PUBLISH_FILES_PER_OBJECT * objects + tileFiles;

  const entries = (Object.entries(bytesByMedia) as [MediaKind, number][]).sort((a, b) => b[1] - a[1]);
  const top = entries[0];
  const driver = top && publishedBytes > 0 && top[1] / publishedBytes > 0.5 ? top[0] : null;

  return { tier, publishedBytes, publishedFiles, originalBytes, bytesByMedia, driver, tileFiles, objects };
}

// ---------------------------------------------------------------------------------------------
// Destination verdicts
// ---------------------------------------------------------------------------------------------

/** Preference order, best-first. The recommendation walks this list and takes the first pair that fits.
 *
 *  Object storage sits ABOVE the folder deliberately: the goal Archie-34a2 states is "a viewable
 *  website", and a folder on your own disk is not one — it is a staging step (decision 11: Archie
 *  writes the folder and hands over an `rclone sync` command) or a route for someone who already has
 *  a web server. Leading with the folder would answer a question the user did not ask. This ordering
 *  is what reproduces the ticket's own worked example, where a video-carrying archive lands on
 *  "needs object storage (~$1.10/month)" rather than on a local folder. */
const DESTINATION_ORDER: readonly DestinationId[] = ["github-pages", "object-storage", "folder", "zip"];

/** How many times more FILES the archival tier may cost before the recommendation stops preferring it
 *  at a destination where both fit.
 *
 *  This exists because "the folder has no size limit" is not the same as "any tier is sensible on a
 *  folder". At today's `TILE_MIN_EDGE` a 10,000-master archive publishes ~5.9 MILLION files at
 *  archival against ~40,000 at web — 148x. That difference is not fidelity, it is the DZI file-count
 *  tax, and `PROBE-tiling-threshold-2026-07-27.md` is the whole argument that file count is the
 *  binding constraint on every route. A tier that multiplies files by two orders of magnitude is a
 *  different publishing problem, not a better version of the same one.
 *
 *  10x is the boundary between "somewhat more files" and "a different order of magnitude". Note this
 *  becomes inert once Archie-53e3 raises the local tiling threshold to `MAX_MASTER_DIM`: archival then
 *  costs ~30,000 files against web's ~40,000, the ratio drops below 1, and archival is preferred again
 *  — which is the correct outcome and is asserted in the suite. */
export const ARCHIVAL_FILE_RATIO_CEILING = 10;

function githubVerdict(t: TierEstimate, limits: GithubPagesLimits): DestinationVerdict {
  const uploadMinutes = t.publishedFiles / limits.contentWritesPerMinute;
  const base = {
    destination: "github-pages" as const,
    tier: t.tier,
    estimatedBytes: t.publishedBytes,
    estimatedFiles: t.publishedFiles,
    estimatedUploadMinutes: uploadMinutes,
    carriesOriginals: false,
  };
  if (t.publishedBytes > limits.maxSiteBytes) {
    return {
      ...base,
      fits: false,
      reason: `too big — ${humanBytes(t.publishedBytes)}, and a published GitHub Pages site may be no larger than ${humanBytes(limits.maxSiteBytes)}`,
    };
  }
  if (t.publishedFiles > limits.practicalFileCeiling) {
    return {
      ...base,
      fits: false,
      reason: `too many files — ${plural(t.publishedFiles, "file")}, and every publish re-uploads all of them at about ${limits.contentWritesPerMinute} a minute (${Math.round(uploadMinutes)} minutes)`,
    };
  }
  return {
    ...base,
    fits: true,
    reason: `free — ${humanBytes(t.publishedBytes)} of the ${humanBytes(limits.maxSiteBytes)} GitHub Pages allows`,
  };
}

function folderVerdict(t: TierEstimate, supported: boolean): DestinationVerdict {
  const base = {
    destination: "folder" as const,
    tier: t.tier,
    estimatedBytes: t.publishedBytes,
    estimatedFiles: t.publishedFiles,
    carriesOriginals: false,
  };
  return supported
    ? { ...base, fits: true, reason: `no size limit — ${humanBytes(t.publishedBytes)} written to a folder you choose, ready to upload to any host` }
    : {
        ...base,
        fits: false,
        // Decision 11 (Archie-34a2) / Archie-c85f: state the reason, never hide it and never silently
        // swap in the zip. The fallback collision is what c367 exists to kill.
        reason: "not available in this browser — writing to a folder needs the desktop app or Chrome",
      };
}

function objectStorageVerdict(t: TierEstimate, pricing: StoragePricing, folderSink: boolean): DestinationVerdict {
  // R2 rounds usage UP to the next GB-month; the free allowance comes off the top.
  const cost = monthlyCost(t.publishedBytes, pricing);
  const price = cost === 0 ? `free — under the ${pricing.freeGbMonth} GB free tier` : `about $${cost.toFixed(2)}/month`;
  const base = {
    destination: "object-storage" as const,
    tier: t.tier,
    estimatedBytes: t.publishedBytes,
    estimatedFiles: t.publishedFiles,
    estimatedMonthlyCostUsd: cost,
    carriesOriginals: false,
  };
  if (!folderSink) {
    return {
      ...base,
      fits: false,
      // Archie never touches credentials (decision 11), so the route is "write a folder, then rclone
      // sync it" — which means no folder sink is no object-storage route either.
      reason: "not available in this browser — Archie writes the files to a folder for you to upload, and that needs the desktop app or Chrome",
    };
  }
  return { ...base, fits: true, reason: `${price} on ${pricing.label} for ${humanBytes(t.publishedBytes)}, uploaded with a command Archie writes for you` };
}

/** What a tree of this size costs per month at the given pricing — the free tier taken off the top,
 *  usage rounded up as R2 bills it. Shared by the verdict and by the recommendation's free-vs-paid
 *  test, so the two can never disagree about whether a tier is free. */
function monthlyCost(bytes: number, pricing: StoragePricing): number {
  return Math.max(0, Math.ceil(bytes / GIB) - pricing.freeGbMonth) * pricing.usdPerGbMonth;
}

function zipVerdict(t: TierEstimate, limits: ZipFormatLimits): DestinationVerdict {
  // Decision 3 (Archie-34a2): the zip is the one artifact that carries assets-original/ — the only
  // non-regenerable bytes (`asset-store.ts:86`). So its size is the published tree PLUS every source
  // file, which is why it is the destination the caps bite first.
  const bytes = t.publishedBytes + t.originalBytes;
  const files = t.publishedFiles + t.objects;
  const base = {
    destination: "zip" as const,
    tier: t.tier,
    estimatedBytes: bytes,
    estimatedFiles: files,
    carriesOriginals: true,
  };
  if (files > limits.maxEntries) {
    return { ...base, fits: false, reason: `too many files — ${plural(files, "file")}, past the ${limits.maxEntries.toLocaleString()} a .zip can index` };
  }
  if (bytes > limits.maxBytes) {
    return { ...base, fits: false, reason: `too big — ${humanBytes(bytes)}, past the ${humanBytes(limits.maxBytes)} a .zip can index` };
  }
  return { ...base, fits: true, reason: `one file, ${humanBytes(bytes)} — and the only option that also carries your original files` };
}

// ---------------------------------------------------------------------------------------------

/**
 * Probe an enumerated folder: what is in it, what each quality tier would publish, which
 * destinations that fits, and which (destination, tier) pair to recommend.
 */
export function probeArchive(files: ProbedFile[], opts: ProbeOptions = {}): ArchiveProbe {
  const o = {
    webTier: opts.webTier ?? WEB_TIER,
    opusKbps: opts.opusKbps ?? WEB_TIER_OPUS_KBPS,
    maxMasterDim: opts.maxMasterDim ?? MAX_MASTER_DIM,
    tileThresholdPx: opts.tileThresholdPx ?? TILE_MIN_EDGE,
    exhibitCount: opts.exhibitCount ?? 1,
  };
  const zipLimits = opts.zipLimits ?? ZIP_FORMAT_LIMITS;
  const pricing = opts.storagePricing ?? OBJECT_STORAGE_PRICING;
  const githubLimits = opts.githubLimits ?? GITHUB_PAGES_LIMITS;
  const folderSink = opts.capabilities?.folderSink ?? true;

  const { sample, kinds } = analyseSample(files);
  const media = files.filter((f) => kinds.has(f));

  const folder: FolderShape = {
    name: folderNameFrom(files),
    totalFiles: files.length,
    mediaFiles: media.length,
    skippedFiles: files.length - media.length,
    images: media.filter((f) => kinds.get(f) === "image").length,
    audio: media.filter((f) => kinds.get(f) === "audio").length,
    video: media.filter((f) => kinds.get(f) === "video").length,
    mediaBytes: media.reduce((n, f) => n + f.bytes, 0),
    totalBytes: files.reduce((n, f) => n + f.bytes, 0),
  };

  const tiers: Record<QualityTier, TierEstimate> = {
    archival: estimateTier("archival", files, kinds, sample, o),
    web: estimateTier("web", files, kinds, sample, o),
  };

  const destinations: DestinationVerdict[] = [];
  for (const d of DESTINATION_ORDER) {
    for (const tier of ["archival", "web"] as const) {
      const t = tiers[tier];
      destinations.push(
        d === "github-pages" ? githubVerdict(t, githubLimits)
        : d === "folder" ? folderVerdict(t, folderSink)
        : d === "object-storage" ? objectStorageVerdict(t, pricing, folderSink)
        : zipVerdict(t, zipLimits),
      );
    }
  }

  const recommendation = recommend(destinations, tiers, folder, pricing);
  const blockers = destinations.some((v) => v.fits)
    ? []
    : [
        `Nothing here has a route: ${humanBytes(tiers.web.publishedBytes)} at web quality across ${plural(tiers.web.publishedFiles, "file")}.`,
        ...(folderSink
          ? []
          : ["This browser can only reach GitHub Pages and a .zip. The desktop app, or Chrome, opens the folder and object-storage routes."]),
      ];

  return {
    folder,
    sample,
    tiers,
    destinations,
    recommendation,
    blockers,
    confidence: { imagesSampledFraction: folder.images === 0 ? 1 : sample.imagesSampled / folder.images },
  };
}

/**
 * Pick the (destination, tier) pair to pre-select.
 *
 * The rule, and it is deliberately simple because the user's question is simple ("free and good, or
 * paid and archival?"):
 *   1. Walk destinations best-first (`DESTINATION_ORDER`).
 *   2. At the first destination where ANY tier fits, prefer ARCHIVAL if it fits there — losing
 *      fidelity buys nothing once the destination is already free — UNLESS archival costs either
 *      more than `ARCHIVAL_FILE_RATIO_CEILING` times the files (see that constant) or REAL MONEY
 *      where web is free. That second test is the user's own question, in their own words: "free and
 *      good, or paid and archival?" — so a probe that silently answers "paid" when "free" was on the
 *      table has answered the wrong one. Where BOTH tiers cost the same (video, which no tier
 *      shrinks), the test does not fire and archival is preferred, which is correct.
 * So a small photo archive gets (GitHub Pages, archival); the map's 1,000-scan reference gets
 * (GitHub Pages, web), because archival's 19 GB has no free home; a 10,000-master TIFF archive gets
 * (folder, web), because archival's DZI pyramids cost 148x the files; and a video archive gets
 * (object storage, …), because no tier shrinks video.
 */
function recommend(
  destinations: DestinationVerdict[],
  tiers: Record<QualityTier, TierEstimate>,
  folder: FolderShape,
  pricing: StoragePricing,
): ProbeRecommendation | null {
  const fileBlowup =
    tiers.web.publishedFiles > 0 && tiers.archival.publishedFiles / tiers.web.publishedFiles > ARCHIVAL_FILE_RATIO_CEILING;
  const costsMoney = monthlyCost(tiers.archival.publishedBytes, pricing) > 0 && monthlyCost(tiers.web.publishedBytes, pricing) === 0;

  for (const d of DESTINATION_ORDER) {
    const archival = destinations.find((v) => v.destination === d && v.tier === "archival");
    const web = destinations.find((v) => v.destination === d && v.tier === "web");
    const preferWeb = fileBlowup || costsMoney;
    const chosen = archival?.fits && !preferWeb ? archival : web?.fits ? web : archival?.fits ? archival : null;
    if (!chosen) continue;

    const other = chosen.tier === "archival" ? web : archival;
    let why: string;
    if (chosen.tier === "archival") {
      why = `Your archive fits at full fidelity — ${humanBytes(chosen.estimatedBytes)}. ${capitalise(chosen.reason)}.`;
    } else if (fileBlowup && archival?.fits) {
      why =
        `Full fidelity would fit here, but it slices every image into deep-zoom tiles — ` +
        `${plural(tiers.archival.publishedFiles, "file")} against ${plural(tiers.web.publishedFiles, "file")} at web quality. ` +
        `Your originals stay on your disk either way.`;
    } else if (costsMoney && archival?.fits) {
      why =
        `Full fidelity would fit here, but ${humanBytes(tiers.archival.publishedBytes)} costs about ` +
        `$${monthlyCost(tiers.archival.publishedBytes, pricing).toFixed(2)}/month to host, where ${humanBytes(tiers.web.publishedBytes)} at web quality is free. ` +
        `Your originals stay on your disk either way.`;
    } else {
      const archivalBytes = tiers.archival.publishedBytes;
      why =
        other && !other.fits
          ? `At full fidelity this is ${humanBytes(archivalBytes)}, which does not fit; at web quality it is ${humanBytes(chosen.estimatedBytes)}, which does. Your originals stay on your disk either way.`
          : `${capitalise(chosen.reason)}. Your originals stay on your disk.`;
    }
    if (tiers.web.driver === "video" && folder.video > 0) {
      why += ` Your ${plural(folder.video, "video file")} publish unchanged at both qualities — that is what sets the size here.`;
    }
    return { destination: d, tier: chosen.tier, why };
  }
  return null;
}

const capitalise = (s: string) => (s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1));
