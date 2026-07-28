// Build the 1,000-master acceptance corpus (Archie-c74e step 1). See corpus.ts for WHY the masters
// are derived from six real digitization masters rather than synthesised.
//
// Run:  node scripts/accept/gen-corpus.mjs [--n 1000] [--out /mnt/.../corpus] [--q 0.92]
//
// The six source masters are the ones `scripts/perf/webptierrun.mjs` downloads and caches into
// /tmp/archie-masters; this script reuses that cache and re-downloads only what is missing, so the
// two runs cannot disagree about what a "parchment folio" is.
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { launchBrowser } from "../lib/driver.mjs";
import { startSink, walkTree } from "./sink.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");
const CACHE = "/tmp/archie-masters";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const N = Number(arg("n", "1000"));
const OUT = path.resolve(arg("out", "/mnt/Ghar/archie-accept-c74e/corpus"));
const QUALITY = arg("q", "0.92");
const VITE_PORT = Number(arg("vite-port", "5411"));
const SINK_PORT = Number(arg("sink-port", "5413"));

// The six masters, copied VERBATIM from scripts/perf/webptierrun.mjs:24-37 so the corpus and the
// tier sweep sample the same classes. A URL that rots is replaced in BOTH places.
const commons = (file) => `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}`;
const MASTERS = [
  ["manuscript-folio.jpg", "https://collections.library.yale.edu/iiif/2/1006076/full/max/0/default.jpg"],
  ["manuscript-foldout.jpg", "https://collections.library.yale.edu/iiif/2/1006194/full/max/0/default.jpg"],
  ["photo-bw-portrait.jpg", `${commons("Migrant_Mother_(LOC_fsa.8b29516).jpg")}?width=4000`],
  ["painting-oil.jpg", `${commons("Vincent_van_Gogh_-_Wheatfield_with_crows_-_Google_Art_Project.jpg")}?width=5000`],
  ["printed-page-incunabulum.jpg", commons("C Valerij Flacci Setini Balbi Argonautic22.jpg")],
  ["herbarium-sheet.jpg", commons("Dracophyllum fiordense lectotype.jpg")],
];

fs.mkdirSync(CACHE, { recursive: true });
for (const [name, url] of MASTERS) {
  const dest = path.join(CACHE, name);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) continue;
  process.stdout.write(`• downloading ${name}… `);
  const r = await fetch(url, { headers: { "User-Agent": "ArchieAccept/1.0 (Archie-c74e)" }, redirect: "follow" });
  if (!r.ok) throw new Error(`${name}: HTTP ${r.status} from ${url}`);
  fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
  console.log(`${(fs.statSync(dest).size / 1048576).toFixed(2)} MB`);
}

fs.mkdirSync(OUT, { recursive: true });
const sink = await startSink(OUT, SINK_PORT);
console.log(`• sink → ${OUT} (127.0.0.1:${SINK_PORT})`);

const req = createRequire(path.join(REPO, "apps/studio/package.json"));
const { createServer } = await import(pathToFileURL(req.resolve("vite")).href);
const server = await createServer({
  root: HERE,
  configFile: false,
  logLevel: "warn",
  server: { port: VITE_PORT, strictPort: true, fs: { allow: [REPO, CACHE] } },
});
await server.listen();

const masterBase = `http://localhost:${VITE_PORT}/@fs${CACHE}`;
const url = `http://localhost:${VITE_PORT}/corpus.html?n=${N}&q=${QUALITY}`
  + `&sink=${encodeURIComponent(`http://127.0.0.1:${SINK_PORT}`)}`
  + `&masters=${encodeURIComponent(masterBase)}`;
console.log(`• builder ${url}`);

const browser = await launchBrowser({ headless: !process.env.HEADED });
const page = await browser.newPage();
page.on("console", (m) => console.log(`  [${m.type()}] ${m.text()}`));
let onPageError;
const failed = new Promise((_, reject) => { onPageError = reject; });
page.on("pageerror", (e) => { console.log(`  [pageerror] ${e.message}`); onPageError(e); });

await page.goto(url, { waitUntil: "load" });
console.log(`• building ${N} masters…\n`);

let results;
try {
  results = await Promise.race([
    page.waitForFunction(() => window.__BENCH__, null, { timeout: 4 * 3600_000 }).then((h) => h.jsonValue()),
    failed,
  ]);
} finally {
  await browser.close().catch(() => {});
  await server.close().catch(() => {});
}

// MEASURE THE ARTIFACT, not the page's own tally — the two are independent claims
// (.claude/rules/svelte-no-typecheck-net.md general form).
const onDisk = await walkTree(OUT);
await sink.stop();
const summary = { ...results, onDisk, sinkStats: sink.stats, outDir: OUT };
fs.writeFileSync(path.join(path.dirname(OUT), "corpus-summary.json"), JSON.stringify(summary, null, 2));
console.log("\n--- corpus ---");
console.log(JSON.stringify(summary, null, 2));
process.exit(results?.error ? 1 : 0);
