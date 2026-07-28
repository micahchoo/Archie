// Archie-7e6f H3 — "Can Chromium transcode video in the browser, and what is still missing?"
//
// A Node probe, NO UI, no dev server: it opens a blank secure-context page in real Chromium and asks
// the platform directly. The question it answers is narrow and worth stating, because the tempting
// wrong answer is one word:
//
//   NOT "does VideoEncoder exist" — it does, on Chromium — but "is VideoEncoder ENOUGH to convert an
//   author's video file into a publishable video file?"
//
// It is not, and the gap is structural rather than a matter of browser version. WebCodecs specifies
// codecs and NOTHING about containers: there is no demuxer to pull coded chunks out of the author's
// .mov/.mp4, and no muxer to write encoded chunks into a file a `<video>` element can play. That is
// the whole of H3's finding, and it is why this ticket leaves the Chromium path DESIGNED, NOT BUILT:
// closing it requires a new runtime dependency, and adding one is the user's call in this repo.
//
// The probe prints the SUBJECT, not just a verdict (.claude/rules/post-review-fixes-are-unreviewed.md
// §1a) — every config it tried, and the mux/demux surface it searched for by name — so a future
// reader can tell "Chromium gained a muxer" from "the probe stopped looking".
//
// ── PRIOR ART: freecut, and the one thing it corrected in this probe ─────────────────────────────
// freecut (the in-corpus browser video editor) is the specimen for this whole path, and it taught
// this probe something that was wrong in its first draft:
//
//   `VideoEncoder.isConfigSupported()` LIES BY OMISSION. freecut runs a REAL one-frame test encode
//   instead (`src/features/media-library/workers/render-support.ts:261-289`) because the declarative
//   check "omits the output track's frame rate and the sample's display size, while
//   `VideoSampleSource` adds both to the WebCodecs config. Chrome can approve that incomplete HEVC
//   probe and reject the encoder when the first frame arrives."
//
// So this probe does BOTH: the declarative check (§2) and a real encode of one frame (§3). A codec
// that passes §2 and fails §3 is the exact trap freecut hit, and the probe reports the disagreement
// rather than picking a side.
//
// What freecut does NOT support, said plainly: it is no donor for the DESKTOP sidecar half of
// Archie-7e6f. It spawns no encoder and links no native library — `grep -rin ffmpeg` over its source
// returns three hits and every one is prose, with `headless/README.md:107` naming ffmpeg pre-decode
// as explicitly not wired up. Freecut is a pure-browser specimen; the sidecar design claims no
// precedent from it.
//
// It IS the citation for the container gap and for how to close it: freecut carries `mediabunny`
// 1.50.3 for BOTH halves — demux via `new Input({ formats: ALL_FORMATS, source })`
// (`src/features/export/utils/canvas-render-orchestrator.ts:300`) and mux via `new Output({ format,
// target })` with Mp4/WebM/Mov/Mkv output formats (`src/features/export/utils/client-renderer.ts:267-297`).
// `mp4box.js`, `webm-muxer`, `mp4-muxer` and `mux.js` appear NOWHERE in it, and there is no
// hand-rolled muxer. That makes mediabunny the concrete candidate if H3 is ever built.
//
// Run:
//   node scripts/probe/webcodecs-video.mjs
//
// It needs `playwright` from the repo root's node_modules; nothing else, and no network.

import { chromium } from "playwright";
import { createServer } from "node:http";

const SYSTEM_CHROMIUM = "/usr/bin/chromium-browser";

/** The web-tier candidates from apps/studio/src/video-transcode.ts, plus the two audio partners.
 *  `avc1.640028` is H.264 High@4.0; `vp09.00.10.08` is VP9 Profile 0, level 1.0, 8-bit. */
const VIDEO_CONFIGS = [
  { label: "H.264 High (web-tier default)", codec: "avc1.640028", width: 1280, height: 720, bitrate: 2_000_000, framerate: 30 },
  { label: "H.264 Baseline", codec: "avc1.42001E", width: 1280, height: 720, bitrate: 2_000_000, framerate: 30 },
  { label: "VP9 Profile 0 (web-tier fallback)", codec: "vp09.00.10.08", width: 1280, height: 720, bitrate: 2_000_000, framerate: 30 },
  { label: "VP8", codec: "vp8", width: 1280, height: 720, bitrate: 2_000_000, framerate: 30 },
  { label: "AV1 Main", codec: "av01.0.04M.08", width: 1280, height: 720, bitrate: 1_200_000, framerate: 30 },
];

const AUDIO_CONFIGS = [
  { label: "AAC-LC", codec: "mp4a.40.2", sampleRate: 48000, numberOfChannels: 2, bitrate: 128_000 },
  { label: "Opus", codec: "opus", sampleRate: 48000, numberOfChannels: 2, bitrate: 96_000 },
];

/** The container work WebCodecs does NOT do. Probed by name so the absence is a measurement rather
 *  than an assertion — if any of these ever appears on the platform, this probe says so. */
const CONTAINER_SURFACE = [
  "VideoDecoder", // present: decodes CHUNKS, but something must produce the chunks from a file
  "AudioDecoder",
  "ImageDecoder",
  "MediaRecorder", // the closest native muxer, and it can only record a live stream in real time
  "MediaSource",
  "ManagedMediaSource",
  // Names that would indicate a real demux/mux surface. None of these are specified anywhere today.
  "MediaContainerDecoder",
  "MediaContainerEncoder",
  "VideoMuxer",
  "VideoDemuxer",
];

async function launch() {
  try {
    return await chromium.launch({ headless: true });
  } catch (e) {
    console.log(`  bundled chromium failed (${String(e.message).slice(0, 80)}); trying system chromium`);
    return await chromium.launch({
      headless: true,
      executablePath: SYSTEM_CHROMIUM,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
  }
}

async function main() {
  // WebCodecs is SECURE-CONTEXT ONLY, and `about:blank` is NOT one.
  //
  // The first draft of this probe used about:blank and duly reported `VideoEncoder: false` on a
  // Chromium that has had VideoEncoder for years — a confident verdict about nothing, of exactly the
  // shape .claude/rules/post-review-fixes-are-unreviewed.md §1a warns about. It was caught only
  // because the probe prints `isSecureContext` next to the verdict. `http://localhost` IS treated as
  // potentially trustworthy, so a one-line static server is the whole fix.
  const server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html" });
    res.end("<!doctype html><title>webcodecs probe</title>");
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;

  const browser = await launch();
  const page = await browser.newPage();
  await page.goto(`http://localhost:${port}/`);

  const ua = await page.evaluate(() => navigator.userAgent);
  const secure = await page.evaluate(() => window.isSecureContext);
  console.log(`\n=== subject ===`);
  console.log(`  origin:         http://localhost:${port}/`);
  console.log(`  userAgent:      ${ua}`);
  console.log(`  isSecureContext:${secure}  (WebCodecs is secure-context only)`);
  if (!secure) {
    // Refuse to report a verdict from a context that could not have had the API in the first place.
    console.error(
      "\nABORT: not a secure context, so an absent VideoEncoder would mean nothing. No verdict reported.",
    );
    await browser.close();
    server.close();
    process.exit(2);
  }

  const result = await page.evaluate(
    async ({ videoConfigs, audioConfigs, containerSurface }) => {
      const out = {
        videoEncoder: typeof globalThis.VideoEncoder !== "undefined",
        audioEncoder: typeof globalThis.AudioEncoder !== "undefined",
        video: [],
        audio: [],
        surface: {},
      };
      if (out.videoEncoder) {
        for (const c of videoConfigs) {
          const { label, ...cfg } = c;
          try {
            const s = await globalThis.VideoEncoder.isConfigSupported(cfg);
            out.video.push({ label, codec: cfg.codec, supported: !!s.supported });
          } catch (e) {
            out.video.push({ label, codec: cfg.codec, supported: false, error: String(e).slice(0, 120) });
          }
        }
      }
      if (out.audioEncoder) {
        for (const c of audioConfigs) {
          const { label, ...cfg } = c;
          try {
            const s = await globalThis.AudioEncoder.isConfigSupported(cfg);
            out.audio.push({ label, codec: cfg.codec, supported: !!s.supported });
          } catch (e) {
            out.audio.push({ label, codec: cfg.codec, supported: false, error: String(e).slice(0, 120) });
          }
        }
      }
      for (const name of containerSurface) out.surface[name] = name in globalThis;

      // §3 — the REAL encode, per freecut's render-support.ts:261-289. isConfigSupported omits the
      // frame rate and the sample's display size that a real encode supplies, so it can approve a
      // config the encoder then refuses on the first frame. One frame is enough to find that out,
      // and it needs no muxer: we count output chunks, we do not write a file.
      out.realEncode = [];
      if (out.videoEncoder && typeof globalThis.OffscreenCanvas !== "undefined" && typeof globalThis.VideoFrame !== "undefined") {
        for (const c of videoConfigs) {
          const { label, ...cfg } = c;
          const attempt = { label, codec: cfg.codec, chunks: 0, ok: false, error: null };
          try {
            const canvas = new OffscreenCanvas(cfg.width, cfg.height);
            const ctx = canvas.getContext("2d");
            ctx.fillStyle = "#3a5f3a";
            ctx.fillRect(0, 0, cfg.width, cfg.height);
            await new Promise((resolve) => {
              const enc = new globalThis.VideoEncoder({
                output: () => { attempt.chunks++; },
                error: (e) => { attempt.error = String(e).slice(0, 140); resolve(); },
              });
              try {
                enc.configure(cfg);
                const frame = new globalThis.VideoFrame(canvas, { timestamp: 0, duration: 33333 });
                enc.encode(frame, { keyFrame: true });
                frame.close();
                enc.flush().then(() => { try { enc.close(); } catch {} resolve(); }, (e) => {
                  attempt.error = String(e).slice(0, 140);
                  resolve();
                });
              } catch (e) {
                attempt.error = String(e).slice(0, 140);
                resolve();
              }
              // A configure() that neither errors nor produces a chunk must not hang the probe.
              setTimeout(resolve, 8000);
            });
            attempt.ok = attempt.chunks > 0;
          } catch (e) {
            attempt.error = String(e).slice(0, 140);
          }
          out.realEncode.push(attempt);
        }
      }
      return out;
    },
    { videoConfigs: VIDEO_CONFIGS, audioConfigs: AUDIO_CONFIGS, containerSurface: CONTAINER_SURFACE },
  );

  console.log(`\n=== 1. does the ENCODER exist? ===`);
  console.log(`  VideoEncoder: ${result.videoEncoder}`);
  console.log(`  AudioEncoder: ${result.audioEncoder}`);

  console.log(`\n=== 2. which CODECS can it encode? (VideoEncoder.isConfigSupported) ===`);
  for (const r of result.video) {
    console.log(`  ${r.supported ? "YES" : "no "}  ${r.label.padEnd(34)} ${r.codec}${r.error ? `  (${r.error})` : ""}`);
  }
  for (const r of result.audio) {
    console.log(`  ${r.supported ? "YES" : "no "}  ${r.label.padEnd(34)} ${r.codec}${r.error ? `  (${r.error})` : ""}`);
  }

  console.log(`\n=== 3. REAL one-frame encode (freecut render-support.ts:261-289 — the declarative check lies) ===`);
  for (const r of result.realEncode ?? []) {
    console.log(
      `  ${r.ok ? "YES" : "no "}  ${r.label.padEnd(34)} chunks=${r.chunks}${r.error ? `  (${r.error})` : ""}`,
    );
  }
  const declarative = new Map(result.video.map((r) => [r.codec, r.supported]));
  const disagreements = (result.realEncode ?? []).filter((r) => declarative.get(r.codec) !== r.ok);
  if (disagreements.length) {
    console.log(`\n  !! ${disagreements.length} codec(s) where isConfigSupported DISAGREES with a real encode:`);
    for (const d of disagreements) {
      console.log(`     ${d.codec}: isConfigSupported=${declarative.get(d.codec)} realEncode=${d.ok}`);
    }
    console.log(`     This is exactly freecut's finding. Trust the real encode.`);
  } else {
    console.log(`\n  (declarative check and real encode agree on all ${result.realEncode?.length ?? 0} codecs here)`);
  }

  console.log(`\n=== 4. the CONTAINER surface — the half WebCodecs does not provide ===`);
  for (const [name, present] of Object.entries(result.surface)) {
    console.log(`  ${present ? "present" : "ABSENT "}  ${name}`);
  }

  // The real encode is the authority (freecut), so the verdict counts THAT, not isConfigSupported.
  const encodableVideo = (result.realEncode ?? []).filter((r) => r.ok).map((r) => r.label);
  const hasMuxer = result.surface.VideoMuxer || result.surface.MediaContainerEncoder;
  const hasDemuxer = result.surface.VideoDemuxer || result.surface.MediaContainerDecoder;

  // The AUDIO half decides whether the two implementations can agree on a container, which the
  // ticket requires ("two implementations must produce compatible output"). A browser that encodes
  // H.264 video but cannot encode AAC cannot produce the desktop sidecar's MP4 target at all.
  const audioOk = result.audio.filter((r) => r.supported).map((r) => r.codec);
  const canDoMp4Pair = audioOk.includes("mp4a.40.2") && (result.realEncode ?? []).some((r) => r.ok && r.codec.startsWith("avc1"));

  console.log(`\n=== VERDICT ===`);
  console.log(`  can encode frames:      ${encodableVideo.length > 0} ${encodableVideo.length ? `(${encodableVideo.join(", ")})` : ""}`);
  console.log(`  audio codecs available: ${audioOk.length ? audioOk.join(", ") : "NONE"}`);
  console.log(`  can produce H.264+AAC:  ${canDoMp4Pair}   <- the desktop sidecar's target`);
  if (!canDoMp4Pair) {
    console.log(`
  NOTE, and it is a bigger obstacle than the muxer: this browser cannot encode the AUDIO half
  of the web-tier target. Even handed a muxer it could not produce H.264+AAC/MP4, so a WebCodecs
  path would have to emit VP9+Opus/WebM — a DIFFERENT artifact from the desktop sidecar's. The
  ticket requires the two implementations to produce compatible output, so this alone makes H3
  more than a dependency decision. (Caveat worth checking before acting: this is Chrome for
  Testing / headless. A branded Chrome build may carry codecs this one does not — re-run there
  before concluding anything about real users.)`);
  }
  console.log(`  can DEMUX an input file: ${!!hasDemuxer}`);
  console.log(`  can MUX an output file:  ${!!hasMuxer}`);
  console.log(
    `  => in-browser transcode is ${encodableVideo.length > 0 && hasMuxer && hasDemuxer ? "POSSIBLE with platform APIs alone" : "NOT possible with platform APIs alone"}`,
  );
  if (encodableVideo.length > 0 && !(hasMuxer && hasDemuxer)) {
    console.log(`
  The encoder is real and the container work is missing, which is exactly the H3 finding:
  a Chromium WebCodecs transcode needs a DEPENDENCY to demux the author's file and mux the
  result. Candidates, none of them added by this ticket:

    mediabunny   demux + mux in one package (MP4/WebM/Mov/Mkv), WebCodecs-native API.
                 THE PRECEDENTED CHOICE: freecut carries exactly this, 1.50.3, for both
                 halves, and carries no other muxer at all.
    mp4box.js    demux + mux, MP4 only, older and more widely deployed.
    mp4-muxer /  mux ONLY — you would still need a separate demuxer for the input, so this
    webm-muxer   is two dependencies wearing one hat.

  Adding a runtime dependency is the user's decision in this repo, so H3 stops here. Note also
  that MediaRecorder is NOT a shortcut: it muxes only a LIVE MediaStream in real time, so a
  30-minute video takes 30 minutes and the quality knobs a tier needs are not exposed.`);
  }

  await browser.close();
  server.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
