// Desktop video transcode across the Blob↔file boundary (Archie-7e6f). The tier engine
// (`applyTier`) holds a `Blob` and expects a `Blob` back; the ffmpeg sidecar
// (`video_transcode` in src-tauri/src/video.rs) takes ABSOLUTE FILE PATHS in and out. This module
// is that seam: stage the source under the app-data dir, invoke, read the result back, unlink both.
// `publish-flows` uses it on `isTauri()`; the browser path (`transcodeVideoInBrowser`) is the
// non-Tauri fallback, and a machine whose sidecar lacks codecs keeps the counted passthrough.
//
// WHY THE APP-DATA DIR AND NOT THE OS TEMP DIR: the Tauri fs plugin refuses paths outside its
// capability scope (capabilities/default.json `fs:scope`), and the OS temp dir is not scoped. The
// app-data dir IS (`$APPDATA/**`), which is why this seam needed NO capability grant. The Rust
// command reads/writes these paths with its own std::fs access (custom commands are not gated by
// the fs plugin's scope), so the only scoped operations are the JS-side write and read-back — both
// inside `$APPDATA`.
//
// FAILURE POLICY — same contract as `transcodeVideo`: THROW a typed `VideoTranscodeError` on every
// failure; never return the source bytes dressed as a conversion. The engine converts that throw
// into a COUNTED passthrough (`no-video-encoder` / `video-encode-failed`), so a staging failure is
// visible rather than silent. Cleanup is best-effort in `finally`: a leftover staging file is a
// hygiene issue, not a degradation, and must not fail the publish for nothing.
import type { TauriFsBridge } from "@render/core";
import type { TauriFileHandleLike } from "./tauri-fs.js";
import { tauriFsBridge, tauriAppDataDir, writeAllToTauriHandle } from "./tauri-fs.js";
import { transcodeVideo, type TranscodeVideoOptions } from "./video-transcode.js";
import { VideoTranscodeError, type VideoTargetParams, type VideoTranscodeResult } from "./video-profiles.js";

/** The staging directory name, under the app-data dir. */
const VIDEO_TMP_DIR = "archie-video-transcode";

/** Extension hints for the STAGED INPUT, so ffmpeg's format probing gets the container's usual
 *  spelling. The OUTPUT extension comes from the target (`mp4`/`webm`) — it is what ffmpeg uses to
 *  pick the muxer, so it is never guessed. Unknown mimes stage with no extension; ffmpeg probes
 *  content either way. */
const EXT_FOR_MIME: Readonly<Record<string, string>> = {
  "video/quicktime": "mov",
  "video/mp4": "mp4",
  "video/x-m4v": "m4v",
  "video/webm": "webm",
  "video/x-matroska": "mkv",
  "video/ogg": "ogv",
};

/** The slice of the Tauri fs bridge this seam touches — what the tests inject. */
export interface SidecarFs {
  mkdir(path: string): Promise<void>;
  open(path: string): Promise<TauriFileHandleLike>;
  readFile(path: string): Promise<Uint8Array>;
  remove(path: string): Promise<void>;
}

/** Injectable halves, so the seam is testable without a webview (same idiom as `VideoBridge` in
 *  video-transcode.ts). Absent members default to the real ones. */
export interface VideoSidecarDeps {
  fs?: SidecarFs;
  appDataDir?: () => Promise<string>;
  transcode?: (opts: TranscodeVideoOptions) => Promise<VideoTranscodeResult>;
  jobId?: string;
}

const uniqueJobId = (): string =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `v${Date.now()}-${Math.random().toString(36).slice(2)}`;

/**
 * Transcode one video through the desktop sidecar, bridging `Blob` in to `Blob` out.
 *
 * THROWS a typed {@link VideoTranscodeError} on every failure (staging, the sidecar's own refusal,
 * the read-back). The sidecar's errors pass through untouched; this module's own failures surface
 * as `output-failed`.
 */
export async function transcodeVideoViaTempFile(
  src: Blob,
  target: VideoTargetParams,
  deps: VideoSidecarDeps = {},
): Promise<Blob> {
  const bridge = deps.fs ?? (await tauriFsBridge());
  const fs: SidecarFs = bridge;
  const appData = deps.appDataDir ? await deps.appDataDir() : await tauriAppDataDir();
  const transcode = deps.transcode ?? transcodeVideo;
  const jobId = deps.jobId ?? uniqueJobId();

  const dir = `${appData}/${VIDEO_TMP_DIR}`;
  const baseMime = src.type.split(";")[0]!.trim().toLowerCase();
  const inputExt = EXT_FOR_MIME[baseMime] ?? null;
  const input = `${dir}/in-${jobId}${inputExt === null ? "" : `.${inputExt}`}`;
  const output = `${dir}/out-${jobId}.${target.ext}`;

  try {
    // Everything that can fail the seam is inside this try — mkdir included — so a staging refusal
    // (scope, disk, permission) surfaces as a typed `output-failed` like any other failure, and the
    // cleanup below runs for every exit path.
    await fs.mkdir(dir);
    // MATERIALIZE before write (Archie-623e): a lazy Tauri `File`'s bytes live behind an OVERRIDDEN
    // arrayBuffer(), and the plugin-fs handle would write the Blob's INTERNAL byte sequence, which
    // is EMPTY on that File. Copy into real bytes once, then stream them through the POSIX-loop
    // write (a single `fh.write` may commit fewer bytes than given and return how many).
    const bytes = new Uint8Array(await src.arrayBuffer());
    const fh = await fs.open(input);
    try {
      await writeAllToTauriHandle(fh, bytes);
    } finally {
      await fh.close();
    }

    await transcode({ jobId, input, output, target });

    const out = await fs.readFile(output);
    // View-safe: `out` may be a Uint8Array view with a nonzero byteOffset, so hand BlobPart the exact
    // byte range (`out.buffer` alone could carry preceding bytes from a pooled allocation). The
    // `as unknown as BlobPart` cast is the repo's established pattern (binding.ts) for TS 5.9's
    // stricter Buffer types.
    return new Blob([out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as unknown as BlobPart], { type: target.containerMime });
  } catch (e) {
    if (e instanceof VideoTranscodeError) throw e;
    throw new VideoTranscodeError(
      "output-failed",
      `The transcoded video couldn't be written: ${e instanceof Error ? e.message : String(e)}`,
    );
  } finally {
    for (const p of [input, output]) {
      try { await fs.remove(p); } catch { /* best-effort — see the module header */ }
    }
  }
}
