// Archie-c74e step 2 — drive the ingest of the 1,000-master corpus into a real folder working store.
//
// Run:  node scripts/accept/ingest.mjs [--n 1000] [--exhibits 20]
//       [--corpus /mnt/Ghar/archie-accept-c74e/corpus] [--work /mnt/Ghar/archie-accept-c74e/work]
import fs from "node:fs";
import path from "node:path";
import { startSink, walkTree } from "./sink.mjs";
import { runPage } from "./harness.mjs";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const ROOT = arg("root", "/mnt/Ghar/archie-accept-c74e");
const CORPUS = path.resolve(arg("corpus", path.join(ROOT, "corpus")));
const WORK = path.resolve(arg("work", path.join(ROOT, "work")));
const N = Number(arg("n", "1000"));
const EXHIBITS = Number(arg("exhibits", "20"));
const BASE_URL = arg("base", "https://accept.example/thousand/");
const VITE_PORT = Number(arg("vite-port", "5412"));
const CORPUS_PORT = Number(arg("corpus-port", "5414"));
const WORK_PORT = Number(arg("work-port", "5415"));

fs.rmSync(WORK, { recursive: true, force: true });
fs.mkdirSync(WORK, { recursive: true });

const corpusSink = await startSink(CORPUS, CORPUS_PORT);
const workSink = await startSink(WORK, WORK_PORT);
console.log(`• corpus sink  ${CORPUS} (:${CORPUS_PORT})`);
console.log(`• working sink ${WORK} (:${WORK_PORT})`);

const qs = new URLSearchParams({
  corpus: `http://127.0.0.1:${CORPUS_PORT}`,
  work: `http://127.0.0.1:${WORK_PORT}`,
  n: String(N), exhibits: String(EXHIBITS), base: BASE_URL,
});

const { results, memory } = await runPage({
  pageUrlPath: `/ingest.html?${qs}`,
  port: VITE_PORT,
  allow: [CORPUS, WORK],
});

// MEASURE THE ARTIFACT (.claude/rules/svelte-no-typecheck-net.md general form): the page's own tally
// and what is on disk are independent claims, and only the second is the deliverable.
const onDisk = await walkTree(WORK);
await corpusSink.stop();
await workSink.stop();

const summary = {
  ...results,
  memory: {
    peakRssBytes: memory.peakRssBytes, peakRssGB: memory.peakRssBytes / 1e9,
    peakProcs: memory.peakProcs, peakAtSec: memory.peakAtSec,
    samples: memory.samples.length,
    // A coarse timeline, so growth-vs-bounded is readable without the full array.
    timeline: memory.samples.filter((_, i) => i % Math.max(1, Math.floor(memory.samples.length / 20)) === 0)
      .map((s) => ({ t: Math.round(s.t), gb: +(s.rssBytes / 1e9).toFixed(2) })),
  },
  onDisk, workDir: WORK,
};
fs.writeFileSync(path.join(ROOT, "ingest-summary.json"), JSON.stringify(summary, null, 2));
console.log("\n--- ingest ---");
console.log(JSON.stringify({ ...summary, memory: { ...summary.memory, timeline: summary.memory.timeline } }, null, 2));
process.exit(results?.error ? 1 : 0);
