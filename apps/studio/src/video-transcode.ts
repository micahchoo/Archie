// Video → web-tier transcode seam (Archie-7e6f). The TS half of the native sidecar in
// src-tauri/src/video.rs.
//
// SHAPE (mirrors tiff-transcode.ts, the in-repo precedent): the heavy dependency is loaded LAZILY so
// a library with no video never pays for it, and this module CLASSIFIES rather than swallows — every
// failure surfaces as a typed `VideoTranscodeError` for the caller's refusal copy. What it must never
// do is quietly ship the original bytes as if they had been converted.
//
// ── WHY A NATIVE SIDECAR AND NOT WebCodecs (Archie-4b0a's video fork) ────────────────────────────
// WebKitGTK ships no WebCodecs, so the desktop webview cannot transcode at all. On Chromium web
// WebCodecs exists but provides NO demuxer and NO muxer, so it is not a drop-in either — see
// `webCodecsVideoAssessment()` at the foot of this file and scripts/probe/webcodecs-video.mjs.
// Firefox and Safari get neither, and keep the measure-and-tell hand-off (`videoTierTell`).
//
// ── SILENT FALLBACK IS THE HAZARD, SO THERE IS A COUNTER ─────────────────────────────────────────
// .claude/rules/perf-measure-the-flow.md §2: `dzi-slice-pool` and `bake-async` both degrade silently
// BY DESIGN, and both are only observable because of `bakeFallbackCount()`. The same discipline is
// mandatory here and the stakes are higher — a video path that silently declines to transcode does
// not merely run slow, it publishes the 180 GB of originals the tier existed to avoid.
// `videoSkipCount()` is that readout. This module NEVER falls back on its own; when it cannot
// transcode it THROWS, and the counter records what the caller then chose to skip.
import { isTauri } from "./tauri-fs.js";

// ---------------------------------------------------------------------------------------------------
// Targets
// ---------------------------------------------------------------------------------------------------

/** The two web-tier targets. Which one is reachable depends on the machine — see the module header of
 *  src-tauri/src/video.rs for the measured GNOME 49 finding (H.264 needs the codecs-extra extension;
 *  VP9/Opus is what the base runtime guarantees). */
export type VideoTarget = "h264" | "vp9";

export interface VideoTargetParams {
  codec: VideoTarget;
  /** Container extension, without the dot. */
  ext: "mp4" | "webm";
  /** The `type` a `<video>` / `<source>` should advertise. */
  mime: string;
  /** Downscale-only cap on the long-ish edge (height). A smaller source is left alone. */
  maxHeight: number;
  /** Constant-quality knob. The scales are NOT comparable between codecs: 23 is a normal H.264
   *  value, 33 a normal VP9 one. */
  crf: number;
  audioKbps: number;
}

/** H.264 High + AAC-LC in MP4, faststart. THE DEFAULT — see the decision note on Archie-7e6f: MDN's
 *  web video codec guide states MP4/AVC/AAC is "a broadly-supported combination—by every major
 *  browser, in fact" (fetched 2026-07-27). A published tree is read by visitors we will never meet on
 *  browsers we cannot poll, so the artifact takes the compatible format and the ENCODER side absorbs
 *  the awkwardness. */
export const WEB_TIER_H264: VideoTargetParams = {
  codec: "h264",
  ext: "mp4",
  mime: 'video/mp4; codecs="avc1.640028, mp4a.40.2"',
  maxHeight: 720,
  crf: 23,
  audioKbps: 128,
};

/** VP9 + Opus in WebM — royalty-free, and the target the stock GNOME 49 Flatpak runtime can actually
 *  produce with no extension. MDN notes WebM/open-codec output is "generally well-supported, with the
 *  exception being Safari on older Apple devices", which is exactly the compatibility cliff the
 *  default avoids. Offered as the fallback when `h264` is unavailable, never chosen silently. */
export const WEB_TIER_VP9: VideoTargetParams = {
  codec: "vp9",
  ext: "webm",
  mime: 'video/webm; codecs="vp9, opus"',
  maxHeight: 720,
  crf: 33,
  audioKbps: 96,
};

const VIDEO_MIME_PREFIX = "video/";

/** True for a mime this seam is willing to hand to the encoder. Deliberately permissive — ffmpeg
 *  reads far more than folder-import's EXT_MIME names, and an input it cannot read comes back as a
 *  classified `unsupported-input` rather than being pre-refused on a guess. */
export function isTranscodableVideoMime(mime: string): boolean {
  return mime.startsWith(VIDEO_MIME_PREFIX);
}

/** The target this machine should use, given what it reports. Returns null when neither is reachable
 *  — the caller then greys the control with `unavailableReason` (Archie-c367: never silently swap). */
export function pickTarget(report: EncoderReport): VideoTargetParams | null {
  if (!report.ffmpeg) return null;
  // DELIBERATELY does not consult `h264Decode`. Decode capability is a property of each SOURCE file,
  // not of the target, and a machine that can read WebM but not H.264 can still convert some of the
  // library. Blanket-greying it would refuse work it can do; instead each unreadable file comes back
  // as `decoder-missing`, which names the real cause. See video.rs's header for why the stock GNOME
  // 49 runtime is exactly this machine.
  if (report.h264 && report.aac) return WEB_TIER_H264;
  if (report.vp9 && report.opus) return WEB_TIER_VP9;
  return null;
}

/** Why the control is greyed, in the author's language. Empty string when video transcode IS
 *  available — callers should branch on `pickTarget` rather than on this. */
export function unavailableReason(report: EncoderReport): string {
  if (!report.ffmpeg) {
    return "This build has no video converter, so videos will publish at their original size.";
  }
  if (!report.h264Decode && !report.vp9) {
    return "This build's video converter is missing its codecs, so videos will publish at their original size.";
  }
  if (pickTarget(report) === null) {
    return "This build's video converter has no usable web format, so videos will publish at their original size.";
  }
  return "";
}

// ---------------------------------------------------------------------------------------------------
// The bridge
// ---------------------------------------------------------------------------------------------------

/** What this module needs from Tauri. Injected so the seam's logic is testable without a webview —
 *  the real one is built lazily by {@link tauriVideoBridge}. */
export interface VideoBridge {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
  /** Subscribe to a global event; resolves to an unsubscribe function. */
  listen(event: string, handler: (payload: unknown) => void): Promise<() => void>;
}

/** Mirrors `EncoderReport` in src-tauri/src/video.rs (serde `rename_all = "camelCase"`). */
export interface EncoderReport {
  ffmpeg: boolean;
  version: string | null;
  h264: boolean;
  vp9: boolean;
  aac: boolean;
  opus: boolean;
  h264Decode: boolean;
}

/** Mirrors `TranscodeProgress`. `outTimeUs` is MICROseconds — ffmpeg's own `out_time_ms` field is a
 *  misnomer that also reports microseconds (measured), so the Rust side never reads it. */
export interface VideoProgress {
  jobId: string;
  outTimeUs: number;
  frame: number;
  speed: number | null;
  totalSize: number | null;
  done: boolean;
}

/** Mirrors `TranscodeResult`. */
export interface VideoTranscodeResult {
  output: string;
  bytes: number;
  outTimeUs: number;
}

/** The stable failure kinds `classify_failure` in video.rs can produce, plus the two this side owns
 *  (`unavailable` when there is no Tauri at all, `bad-request` shared with Rust's validation). */
export type VideoErrorKind =
  | "unavailable"
  | "bad-request"
  | "encoder-missing"
  | "codec-missing"
  | "decoder-missing"
  | "unsupported-input"
  | "unreadable-input"
  | "output-failed"
  | "encode-failed";

const KNOWN_KINDS: ReadonlySet<string> = new Set<VideoErrorKind>([
  "unavailable", "bad-request", "encoder-missing", "codec-missing", "decoder-missing",
  "unsupported-input", "unreadable-input", "output-failed", "encode-failed",
]);

export class VideoTranscodeError extends Error {
  readonly kind: VideoErrorKind;
  constructor(kind: VideoErrorKind, message: string) {
    super(message);
    this.name = "VideoTranscodeError";
    this.kind = kind;
  }
}

/** Normalize anything thrown by the invoke boundary into a typed error.
 *
 *  A Rust `Err(TranscodeError)` arrives as a PLAIN OBJECT `{ kind, message }` — not an Error — which
 *  is the whole reason this exists: `e instanceof Error` is false for it and a naive `String(e)`
 *  renders "[object Object]". Same contract as `toDeployError` in deploy/deploy-flows.svelte.ts. */
export function classifyVideoError(e: unknown): VideoTranscodeError {
  if (e instanceof VideoTranscodeError) return e;
  if (
    typeof e === "object" && e !== null &&
    typeof (e as { kind?: unknown }).kind === "string" &&
    typeof (e as { message?: unknown }).message === "string" &&
    KNOWN_KINDS.has((e as { kind: string }).kind)
  ) {
    const { kind, message } = e as { kind: VideoErrorKind; message: string };
    return new VideoTranscodeError(kind, message);
  }
  return new VideoTranscodeError("encode-failed", e instanceof Error ? e.message : String(e));
}

/** True when a payload really is a progress event for `jobId`. Progress rides one global event name,
 *  so two concurrent transcodes share a channel — without this filter a second job's events would
 *  drive the first job's bar. */
export function isProgressFor(jobId: string, payload: unknown): payload is VideoProgress {
  return (
    typeof payload === "object" && payload !== null &&
    (payload as { jobId?: unknown }).jobId === jobId &&
    typeof (payload as { outTimeUs?: unknown }).outTimeUs === "number" &&
    typeof (payload as { done?: unknown }).done === "boolean"
  );
}

/** 0..1, or null when the source duration isn't known. Clamped: ffmpeg's reported position can drift
 *  a frame past a container's advertised duration, and a bar that reads 103% looks broken. */
export function progressFraction(p: VideoProgress, sourceDurationSec: number | null): number | null {
  if (sourceDurationSec === null || !(sourceDurationSec > 0)) return null;
  if (p.done) return 1;
  return Math.max(0, Math.min(1, p.outTimeUs / 1_000_000 / sourceDurationSec));
}

const PROGRESS_EVENT = "archie://video-transcode-progress";

async function tauriVideoBridge(): Promise<VideoBridge> {
  const { invoke } = await import("@tauri-apps/api/core"); // lazy: no video, no Tauri IPC module
  const { listen } = await import("@tauri-apps/api/event");
  return {
    invoke: <T,>(command: string, args?: Record<string, unknown>) => invoke<T>(command, args),
    listen: async (event, handler) => {
      const un = await listen(event, (e: { payload: unknown }) => handler(e.payload));
      return () => un();
    },
  };
}

// ---------------------------------------------------------------------------------------------------
// Skip visibility
// ---------------------------------------------------------------------------------------------------

let skipped = 0;

/** Count of videos published WITHOUT a web-tier conversion. Non-zero means the tier is degraded and
 *  the published bytes are the originals — the same visibility contract as `bakeFallbackCount()`,
 *  and for a sharper reason: this fallback is measured in gigabytes, not milliseconds. Callers that
 *  choose to publish an original after a refusal MUST call {@link noteVideoSkipped}. */
export const videoSkipCount = (): number => skipped;
export function noteVideoSkipped(): void {
  skipped++;
}
/** Test/teardown only. */
export function resetVideoSkipCount(): void {
  skipped = 0;
}

// ---------------------------------------------------------------------------------------------------
// The seam
// ---------------------------------------------------------------------------------------------------

/** What this machine can do. Never throws — a machine with no ffmpeg reports `ffmpeg: false` so the
 *  UI greys the control with a reason instead of raising an error the author cannot act on. */
export async function probeVideoEncoders(bridge?: VideoBridge): Promise<EncoderReport> {
  const none: EncoderReport = {
    ffmpeg: false, version: null, h264: false, vp9: false, aac: false, opus: false, h264Decode: false,
  };
  if (!bridge && !isTauri()) return none; // web: no sidecar, by construction
  try {
    const b = bridge ?? (await tauriVideoBridge());
    return await b.invoke<EncoderReport>("video_probe_encoders");
  } catch {
    return none;
  }
}

export interface TranscodeVideoOptions {
  jobId: string;
  /** Absolute path to the retained original. */
  input: string;
  /** Absolute path to write. */
  output: string;
  target: VideoTargetParams;
  /** Source duration in seconds, when known — only used to turn progress into a fraction. */
  sourceDurationSec?: number | null;
  onProgress?: (p: VideoProgress, fraction: number | null) => void;
  bridge?: VideoBridge;
}

/** Transcode one video to the web tier.
 *
 *  THROWS a typed {@link VideoTranscodeError} on every failure — including "there is no desktop
 *  sidecar here". It does NOT fall back to copying the original: that decision belongs to the caller,
 *  which must record it via {@link noteVideoSkipped} so the skip is visible. */
export async function transcodeVideo(opts: TranscodeVideoOptions): Promise<VideoTranscodeResult> {
  const { jobId, input, output, target, onProgress } = opts;
  const duration = opts.sourceDurationSec ?? null;
  if (!opts.bridge && !isTauri()) {
    throw new VideoTranscodeError(
      "unavailable",
      "Converting video needs the desktop app — in a browser, Archie publishes the original file.",
    );
  }
  const bridge = opts.bridge ?? (await tauriVideoBridge());

  let unlisten: (() => void) | null = null;
  if (onProgress) {
    unlisten = await bridge.listen(PROGRESS_EVENT, (payload) => {
      if (!isProgressFor(jobId, payload)) return;
      onProgress(payload, progressFraction(payload, duration));
    });
  }
  try {
    return await bridge.invoke<VideoTranscodeResult>("video_transcode", {
      request: {
        jobId,
        input,
        output,
        codec: target.codec,
        maxHeight: target.maxHeight,
        crf: target.crf,
        audioKbps: target.audioKbps,
      },
    });
  } catch (e) {
    throw classifyVideoError(e);
  } finally {
    // Unsubscribing in `finally` matters: a listener left attached after a failed job would keep
    // driving a bar for a transcode that is over.
    unlisten?.();
  }
}

// ---------------------------------------------------------------------------------------------------
// H4 — the measure-and-tell hand-off for platforms with no transcode
// ---------------------------------------------------------------------------------------------------

/** Web-tier video bitrate used for the SIZE ESTIMATE only, in kbit/s: 720p H.264 at CRF 23 plus
 *  128 kbit/s AAC. Deliberately a stated bitrate model rather than a compression RATIO — a ratio
 *  measured on synthetic test patterns would be fiction, and real material varies by an order of
 *  magnitude between a static talking head and handheld footage. An estimate the author can sanity
 *  check beats a precise-looking number nobody can reproduce. */
export const WEB_TIER_VIDEO_KBPS = 2000 + 128;

/** USD per GB-month of static hosting, for the "or budget…" half of the tell.
 *
 *  DUPLICATED ON PURPOSE. The object-storage pricing work (Archie-c85f) owns the real table and is
 *  landing in parallel; importing from it now would couple this seam to a moving file. When that
 *  lands, delete this constant and read theirs — the value is a placeholder for the shape, not a
 *  quote. */
export const HOSTING_USD_PER_GB_MONTH = 0.015;

export interface VideoInventory {
  /** How many video objects the library holds. */
  count: number;
  /** Total bytes of those objects as they stand (the originals). */
  bytes: number;
  /** Total duration in seconds, when known. Null when Archie never probed durations — the estimate
   *  then falls back to a ratio, and `estimateWebTierVideoBytes` says so in its return. */
  durationSec: number | null;
}

export interface VideoTierEstimate {
  webTierBytes: number;
  /** True when the figure came from durations (trustworthy-ish) rather than from a blanket ratio. */
  fromDuration: boolean;
  monthlyUsd: number;
}

/** Rough ratio used only when durations are unknown. Stated, not measured — see WEB_TIER_VIDEO_KBPS. */
const BLIND_RATIO = 0.15;

export function estimateWebTierVideoBytes(inv: VideoInventory): VideoTierEstimate {
  const webTierBytes =
    inv.durationSec !== null && inv.durationSec > 0
      ? Math.round((WEB_TIER_VIDEO_KBPS * 1000 * inv.durationSec) / 8)
      : Math.round(inv.bytes * BLIND_RATIO);
  return {
    webTierBytes,
    fromDuration: inv.durationSec !== null && inv.durationSec > 0,
    monthlyUsd: (inv.bytes / 1_000_000_000) * HOSTING_USD_PER_GB_MONTH,
  };
}

/** Human bytes at the granularity the tell needs — no decimals below a GB, one above. */
export function formatBytes(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)} GB`;
  if (n >= 1_000_000) return `${Math.round(n / 1_000_000)} MB`;
  return `${Math.round(n / 1000)} KB`;
}

/** The measure-and-tell string for a platform that cannot transcode (Firefox, Safari, or a desktop
 *  build whose codecs are missing).
 *
 *  It says three things, in this order, because that is the reader's question sequence: what you
 *  have, what it would cost to leave it alone, and the two things you can DO. It never implies Archie
 *  did the conversion, and it never silently swaps in a lesser one (Archie-c367). */
export function videoTierTell(inv: VideoInventory, reason: string): string {
  if (inv.count === 0) return "";
  const est = estimateWebTierVideoBytes(inv);
  const noun = inv.count === 1 ? "video" : "videos";
  const about = est.fromDuration ? "about" : "very roughly";
  const dollars = est.monthlyUsd < 0.01 ? "under $0.01" : `about $${est.monthlyUsd.toFixed(2)}`;
  return (
    `${inv.count} ${noun}, ${formatBytes(inv.bytes)}. ${reason} ` +
    `Converted for the web they would be ${about} ${formatBytes(est.webTierBytes)}, ` +
    `so you can convert them yourself first (HandBrake does this well), ` +
    `or publish them as they are and budget ${dollars} a month of hosting.`
  );
}

// ---------------------------------------------------------------------------------------------------
// H3 — the Chromium/WebCodecs path: ASSESSED, NOT BUILT
// ---------------------------------------------------------------------------------------------------

export interface WebCodecsAssessment {
  /** `VideoEncoder` exists in this realm. */
  encoderPresent: boolean;
  /** Even where it exists, WebCodecs supplies neither a demuxer nor a muxer. */
  muxGap: true;
  /** Why this path is not wired up yet. */
  note: string;
}

/** What a Chromium browser can actually offer today, and what it still cannot.
 *
 *  `VideoEncoder` is only half a transcoder. **WebCodecs specifies no container handling at all** —
 *  no demuxer to get coded chunks OUT of the author's .mov/.mp4, and no muxer to put encoded chunks
 *  INTO a playable file. MDN classes `VideoEncoder` as "Limited availability … not Baseline because
 *  it does not work in some of the most widely-used browsers" (fetched 2026-07-27), which is the
 *  platform half; the container gap is the harder half and it does not go away on Chromium.
 *
 *  MEASURED 2026-07-27 by scripts/probe/webcodecs-video.mjs against headless Chromium 148, in a
 *  localhost secure context — two findings, and the second is the one that matters:
 *
 *   1. Video encode is genuinely there: H.264 High, VP9, VP8 and AV1 all produced a real chunk (not
 *      merely `isConfigSupported`, which freecut documents as unreliable — see the probe's header).
 *      No demux or mux surface exists: `MediaContainerDecoder`, `MediaContainerEncoder`, `VideoMuxer`
 *      and `VideoDemuxer` are all absent, and `MediaRecorder` only muxes a LIVE stream in real time.
 *   2. **AAC-LC encode is NOT available** — the only audio codec offered was Opus. So even handed a
 *      muxer, that browser could not produce this seam's `WEB_TIER_H264` target; it could only emit
 *      VP9+Opus/WebM, a DIFFERENT artifact from the desktop sidecar's. Archie-7e6f requires the two
 *      implementations to produce compatible output, so H3 is not merely a dependency decision.
 *
 *  The dependency, if H3 is ever built, is precedented rather than speculative: freecut carries
 *  `mediabunny` 1.50.3 for BOTH halves (demux `new Input({ formats: ALL_FORMATS, source })`,
 *  canvas-render-orchestrator.ts:300; mux `new Output({ format, target })`, client-renderer.ts:267-297)
 *  and carries no other muxer at all — no mp4box.js, no webm-muxer, no mp4-muxer, none hand-rolled.
 *  Adding a runtime dependency is the user's call in this repo, so H3 is DESIGNED AND NOT BUILT.
 *
 *  Note this is a probe of the CURRENT realm and is therefore honest on the studio's own page; it
 *  says nothing about the author's other browsers. */
export function webCodecsVideoAssessment(): WebCodecsAssessment {
  const encoderPresent = typeof globalThis !== "undefined" && "VideoEncoder" in globalThis;
  return {
    encoderPresent,
    muxGap: true,
    note: encoderPresent
      ? "This browser can encode video frames, but not read or write video FILES — WebCodecs has no " +
        "demuxer or muxer. Archie would need an extra library for that."
      : "This browser has no WebCodecs video encoder.",
  };
}
