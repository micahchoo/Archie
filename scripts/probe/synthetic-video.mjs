// Synthetic-video harness driver — the REAL-Chromium leg of Archie-e870 gap 2.
//
// Every test of the browser transcode seam (`apps/studio/src/video-transcode-web.ts`) runs under
// jsdom, which has no WebCodecs, so `mediabunny` is mocked everywhere and nothing proved that real
// Chromium produces a PLAYABLE file. This driver runs one end-to-end pass in actual Chromium:
// synthesized source (canvas.captureStream + MediaRecorder + an oscillator) → the REAL
// `transcodeVideoInBrowser()` → and the output is then DECODED two independent ways (mediabunny's
// WebCodecs-backed frame sink; a `<video>` element with picture comparison). "Bytes came back" is
// not the claim; "frames come out of the decoder" is.
//
// Vite (not esbuild) serves the page: the subject imports the real studio seam, whose bare
// `mediabunny` specifier must resolve as it does in the app. Chromium (not Node) because
// canvas/MediaRecorder/AudioContext/VideoDecoder do not exist in Node — that is the entire point
// of the harness.
//
// Run:   node scripts/probe/synthetic-video.mjs        (HEADED=1 to watch; SAVE=/tmp/out.webm to
//                                                       lift the encoded artifact to disk)
// Needs: playwright from the repo root's node_modules; no network.
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";
import { writeFile, access, readFile } from "node:fs/promises";
import { launchBrowser } from "../lib/driver.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");

const req = createRequire(path.join(REPO, "apps/studio/package.json"));
// The page imports `mediabunny` bare, but the page lives under scripts/ — vite would walk up and
// find no mediabunny there, so the specifier is aliased to the file the app itself loads. Resolving
// it naively (`req.resolve("mediabunny")`) lands on the NODE CJS bundle (`dist/bundles/
// mediabunny.node.cjs`) — the first harness run silently loaded that in Chromium, its import
// failed, and `probeBrowserVideoCaps`'s deliberate catch reported all-false caps: a green-looking
// "this browser cannot" that was really "the harness handed the browser the wrong build". So the
// browser ESM entry is read out of the package's own exports map, and its absence is fatal here.
const MB_PKG = path.dirname(path.dirname(path.dirname(req.resolve("mediabunny"))));
const MB_EXPORTS = JSON.parse(await readFile(path.join(MB_PKG, "package.json"), "utf8")).exports["."];
const MB_ENTRY = path.join(MB_PKG, MB_EXPORTS.browser.import);
await access(MB_ENTRY); // fatal if the layout moved — never alias to a missing file

// pnpm doesn't hoist and vite is not a root dep — resolve it from the app that owns it.
const { createServer } = await import(pathToFileURL(req.resolve("vite")).href);


const server = await createServer({
  root: HERE,
  configFile: false,
  logLevel: "warn",
  resolve: { alias: { mediabunny: MB_ENTRY } },
  server: { port: 5398, strictPort: true, fs: { allow: [REPO] } },
});
await server.listen();
const url = "http://localhost:5398/synthetic-video.html";
console.log(`• harness server ${url}`);

const browser = await launchBrowser({
  headless: !process.env.HEADED,
  // The oscillator and the <video>.play() oracle need a non-suspended media realm; headless has no
  // user gesture to grant it.
  args: ["--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage();
page.on("console", (m) => console.log(`  [${m.type()}] ${m.text()}`));

// A module-evaluation error (bad import) never runs the page script, so __RESULT__ would never be
// set — race the wait against the first pageerror so that failure surfaces in seconds, not minutes
// (same idiom as scripts/perf/run.mjs).
let onPageError;
const failed = new Promise((_, reject) => { onPageError = reject; });
page.on("pageerror", (e) => { console.log(`  [pageerror] ${e.message}`); onPageError(e); });

await page.goto(url, { waitUntil: "load" });

let result;
try {
  result = await Promise.race([
    page.waitForFunction(() => window.__RESULT__ !== undefined, null, { timeout: 180_000 })
      .then(() => page.evaluate(() => window.__RESULT__)),
    failed,
  ]);
} finally {
  if (process.env.SAVE && result && !result.error) {
    const b64 = await page.evaluate(() => window.__OUTPUT_B64__ ?? null);
    if (b64) {
      await writeFile(process.env.SAVE, Buffer.from(b64, "base64"));
      console.log(`• encoded artifact written to ${process.env.SAVE}`);
    } else {
      console.log(`• SAVE requested but no artifact was produced`);
    }
  }
  await browser.close().catch(() => {});
  await server.close().catch(() => {});
}

if (result?.error) {
  console.error(`\nFAIL: ${result.error}`);
  process.exit(1);
}

// ── The acceptance oracle, stated where it is checked ────────────────────────────────────────────
// The page gathers evidence; the DRIVER decides pass/fail, so the claim lives in reviewable code
// and not in whatever the page happened to assert about itself.
const checks = [];
const check = (name, ok, detail) => checks.push({ name, ok, detail });

check("real WebCodecs realm", result.caps?.webCodecsPresent === true, `caps=${JSON.stringify(result.caps)}`);
check("a target was resolved", !!result.target, `${result.target ? result.target.codec : "null"}`);
check("progress flowed through the real conversion", (result.transcode?.progressCalls ?? 0) > 0 && result.transcode.lastProgress > 0,
  `${result.transcode?.progressCalls} ticks, last=${result.transcode?.lastProgress}`);
check("output demuxes with a video track", result.decode?.decodable === true, `codec=${result.decode?.codec}`);
check("frames actually decode (WebCodecs)", (result.decode?.framesDecoded ?? 0) >= 5,
  `${result.decode?.framesDecoded} frames, first t=${result.decode?.first?.t?.toFixed(2)}s, last t=${result.decode?.last?.t?.toFixed(2)}s`);
check("decoded picture is sized like the source", result.decode?.width > 0 && result.decode?.height > 0,
  `${result.decode?.width}x${result.decode?.height} from ${result.source?.width}x${result.source?.height}`);
check("output duration is a real ~3s file", result.decode?.durationSec > 0.6 * 3 && result.decode?.durationSec < 1.6 * 3,
  `${result.decode?.durationSec?.toFixed(2)}s`);
check("audio leg survived when source had audio", !result.source?.audioTrack || result.decode?.audio?.decodable === true,
  `source audio=${result.source?.audioTrack}, output audio=${JSON.stringify(result.decode?.audio)}`);
check("video element loads metadata", result.element?.videoWidth > 0, `${result.element?.videoWidth}x${result.element?.videoHeight}`);
check("video element plays and decodes pictures", result.element?.pixelSpread > 0, `spread=${result.element?.pixelSpread}`);
check("two times decode to DIFFERENT pictures", (result.element?.frameDiffFraction ?? 0) > 0.01,
  `${((result.element?.frameDiffFraction ?? 0) * 100).toFixed(1)}% of sampled pixels differ`);

let failedCheck = false;
for (const c of checks) {
  console.log(`${c.ok ? "  ✓" : "  ✗"} ${c.name} — ${c.detail}`);
  if (!c.ok) failedCheck = true;
}

console.log("\n--- JSON ---");
console.log(JSON.stringify(result, null, 2));
process.exit(failedCheck ? 1 : 0);
