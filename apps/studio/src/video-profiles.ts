// The video web-tier contract, PLATFORM-NEUTRAL (Archie-7e6f). The two transcode seams — the native
// ffmpeg sidecar (`video-transcode.ts` / src-tauri/src/video.rs) on desktop and the
// mediabunny/WebCodecs path (`video-transcode-web.ts`) in Chromium — share exactly one vocabulary:
// the two declared profiles, the capability shape, the target decision, and the typed failure.
// That vocabulary lives HERE so both seams import the same objects instead of each restating them.
//
// WHY THIS FILE EXISTS, stated as the two seams it serves:
//
//   1. ONE DECISION. `pickTarget` used to exist twice — `pickTarget(report)` over ffmpeg's
//      `EncoderReport` in video-transcode.ts and `pickBrowserTarget(caps)` over `BrowserVideoCaps`
//      in video-transcode-web.ts. Two copies of one preference order is how a third artifact shape
//      enters a published tree: one side "improves" its copy, the other does not, and the files the
//      two platforms publish drift apart without anything failing. Both probes now report the ONE
//      `VideoCapabilities` shape and the ONE `pickTarget` chooses from it. The browser-specific
//      reasoning is preserved in the probe mapping and in `pickTarget`'s comments below.
//
//   2. THE BROWSER PATH MUST NOT DRAG DESKTOP GLUE. `video-transcode-web.ts` used to import the
//      profiles from `video-transcode.ts`, which imports `isTauri` from `tauri-fs.js` — so the
//      browser path transitively imported the desktop fs bridge. That module is cheap today (every
//      @tauri-apps/* import behind `await import`), but it is the wrong dependency in principle and
//      the kind of thing that grows into a real leak. This module imports NOTHING, so a browser-only
//      graph can reach it without touching tauri-fs.js at all.
//
// What deliberately stays OUT of this file: the probes and the encode calls (`probeVideoEncoders`,
// `probeBrowserVideoCaps`, `transcodeVideo`, `transcodeVideoInBrowser`) — those are the platform
// halves, thin adapters on the desktop/browser side; and the measure-and-tell (`videoTierTell` and
// friends) — that stays in `video-transcode.ts` with the seam that owns the counter.

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
  /** The `type` a `<video>` / `<source>` should advertise — WITH codec parameters, because that is
   *  the whole point of the attribute: it lets a browser skip a source it cannot play without
   *  fetching it. NOT for a manifest `format` field; see {@link VideoTargetParams.containerMime}. */
  mime: string;
  /** The bare media type, no parameters — what an object's `format` carries in the published
   *  manifest, beside `image/webp` and `audio/ogg`.
   *
   *  SEPARATE FROM `mime` because a test caught them being conflated: the tier decision put the full
   *  `video/mp4; codecs="avc1.640028, mp4a.40.2"` into `AObject.format`. IIIF Presentation 3 `format`
   *  is a media type, and every other tier writes a bare one, so a parameterised string there is both
   *  off-spec and inconsistent with its siblings. Two fields, two jobs. */
  containerMime: string;
  /** Downscale-only cap on the long-ish edge (height). A smaller source is left alone. */
  maxHeight: number;
  /** Constant-quality knob. The scales are NOT comparable between codecs: 23 is a normal H.264
   *  value, 33 a normal VP9 one. Used by the ffmpeg sidecar ONLY. */
  crf: number;
  /** Video bitrate for the BROWSER path, in kbit/s. A second knob rather than a conversion of `crf`
   *  because the two encoders take genuinely different instructions: ffmpeg does constant QUALITY
   *  (rate varies, quality pinned), while WebCodecs' `VideoEncoder` is configured with a bitrate
   *  (rate pinned, quality varies). There is no exchange rate between them — a CRF-to-bitrate formula
   *  would be a fabricated number dressed as a derivation, so both are stated instead.
   *
   *  The H.264 figure is not free-chosen: it is `WEB_TIER_VIDEO_KBPS` minus this profile's audio, so
   *  the bitrate the browser actually encodes at and the bitrate `estimateWebTierVideoBytes` predicts
   *  are THE SAME NUMBER. Before this path existed the estimate answered for nobody; now a size
   *  estimate that misses is a bug with one cause instead of two. VP9 is set lower at the same
   *  perceived quality, which is the codec's whole point. */
  webBitrateKbps: number;
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
  containerMime: "video/mp4",
  maxHeight: 720,
  crf: 23,
  webBitrateKbps: 2000,
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
  containerMime: "video/webm",
  maxHeight: 720,
  crf: 33,
  webBitrateKbps: 1400,
  audioKbps: 96,
};

const VIDEO_MIME_PREFIX = "video/";

/** True for a mime this seam is willing to hand to the encoder. Deliberately permissive — ffmpeg
 *  reads far more than folder-import's EXT_MIME names, and an input it cannot read comes back as a
 *  classified `unsupported-input` rather than being pre-refused on a guess. */
export function isTranscodableVideoMime(mime: string): boolean {
  return mime.startsWith(VIDEO_MIME_PREFIX);
}

// ---------------------------------------------------------------------------------------------------
// Capability + the ONE target decision
// ---------------------------------------------------------------------------------------------------

/** What a machine can encode, as the questions a target choice actually asks. THE one shape both
 *  probes report (Archie-7e6f): `probeVideoEncoders` maps ffmpeg's `EncoderReport` onto it and
 *  `probeBrowserVideoCaps` maps the WebCodecs checks onto it, and `pickTarget` — the single copy of
 *  the preference order — decides from it.
 *
 *  `ffmpeg` is the ENCODER-REALM-PRESENT flag, named for its desktop origin but meaning "a realm
 *  that can encode exists at all": true on desktop when the sidecar found ffmpeg, true in the
 *  browser when WebCodecs exists. False means no transcode is possible whatever the codec booleans
 *  claim — a browser without WebCodecs maps to `ffmpeg: false` (see the probe), so a stale caps
 *  object can never mint a target. `h264Decode` is desktop-only (ffmpeg's decode capability, which
 *  decides whether typical H.264 input can be READ) and `webCodecsPresent` is browser-only (what
 *  lets the one `unavailableReason` quote the browser copy); both are absent on the other platform.
 *
 *  `webCodecs?: never` is a TYPE-LEVEL migration guard: the old browser-only `BrowserVideoCaps`
 *  shape (which carried `webCodecs`) is gone, and an object literal that still spells it fails to
 *  typecheck as this shape. */
export interface VideoCapabilities {
  webCodecs?: never;
  ffmpeg: boolean;
  h264: boolean;
  vp9: boolean;
  aac: boolean;
  opus: boolean;
  /** Desktop only: the sidecar's ffmpeg can DECODE H.264 input (a property of each source file, not
   *  of a target — see `pickTarget`). Absent on the browser, whose probe never asks. */
  h264Decode?: boolean;
  /** Browser only: the probe ran in a realm WITH WebCodecs. `true` on Chromium; `false` when the
   *  probe found none; absent on desktop, whose reason copy is the desktop one. */
  webCodecsPresent?: boolean;
}

/** The canonical all-false capability: no realm, no codecs. What a probe returns when there is
 *  nothing to ask — the desktop without a sidecar, a probe that failed. Platform-flavoured variants
 *  (the browser's `NO_BROWSER_VIDEO_CAPS`) spread this and add their marker. */
export const NO_VIDEO_CAPABILITIES: VideoCapabilities = {
  ffmpeg: false, h264: false, vp9: false, aac: false, opus: false,
};

/** The target this machine should use, given what it reports. Returns null when neither is reachable
 *  — the caller then greys the control with `unavailableReason` (Archie-c367: never silently swap).
 *
 *  THE preference order, in its one copy: H.264/AAC/MP4 first because MDN calls MP4+AVC+AAC "a
 *  broadly-supported combination—by every major browser, in fact"; VP9/Opus/WebM second. A machine
 *  that can do the first produces a file byte-compatible IN FORMAT with what the other platform's
 *  default produces.
 *
 *  Both halves of a profile are required together — that is the whole guard against the
 *  Opus-in-MP4 hybrid: `h264 && !aac` falls THROUGH to the VP9 test rather than quietly
 *  substituting a different audio codec into the MP4. Measured on Chromium 148, `h264 && !aac` is
 *  the live case (AVC encode yes, AAC encode no), so this fall-through is the normal path and not a
 *  defensive branch. A hybrid is never assembled — this returns one of the two DECLARED profiles or
 *  null, and null greys the control with a reason.
 *
 *  DELIBERATELY does not consult `h264Decode`. Decode capability is a property of each SOURCE file,
 *  not of the target, and a machine that can read WebM but not H.264 can still convert some of the
 *  library. Blanket-greying it would refuse work it can do; instead each unreadable file comes back
 *  as `decoder-missing`, which names the real cause. See video.rs's header for why the stock GNOME
 *  49 runtime is exactly this machine. */
export function pickTarget(caps: VideoCapabilities): VideoTargetParams | null {
  if (!caps.ffmpeg) return null;
  if (caps.h264 && caps.aac) return WEB_TIER_H264;
  if (caps.vp9 && caps.opus) return WEB_TIER_VP9;
  return null;
}

/** Why the control is greyed, in the author's language. Empty string when video transcode IS
 *  available — callers should branch on `pickTarget` rather than on this.
 *
 *  One function for both platforms, and the copy stays per-platform: the browser's reason names
 *  browsers ("Chrome and Edge can; Firefox and Safari cannot yet" — an author can act on that, not
 *  on "no WebCodecs"), the desktop's names the build. `webCodecsPresent` is what tells them apart. */
export function unavailableReason(caps: VideoCapabilities): string {
  if (!caps.ffmpeg) {
    return caps.webCodecsPresent === false
      ? "This browser cannot convert video. Chrome and Edge can; Firefox and Safari cannot yet."
      : "This build has no video converter, so videos will publish at their original size.";
  }
  // Desktop only (the browser never sets `h264Decode`): the converter is there but its codecs are
  // not — the base-runtime-without-codecs-extra case measured on GNOME 49. On the browser the two
  // codec booleans below already tell the whole story, so this branch is skipped.
  if (caps.webCodecsPresent !== true && !caps.h264Decode && !caps.vp9) {
    return "This build's video converter is missing its codecs, so videos will publish at their original size.";
  }
  if (pickTarget(caps) === null) {
    return caps.webCodecsPresent === true
      ? "This browser has no video and sound format Archie can publish together, so videos will publish at their original size."
      : "This build's video converter has no usable web format, so videos will publish at their original size.";
  }
  return "";
}

// ---------------------------------------------------------------------------------------------------
// The typed failure, shared by both seams
// ---------------------------------------------------------------------------------------------------

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

/** The kinds `classifyVideoError` will trust from a plain `{kind, message}` object crossing the
 *  invoke boundary — anything else degrades to `encode-failed`, so an arbitrary shaped value cannot
 *  mint a kind the UI has no copy for. */
export const KNOWN_KINDS: ReadonlySet<string> = new Set<VideoErrorKind>([
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

// ---------------------------------------------------------------------------------------------------
// The wire shapes (mirror src-tauri/src/video.rs, serde `rename_all = "camelCase"`)
// ---------------------------------------------------------------------------------------------------

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
