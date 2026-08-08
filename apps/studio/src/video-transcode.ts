// Video → web-tier transcode seam (Archie-7e6f). The TS half of the native sidecar in
// src-tauri/src/video.rs.
//
// SHAPE (mirrors tiff-transcode.ts, the in-repo precedent): the heavy dependency is loaded LAZILY so
// a library with no video never pays for it, and this module CLASSIFIES rather than swallows — every
// failure surfaces as a typed `VideoTranscodeError` for the caller's refusal copy. What it must never
// do is quietly ship the original bytes as if they had been converted.
//
// ── WHY A NATIVE SIDECAR ON DESKTOP, AND WHERE THE BROWSER PATH LIVES ────────────────────────────
// WebKitGTK ships no WebCodecs, so the desktop webview cannot transcode at all — hence this sidecar.
// Chromium HAS WebCodecs but no demuxer and no muxer, which is why the browser path is not simply
// this module without Tauri: it needs a container library. That path is now BUILT and lives in
// `video-transcode-web.ts` (mediabunny; user-approved dependency, ticket DECIDED 2026-07-27).
// Firefox and Safari get neither and keep the measure-and-tell hand-off (`videoTierTell`) — the
// evidence is in scripts/probe/webcodecs-video.mjs and video-transcode-web.ts's header.
//
// ── WHERE THE SHARED CONTRACT LIVES ──────────────────────────────────────────────────────────────
// The two declared profiles (`WEB_TIER_H264` / `WEB_TIER_VP9`), the `VideoTargetParams` shape, the
// typed error, and the ONE target decision (`pickTarget` over the one `VideoCapabilities` shape)
// live in `video-profiles.ts`, which imports NOTHING. This file keeps the DESKTOP half: the Tauri
// bridge, the capability probe (a thin adapter from ffmpeg's `EncoderReport` onto that one shape),
// the transcode call, the skip counter, and the H4 measure-and-tell. `video-transcode-web.ts`
// imports the same contract from `video-profiles.ts`, so neither seam drags the other's platform
// glue into the web graph.
//
// ── SILENT FALLBACK IS THE HAZARD, SO THERE IS A COUNTER ─────────────────────────────────────────
// .claude/rules/perf-measure-the-flow.md §2: `dzi-slice-pool` and `bake-async` both degrade silently
// BY DESIGN, and both are only observable because of `bakeFallbackCount()`. The same discipline is
// mandatory here and the stakes are higher — a video path that silently declines to transcode does
// not merely run slow, it publishes the 180 GB of originals the tier existed to avoid.
// `videoSkipCount()` is that readout. This module NEVER falls back on its own; when it cannot
// transcode it THROWS, and the counter records what the caller then chose to skip.
import {
  KNOWN_KINDS,
  NO_VIDEO_CAPABILITIES,
  VideoTranscodeError,
  type VideoCapabilities,
  type VideoErrorKind,
  type VideoProgress,
  type VideoTargetParams,
  type VideoTranscodeResult,
} from "./video-profiles.js";
import { isTauri } from "./tauri-fs.js";

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

/** Mirrors `EncoderReport` in src-tauri/src/video.rs (serde `rename_all = "camelCase"`). The probe
 *  maps this platform report onto the ONE `VideoCapabilities` shape — `version` is diagnostic and
 *  does not survive the mapping. */
export interface EncoderReport {
  ffmpeg: boolean;
  version: string | null;
  h264: boolean;
  vp9: boolean;
  aac: boolean;
  opus: boolean;
  h264Decode: boolean;
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

/** What this machine can do, as the ONE capability shape both platforms share (video-profiles.ts).
 *  Never throws — a machine with no ffmpeg reports `ffmpeg: false` so the UI greys the control with
 *  a reason instead of raising an error the author cannot act on. Thin adapter: maps the Rust
 *  `EncoderReport` onto {@link VideoCapabilities}. */
export async function probeVideoEncoders(bridge?: VideoBridge): Promise<VideoCapabilities> {
  const none: VideoCapabilities = { ...NO_VIDEO_CAPABILITIES, h264Decode: false };
  if (!bridge && !isTauri()) return none; // web: no sidecar, by construction
  try {
    const b = bridge ?? (await tauriVideoBridge());
    const report = await b.invoke<EncoderReport>("video_probe_encoders");
    return {
      ffmpeg: report.ffmpeg,
      h264: report.h264,
      vp9: report.vp9,
      aac: report.aac,
      opus: report.opus,
      h264Decode: report.h264Decode,
    };
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
// H3 — the Chromium/WebCodecs path: BUILT, in video-transcode-web.ts
// ---------------------------------------------------------------------------------------------------
//
// This file used to end in a `webCodecsVideoAssessment()` reporting an unconditional `muxGap: true`
// and the note "Archie would need an extra library for that". Both were true when written and are
// now false: the user approved the dependency (ticket, DECIDED 2026-07-27) and `mediabunny` closes
// exactly that gap. The function is DELETED rather than left returning a stale claim — a probe that
// reports a capability the codebase no longer lacks is worse than no probe, because it reads as
// current.
//
// The live browser equivalents are `probeBrowserVideoCaps()` in `video-transcode-web.ts` and the
// ONE shared decision `pickTarget()` in `video-profiles.ts` — the browser probe reports the same
// `VideoCapabilities` shape this seam's `probeVideoEncoders()` reports for the desktop sidecar, so
// both platforms choose between the SAME two declared profiles and no third artifact shape can enter
// a published tree. The measured Chromium 148 findings that shaped the choice (H.264 encode yes,
// AAC encode NO) are recorded in that file's header.
