// The browser WebCodecs/mediabunny transcode path (Archie-7e6f H3).
//
// WHAT THIS SUITE CANNOT SEE — stated first, because the gap is larger here than for any other suite
// in this app and mistaking it for coverage would be the whole failure mode:
//
//   Node and jsdom have NO WebCodecs. There is no `VideoEncoder`, no `AudioEncoder`, no
//   `VideoDecoder`. So this suite NEVER encodes a frame, never demuxes a container, and never
//   produces a byte of video. mediabunny is mocked outright. Nothing here proves that a real
//   Chromium produces a playable file, that H.264 High is actually reachable, that `fastStart`
//   puts the moov atom where it belongs, or that the output plays in any browser at all.
//
// What it DOES pin is everything that is a DECISION rather than an encode: which of the two declared
// profiles a capability set selects, that a hybrid is never assembled, that every mediabunny refusal
// becomes a typed error instead of a silent degradation, and that a downscale never becomes an
// upscale. Those are exactly the parts that were reasoned about rather than measured, so they are
// the parts a unit test earns its keep on.
//
// The real-Chromium half is scripts/probe/webcodecs-video.mjs (capability) and a driven browser run
// (encode). See the ticket's record for what was and was not driven.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  pickBrowserTarget,
  browserUnavailableReason,
  heightFor,
  probeBrowserVideoCaps,
  transcodeVideoInBrowser,
  NO_BROWSER_VIDEO_CAPS,
  type BrowserVideoCaps,
} from "./video-transcode-web.js";
import { WEB_TIER_H264, WEB_TIER_VP9, VideoTranscodeError } from "./video-transcode.js";

const caps = (over: Partial<BrowserVideoCaps> = {}): BrowserVideoCaps => ({
  webCodecs: true, avc: true, aac: true, vp9: true, opus: true, ...over,
});

// ---------------------------------------------------------------------------------------------
// The target choice — the one real decision in the module
// ---------------------------------------------------------------------------------------------

describe("pickBrowserTarget", () => {
  it("prefers H.264/AAC/MP4, the same first choice the desktop sidecar makes", () => {
    // Identity, not shape: the point is that the browser returns the SAME profile object the sidecar
    // publishes, so the two implementations cannot drift into two artifacts that merely look alike.
    expect(pickBrowserTarget(caps())).toBe(WEB_TIER_H264);
  });

  it("falls back to VP9/Opus/WebM when H.264 encode is missing", () => {
    expect(pickBrowserTarget(caps({ avc: false }))).toBe(WEB_TIER_VP9);
  });

  it("NEVER assembles H.264 video with Opus audio — the Chromium case, and the whole guard", () => {
    // This is the measured live configuration on Chromium 148: AVC encode yes, AAC encode no.
    // mediabunny would happily write Opus into MP4 (its compatibility table marks it supported), and
    // the result would play with SILENT AUDIO in Safari — the exact browser H.264/MP4 exists to
    // serve. So `avc && !aac` must fall THROUGH to VP9 rather than substituting an audio codec.
    const chromium = caps({ aac: false });
    const target = pickBrowserTarget(chromium);
    expect(target).toBe(WEB_TIER_VP9);
    // Restated as the property rather than the value, so a future profile edit cannot quietly make
    // this pass for the wrong reason: whatever comes back, an mp4 never carries opus.
    expect(target!.ext === "mp4" ? target!.mime : "").not.toContain("opus");
  });

  it("returns null — never a partial profile — when neither pair is complete", () => {
    expect(pickBrowserTarget(caps({ aac: false, opus: false }))).toBeNull();
    expect(pickBrowserTarget(caps({ avc: false, vp9: false }))).toBeNull();
  });

  it("returns null when the realm has no WebCodecs at all, whatever else it claims", () => {
    // Guards against a caps object assembled from a stale probe: no WebCodecs means no encode,
    // regardless of the four codec booleans.
    expect(pickBrowserTarget(caps({ webCodecs: false }))).toBeNull();
    expect(pickBrowserTarget(NO_BROWSER_VIDEO_CAPS)).toBeNull();
  });

  it("only ever returns one of the two DECLARED profiles — no third artifact shape", () => {
    // Exhaustive over all 16 codec combinations (webCodecs true), because "a third shape cannot be
    // constructed" is a claim about the whole input space, not about four examples.
    const flags = [false, true];
    const seen = new Set<unknown>();
    for (const avc of flags) for (const aac of flags) for (const vp9 of flags) for (const opus of flags) {
      seen.add(pickBrowserTarget(caps({ avc, aac, vp9, opus })));
    }
    expect([...seen].every((t) => t === null || t === WEB_TIER_H264 || t === WEB_TIER_VP9)).toBe(true);
    expect(seen.has(WEB_TIER_H264)).toBe(true); // the sweep really did reach both branches…
    expect(seen.has(WEB_TIER_VP9)).toBe(true);
    expect(seen.has(null)).toBe(true); // …and the refusal
  });
});

describe("browserUnavailableReason", () => {
  it("is empty exactly when a target IS reachable", () => {
    expect(browserUnavailableReason(caps())).toBe("");
    expect(browserUnavailableReason(caps({ aac: false }))).toBe(""); // VP9 still reachable
    expect(browserUnavailableReason(caps({ aac: false, opus: false }))).not.toBe("");
  });

  it("names the browsers rather than the API when WebCodecs is absent", () => {
    // The author cannot act on "no WebCodecs"; they can act on "Chrome can, Firefox cannot".
    const r = browserUnavailableReason(caps({ webCodecs: false }));
    expect(r).toMatch(/Chrome/);
    expect(r).not.toMatch(/WebCodecs/);
  });

  it("says videos will publish at their original size when codecs do not pair up", () => {
    expect(browserUnavailableReason(caps({ aac: false, opus: false }))).toMatch(/original size/);
  });
});

// ---------------------------------------------------------------------------------------------
// Downscale-only
// ---------------------------------------------------------------------------------------------

describe("heightFor", () => {
  it("caps a taller source at the profile's height", () => {
    expect(heightFor(1080, 720)).toBe(720);
    expect(heightFor(2160, 720)).toBe(720);
  });

  it("leaves a SHORTER source alone — mediabunny's height is a target, not a cap", () => {
    // The bug this exists to prevent: `height: 720` on a 240p source UPSCALES it, producing a bigger
    // file inside a tier whose whole purpose is smaller files. ffmpeg says this with min(ih,720).
    expect(heightFor(240, 720)).toBe(240);
    expect(heightFor(480, 720)).toBe(480);
  });

  it("falls back to the cap when the demuxer reported no height", () => {
    expect(heightFor(null, 720)).toBe(720);
    expect(heightFor(0, 720)).toBe(720);
  });
});

// ---------------------------------------------------------------------------------------------
// The probe
// ---------------------------------------------------------------------------------------------

describe("probeBrowserVideoCaps", () => {
  const g = globalThis as Record<string, unknown>;
  afterEach(() => {
    delete g.VideoEncoder;
    delete g.AudioEncoder;
    vi.restoreAllMocks();
  });

  it("reports nothing encodable in a realm with no WebCodecs — and does not throw", () => {
    // This is the REAL state of this test runner, so the assertion is about the environment the suite
    // actually runs in rather than about a stub.
    expect("VideoEncoder" in globalThis).toBe(false);
    return expect(probeBrowserVideoCaps()).resolves.toEqual(NO_BROWSER_VIDEO_CAPS);
  });

  it("requires BOTH encoders — a realm with VideoEncoder but no AudioEncoder is not usable", async () => {
    g.VideoEncoder = function () {};
    expect(await probeBrowserVideoCaps()).toEqual(NO_BROWSER_VIDEO_CAPS);
  });
});

// ---------------------------------------------------------------------------------------------
// The transcode's REFUSALS. Nothing below encodes anything; mediabunny is a mock.
// ---------------------------------------------------------------------------------------------

/** The knobs each test twists. Module-level because `vi.mock` is hoisted above the imports. */
const mbState: {
  isValid: boolean;
  discardedTracks: { track: { type: string }; reason: string }[];
  buffer: ArrayBuffer | null;
  executeThrows: Error | null;
  initThrows: Error | null;
  displayHeight: number | null;
  lastInit: Record<string, unknown> | null;
  lastFormat: string | null;
  lastFastStart: unknown;
} = {
  isValid: true, discardedTracks: [], buffer: new ArrayBuffer(8), executeThrows: null,
  initThrows: null, displayHeight: 1080, lastInit: null, lastFormat: null, lastFastStart: null,
};

vi.mock("mediabunny", () => ({
  ALL_FORMATS: ["mock"],
  BlobSource: class { constructor(public b: Blob) {} },
  BufferTarget: class { buffer: ArrayBuffer | null = null; },
  Mp4OutputFormat: class {
    constructor(o: { fastStart?: unknown }) { mbState.lastFormat = "mp4"; mbState.lastFastStart = o?.fastStart; }
  },
  WebMOutputFormat: class { constructor() { mbState.lastFormat = "webm"; } },
  Input: class {
    getPrimaryVideoTrack() {
      return Promise.resolve(mbState.displayHeight === null ? null : { displayHeight: mbState.displayHeight });
    }
  },
  Output: class {
    target: { buffer: ArrayBuffer | null };
    constructor(o: { target: { buffer: ArrayBuffer | null } }) { this.target = o.target; }
  },
  Conversion: {
    init: (o: Record<string, unknown>) => {
      if (mbState.initThrows) return Promise.reject(mbState.initThrows);
      mbState.lastInit = o;
      return Promise.resolve({
        isValid: mbState.isValid,
        discardedTracks: mbState.discardedTracks,
        onProgress: undefined as ((p: number) => void) | undefined,
        execute() {
          if (mbState.executeThrows) return Promise.reject(mbState.executeThrows);
          (o.output as { target: { buffer: ArrayBuffer | null } }).target.buffer = mbState.buffer;
          return Promise.resolve();
        },
      });
    },
  },
  canEncodeVideo: () => Promise.resolve(true),
  canEncodeAudio: () => Promise.resolve(true),
}));

describe("transcodeVideoInBrowser", () => {
  const g = globalThis as Record<string, unknown>;
  const src = new Blob([new Uint8Array(4)], { type: "video/quicktime" });

  beforeEach(() => {
    Object.assign(mbState, {
      isValid: true, discardedTracks: [], buffer: new ArrayBuffer(8), executeThrows: null,
      initThrows: null, displayHeight: 1080, lastInit: null, lastFormat: null, lastFastStart: null,
    });
    g.VideoEncoder = function () {};
  });
  afterEach(() => { delete g.VideoEncoder; });

  it("refuses with `encoder-missing` where there is no VideoEncoder, rather than importing the muxer", async () => {
    delete g.VideoEncoder;
    await expect(transcodeVideoInBrowser(src, { target: WEB_TIER_H264 }))
      .rejects.toMatchObject({ kind: "encoder-missing" });
  });

  it("produces a Blob carrying the TARGET's mime, not the source's", async () => {
    const out = await transcodeVideoInBrowser(src, { target: WEB_TIER_H264 });
    expect(out.type).toBe(WEB_TIER_H264.mime);
    expect(out.type).not.toBe(src.type);
  });

  it("asks for MP4 with faststart on the H.264 profile and WebM on the VP9 one", async () => {
    await transcodeVideoInBrowser(src, { target: WEB_TIER_H264 });
    expect(mbState.lastFormat).toBe("mp4");
    // The browser spelling of the sidecar's `-movflags +faststart`. Without it a published video
    // downloads whole before the first frame paints.
    expect(mbState.lastFastStart).toBe("in-memory");

    await transcodeVideoInBrowser(src, { target: WEB_TIER_VP9 });
    expect(mbState.lastFormat).toBe("webm");
  });

  it("maps each profile onto mediabunny's own codec names", async () => {
    await transcodeVideoInBrowser(src, { target: WEB_TIER_H264 });
    expect(mbState.lastInit).toMatchObject({ video: { codec: "avc" }, audio: { codec: "aac" } });
    await transcodeVideoInBrowser(src, { target: WEB_TIER_VP9 });
    expect(mbState.lastInit).toMatchObject({ video: { codec: "vp9" }, audio: { codec: "opus" } });
  });

  it("encodes at the profile's stated bitrate — the same number the size estimate predicts", async () => {
    await transcodeVideoInBrowser(src, { target: WEB_TIER_H264 });
    expect(mbState.lastInit).toMatchObject({
      video: { bitrate: WEB_TIER_H264.webBitrateKbps * 1000 },
      audio: { bitrate: WEB_TIER_H264.audioKbps * 1000 },
    });
  });

  it("clamps the requested height to the SOURCE's, so a small video is never upscaled", async () => {
    mbState.displayHeight = 240;
    await transcodeVideoInBrowser(src, { target: WEB_TIER_H264 });
    expect(mbState.lastInit).toMatchObject({ video: { height: 240 } });

    mbState.displayHeight = 1080;
    await transcodeVideoInBrowser(src, { target: WEB_TIER_H264 });
    expect(mbState.lastInit).toMatchObject({ video: { height: 720 } });
  });

  it("classifies an unreadable container as `unreadable-input`, not as an encode failure", async () => {
    // The author's fix differs: a truncated file is re-exported, a failed encode is retried.
    mbState.initThrows = new Error("not a media file");
    await expect(transcodeVideoInBrowser(src, { target: WEB_TIER_H264 }))
      .rejects.toMatchObject({ kind: "unreadable-input" });
  });

  it("REFUSES a conversion that would silently drop a track, even though it could run", async () => {
    // The load-bearing one. mediabunny's docs invite you to inspect discardedTracks and proceed
    // anyway; proceeding would publish a .mp4 the manifest describes as video and a reader cannot
    // watch. The tier already renamed the file before any encode ran, so there is no honest
    // half-outcome available here.
    mbState.isValid = true;
    mbState.discardedTracks = [{ track: { type: "video" }, reason: "undecodable_source_codec" }];
    await expect(transcodeVideoInBrowser(src, { target: WEB_TIER_H264 }))
      .rejects.toMatchObject({ kind: "decoder-missing" });
  });

  it("maps each mediabunny discard reason onto its own error kind", async () => {
    const cases: [string, string][] = [
      ["undecodable_source_codec", "decoder-missing"],
      ["unknown_source_codec", "unsupported-input"],
      ["no_encodable_target_codec", "codec-missing"],
      ["something_new_upstream_added", "unsupported-input"], // unknown reason still refuses
    ];
    for (const [reason, kind] of cases) {
      mbState.isValid = false;
      mbState.discardedTracks = [{ track: { type: "video" }, reason }];
      await expect(transcodeVideoInBrowser(src, { target: WEB_TIER_H264 }))
        .rejects.toMatchObject({ kind });
    }
  });

  it("turns an execute() throw into a typed `encode-failed`, never a raw Error", async () => {
    mbState.executeThrows = new Error("encoder died");
    const err = await transcodeVideoInBrowser(src, { target: WEB_TIER_H264 }).catch((e) => e);
    expect(err).toBeInstanceOf(VideoTranscodeError);
    expect(err.kind).toBe("encode-failed");
    expect(err.message).toContain("encoder died");
  });

  it("refuses an empty output rather than publishing a zero-byte file under a .mp4 name", async () => {
    mbState.buffer = null;
    await expect(transcodeVideoInBrowser(src, { target: WEB_TIER_H264 }))
      .rejects.toMatchObject({ kind: "output-failed" });
  });

  it("reports progress as a fraction when a callback is given", async () => {
    const seen: number[] = [];
    await transcodeVideoInBrowser(src, { target: WEB_TIER_H264, onProgress: (f) => seen.push(f) });
    // The mock never drives onProgress, so this pins only that wiring it up does not throw and does
    // not disturb the result — deliberately NOT claimed as proof that progress arrives.
    expect(seen).toEqual([]);
  });
});
