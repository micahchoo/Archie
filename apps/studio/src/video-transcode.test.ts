// video-transcode seam (Archie-7e6f). Everything here runs against an INJECTED bridge — no Tauri, no
// subprocess, no ffmpeg. What is pinned is the seam's own logic: which target a machine gets, how a
// Rust rejection becomes a typed error, how the shared progress channel is filtered, and the shape of
// the measure-and-tell string.
//
// WHAT THIS SUITE CANNOT SEE, stated so nobody mistakes it for coverage of the desktop path: it never
// spawns ffmpeg, so it proves nothing about argv correctness, progress parsing, or stderr
// classification. Those live in `src-tauri/src/video.rs`'s own `#[cfg(test)]` module against verbatim
// captured fixtures, and neither suite substitutes for a packaged run.
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  WEB_TIER_H264,
  WEB_TIER_VP9,
  isTranscodableVideoMime,
  pickTarget,
  unavailableReason,
  classifyVideoError,
  VideoTranscodeError,
  isProgressFor,
  progressFraction,
  probeVideoEncoders,
  transcodeVideo,
  videoSkipCount,
  noteVideoSkipped,
  resetVideoSkipCount,
  estimateWebTierVideoBytes,
  formatBytes,
  videoTierTell,
  type EncoderReport,
  type VideoBridge,
  type VideoProgress,
} from "./video-transcode.js";

// isTauri() is false in vitest; every test here passes an explicit bridge, which is also the branch
// that proves the seam does not REQUIRE a webview to be exercised.
vi.mock("./tauri-fs.js", () => ({ isTauri: () => false }));

const report = (over: Partial<EncoderReport> = {}): EncoderReport => ({
  ffmpeg: true, version: "7.1.3", h264: true, vp9: true, aac: true, opus: true, h264Decode: true,
  ...over,
});

/** A bridge whose invoke/listen are scripted per test. `emit` pushes a payload to every listener. */
function fakeBridge(
  invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>,
): VideoBridge & { emit: (p: unknown) => void; listenerCount: () => number } {
  const handlers = new Set<(p: unknown) => void>();
  return {
    invoke: <T,>(cmd: string, args?: Record<string, unknown>) => invoke(cmd, args) as Promise<T>,
    listen: async (_event, handler) => {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    emit: (p) => handlers.forEach((h) => h(p)),
    listenerCount: () => handlers.size,
  };
}

const progress = (over: Partial<VideoProgress> = {}): VideoProgress => ({
  jobId: "job-1", outTimeUs: 0, frame: 0, speed: null, totalSize: null, done: false, ...over,
});

beforeEach(() => resetVideoSkipCount());

describe("target selection", () => {
  it("prefers H.264/MP4 — the format every major browser plays", () => {
    expect(pickTarget(report())).toBe(WEB_TIER_H264);
  });

  it("falls back to VP9/WebM when the machine has no H.264 encoder (the stock GNOME 49 case)", () => {
    // Measured base org.gnome.Platform//49: no libx264 either direction, but libvpx-vp9 + libopus
    // are in the base runtime.
    expect(pickTarget(report({ h264: false, h264Decode: false }))).toBe(WEB_TIER_VP9);
  });

  it("refuses rather than guessing when neither pair is complete", () => {
    expect(pickTarget(report({ h264: false, vp9: false }))).toBeNull();
    // An encoder with no matching AUDIO codec is not a usable target either.
    expect(pickTarget(report({ h264: true, aac: false, vp9: true, opus: false }))).toBeNull();
  });

  it("refuses when there is no ffmpeg at all", () => {
    expect(pickTarget(report({ ffmpeg: false }))).toBeNull();
    expect(unavailableReason(report({ ffmpeg: false }))).toMatch(/no video converter/i);
  });

  it("says nothing when a target IS available — the caller branches on pickTarget, not on prose", () => {
    expect(unavailableReason(report())).toBe("");
    expect(unavailableReason(report({ h264: false }))).toBe("");
  });

  it("greys with a reason when the converter is there but has no usable codecs", () => {
    const r = report({ h264: false, h264Decode: false, vp9: false, opus: false });
    expect(pickTarget(r)).toBeNull();
    expect(unavailableReason(r)).toMatch(/missing its codecs/i);
  });

  it("the two targets carry containers and mimes that match their codecs", () => {
    expect(WEB_TIER_H264.ext).toBe("mp4");
    expect(WEB_TIER_H264.mime).toContain("avc1");
    expect(WEB_TIER_VP9.ext).toBe("webm");
    expect(WEB_TIER_VP9.mime).toContain("vp9");
  });

  it("accepts any video/* mime and no other", () => {
    expect(isTranscodableVideoMime("video/quicktime")).toBe(true);
    expect(isTranscodableVideoMime("video/x-matroska")).toBe(true);
    expect(isTranscodableVideoMime("audio/mpeg")).toBe(false);
    expect(isTranscodableVideoMime("image/tiff")).toBe(false);
  });
});

describe("error classification", () => {
  // A Rust `Err(TranscodeError)` crosses the invoke boundary as a PLAIN OBJECT, not an Error. That is
  // the case worth pinning: `instanceof Error` is false and `String(e)` would render "[object Object]".
  it.each([
    ["codec-missing", "…the codecs-extra runtime extension is not installed."],
    ["decoder-missing", "…cannot decode that video's format."],
    ["unsupported-input", "That file isn't a video we can read."],
    ["unreadable-input", "The original video couldn't be opened."],
    ["output-failed", "The transcoded file couldn't be written."],
    ["encode-failed", "ffmpeg exited with status 183."],
    ["bad-request", "The input path starts with '-'."],
  ])("carries a Rust %s rejection through with its kind intact", (kind, message) => {
    const e = classifyVideoError({ kind, message });
    expect(e).toBeInstanceOf(VideoTranscodeError);
    expect(e.kind).toBe(kind);
    expect(e.message).toBe(message);
  });

  it("does NOT trust an unknown kind — an arbitrary object degrades to encode-failed", () => {
    // Otherwise any `{kind, message}` shaped value would mint a kind the UI has no copy for.
    const e = classifyVideoError({ kind: "totally-made-up", message: "hi" });
    expect(e.kind).toBe("encode-failed");
  });

  it("keeps a thrown Error's message rather than stringifying the object", () => {
    const e = classifyVideoError(new Error("IPC channel closed"));
    expect(e.kind).toBe("encode-failed");
    expect(e.message).toBe("IPC channel closed");
    expect(e.message).not.toContain("[object Object]");
  });

  it("passes an already-typed error straight through", () => {
    const original = new VideoTranscodeError("codec-missing", "no libx264");
    expect(classifyVideoError(original)).toBe(original);
  });

  it("survives a non-object rejection", () => {
    expect(classifyVideoError("boom").kind).toBe("encode-failed");
    expect(classifyVideoError("boom").message).toBe("boom");
    expect(classifyVideoError(undefined).message).toBe("undefined");
  });
});

describe("progress", () => {
  it("ignores another job's events on the shared channel", () => {
    // Progress rides ONE global event name, so two concurrent transcodes share it. Without this
    // filter a second job would drive the first job's bar.
    expect(isProgressFor("job-1", progress({ jobId: "job-1" }))).toBe(true);
    expect(isProgressFor("job-1", progress({ jobId: "job-2" }))).toBe(false);
  });

  it("ignores a malformed payload", () => {
    expect(isProgressFor("job-1", null)).toBe(false);
    expect(isProgressFor("job-1", { jobId: "job-1" })).toBe(false);
    expect(isProgressFor("job-1", "job-1")).toBe(false);
  });

  it("reads MICROseconds — a 3.000 s position against a 6 s source is half done", () => {
    // ffmpeg's out_time_us for 3.000 s is 3_000_000 (measured). Treating it as milliseconds would
    // give 500x and slam the bar to full on the first event.
    expect(progressFraction(progress({ outTimeUs: 3_000_000 }), 6)).toBeCloseTo(0.5, 6);
  });

  it("clamps an overshoot rather than reporting more than 100%", () => {
    expect(progressFraction(progress({ outTimeUs: 7_000_000 }), 6)).toBe(1);
  });

  it("returns null when the source duration is unknown, never a fake zero", () => {
    expect(progressFraction(progress({ outTimeUs: 1_000_000 }), null)).toBeNull();
    expect(progressFraction(progress({ outTimeUs: 1_000_000 }), 0)).toBeNull();
  });

  it("reports 1 on the terminating block whatever the clock says", () => {
    expect(progressFraction(progress({ outTimeUs: 10, done: true }), 600)).toBe(1);
  });
});

describe("the seam", () => {
  it("passes a typed request — never an argv — to the Rust command", async () => {
    // The webview must not be able to express ffmpeg arguments; that boundary is what keeps the
    // subprocess closed. If this ever carries an `args` array, the trust model has been broken.
    const seen: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
    const bridge = fakeBridge(async (cmd, args) => {
      seen.push({ cmd, ...(args ? { args } : {}) });
      return { output: "/tmp/o.mp4", bytes: 1234, outTimeUs: 3_000_000 };
    });
    const r = await transcodeVideo({
      jobId: "job-1", input: "/tmp/in.mov", output: "/tmp/o.mp4", target: WEB_TIER_H264, bridge,
    });
    expect(r.bytes).toBe(1234);
    expect(seen[0]!.cmd).toBe("video_transcode");
    const request = seen[0]!.args!["request"] as Record<string, unknown>;
    expect(request).toMatchObject({
      jobId: "job-1", input: "/tmp/in.mov", output: "/tmp/o.mp4",
      codec: "h264", maxHeight: 720, crf: 23, audioKbps: 128,
    });
    expect(Object.keys(request)).not.toContain("args");
  });

  it("delivers this job's progress with a fraction, and drops the other job's", async () => {
    const seen: Array<[VideoProgress, number | null]> = [];
    let bridge!: ReturnType<typeof fakeBridge>;
    bridge = fakeBridge(async () => {
      bridge.emit(progress({ jobId: "job-1", outTimeUs: 3_000_000 }));
      bridge.emit(progress({ jobId: "OTHER", outTimeUs: 6_000_000 }));
      bridge.emit(progress({ jobId: "job-1", outTimeUs: 6_000_000, done: true }));
      return { output: "/tmp/o.mp4", bytes: 9, outTimeUs: 6_000_000 };
    });
    await transcodeVideo({
      jobId: "job-1", input: "/tmp/in.mov", output: "/tmp/o.mp4", target: WEB_TIER_H264,
      sourceDurationSec: 6, bridge, onProgress: (p, f) => seen.push([p, f]),
    });
    expect(seen.map(([, f]) => f)).toEqual([0.5, 1]);
    expect(seen.every(([p]) => p.jobId === "job-1")).toBe(true);
  });

  it("unsubscribes the listener even when the transcode FAILS", async () => {
    // A listener left attached would keep driving a bar for a job that is over.
    let bridge!: ReturnType<typeof fakeBridge>;
    bridge = fakeBridge(async () => {
      throw { kind: "codec-missing", message: "no libx264" };
    });
    await expect(
      transcodeVideo({
        jobId: "job-1", input: "/tmp/in.mov", output: "/tmp/o.mp4", target: WEB_TIER_H264,
        bridge, onProgress: () => {},
      }),
    ).rejects.toMatchObject({ kind: "codec-missing" });
    expect(bridge.listenerCount()).toBe(0);
  });

  it("throws `unavailable` on the web rather than pretending to convert", async () => {
    // No bridge + no Tauri. The important half is that it THROWS: a silent copy of the original
    // would publish the bytes the tier exists to avoid.
    await expect(
      transcodeVideo({
        jobId: "j", input: "/tmp/in.mov", output: "/tmp/o.mp4", target: WEB_TIER_H264,
      }),
    ).rejects.toMatchObject({ kind: "unavailable" });
  });

  it("probe reports no-ffmpeg instead of throwing when the command fails", async () => {
    const bridge = fakeBridge(async () => {
      throw new Error("command not found");
    });
    expect(await probeVideoEncoders(bridge)).toMatchObject({ ffmpeg: false, h264: false });
  });

  it("probe returns no-ffmpeg on the web without touching the bridge", async () => {
    expect(await probeVideoEncoders()).toMatchObject({ ffmpeg: false });
  });
});

describe("skip visibility", () => {
  it("counts skips, because a silent one is measured in gigabytes", () => {
    // The bake-async `bakeFallbackCount()` contract. A degraded video tier looks exactly like a
    // working one from the outside — the published tree is just enormous.
    expect(videoSkipCount()).toBe(0);
    noteVideoSkipped();
    noteVideoSkipped();
    expect(videoSkipCount()).toBe(2);
  });

  it("transcodeVideo does NOT increment it — the seam throws, the caller decides", async () => {
    await expect(
      transcodeVideo({ jobId: "j", input: "/a", output: "/b", target: WEB_TIER_H264 }),
    ).rejects.toThrow();
    expect(videoSkipCount()).toBe(0);
  });
});

describe("the measure-and-tell hand-off (H4)", () => {
  const inv = { count: 14, bytes: 180_000_000_000, durationSec: 60 * 60 * 40 }; // 40 hours

  it("estimates from DURATION when it is known", () => {
    const e = estimateWebTierVideoBytes(inv);
    expect(e.fromDuration).toBe(true);
    // 2128 kbit/s x 144000 s / 8 = 38.3 GB
    expect(e.webTierBytes).toBe(Math.round((2128 * 1000 * 144000) / 8));
    expect(e.webTierBytes).toBeLessThan(inv.bytes);
  });

  it("says so — in the copy — when it had to guess from bytes alone", () => {
    const blind = estimateWebTierVideoBytes({ ...inv, durationSec: null });
    expect(blind.fromDuration).toBe(false);
    expect(videoTierTell({ ...inv, durationSec: null }, "R")).toContain("very roughly");
    expect(videoTierTell(inv, "R")).toContain("about");
    expect(videoTierTell(inv, "R")).not.toContain("very roughly");
  });

  it("names the count, the real size, the reason, and BOTH ways out", () => {
    const s = videoTierTell(inv, "Safari can't convert video.");
    expect(s).toContain("14 videos");
    expect(s).toContain("180.0 GB");
    expect(s).toContain("Safari can't convert video.");
    expect(s).toContain("HandBrake");
    expect(s).toMatch(/\$\d/);
  });

  it("never claims Archie did the conversion", () => {
    const s = videoTierTell(inv, "Firefox can't convert video.");
    expect(s).not.toMatch(/\bconverted them\b|\bwe converted\b|\bArchie converted\b/i);
    expect(s).toMatch(/convert them yourself|publish them as they are/i);
  });

  it("is empty when there is no video — no tell about nothing", () => {
    expect(videoTierTell({ count: 0, bytes: 0, durationSec: 0 }, "R")).toBe("");
  });

  it("singularises one video", () => {
    expect(videoTierTell({ count: 1, bytes: 2_000_000_000, durationSec: 600 }, "R")).toContain("1 video,");
  });

  it("formats bytes at the granularity the tell needs", () => {
    expect(formatBytes(180_000_000_000)).toBe("180.0 GB");
    expect(formatBytes(4_200_000_000)).toBe("4.2 GB");
    expect(formatBytes(45_000_000)).toBe("45 MB");
    expect(formatBytes(45_000)).toBe("45 KB");
  });

  it("does not print a bare $0.00 for a tiny library", () => {
    expect(videoTierTell({ count: 1, bytes: 5_000_000, durationSec: 30 }, "R")).toContain("under $0.01");
  });
});

