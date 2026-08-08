// The desktop video seam across the Blob↔file boundary (Archie-7e6f). What this pins is the bridge's
// own contract — staging under the app-data dir, the sidecar call with ABSOLUTE paths, the read-back
// as a Blob in the TARGET's container MIME, and best-effort cleanup on every exit path — against an
// INJECTED fs slice and an INJECTED transcode (the real ones need a webview; same seam idiom as
// `VideoBridge` in video-transcode.ts). What it CANNOT see is the sidecar itself — argv correctness,
// progress parsing and stderr classification live in src-tauri/src/video.rs's own `#[cfg(test)]`
// module, and neither suite substitutes for a packaged run.
import { describe, it, expect, vi } from "vitest";
import { transcodeVideoViaTempFile, type SidecarFs } from "./video-sidecar-bridge.js";
import { WEB_TIER_H264, VideoTranscodeError, type VideoTranscodeResult } from "./video-profiles.js";
import type { TranscodeVideoOptions } from "./video-transcode.js";

/** The injected fs slice plus the in-memory byte store the fakes share. */
type FakeFs = SidecarFs & { files: Map<string, Uint8Array> };
type FakeTranscode = (opts: TranscodeVideoOptions) => Promise<VideoTranscodeResult>;

/** In-memory fake of the plugin-fs slice. `write` is POSIX-style (returns bytes written) so the
 *  bridge's `writeAllToTauriHandle` loop is exercised for real rather than assumed. */
function fakeFs(): FakeFs {
  const files = new Map<string, Uint8Array>();
  const merge = (path: string, data: Uint8Array): void => {
    const cur = files.get(path);
    const next = new Uint8Array((cur?.length ?? 0) + data.length);
    if (cur) next.set(cur);
    next.set(data, cur?.length ?? 0);
    files.set(path, next);
  };
  return {
    files,
    mkdir: vi.fn(async () => {}),
    open: vi.fn(async (path: string) => ({
      write: async (data: Uint8Array) => { merge(path, data); return data.length; },
      close: async () => {},
    })),
    readFile: vi.fn(async (path: string) => files.get(path) ?? new Uint8Array(0)),
    remove: vi.fn(async (path: string) => { files.delete(path); }),
  };
}

/** A transcode stub that WRITES the output the bridge will read back, like the real sidecar does. */
function fakeTranscode(fs: FakeFs) {
  return vi.fn<FakeTranscode>(async (opts) => {
    const bytes = new TextEncoder().encode(`OUT(${opts.target.codec})`);
    fs.files.set(opts.output, bytes);
    return { output: opts.output, bytes: bytes.length, outTimeUs: 1_000_000 };
  });
}

const src = new Blob([new Uint8Array([1, 2, 3])], { type: "video/quicktime" });
const INPUT = "/appdata/archie-video-transcode/in-job-1.mov";
const OUTPUT = "/appdata/archie-video-transcode/out-job-1.mp4";

describe("transcodeVideoViaTempFile", () => {
  it("stages the source, invokes the sidecar with ABSOLUTE paths, and returns a Blob in the target's container MIME", async () => {
    const fs = fakeFs();
    const transcode = fakeTranscode(fs);
    // The staged input must be asserted BEFORE the bridge's finally-cleanup runs (it deletes both
    // staging files on every exit path), so the byte check lives inside the transcode stub.
    const staged = vi.fn<FakeTranscode>(async (opts) => {
      expect(fs.files.get(opts.input)).toEqual(new Uint8Array([1, 2, 3]));
      return transcode(opts);
    });
    const out = await transcodeVideoViaTempFile(src, WEB_TIER_H264, {
      fs, appDataDir: async () => "/appdata", transcode: staged, jobId: "job-1",
    });

    expect(staged).toHaveBeenCalledTimes(1);
    const call = staged.mock.calls[0]![0];
    expect(call.input).toBe(INPUT);
    expect(call.output).toBe(OUTPUT);
    expect(call.target).toBe(WEB_TIER_H264);
    // The read-back is the sidecar's OUTPUT bytes, wrapped in the TARGET's BARE container mime —
    // never the source's, and never the parameterised `<source type>` string.
    expect(out.type).toBe(WEB_TIER_H264.containerMime);
    expect(await out.text()).toBe("OUT(h264)");
  });

  it("cleans up both staging files when the transcode succeeds", async () => {
    const fs = fakeFs();
    await transcodeVideoViaTempFile(src, WEB_TIER_H264, {
      fs, appDataDir: async () => "/appdata", transcode: fakeTranscode(fs), jobId: "job-1",
    });
    expect(fs.remove).toHaveBeenCalledWith(INPUT);
    expect(fs.remove).toHaveBeenCalledWith(OUTPUT);
    expect(fs.files.size).toBe(0);
  });

  it("passes a sidecar refusal through as the SAME typed error, and still cleans up", async () => {
    const fs = fakeFs();
    const sidecarErr = new VideoTranscodeError("codec-missing", "no libx264");
    await expect(
      transcodeVideoViaTempFile(src, WEB_TIER_H264, {
        fs, appDataDir: async () => "/appdata", jobId: "job-1",
        transcode: vi.fn<FakeTranscode>(async () => { throw sidecarErr; }),
      }),
    ).rejects.toBe(sidecarErr);
    expect(fs.remove).toHaveBeenCalledWith(INPUT);
    expect(fs.remove).toHaveBeenCalledWith(OUTPUT);
  });

  it("wraps its OWN staging failure in a typed `output-failed` — never a raw plugin error", async () => {
    const fs = fakeFs();
    fs.mkdir = vi.fn(async () => { throw new Error("forbidden path"); });
    await expect(
      transcodeVideoViaTempFile(src, WEB_TIER_H264, {
        fs, appDataDir: async () => "/appdata", transcode: fakeTranscode(fs), jobId: "job-1",
      }),
    ).rejects.toMatchObject({ kind: "output-failed", message: /forbidden path/ });
  });

  it("uses the target's own extension for the output — the muxer ffmpeg picks is decided by it", async () => {
    const fs = fakeFs();
    const transcode = fakeTranscode(fs);
    await transcodeVideoViaTempFile(src, WEB_TIER_H264, {
      fs, appDataDir: async () => "/appdata", transcode, jobId: "job-1",
    });
    expect(transcode.mock.calls[0]![0].output.endsWith(".mp4")).toBe(true);
  });
});
