import { describe, it, expect } from "vitest";
import { MAX_MASTER_DIM, ZIP_FORMAT_LIMITS } from "@render/core";
import {
  probeArchive, probedKind, cappedPixels, tileFileCount, humanBytes,
  WEB_TIER, ARCHIVAL_WEBP_BYTES_PER_PIXEL, WEB_TIER_OPUS_KBPS, AUDIO_SOURCE_KBPS,
  GITHUB_PAGES_LIMITS, OBJECT_STORAGE_PRICING, TILE_MIN_EDGE, ARCHIVAL_FILE_RATIO_CEILING,
  PUBLISH_FIXED_FILES, PUBLISH_FILES_PER_EXHIBIT, PUBLISH_FILES_PER_OBJECT,
  type ProbedFile, type DestinationId, type QualityTier,
} from "./archive-probe.js";

// --- fixture builders -------------------------------------------------------------------------
// Synthetic INVENTORIES, not synthetic images: the probe never reads bytes, so a fixture only has to
// carry the four facts a folder pick hands over (name, path, type, size) plus optional samples.

const MB = 1024 * 1024;
const GB = 1024 * MB;

function img(i: number, opts: { bytes: number; width?: number; height?: number; ext?: string; type?: string } = { bytes: 5 * MB }): ProbedFile {
  const ext = opts.ext ?? "jpg";
  return {
    name: `scan-${i}.${ext}`,
    relativePath: `Archive/scan-${i}.${ext}`,
    type: opts.type ?? (ext === "tif" || ext === "tiff" ? "" : `image/${ext === "jpg" ? "jpeg" : ext}`),
    bytes: opts.bytes,
    ...(opts.width !== undefined ? { width: opts.width } : {}),
    ...(opts.height !== undefined ? { height: opts.height } : {}),
  };
}

function audio(i: number, opts: { bytes: number; ext?: string; durationSec?: number }): ProbedFile {
  const ext = opts.ext ?? "wav";
  return {
    name: `interview-${i}.${ext}`,
    relativePath: `Archive/audio/interview-${i}.${ext}`,
    type: "",
    bytes: opts.bytes,
    ...(opts.durationSec !== undefined ? { durationSec: opts.durationSec } : {}),
  };
}

function video(i: number, opts: { bytes: number; durationSec?: number }): ProbedFile {
  return {
    name: `reel-${i}.mp4`,
    relativePath: `Archive/video/reel-${i}.mp4`,
    type: "video/mp4",
    bytes: opts.bytes,
    ...(opts.durationSec !== undefined ? { durationSec: opts.durationSec } : {}),
  };
}

const verdict = (p: ReturnType<typeof probeArchive>, d: DestinationId, t: QualityTier) => {
  const v = p.destinations.find((x) => x.destination === d && x.tier === t);
  if (!v) throw new Error(`no verdict for ${d}/${t}`);
  return v;
};

// --- the three inventories the ticket names ---------------------------------------------------

/** A 300-file photo folder: a local-history society's scanned prints, every image sampled.
 *  2.5 MB per 12 Mpx file is 0.21 bytes/px — the source bpp actually MEASURED on the corpus in
 *  `scripts/perf/webptierbench.ts` (0.206-0.217 on the three photographic/manuscript masters), not a
 *  round number picked to make the test come out. */
const PHOTO_FOLDER: ProbedFile[] = Array.from({ length: 300 }, (_, i) =>
  img(i, { bytes: 2.5 * MB, width: 4000, height: 3000 }),
);

/** A 10,000-file, 20 GB digitization archive of 6000x4500 TIFF masters — the map's target scale. */
const BIG_TIFF_ARCHIVE: ProbedFile[] = Array.from({ length: 10_000 }, (_, i) =>
  img(i, { bytes: 2 * MB + 96 * 1024, ext: "tif", width: 6000, height: 4500 }),
);

/** An oral-history collection: 200 hours of WAV plus a handful of reference photos. */
const WAV_BYTES_PER_HOUR = 44_100 * 2 * 2 * 3600;
const AV_FOLDER: ProbedFile[] = [
  // One hour of 44.1 kHz / 16-bit / stereo PCM is EXACTLY 44100*2*2*3600 = 635,040,000 bytes.
  ...Array.from({ length: 200 }, (_, i) => audio(i, { bytes: WAV_BYTES_PER_HOUR, durationSec: 3600 })),
  ...Array.from({ length: 20 }, (_, i) => img(i, { bytes: 4 * MB, width: 3000, height: 2000 })),
];

// ===============================================================================================
describe("probedKind — classification delegates to folder-import, so probe and import agree", () => {
  it("classifies the three media kinds", () => {
    expect(probedKind(img(1, { bytes: 1 }))).toBe("image");
    expect(probedKind(audio(1, { bytes: 1 }))).toBe("audio");
    expect(probedKind(video(1, { bytes: 1 }))).toBe("video");
  });
  it("types a .tif from the extension, exactly as folder-import's EXT_MIME does", () => {
    expect(probedKind(img(1, { bytes: 1, ext: "tif" }))).toBe("image");
  });
  it("skips hidden paths and non-media", () => {
    expect(probedKind({ name: "notes.txt", relativePath: "Archive/notes.txt", type: "text/plain", bytes: 10 })).toBeNull();
    expect(probedKind({ name: "a.jpg", relativePath: "Archive/.thumbnails/a.jpg", type: "image/jpeg", bytes: 10 })).toBeNull();
    expect(probedKind({ name: "Thumbs.db", relativePath: "Archive/Thumbs.db", type: "", bytes: 10 })).toBeNull();
  });
});

describe("cappedPixels — the cap is on the LONGER EDGE, applied to a pixel count", () => {
  it("leaves an image already inside the cap untouched", () => {
    expect(cappedPixels(1000 * 800, 1.25, 2400)).toBe(1000 * 800);
  });
  it("caps a 4:3 image to exactly the fitWithin result", () => {
    // 6000x4500 capped at 2400 -> 2400x1800.
    expect(cappedPixels(6000 * 4500, 6000 / 4500, 2400)).toBeCloseTo(2400 * 1800, 0);
  });
  it("caps a square image correctly (aspect 1 is not a special case)", () => {
    expect(cappedPixels(5000 * 5000, 1, 2500)).toBeCloseTo(2500 * 2500, 0);
  });
  it("caps an extreme panorama by its long edge, not its area", () => {
    // 8000x1000 at 2400 -> 2400x300 = 720,000 px, NOT sqrt-of-area scaling.
    expect(cappedPixels(8000 * 1000, 8, 2400)).toBeCloseTo(2400 * 300, 0);
  });
  it("returns zero for a zero-pixel image rather than NaN", () => {
    expect(cappedPixels(0, 1.33, 2400)).toBe(0);
  });
});

describe("tileFileCount — delegates to render-core's dziPyramid", () => {
  it("matches the count PROBE-tiling-threshold measured against the real slicer", () => {
    // That ledger's table: 6000x4500 -> 592 tiles/object, measured AND analytic. +1 for the .dzi.
    expect(tileFileCount(6000, 4500)).toBe(592 + 1);
    expect(tileFileCount(4096, 3072)).toBe(320 + 1);
    expect(tileFileCount(2400, 1800)).toBe(117 + 1);
  });
  it("is zero for a degenerate size instead of throwing", () => {
    expect(tileFileCount(0, 100)).toBe(0);
  });
});

// ===============================================================================================
describe("the file-count model reconciles with a measured published tree", () => {
  it("reproduces PROBE-tiling-threshold's measured 31-file untiled baseline", () => {
    // That bench published 2 exhibits x 3 objects with tiling off and walked the tree: 31 files.
    const files = Array.from({ length: 6 }, (_, i) => img(i, { bytes: 1 * MB, width: 800, height: 600 }));
    const p = probeArchive(files, { exhibitCount: 2, tileThresholdPx: Infinity });
    expect(p.tiers.archival.publishedFiles).toBe(31);
    // And the constants add up the way the comment in the module claims.
    expect(PUBLISH_FIXED_FILES + 2 * PUBLISH_FILES_PER_EXHIBIT + 6 * PUBLISH_FILES_PER_OBJECT).toBe(31);
  });
});

// ===============================================================================================
describe("inventory 1 — a 300-file photo folder", () => {
  const p = probeArchive(PHOTO_FOLDER, { exhibitCount: 1 });

  it("reports the shape the create-dialog panel needs", () => {
    expect(p.folder.mediaFiles).toBe(300);
    expect(p.folder.images).toBe(300);
    expect(p.folder.audio).toBe(0);
    expect(p.folder.mediaBytes).toBe(300 * 2.5 * MB);
    expect(p.sample.medianLongEdge).toBe(4000);
    expect(p.sample.dominantImageMime).toBe("image/jpeg");
    expect(p.confidence.imagesSampledFraction).toBe(1);
  });

  it("estimates the archival tier as the source bytes, because ingest stores a within-cap JPEG untouched", () => {
    // bakeDisplayMaster only re-encodes above MAX_MASTER_DIM (bake.ts:80-98). 4000px < 6000px.
    expect(p.tiers.archival.publishedBytes).toBe(300 * 2.5 * MB);
  });

  it("estimates the web tier from the pinned WebP bpp at the pinned cap", () => {
    // 4000x3000 -> 2400x1800 = 4,320,000 px x 0.1476 bpp.
    const perImage = 2400 * 1800 * WEB_TIER.bytesPerPixel;
    expect(p.tiers.web.publishedBytes).toBeCloseTo(300 * perImage, -3);
    expect(p.tiers.web.publishedBytes / p.tiers.archival.publishedBytes).toBeLessThan(0.65);
  });

  it("recommends GitHub Pages at ARCHIVAL quality — losing fidelity buys nothing when it already fits free", () => {
    expect(p.recommendation).toEqual({
      destination: "github-pages",
      tier: "archival",
      why: expect.stringContaining("full fidelity"),
    });
    expect(verdict(p, "github-pages", "archival").fits).toBe(true);
  });

  it("fits the zip too, and says the zip is the one that carries originals", () => {
    const z = verdict(p, "zip", "web");
    expect(z.fits).toBe(true);
    expect(z.carriesOriginals).toBe(true);
    // published tree + one original per object.
    expect(z.estimatedFiles).toBe(p.tiers.web.publishedFiles + 300);
    expect(z.estimatedBytes).toBeGreaterThan(300 * 2.5 * MB);
  });

  it("prices object storage as free at this size — under R2's 10 GB tier", () => {
    const os = verdict(p, "object-storage", "archival");
    expect(os.estimatedMonthlyCostUsd).toBe(0);
    expect(os.reason).toContain("free");
  });
});

// ===============================================================================================
describe("inventory 2 — a 10,000-file, 20 GB TIFF archive", () => {
  const p = probeArchive(BIG_TIFF_ARCHIVE, { exhibitCount: 12 });

  it("sees 10,000 images and ~20 GB", () => {
    expect(p.folder.images).toBe(10_000);
    expect(p.folder.mediaBytes / GB).toBeCloseTo(20, 0);
  });

  it("models the archival master as a WebP re-encode, because a TIFF has no browser decoder", () => {
    // Every TIFF goes through transcodeTiff regardless of size, so archival is bpp-modelled, not
    // pass-through: 6000x4500 x 0.2971.
    const perMaster = 6000 * 4500 * ARCHIVAL_WEBP_BYTES_PER_PIXEL;
    // ...plus DZI tiles, since 6000px is over today's 4096px TILE_MIN_EDGE.
    expect(p.tiers.archival.publishedBytes).toBeGreaterThan(10_000 * perMaster);
    expect(p.tiers.archival.tileFiles).toBe(10_000 * tileFileCount(6000, 4500));
  });

  it("blows every free destination at archival quality, on FILE COUNT — the map's central claim", () => {
    const gh = verdict(p, "github-pages", "archival");
    expect(gh.fits).toBe(false);
    const zip = verdict(p, "zip", "archival");
    expect(zip.fits).toBe(false);
    expect(zip.reason).toContain("too many files");
    // ~5.9M tile files: three orders past the zip's 65,535 entries.
    expect(zip.estimatedFiles).toBeGreaterThan(ZIP_FORMAT_LIMITS.maxEntries);
  });

  it("the web tier never tiles — the cap sits below every threshold under consideration", () => {
    expect(p.tiers.web.tileFiles).toBe(0);
    expect(WEB_TIER.maxDim).toBeLessThan(TILE_MIN_EDGE);
    expect(WEB_TIER.maxDim).toBeLessThan(MAX_MASTER_DIM);
  });

  it("recommends the folder at WEB quality — archival fits there but costs 148x the files", () => {
    // 6.4 GB at web quality is already over the 1 GB Pages ceiling, so the folder is the next free
    // route. Archival FITS a folder (a folder has no size cap) and is still the wrong answer: DZI
    // slicing takes it from ~40k files to ~5.9M, which is a different publishing problem, not a
    // better version of the same one. ARCHIVAL_FILE_RATIO_CEILING is what encodes that.
    expect(verdict(p, "github-pages", "web").fits).toBe(false);
    expect(verdict(p, "folder", "archival").fits).toBe(true);
    expect(p.tiers.archival.publishedFiles / p.tiers.web.publishedFiles).toBeGreaterThan(ARCHIVAL_FILE_RATIO_CEILING);
    expect(p.recommendation?.destination).toBe("folder");
    expect(p.recommendation?.tier).toBe("web");
    expect(p.recommendation?.why).toContain("deep-zoom tiles");
  });

  it("prefers ARCHIVAL again once Archie-53e3 removes the tile tax — the ceiling is not a permanent veto", () => {
    const after = probeArchive(BIG_TIFF_ARCHIVE, { exhibitCount: 12, tileThresholdPx: MAX_MASTER_DIM });
    expect(after.tiers.archival.publishedFiles / after.tiers.web.publishedFiles).toBeLessThan(ARCHIVAL_FILE_RATIO_CEILING);
    expect(after.recommendation?.tier).toBe("archival");
  });

  it("falls through to object storage when the platform has no folder sink (Firefox/Safari)", () => {
    const ff = probeArchive(BIG_TIFF_ARCHIVE, { exhibitCount: 12, capabilities: { folderSink: false } });
    expect(verdict(ff, "folder", "web").fits).toBe(false);
    expect(verdict(ff, "folder", "web").reason).toContain("desktop app or Chrome");
    expect(verdict(ff, "object-storage", "web").fits).toBe(false);
    // Nothing is left: GitHub Pages is over, folder and object storage are unreachable, the zip is
    // over its entry cap. That is the honest dead end the ticket asks for.
    expect(ff.recommendation).toBeNull();
    expect(ff.blockers.length).toBeGreaterThan(0);
    expect(ff.blockers.join(" ")).toContain("desktop app");
  });

  it("Archie-53e3's proposed threshold removes the tile tax without touching anything else", () => {
    const after = probeArchive(BIG_TIFF_ARCHIVE, { exhibitCount: 12, tileThresholdPx: MAX_MASTER_DIM });
    expect(after.tiers.archival.tileFiles).toBe(0);
    expect(after.tiers.archival.publishedFiles).toBeLessThan(p.tiers.archival.publishedFiles / 100);
    // The tiling threshold is a PARAMETER precisely so this comparison is one call, not a code edit.
    expect(after.tiers.archival.publishedBytes).toBeLessThan(p.tiers.archival.publishedBytes);
  });
});

// ===============================================================================================
describe("inventory 3 — an AV-heavy folder (Opus is the difference between borderline and dead)", () => {
  const p = probeArchive(AV_FOLDER, { exhibitCount: 3 });

  it("counts 200 hours of audio", () => {
    expect(p.folder.audio).toBe(200);
    expect(p.sample.audioSeconds).toBe(200 * 3600);
  });

  it("shrinks WAV to Opus by about 40x — the factor Archie-4b0a's audio decision was made on", () => {
    const wavBytes = 200 * WAV_BYTES_PER_HOUR;
    const opusBytes = p.tiers.web.bytesByMedia.audio;
    expect(p.tiers.archival.bytesByMedia.audio).toBe(wavBytes);
    // The factor is 1411 kbps / 32 kbps = 44.1x by construction, and the map's "~40x" (Archie-34a2
    // MEASURED FACTS: 100 hrs = 60 GB WAV -> ~1.4 GB Opus) is that rounded. The band is wide enough
    // to hold both and narrow enough that changing WEB_TIER_OPUS_KBPS breaks it.
    expect(wavBytes / opusBytes).toBeGreaterThan(40);
    expect(wavBytes / opusBytes).toBeLessThan(48);
    expect(wavBytes / opusBytes).toBeCloseTo(1411.2 / WEB_TIER_OPUS_KBPS, 1);
    // Absolute: 200 hrs of Opus at the pinned bitrate. Computed from the constant, never remembered.
    expect(opusBytes).toBeCloseTo((200 * 3600 * WEB_TIER_OPUS_KBPS * 1000) / 8, 5);
    expect(opusBytes / GB).toBeCloseTo(2.7, 1);
  });

  it("infers duration from the source bitrate when the caller could not sample it", () => {
    const unsampled = probeArchive([audio(0, { bytes: WAV_BYTES_PER_HOUR })], { exhibitCount: 1 });
    // WAV at the table's 1411 kbps recovers the hour to within 0.1% — uncompressed audio's bitrate
    // is a fact about the format, so this branch is exact for exactly the format that matters most.
    expect(unsampled.sample.audioSeconds).toBeCloseTo(WAV_BYTES_PER_HOUR / ((AUDIO_SOURCE_KBPS["audio/wav"]! * 1000) / 8), 0);
    expect(Math.abs(unsampled.sample.audioSeconds - 3600) / 3600).toBeLessThan(0.02);
  });

  it("never makes a file bigger by transcoding it", () => {
    // A 64 kbps opus file re-encoded at a 32 kbps target would shrink; a 16 kbps one must not grow.
    const tiny = probeArchive([{ name: "a.ogg", relativePath: "A/a.ogg", type: "audio/ogg", bytes: 1000, durationSec: 3600 }], {});
    expect(tiny.tiers.web.bytesByMedia.audio).toBe(1000);
  });

  it("recommends a route that fits, and names audio as the driver", () => {
    expect(p.tiers.web.driver).toBe("audio");
    expect(p.recommendation).not.toBeNull();
    // 2.9 GB of Opus is past the 1 GB Pages ceiling; the folder is the free route that remains.
    expect(verdict(p, "github-pages", "web").fits).toBe(false);
    expect(p.recommendation?.destination).toBe("folder");
  });
});

// ===============================================================================================
describe("video is told, never transcoded (Archie-4b0a graduated it out to Archie-7e6f)", () => {
  const withVideo: ProbedFile[] = [
    ...Array.from({ length: 50 }, (_, i) => img(i, { bytes: 5 * MB, width: 3000, height: 2000 })),
    ...Array.from({ length: 12 }, (_, i) => video(i, { bytes: 8 * GB, durationSec: 3600 })),
  ];
  const p = probeArchive(withVideo, { exhibitCount: 2 });

  it("costs video identically at both tiers — the quality toggle must not imply otherwise", () => {
    expect(p.tiers.web.bytesByMedia.video).toBe(12 * 8 * GB);
    expect(p.tiers.archival.bytesByMedia.video).toBe(p.tiers.web.bytesByMedia.video);
  });

  it("names video as the driver and says so in the recommendation", () => {
    expect(p.tiers.web.driver).toBe("video");
    expect(p.recommendation?.why).toContain("video file");
    expect(p.recommendation?.why).toContain("both qualities");
  });

  it("forces a paid or local destination — 96 GB has no free home", () => {
    expect(verdict(p, "github-pages", "web").fits).toBe(false);
    expect(verdict(p, "zip", "web").fits).toBe(false); // past the 4 GiB classic-zip cap
    const os = verdict(p, "object-storage", "web");
    expect(os.fits).toBe(true);
    expect(os.estimatedMonthlyCostUsd).toBeGreaterThan(1);
  });
});

// ===============================================================================================
describe("edge cases", () => {
  it("an empty folder probes to zeros and recommends the best destination rather than crashing", () => {
    const p = probeArchive([]);
    expect(p.folder.totalFiles).toBe(0);
    expect(p.folder.mediaFiles).toBe(0);
    expect(p.tiers.web.publishedBytes).toBe(0);
    expect(p.tiers.web.driver).toBeNull();
    expect(p.sample.medianLongEdge).toBeNull();
    expect(p.confidence.imagesSampledFraction).toBe(1);
    expect(p.blockers).toEqual([]);
    expect(p.recommendation?.destination).toBe("github-pages");
    // Even an empty library publishes the fixed site files.
    expect(p.tiers.web.publishedFiles).toBe(PUBLISH_FIXED_FILES + PUBLISH_FILES_PER_EXHIBIT);
  });

  it("a folder of only non-media reports every file as skipped", () => {
    const p = probeArchive([
      { name: "catalogue.csv", relativePath: "A/catalogue.csv", type: "text/csv", bytes: 4096 },
      { name: "readme.txt", relativePath: "A/readme.txt", type: "text/plain", bytes: 512 },
    ]);
    expect(p.folder.mediaFiles).toBe(0);
    expect(p.folder.skippedFiles).toBe(2);
    expect(p.folder.totalBytes).toBe(4608);
    expect(p.folder.mediaBytes).toBe(0);
  });

  it("a single huge TIFF is capped at MAX_MASTER_DIM before anything is costed", () => {
    // 20000x15000 = 300 Mpx, 900 MB. Ingest caps it to 6000x4500 = 27 Mpx first.
    const p = probeArchive([img(0, { bytes: 900 * MB, ext: "tif", width: 20_000, height: 15_000 })]);
    expect(p.tiers.web.bytesByMedia.image).toBeCloseTo(2400 * 1800 * WEB_TIER.bytesPerPixel, -2);
    // The archival master is capped too — nowhere near the 900 MB source.
    const masterOnly = 6000 * 4500 * ARCHIVAL_WEBP_BYTES_PER_PIXEL;
    expect(p.tiers.archival.bytesByMedia.image).toBeLessThan(900 * MB);
    expect(p.tiers.archival.bytesByMedia.image).toBeGreaterThan(masterOnly);
    // But the ORIGINAL is retained at full size, and only the zip carries it.
    expect(p.tiers.archival.originalBytes).toBe(900 * MB);
    expect(verdict(p, "zip", "archival").estimatedBytes).toBeGreaterThan(900 * MB);
    expect(verdict(p, "github-pages", "archival").estimatedBytes).toBeLessThan(900 * MB);
  });

  it("estimates an unsampled image from its OWN byte size, so a mixed folder keeps its spread", () => {
    // One sampled 6 MB / 12 Mpx image sets 2 px per byte; the 60 MB neighbour must be estimated at
    // ~120 Mpx, not at the sampled image's 12 Mpx.
    const p = probeArchive([
      img(0, { bytes: 6 * MB, width: 4000, height: 3000 }),
      img(1, { bytes: 60 * MB }),
    ]);
    expect(p.sample.pixelsPerSourceByte).toBeCloseTo((4000 * 3000) / (6 * MB), 6);
    expect(p.confidence.imagesSampledFraction).toBe(0.5);
    // Both cap to the same web-tier size, so the web estimate cannot show the difference — the
    // ARCHIVAL one can: the big file is over MAX_MASTER_DIM and is therefore re-encoded, while the
    // sampled one passes through at its source size.
    expect(p.tiers.archival.bytesByMedia.image).toBeLessThan(6 * MB + 60 * MB);
  });

  it("with no sample at all, falls back to the cap — over-stating, never under-stating", () => {
    const none = probeArchive([img(0, { bytes: 5 * MB })]);
    expect(none.sample.pixelsPerSourceByte).toBeNull();
    expect(none.confidence.imagesSampledFraction).toBe(0);
    // The fallback image is assumed AT the cap, so its web estimate is the full capped size.
    expect(none.tiers.web.bytesByMedia.image).toBeCloseTo(cappedPixels(MAX_MASTER_DIM * MAX_MASTER_DIM, 4 / 3, WEB_TIER.maxDim) * WEB_TIER.bytesPerPixel, -2);
  });
});

// ===============================================================================================
describe("destination limits are the REAL ones, and the zip's are a parameter", () => {
  it("cites GitHub's published 1 GB site limit and 100 MiB file limit", () => {
    expect(GITHUB_PAGES_LIMITS.maxSiteBytes).toBe(1024 * 1024 * 1024);
    expect(GITHUB_PAGES_LIMITS.maxFileBytes).toBe(100 * 1024 * 1024);
  });

  it("refuses GitHub Pages at exactly one byte over the published limit, and allows it at the limit", () => {
    // A single video sized to land the tree exactly on the boundary.
    const at = probeArchive([video(0, { bytes: GITHUB_PAGES_LIMITS.maxSiteBytes })], {});
    expect(verdict(at, "github-pages", "web").fits).toBe(true);
    const over = probeArchive([video(0, { bytes: GITHUB_PAGES_LIMITS.maxSiteBytes + 1 })], {});
    expect(verdict(over, "github-pages", "web").fits).toBe(false);
    expect(verdict(over, "github-pages", "web").reason).toContain("no larger than 1 GB");
  });

  it("refuses GitHub Pages on file count even when the bytes fit, and says how long it would take", () => {
    // 2,000 tiny images: well under 1 GB, but 6,000+ files at 80 writes/min.
    const many = probeArchive(Array.from({ length: 2000 }, (_, i) => img(i, { bytes: 40 * 1024, width: 800, height: 600 })), {});
    expect(many.tiers.web.publishedBytes).toBeLessThan(GITHUB_PAGES_LIMITS.maxSiteBytes);
    const gh = verdict(many, "github-pages", "web");
    expect(gh.fits).toBe(false);
    expect(gh.reason).toContain("too many files");
    expect(gh.estimatedUploadMinutes).toBeCloseTo(gh.estimatedFiles / GITHUB_PAGES_LIMITS.contentWritesPerMinute, 5);
  });

  it("takes the zip caps as a PARAMETER, so Archie-1cf0's Zip64 writer is one argument away", () => {
    const files = Array.from({ length: 30_000 }, (_, i) => img(i, { bytes: 200 * 1024, width: 1200, height: 900 }));
    const classic = probeArchive(files, {});
    expect(verdict(classic, "zip", "web").fits).toBe(false);
    expect(verdict(classic, "zip", "web").reason).toContain("65,535");

    const zip64 = probeArchive(files, { zipLimits: { maxEntries: 2 ** 32 - 1, maxBytes: 2 ** 53 } });
    expect(verdict(zip64, "zip", "web").fits).toBe(true);
  });

  it("prices object storage from R2's published rate, with the free tier taken off the top", () => {
    expect(OBJECT_STORAGE_PRICING.usdPerGbMonth).toBe(0.015);
    expect(OBJECT_STORAGE_PRICING.freeGbMonth).toBe(10);
    const p = probeArchive([video(0, { bytes: 110 * GB })], {});
    const os = verdict(p, "object-storage", "archival");
    // 110 GB, rounded up, minus the 10 GB free, at $0.015 = $1.50.
    expect(os.estimatedMonthlyCostUsd).toBeCloseTo(100 * 0.015, 6);
  });

  it("greys folder AND object storage together on a browser with no folder picker — Archie never touches credentials", () => {
    const p = probeArchive(PHOTO_FOLDER, { capabilities: { folderSink: false } });
    expect(verdict(p, "folder", "archival").fits).toBe(false);
    expect(verdict(p, "object-storage", "archival").fits).toBe(false);
    // GitHub Pages and the zip are untouched by the capability — this folder still has a route.
    expect(verdict(p, "github-pages", "archival").fits).toBe(true);
    expect(p.blockers).toEqual([]);
  });
});

describe("humanBytes keeps the surface honest about precision", () => {
  it("rounds coarsely rather than implying precision the estimate lacks", () => {
    expect(humanBytes(0)).toBe("0 bytes");
    expect(humanBytes(1536)).toBe("2 KB");
    expect(humanBytes(900 * MB)).toBe("900 MB");
    expect(humanBytes(1.5 * GB)).toBe("1.5 GB");
    expect(humanBytes(74 * GB)).toBe("74 GB");
  });
});

describe("every verdict carries a reason, fitting or not — c367 greys rows WITH their reason", () => {
  it("has a non-empty reason on all sixteen (destination x tier) rows, in both capability modes", () => {
    for (const caps of [{ folderSink: true }, { folderSink: false }]) {
      const p = probeArchive(BIG_TIFF_ARCHIVE.slice(0, 50), { capabilities: caps });
      expect(p.destinations).toHaveLength(8);
      for (const v of p.destinations) {
        expect(v.reason, `${v.destination}/${v.tier}`).toBeTruthy();
        expect(v.estimatedBytes).toBeGreaterThan(0);
        expect(v.estimatedFiles).toBeGreaterThan(0);
      }
    }
  });
});
