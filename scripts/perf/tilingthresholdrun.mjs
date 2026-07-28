// Runs scripts/perf/tilingthresholdbench.ts (Archie-86ff — where the tiling threshold sits) in real
// Chromium. Same harness shape as publishrun.mjs — see its header for why vite + Chromium and why the
// pageerror race matters, and why @render/core is aliased for the dzi-tile-worker's bare specifier
// (the worker's bare `@render/core` import hits isomorphic-dompurify's CJS interop under a bare vite
// server and silently degrades tiling to the inline slicer if not shimmed — publishbench.ts's finding,
// inherited here since this bench drives the same worker path via sliceToDziAuto).
//
// Run:  node scripts/perf/tilingthresholdrun.mjs        (add HEADED=1 to watch it)
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";
import { launchBrowser } from "../lib/driver.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");

const req = createRequire(path.join(REPO, "apps/studio/package.json"));
const { createServer } = await import(pathToFileURL(req.resolve("vite")).href);

const server = await createServer({
  root: HERE,
  configFile: false,
  logLevel: "warn",
  resolve: { alias: { "@render/core": path.join(HERE, "render-core-shim.ts") } },
  server: { port: 5397, strictPort: true, fs: { allow: [REPO] } },
});
await server.listen();
console.log("• bench server http://localhost:5397/tilingthreshold.html");

const browser = await launchBrowser({ headless: !process.env.HEADED });
const page = await browser.newPage();
page.on("console", (m) => console.log(`  [${m.type()}] ${m.text()}`));

let onPageError;
const failed = new Promise((_, reject) => { onPageError = reject; });
page.on("pageerror", (e) => { console.log(`  [pageerror] ${e.message}`); onPageError(e); });

await page.goto("http://localhost:5397/tilingthreshold.html", { waitUntil: "load" });
console.log("• running… (7 dimensions x 2 modes x 3 runs — allow a couple of minutes)\n");

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

console.log("\n--- JSON ---");
console.log(JSON.stringify(results, null, 2));
process.exit(results?.error ? 1 : 0);
