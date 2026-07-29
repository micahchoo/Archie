// AV probe at ingest (Archie-0c7f, shape decided by Archie-ebe7): pull a poster frame, a duration and
// (for video) pixel dimensions out of a local audio/video file, using nothing but the platform.
//
// WHY NOT A LIBRARY. ebe7 weighed `mediabunny` (real container parsing — rotation, per-track metadata,
// worker-side) against a canvas frame-grab and chose the frame-grab: zero new dependencies, and it
// unblocks this ticket today. mediabunny is the answer the day rotation or audio waveforms actually
// bite. The one thing this approach cannot see is display ROTATION metadata, so a phone video shot
// portrait may poster in its stored orientation — recorded here rather than discovered later.
//
// EVERYTHING HERE IS BEST-EFFORT. A poster is a pure optimization, exactly like the image thumbnail in
// ingest-flows: its failure must never block an import. Every path resolves rather than rejects, and
// every wait is bounded — a file whose codec the engine lacks never fires `loadedmetadata` at all, so
// an unbounded `await` would hang the whole import queue on one bad file.

/** What a probe managed to learn. Every field is optional — absence is the normal, expected outcome. */
export interface AvProbe {
  /** Seconds. Absent when the engine could not decode metadata, or reported a non-finite duration
   *  (a live stream, or a VBR file with no container duration, both report `Infinity`). */
  duration?: number;
  width?: number;
  height?: number;
  /** A single decoded frame, ready for the thumbnail path. Video only. */
  poster?: Blob;
}

/** Bounded wait: resolve on `event`, or give up. Never rejects — see the module header. */
function once(el: EventTarget, event: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      el.removeEventListener(event, hit);
      el.removeEventListener("error", miss);
      clearTimeout(timer);
      resolve(ok);
    };
    const hit = () => finish(true);
    const miss = () => finish(false);
    const timer = setTimeout(() => finish(false), timeoutMs);
    el.addEventListener(event, hit, { once: true });
    el.addEventListener("error", miss, { once: true });
  });
}

/**
 * Where to grab the frame from. Seeking to 0 is the obvious choice and the wrong one — video very
 * commonly opens on a black or blank frame (a fade-in, a slate, a leader), which is precisely the
 * "black video plate" this ticket exists to fix. Take a frame a little way in instead, but never past
 * the end of a very short clip.
 *
 * Exported for its own test: this is the only part of the probe with a decision in it, and it is pure.
 */
export function posterSeekTime(duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  // 10% in, capped at 1s so a long film does not seek minutes ahead, and floored below the clip's own
  // end so a 0.2s sting still lands on a real frame rather than past it.
  return Math.min(1, duration * 0.1, Math.max(0, duration - 0.05));
}

/** Injectable seam — the DOM bits, so the orchestration above can be tested without a codec. */
export interface AvProbeDeps {
  createMedia: (kind: "video" | "audio") => HTMLVideoElement | HTMLAudioElement;
  createCanvas: () => HTMLCanvasElement;
  objectUrl: (blob: Blob) => string;
  revokeUrl: (url: string) => void;
}

const domDeps: AvProbeDeps = {
  createMedia: (kind) => document.createElement(kind) as HTMLVideoElement | HTMLAudioElement,
  createCanvas: () => document.createElement("canvas"),
  objectUrl: (blob) => URL.createObjectURL(blob),
  revokeUrl: (url) => URL.revokeObjectURL(url),
};

const METADATA_TIMEOUT_MS = 10_000;
const SEEK_TIMEOUT_MS = 10_000;

/**
 * Probe a local audio/video file. Resolves to `{}` when nothing could be learned — never throws.
 *
 * `kind` is taken from the caller's own mime branch rather than re-sniffed here, so the probe agrees
 * with the `mediaType` the object is stored under by construction.
 */
export async function probeAvFile(
  file: Blob,
  kind: "video" | "audio",
  deps: AvProbeDeps = domDeps,
): Promise<AvProbe> {
  // INSIDE the try, both of them. An earlier draft created these above it and the "never throws"
  // promise in this module's header was simply false: `document` is undefined under the node test
  // environment, so `createMedia` threw straight out of the probe and took the whole AV import with
  // it (caught by asset-queue.test.ts — "a successful AV import is visible-green", ReferenceError:
  // document is not defined). Setup is part of what can fail, so setup belongs in the guarded region.
  let url: string | undefined;
  let el: HTMLVideoElement | HTMLAudioElement | undefined;
  try {
    url = deps.objectUrl(file);
    el = deps.createMedia(kind);
    el.preload = "metadata";
    el.muted = true;
    el.src = url;

    if (!(await once(el, "loadedmetadata", METADATA_TIMEOUT_MS))) return {};

    const out: AvProbe = {};
    // Infinity/NaN are real answers from the platform for streams and some VBR files. Storing either
    // would put "Infinity" in front of a reader, so treat them as "unknown" and omit the field.
    if (Number.isFinite(el.duration) && el.duration > 0) out.duration = el.duration;

    if (kind === "audio") return out;

    const video = el as HTMLVideoElement;
    if (video.videoWidth > 0 && video.videoHeight > 0) {
      out.width = video.videoWidth;
      out.height = video.videoHeight;
    }

    // A frame needs a seek to have completed AND dimensions to draw into. Missing either means no
    // poster — the object still carries its duration, which is the half that always works.
    if (out.width === undefined || out.height === undefined) return out;

    // Seeking to where you ALREADY are fires no `seeked` event, so waiting for one would burn the
    // full timeout and come back with no poster. That is not hypothetical: a MediaRecorder-produced
    // webm carries no container duration, `video.duration` reads Infinity, posterSeekTime therefore
    // returns 0 — and the element is already at 0. Measured in the browser drive
    // (e2e/av-poster.spec.ts). Frame 0 is already decoded once `loadedmetadata` has fired, so there
    // is nothing to wait for in that case.
    const target = posterSeekTime(video.duration);
    if (Math.abs(video.currentTime - target) > 0.01) {
      video.currentTime = target;
      if (!(await once(video, "seeked", SEEK_TIMEOUT_MS))) return out;
    }

    const canvas = deps.createCanvas();
    canvas.width = out.width;
    canvas.height = out.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return out;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    // A blob: URL of a LOCAL file is same-origin, so the canvas is not tainted and toBlob succeeds.
    // (A remote video would taint it and toBlob would throw — hence the catch, and hence why this
    // probe is only ever handed a local File.)
    const poster = await new Promise<Blob | null>((resolve) => {
      try {
        canvas.toBlob((b) => resolve(b), "image/jpeg", 0.82);
      } catch {
        resolve(null);
      }
    });
    if (poster) out.poster = poster;
    return out;
  } catch {
    // Any surprise from the platform is a skipped poster, never a failed import.
    return {};
  } finally {
    try {
      el?.removeAttribute("src");
      el?.load?.();
    } catch { /* teardown is best-effort too */ }
    // Only revoke what was actually minted — `objectUrl` itself may be what threw.
    if (url !== undefined) deps.revokeUrl(url);
  }
}
