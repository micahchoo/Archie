// Runs scripts/perf/webptierbench.ts (Archie-7280 — pin the web tier's maxDim + quality) in real
// Chromium. Harness shape from tilingthresholdrun.mjs; see publishrun.mjs's header for why vite +
// Chromium and why the pageerror race matters.
//
// The corpus is SIX real digitization masters, downloaded on first run into /tmp/archie-masters and
// served through vite's /@fs/ escape hatch (they are NOT committed — multi-MB, and their licences are
// the institutions', not ours). Sources are public IIIF / Wikimedia Commons and are listed in MASTERS
// below so the run is reproducible. If a URL rots, replace it with another master of the SAME CLASS
// (parchment folio / film scan / oil painting / letterpress page / herbarium sheet) — the classes are
// what the sweep is sampling, not the particular images.
//
// Run:  node scripts/perf/webptierrun.mjs        (add HEADED=1 to watch it)
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { launchBrowser } from "../lib/driver.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");
const CACHE = "/tmp/archie-masters";

const commons = (file) => `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}`;
const MASTERS = [
  // Parchment manuscript folio — the repo's own Voynich seed material (apps/viewer/fixtures/voynich.ts:22).
  ["manuscript-folio.jpg", "https://collections.library.yale.edu/iiif/2/1006076/full/max/0/default.jpg"],
  // Wide foldout from the same digitization run.
  ["manuscript-foldout.jpg", "https://collections.library.yale.edu/iiif/2/1006194/full/max/0/default.jpg"],
  // B&W large-format film scan (Lange, Migrant Mother — LOC FSA).
  ["photo-bw-portrait.jpg", `${commons("Migrant_Mother_(LOC_fsa.8b29516).jpg")}?width=4000`],
  // Oil-on-canvas painting, Google Art Project capture.
  ["painting-oil.jpg", `${commons("Vincent_van_Gogh_-_Wheatfield_with_crows_-_Google_Art_Project.jpg")}?width=5000`],
  // Letterpress incunabulum page — high-contrast text, the class that behaves least like a photograph.
  ["printed-page-incunabulum.jpg", commons("C Valerij Flacci Setini Balbi Argonautic22.jpg")],
  // Herbarium sheet at 10175x7534 — above MAX_MASTER_DIM, so it exercises the ingest cap.
  ["herbarium-sheet.jpg", commons("Dracophyllum fiordense lectotype.jpg")],
];

fs.mkdirSync(CACHE, { recursive: true });
for (const [name, url] of MASTERS) {
  const dest = path.join(CACHE, name);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) continue;
  process.stdout.write(`• downloading ${name}… `);
  const r = await fetch(url, { headers: { "User-Agent": "ArchieProbe/1.0 (Archie-7280 web-tier sweep)" }, redirect: "follow" });
  if (!r.ok) throw new Error(`${name}: HTTP ${r.status} from ${url}`);
  fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
  console.log(`${(fs.statSync(dest).size / 1048576).toFixed(2)} MB`);
}

const req = createRequire(path.join(REPO, "apps/studio/package.json"));
const { createServer } = await import(pathToFileURL(req.resolve("vite")).href);

const server = await createServer({
  root: HERE,
  configFile: false,
  logLevel: "warn",
  server: { port: 5398, strictPort: true, fs: { allow: [REPO, CACHE] } },
});
await server.listen();
console.log("• bench server http://localhost:5398/webptier.html");

const browser = await launchBrowser({ headless: !process.env.HEADED });
const page = await browser.newPage();
page.on("console", (m) => console.log(`  [${m.type()}] ${m.text()}`));

let onPageError;
const failed = new Promise((_, reject) => { onPageError = reject; });
page.on("pageerror", (e) => { console.log(`  [pageerror] ${e.message}`); onPageError(e); });

await page.goto("http://localhost:5398/webptier.html", { waitUntil: "load" });
console.log("• running… (6 masters x 3 dims x 3 qualities, plus SSIM — a couple of minutes)\n");

let results;
try {
  results = await Promise.race([
    page.waitForFunction(() => window.__BENCH__, null, { timeout: 900_000 }).then((h) => h.jsonValue()),
    failed,
  ]);
} finally {
  await browser.close().catch(() => {});
  await server.close().catch(() => {});
}

fs.writeFileSync(path.join(CACHE, "webptier-results.json"), JSON.stringify(results, null, 2));
console.log(`\n• raw results → ${path.join(CACHE, "webptier-results.json")}`);
process.exit(results?.error ? 1 : 0);
