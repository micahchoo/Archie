// Archie-c74e step 4 — publish the 1,000-object library at BOTH tiers into real folders, fixity on.
//
// Run:  node scripts/accept/publish.mjs [--tiers archival,web] [--control 50]
//
// Every server binds its OWN port and FAILS if it is taken — a reused server silently drives another
// worktree's bytes (.claude/rules/viewer-e2e-shared-port.md).
import fs from "node:fs";
import path from "node:path";
import { startSink, walkTree } from "./sink.mjs";
import { runPage, REPO } from "./harness.mjs";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const ROOT = arg("root", "/mnt/Ghar/archie-accept-c74e");
const WORK = path.resolve(arg("work", path.join(ROOT, "work")));
const BASE_URL = arg("base", "https://accept.example/thousand/");
const TIERS = arg("tiers", "archival,web").split(",");
const CONTROL_N = Number(arg("control", "50"));
const VITE_PORT = Number(arg("vite-port", "5416"));
const WORK_PORT = Number(arg("work-port", "5417"));
let nextPort = Number(arg("sink-port", "5418"));

const VIEWER_DIST = path.join(REPO, "packages/archie-viewer/dist");
const viewerFiles = fs.readdirSync(VIEWER_DIST).filter((f) => fs.statSync(path.join(VIEWER_DIST, f)).isFile());
if (!viewerFiles.includes("archie-viewer.js")) throw new Error("packages/archie-viewer/dist has no archie-viewer.js — build it first");
console.log(`• viewer bundle: ${viewerFiles.length} file(s) from ${VIEWER_DIST}`);

const workSink = await startSink(WORK, WORK_PORT);
const sinks = {};
const dirs = {};
const started = [workSink];
for (const tier of TIERS) {
  const dir = path.join(ROOT, `pub-${tier}`);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const s = await startSink(dir, nextPort++);
  sinks[tier] = `http://127.0.0.1:${s.port}`;
  dirs[tier] = dir;
  started.push(s);
  console.log(`• ${tier} sink ${dir} (:${s.port})`);
}
const controlDir = path.join(ROOT, "pub-control");
fs.rmSync(controlDir, { recursive: true, force: true });
fs.mkdirSync(controlDir, { recursive: true });
const controlSink = await startSink(controlDir, nextPort++);
started.push(controlSink);

const qs = new URLSearchParams({
  work: `http://127.0.0.1:${WORK_PORT}`,
  sinks: JSON.stringify(sinks),
  base: BASE_URL,
  tiers: TIERS.join(","),
  control: String(CONTROL_N),
  controlSink: `http://127.0.0.1:${controlSink.port}`,
});

const { results, memory } = await runPage({
  pageUrlPath: `/publish.html?${qs}`,
  port: VITE_PORT,
  allow: [WORK, ...Object.values(dirs), controlDir],
  mounts: { "/viewer-dist": VIEWER_DIST },
  initScript: `window.__VIEWER_FILES__ = ${JSON.stringify(viewerFiles)};`,
});

// MEASURE THE ARTIFACT. The page's `sink writes` tally and a walk of the finished tree are
// independent claims; only the walk is the deliverable.
const onDisk = {};
for (const tier of TIERS) onDisk[tier] = await walkTree(dirs[tier]);
for (const s of started) await s.stop();

const summary = {
  ...results,
  onDisk,
  dirs,
  baseUrl: BASE_URL,
  viewerBundleFiles: viewerFiles.length,
  memory: {
    peakRssBytes: memory.peakRssBytes, peakRssGB: memory.peakRssBytes / 1e9,
    peakProcs: memory.peakProcs, peakAtSec: memory.peakAtSec, samples: memory.samples.length,
    timeline: memory.samples.filter((_, i) => i % Math.max(1, Math.floor(memory.samples.length / 24)) === 0)
      .map((s) => ({ t: Math.round(s.t), gb: +(s.rssBytes / 1e9).toFixed(2) })),
  },
};
fs.writeFileSync(path.join(ROOT, "publish-summary.json"), JSON.stringify(summary, null, 2));
console.log("\n--- publish ---");
console.log(JSON.stringify(summary, null, 2));
process.exit(results?.error ? 1 : 0);
