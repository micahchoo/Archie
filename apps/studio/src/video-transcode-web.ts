// Video → web-tier transcode, IN THE BROWSER (Archie-7e6f H3). The Chromium/WebCodecs counterpart to
// the native sidecar in src-tauri/src/video.rs, which `video-transcode.ts` drives on desktop.
//
// ── WHY THIS EXISTS AT ALL, AND WHAT CHANGED ────────────────────────────────────────────────────
// `video-transcode.ts`'s `webCodecsVideoAssessment()` recorded H3 as DESIGNED-NOT-BUILT for one
// reason: **WebCodecs is codecs without containers.** `VideoEncoder` hands back `EncodedVideoChunk`s
// and there is no demuxer to get coded packets out of the author's .mov and no muxer to put them into
// a playable file — measured 2026-07-27 by scripts/probe/webcodecs-video.mjs against headless
// Chromium 148 (`MediaContainerDecoder`, `MediaContainerEncoder`, `VideoMuxer`, `VideoDemuxer` all
// absent; `MediaRecorder` muxes only a LIVE stream in real time, so it is not a publish-time
// transcoder). That gap needed a library, and a library is a dependency decision.
//
// The user decided it (ticket, DECIDED 2026-07-27): build the path, take the dependency. The
// dependency is `mediabunny`, which is precedented rather than speculative — freecut carries it for
// BOTH halves (demux `canvas-render-orchestrator.ts:300`, mux `client-renderer.ts:267-297`) and
// carries no other muxer at all: no mp4box.js, no webm-muxer, no mp4-muxer, none hand-rolled.
//
// mediabunny supplies exactly the two missing halves and drives WebCodecs for the middle: its
// `Conversion` reads through a demuxer, decodes with `VideoDecoder`/`AudioDecoder`, re-encodes with
// `VideoEncoder`/`AudioEncoder`, and muxes to MP4 or WebM. So this module is thin ON PURPOSE — the
// interesting content here is the TARGET choice and the refusals, not the pipeline.
//
// ── THE CONTAINER DECISION, WHICH IS THE ONE REAL DECISION IN THIS FILE ──────────────────────────
// The ticket requires both implementations to produce COMPATIBLE output, and Chromium cannot encode
// AAC (measured: the probe was offered Opus and nothing else). Naively that forces a third artifact
// shape. It does not, and the reason is that the desktop side already declares TWO profiles, not one:
// `WEB_TIER_H264` and `WEB_TIER_VP9`. `pickTarget(report)` chooses between them from what the machine
// reports. This module is the same function against a different oracle — `canEncodeVideo` /
// `canEncodeAudio` instead of ffmpeg's encoder table — so a browser emits a profile the sidecar
// ALREADY emits, and no third shape enters the published tree.
//
// **The refusal that makes that true is explicit, and it has to be.** mediabunny will happily write
// Opus into MP4 (its own compatibility table marks the combination supported), so "H.264 video with
// Opus audio in MP4" is one option object away — it would let a browser match the desktop DEFAULT's
// container and codec. It is refused here: Safari does not decode Opus in MP4, so that file plays
// with SILENT AUDIO on precisely the browser the H.264/MP4 choice exists to serve, and it fails that
// way in a published tree read by visitors nobody can poll. A hybrid is therefore never assembled —
// {@link pickBrowserTarget} returns one of the two DECLARED profiles or null, and null greys the
// control with a reason (Archie-c367: never silently swapped).
//
// ── FAILURE POLICY: THROWS, LIKE ITS DESKTOP SIBLING ─────────────────────────────────────────────
// Same contract as `transcodeVideo` and for the same reason (.claude/rules/perf-measure-the-flow.md
// §2): a video path that quietly declines to transcode does not merely run slow, it publishes the
// gigabytes the tier existed to avoid. Every failure here is a typed `VideoTranscodeError`; the
// caller decides whether to ship the original and records that choice through `noteVideoSkipped()`.
import {
  VideoTranscodeError,
  WEB_TIER_H264,
  WEB_TIER_VP9,
  type VideoTargetParams,
} from "./video-transcode.js";

// ---------------------------------------------------------------------------------------------------
// Capability
// ---------------------------------------------------------------------------------------------------

/** What this realm can encode, as the two questions a target choice actually asks. Separated from
 *  {@link pickBrowserTarget} so the choice stays a PURE function over booleans and unit-tests without a
 *  browser — the same split `pickTarget(report)` uses on the desktop side, where `EncoderReport` is the
 *  impure half. */
export interface BrowserVideoCaps {
  /** `VideoEncoder` / `AudioEncoder` exist in this realm at all. False on Firefox, Safari < 26, and
   *  the desktop app's WebKitGTK webview. */
  webCodecs: boolean;
  avc: boolean;
  aac: boolean;
  vp9: boolean;
  opus: boolean;
}

export const NO_BROWSER_VIDEO_CAPS: BrowserVideoCaps = {
  webCodecs: false, avc: false, aac: false, vp9: false, opus: false,
};

/**
 * Which declared profile this browser should produce, or null when neither is reachable. PURE.
 *
 * Deliberately the same shape and the same preference order as `pickTarget(report)` in
 * `video-transcode.ts` — H.264/AAC/MP4 first because MDN calls MP4+AVC+AAC "a broadly-supported
 * combination—by every major browser, in fact"; VP9/Opus/WebM second. A browser that can do the
 * first produces a file byte-compatible IN FORMAT with what the desktop sidecar's default produces.
 *
 * Both halves of a profile are required together. That is the whole guard against the Opus-in-MP4
 * hybrid described in this file's header: `avc && !aac` falls THROUGH to the VP9 test rather than
 * quietly substituting a different audio codec into the MP4. Measured on Chromium 148, `avc && !aac`
 * is the live case, so this fall-through is the normal path and not a defensive branch.
 */
export function pickBrowserTarget(caps: BrowserVideoCaps): VideoTargetParams | null {
  if (!caps.webCodecs) return null;
  if (caps.avc && caps.aac) return WEB_TIER_H264;
  if (caps.vp9 && caps.opus) return WEB_TIER_VP9;
  return null;
}

/** Why the browser control is greyed, in the author's language. Empty string when a target IS
 *  reachable — callers branch on {@link pickBrowserTarget}, not on this. Mirrors `unavailableReason`. */
export function browserUnavailableReason(caps: BrowserVideoCaps): string {
  if (!caps.webCodecs) {
    return "This browser cannot convert video. Chrome and Edge can; Firefox and Safari cannot yet.";
  }
  if (pickBrowserTarget(caps) === null) {
    return "This browser has no video and sound format Archie can publish together, so videos will publish at their original size.";
  }
  return "";
}

/**
 * Ask the running browser what it can encode. IMPURE — the one impure half of the target choice.
 *
 * Every probe is a REAL encodability check at the profile's own dimensions and bitrate, not a bare
 * `'VideoEncoder' in globalThis`. That matters twice over: freecut documents the declarative
 * `isConfigSupported` check as unreliable because it omits frame rate and display size that a real
 * encode supplies (`render-support.ts:261-289`), and mediabunny's `canEncodeVideo` takes the same
 * config object — so passing the profile's actual width/height/bitrate is what makes the answer be
 * about the file we are going to write rather than about some default.
 *
 * NEVER THROWS. A realm with no WebCodecs, or a probe that rejects, comes back as
 * {@link NO_BROWSER_VIDEO_CAPS} so the surface greys a control with a reason instead of raising an
 * error the author cannot act on — the same contract as `probeVideoEncoders`.
 */
export async function probeBrowserVideoCaps(): Promise<BrowserVideoCaps> {
  const g = globalThis as { VideoEncoder?: unknown; AudioEncoder?: unknown };
  if (typeof g.VideoEncoder !== "function" || typeof g.AudioEncoder !== "function") {
    return NO_BROWSER_VIDEO_CAPS;
  }
  try {
    const { canEncodeVideo, canEncodeAudio } = await import("mediabunny");
    const videoOpts = (t: VideoTargetParams) => ({
      width: Math.round((t.maxHeight * 16) / 9),
      height: t.maxHeight,
      bitrate: t.webBitrateKbps * 1000,
    });
    const audioOpts = (t: VideoTargetParams) => ({
      numberOfChannels: 2, sampleRate: 48_000, bitrate: t.audioKbps * 1000,
    });
    const [avc, aac, vp9, opus] = await Promise.all([
      canEncodeVideo("avc", videoOpts(WEB_TIER_H264)),
      canEncodeAudio("aac", audioOpts(WEB_TIER_H264)),
      canEncodeVideo("vp9", videoOpts(WEB_TIER_VP9)),
      canEncodeAudio("opus", audioOpts(WEB_TIER_VP9)),
    ]);
    return { webCodecs: true, avc, aac, vp9, opus };
  } catch {
    return NO_BROWSER_VIDEO_CAPS;
  }
}

// ---------------------------------------------------------------------------------------------------
// The transcode
// ---------------------------------------------------------------------------------------------------

/** mediabunny's reasons for dropping a track → this seam's stable error kinds. A dropped track is not
 *  a warning here: the tier renamed the file to `.mp4`/`.webm` before any encode ran, so publishing a
 *  video whose only video track was discarded would ship a container the manifest describes and the
 *  reader cannot watch. Every reason therefore refuses. */
const DISCARD_KIND: Readonly<Record<string, "decoder-missing" | "unsupported-input" | "codec-missing">> = {
  undecodable_source_codec: "decoder-missing",
  unknown_source_codec: "unsupported-input",
  no_encodable_target_codec: "codec-missing",
};

export interface BrowserTranscodeOptions {
  target: VideoTargetParams;
  /** 0..1. mediabunny reports a real fraction (it knows the source duration from the demuxer), so
   *  unlike the sidecar's byte-progress this needs no duration hint from the caller. */
  onProgress?: (fraction: number) => void;
}

/**
 * Transcode one video to `target`, entirely in the browser.
 *
 * THROWS a typed {@link VideoTranscodeError} on every failure, including "this browser cannot".
 * It never returns the source bytes dressed as a conversion.
 *
 * Two guards before `execute()`, and they are not the same guard:
 *  - `isValid` false means the conversion cannot run at all;
 *  - `discardedTracks` non-empty means it CAN run and would silently drop a track. mediabunny's own
 *    docs point out you can inspect this list and still proceed — deliberately not taken here, per
 *    the note on {@link DISCARD_KIND}. This is the branch that would otherwise be a silent
 *    degradation with a green result, which is the exact failure mode this seam exists to refuse.
 */
export async function transcodeVideoInBrowser(src: Blob, opts: BrowserTranscodeOptions): Promise<Blob> {
  const { target, onProgress } = opts;
  const g = globalThis as { VideoEncoder?: unknown };
  if (typeof g.VideoEncoder !== "function") {
    throw new VideoTranscodeError(
      "encoder-missing",
      "This browser cannot convert video. Chrome and Edge can; Firefox and Safari cannot yet.",
    );
  }

  const mb = await import("mediabunny"); // lazy: a library with no video never downloads the muxer
  const input = new mb.Input({ formats: mb.ALL_FORMATS, source: new mb.BlobSource(src) });
  const output = new mb.Output({
    // `fastStart: 'in-memory'` is the browser spelling of the sidecar's `-movflags +faststart`: the
    // moov atom lands at the FRONT so a reader's browser can start playing before the whole file
    // arrives. Without it a published video downloads completely before the first frame shows, which
    // on a static host is the difference between a page that works and one that looks broken.
    // WebM has no equivalent knob and needs none — its cues are written for streaming by design.
    format: target.ext === "mp4"
      ? new mb.Mp4OutputFormat({ fastStart: "in-memory" })
      : new mb.WebMOutputFormat(),
    target: new mb.BufferTarget(),
  });

  let conversion;
  let height: number;
  try {
    // `height` with `fit: "contain"` is the browser equivalent of the sidecar's
    // `scale=-2:'min(ih,720)'`: aspect preserved, width derived. Unlike ffmpeg's expression it is NOT
    // downscale-only, so it is clamped against the source's own height here — see `heightFor`.
    // `displayHeight` rather than `codedHeight` deliberately: it is the post-rotation presentation
    // height, which is what "720p" means to whoever watches the file.
    const track = await input.getPrimaryVideoTrack();
    height = heightFor(track?.displayHeight ?? null, target.maxHeight);
  } catch (e) {
    throw new VideoTranscodeError("unreadable-input", e instanceof Error ? e.message : String(e));
  }
  try {
    conversion = await mb.Conversion.init({
      input,
      output,
      video: { height, fit: "contain", codec: target.codec === "h264" ? "avc" : "vp9", bitrate: target.webBitrateKbps * 1000 },
      audio: { codec: target.codec === "h264" ? "aac" : "opus", bitrate: target.audioKbps * 1000 },
    });
  } catch (e) {
    // Init reads the container. A file that is not a video, or is truncated, dies here rather than
    // in execute() — distinguishable from an encode failure, and the author's fix is different.
    throw new VideoTranscodeError("unreadable-input", e instanceof Error ? e.message : String(e));
  }

  if (!conversion.isValid) {
    const reason = conversion.discardedTracks[0]?.reason ?? "";
    throw new VideoTranscodeError(
      DISCARD_KIND[reason] ?? "unsupported-input",
      `This browser cannot convert this video (${reason || "no convertible track"}).`,
    );
  }
  if (conversion.discardedTracks.length > 0) {
    const t = conversion.discardedTracks[0]!;
    throw new VideoTranscodeError(
      DISCARD_KIND[t.reason] ?? "unsupported-input",
      `Converting this video would have dropped its ${t.track.type} track (${t.reason}).`,
    );
  }

  if (onProgress) conversion.onProgress = (p: number) => onProgress(p);
  try {
    await conversion.execute();
  } catch (e) {
    throw new VideoTranscodeError("encode-failed", e instanceof Error ? e.message : String(e));
  }

  const buffer = output.target.buffer;
  if (!buffer) {
    // Finalization is what populates `buffer`; a null here means the output never committed. Refusing
    // beats returning a zero-byte Blob that the tier would publish under a `.mp4` name.
    throw new VideoTranscodeError("output-failed", "The converted video came back empty.");
  }
  return new Blob([buffer], { type: target.mime });
}

/**
 * The height to ask for, clamped so the conversion is DOWNSCALE-ONLY.
 *
 * Pulled out and exported because it is the one piece of arithmetic in this file that can be wrong in
 * a way nothing else notices: mediabunny's `height` is a target, not a cap, so a 480p source handed
 * `height: 720` comes back UPSCALED — a bigger file than the original inside a tier whose entire
 * purpose is smaller files. ffmpeg's `min(ih,720)` says this in its own syntax; the browser has no
 * such expression, so it is said here. `null` source height (a demuxer that did not report one)
 * returns the cap, which is the safe direction: mediabunny then leaves an unknown-size track alone.
 */
export function heightFor(sourceHeight: number | null, maxHeight: number): number {
  if (sourceHeight === null || !(sourceHeight > 0)) return maxHeight;
  return Math.min(sourceHeight, maxHeight);
}
