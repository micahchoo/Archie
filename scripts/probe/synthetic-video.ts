// The synthetic-video subject, run INSIDE real Chromium (driven by synthetic-video.mjs).
//
// Archie-e870 gap 2: every test of the browser transcode seam (`video-transcode-web.ts`) runs under
// jsdom, which has no WebCodecs — `mediabunny` is mocked everywhere — so NOTHING before this
// harness showed that real Chromium actually produces a playable file. This page closes that with
// one end-to-end pass over the REAL seam (no mock, no shim, no alias to a fake):
//
//   1. CAPS      — `probeBrowserVideoCaps()` + `pickTarget()`: the ONE decision the studio makes,
//                  taken here against this very browser's encoders.
//   2. SOURCE    — a synthetic video synthesized in THIS page: an animated canvas
//                  (`canvas.captureStream()`) + a 440 Hz oscillator (so the audio leg of the
//                  transcode is exercised, not just video), recorded by MediaRecorder. The content
//                  is deliberately high-entropy (noise blocks over a moving gradient + a frame
//                  counter) so the encoder cannot "win" by emitting keyframes of a flat fill.
//   3. TRANSCODE — the real `transcodeVideoInBrowser()` over that source, exactly the call
//                  publish-flows makes.
//   4. DECODE    — the oracle. Not "bytes came back": the output is
//        a. demuxed and DECODED frame-by-frame through mediabunny → the browser's real `VideoDecoder`
//           (frames counted, dimensions checked, every sample closed — freecut lesson 7), and
//        b. played through a `<video>` element, seeked to two different times, with the decoded
//           pictures compared — distinct, non-flat pictures prove pixels actually came out of the
//           decoder, not just metadata.
//
// The result object also measures output bytes against the stated-bitrate model
// (`webBitrateKbps + audioKbps`) × decoded duration — the model `archive-probe.ts` uses for web-tier
// video — so the size estimate gets one real data point instead of only its derivation.
import { pickTarget, unavailableReason } from "../../apps/studio/src/video-profiles.ts";
import { probeBrowserVideoCaps, transcodeVideoInBrowser } from "../../apps/studio/src/video-transcode-web.ts";

const out = document.querySelector("#out")!;
const say = (s: string) => { out.textContent += s + "\n"; console.log(s); };

const REC_SECONDS = 3;
const REC_W = 640, REC_H = 360, REC_FPS = 30;
const REC_BPS = 2_500_000;

/** MediaRecorder's codec string for the SOURCE. VP9 preferred so source and (likely) target share a
 *  codec — the transcode then still pays the full demux/decode/re-encode/mux round trip, and if the
 *  browser hands the target a different codec the measurement is unaffected either way. */
const REC_MIMES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm;codecs=vp9",
  "video/webm",
];

async function recordSource(): Promise<{ blob: Blob; audio: boolean; recorderMime: string; framesDrawn: number }> {
  const canvas = document.createElement("canvas");
  canvas.width = REC_W; canvas.height = REC_H;
  const ctx = canvas.getContext("2d")!;

  let frames = 0;
  let raf = 0;
  const draw = (t: number) => {
    frames++;
    const hue = (t / 30) % 360;
    const g = ctx.createLinearGradient(0, 0, REC_W, REC_H);
    g.addColorStop(0, `hsl(${hue} 70% 40%)`);
    g.addColorStop(1, `hsl(${(hue + 120) % 360} 70% 60%)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, REC_W, REC_H);
    // Noise blocks that MOVE every frame — representative encoder work, and it makes two frames at
    // different timestamps differ, which the decode oracle at the end relies on.
    for (let i = 0; i < 300; i++) {
      const x = (i * 613 + frames * 37) % REC_W;
      const y = (i * 911 + frames * 53) % REC_H;
      ctx.fillStyle = `rgb(${(i * 97) % 255},${(i * 57) % 255},${(i * 31) % 255})`;
      ctx.fillRect(x, y, 16, 16);
    }
    ctx.fillStyle = "#fff";
    ctx.font = "bold 40px monospace";
    ctx.fillText(`frame ${frames}`, 20, REC_H - 24);
    raf = requestAnimationFrame(draw);
  };
  raf = requestAnimationFrame(draw);

  const stream = canvas.captureStream(REC_FPS);

  // Audio leg: a real oscillator through a MediaStreamDestination, so the transcode's audio track
  // (Opus, for the VP9 target) has actual samples to carry. Graceful fallback: some headless realms
  // refuse to run an AudioContext — the harness then records video-only and says so, it never
  // pretends the audio leg was exercised.
  let audio = false;
  let osc: OscillatorNode | null = null;
  let ac: AudioContext | null = null;
  try {
    ac = new AudioContext();
    await ac.resume().catch(() => {});
    if (ac.state === "running") {
      osc = ac.createOscillator();
      osc.frequency.value = 440;
      const gain = ac.createGain();
      gain.gain.value = 0.15;
      const dest = ac.createMediaStreamDestination();
      osc.connect(gain).connect(dest);
      osc.start();
      for (const t of dest.stream.getAudioTracks()) stream.addTrack(t);
      audio = true;
    }
  } catch { audio = false; }

  const recorderMime = REC_MIMES.find((m) => MediaRecorder.isTypeSupported(m));
  if (!recorderMime) throw new Error(`MediaRecorder supports none of: ${REC_MIMES.join(", ")}`);
  const rec = new MediaRecorder(stream, { mimeType: recorderMime, videoBitsPerSecond: REC_BPS });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
  const stopped = new Promise<void>((res) => { rec.onstop = () => res(); });
  rec.start(250);
  await new Promise((r) => setTimeout(r, REC_SECONDS * 1000));
  rec.stop();
  await stopped;
  cancelAnimationFrame(raf);
  osc?.stop();
  await ac?.close().catch(() => {});
  return { blob: new Blob(chunks, { type: recorderMime }), audio, recorderMime, framesDrawn: frames };
}

/** Demux + inspect via mediabunny: codec, dimensions, PACKET-SCANNED duration (MediaRecorder WebM
 *  famously writes no duration metadata — computeDuration reads packets, so it is exact). */
async function inspectBlob(blob: Blob) {
  const mb: any = await import("mediabunny");
  const input = new mb.Input({ formats: mb.ALL_FORMATS, source: new mb.BlobSource(blob) });
  const v = await input.getPrimaryVideoTrack();
  if (!v) throw new Error("no video track");
  const a = await input.getPrimaryAudioTrack();
  return {
    codec: await v.getCodec(),
    width: v.displayWidth,
    height: v.displayHeight,
    durationSec: await v.computeDuration(),
    audio: a ? { codec: await a.getCodec(), channels: a.numberOfChannels, sampleRate: a.sampleRate } : null,
    input,
    v,
  };
}

/** ORACLE a — decode real frames out of the transcoded file through the browser's VideoDecoder
 *  (mediabunny's sink drives WebCodecs under the hood). Every sample is closed: the frames are
 *  reference-counted GPU memory, not GC-managed (docs/research/freecut-lessons.md lesson 7). */
async function decodeProof(blob: Blob) {
  const mb: any = await import("mediabunny");
  const input = new mb.Input({ formats: mb.ALL_FORMATS, source: new mb.BlobSource(blob) });
  const v = await input.getPrimaryVideoTrack();
  if (!v) throw new Error("DECODE FAILED: transcoded output has no video track");
  const decodable = await v.canDecode();
  if (!decodable) throw new Error("DECODE FAILED: track.canDecode() is false for the transcoded output");

  const sink = new mb.VideoSampleSink(v);
  let count = 0;
  let first: { t: number; w: number; h: number } | null = null;
  let last: { t: number; w: number; h: number } | null = null;
  for await (const s of sink.samples()) {
    first ??= { t: s.timestamp, w: s.displayWidth, h: s.displayHeight };
    last = { t: s.timestamp, w: s.displayWidth, h: s.displayHeight };
    count++;
    s.close();
    if (count >= 12) break;
  }
  if (count === 0) throw new Error("DECODE FAILED: VideoSampleSink yielded zero frames from the output");

  const a = await input.getPrimaryAudioTrack();
  return {
    decodable,
    codec: await v.getCodec(),
    width: v.displayWidth,
    height: v.displayHeight,
    durationSec: await v.computeDuration(),
    framesDecoded: count,
    first,
    last,
    audio: a
      ? { codec: await a.getCodec(), decodable: await a.canDecode(), durationSec: await a.computeDuration() }
      : null,
  };
}

/** ORACLE b — play the output the way a visitor's browser would: a `<video>` element, metadata
 *  loaded, play() started, then seeked to two different times. The decoded pictures must be
 *  non-flat and DIFFERENT from each other — that is what distinguishes "decodes" from "loads". */
async function elementProof(blob: Blob, expectDurationSec: number) {
  const url = URL.createObjectURL(blob);
  const v = document.createElement("video");
  v.muted = true;
  v.preload = "auto";
  v.src = url;
  try {
    await new Promise((res, rej) => {
      v.onloadedmetadata = () => res(null);
      v.onerror = () => rej(new Error(`ELEMENT FAILED: video element error ${v.error?.code} (${v.error?.message})`));
    });
    await v.play();

    const grab = async (t: number): Promise<Uint8ClampedArray> => {
      v.currentTime = t;
      await new Promise((res) => { v.onseeked = () => res(null); });
      const c = document.createElement("canvas");
      c.width = v.videoWidth;
      c.height = v.videoHeight;
      const c2d = c.getContext("2d")!;
      c2d.drawImage(v, 0, 0);
      return c2d.getImageData(0, 0, c.width, c.height).data;
    };

    const t1 = Math.min(0.2, expectDurationSec / 4);
    const t2 = Math.max(t1 + 0.1, expectDurationSec * 0.75);
    const a = await grab(t1);
    const b = await grab(t2);

    // Luminance spread over one frame — a flat/blank decode has ~0 spread.
    let lo = 255, hi = 0;
    for (let i = 0; i < a.length; i += 4 * 97) {
      const l = 0.299 * a[i]! + 0.587 * a[i + 1]! + 0.114 * a[i + 2]!;
      if (l < lo) lo = l;
      if (l > hi) hi = l;
    }
    // Fraction of sampled pixels that meaningfully differ between the two times.
    let diff = 0, sampled = 0;
    for (let i = 0; i < a.length; i += 4 * 97) {
      sampled++;
      if (Math.abs(a[i]! - b[i]!) > 8 || Math.abs(a[i + 1]! - b[i + 1]!) > 8) diff++;
    }

    v.pause();
    return {
      videoWidth: v.videoWidth,
      videoHeight: v.videoHeight,
      durationSec: v.duration,
      pixelSpread: Math.round(hi - lo),
      frameDiffFraction: sampled > 0 ? diff / sampled : 0,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}


/** The transcoded output, stashed by run() so the SAVE path can lift it to disk. */
let lastConverted: Blob | null = null;

declare global {
  interface Window {
    __RESULT__?: unknown;
    __OUTPUT_B64__?: string;
  }
}
async function run() {
  say("• probing this browser's encoders…");
  const caps = await probeBrowserVideoCaps();
  say(`  caps: ${JSON.stringify(caps)}`);
  const target = pickTarget(caps);
  if (!target) throw new Error(`pickTarget returned null — ${unavailableReason(caps)}`);
  say(`• target: ${target.codec} .${target.ext} (${target.webBitrateKbps}+${target.audioKbps} kbps, maxH ${target.maxHeight})`);

  say(`• recording a ${REC_SECONDS}s ${REC_W}x${REC_H}@${REC_FPS} synthetic source (canvas + MediaRecorder)…`);
  const src = await recordSource();
  say(`  source: ${src.blob.size.toLocaleString()} B via ${src.recorderMime}, ${src.framesDrawn} frames drawn, audio track: ${src.audio}`);
  const srcFacts = await inspectBlob(src.blob);
  say(`  source demuxes as ${srcFacts.codec} ${srcFacts.width}x${srcFacts.height}, ${srcFacts.durationSec.toFixed(2)}s, audio: ${JSON.stringify(srcFacts.audio)}`);

  say("• transcoding through the REAL browser seam (transcodeVideoInBrowser)…");
  let progressCalls = 0;
  let lastProgress = -1;
  const t0 = performance.now();
  const converted = await transcodeVideoInBrowser(src.blob, {
    target,
    onProgress: (p) => { progressCalls++; lastProgress = p; },
  });
  lastConverted = converted;
  const encodeMs = Math.round(performance.now() - t0);
  say(`  output: ${converted.size.toLocaleString()} B (${converted.type}) in ${encodeMs} ms, ${progressCalls} progress ticks, last=${lastProgress.toFixed(3)}`);

  say("• ORACLE a — demuxing + decoding output frames via mediabunny/WebCodecs…");
  const decode = await decodeProof(converted);
  say(`  decoded ${decode.framesDecoded} frames of ${decode.codec} ${decode.width}x${decode.height}, ${decode.durationSec.toFixed(2)}s, audio: ${JSON.stringify(decode.audio)}`);

  say("• ORACLE b — playing output in a <video> element and comparing decoded pictures…");
  const element = await elementProof(converted, decode.durationSec);
  say(`  element: ${element.videoWidth}x${element.videoHeight}, ${element.durationSec.toFixed(2)}s, pixel spread ${element.pixelSpread}, differing pixels between times: ${(element.frameDiffFraction * 100).toFixed(1)}%`);

  // The size measurement: the stated-bitrate model `archive-probe.ts` `videoWebBytes` uses, against
  // what this real encode produced.
  const predictedBytes = Math.round(((target.webBitrateKbps + target.audioKbps) * 1000 * decode.durationSec) / 8);
  const sizeModel = {
    predictedBytes,
    measuredBytes: converted.size,
    measuredOverPredicted: +(converted.size / predictedBytes).toFixed(3),
  };
  say(`• size model: predicted ${predictedBytes.toLocaleString()} B (stated bitrate × duration), measured ${converted.size.toLocaleString()} B (${(sizeModel.measuredOverPredicted * 100).toFixed(0)}%)`);

  return {
    caps,
    target: { codec: target.codec, ext: target.ext, webBitrateKbps: target.webBitrateKbps, audioKbps: target.audioKbps, maxHeight: target.maxHeight },
    source: {
      bytes: src.blob.size,
      recorderMime: src.recorderMime,
      audioTrack: src.audio,
      framesDrawn: src.framesDrawn,
      codec: srcFacts.codec,
      width: srcFacts.width,
      height: srcFacts.height,
      durationSec: srcFacts.durationSec,
    },
    transcode: { outBytes: converted.size, encodeMs, progressCalls, lastProgress },
    decode,
    element,
    sizeModel,
  };
}

run()
  .then(async (result) => {
    say("\n• PASS — harness result below");
    window.__RESULT__ = result;
    // For SAVE=<path>: the driver lifts the encoded artifact to disk so a human can play it.
    if (lastConverted) {
      const bytes = new Uint8Array(await lastConverted.arrayBuffer());
      let s = "";
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      window.__OUTPUT_B64__ = btoa(s);
    }
  })
  .catch((e) => {
    say(`\n• FAIL: ${e instanceof Error ? e.stack ?? e.message : String(e)}`);
    window.__RESULT__ = { error: e instanceof Error ? e.message : String(e) };
  });

