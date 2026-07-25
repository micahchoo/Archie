// Runs scripts/perf/ingestbench.ts (INGEST as the caller drives it) in real Chromium.
//
// Same harness shape as run.mjs — see its header for why vite + Chromium and why the pageerror race
// matters. Different page (ingest.html) and no @render/core alias: fsbench.ts imports the fs backends by
// direct path, so the DOMPurify-at-import-time barrel is never pulled in.
//
// Run:  node scripts/perf/ingestrun.mjs        (add HEADED=1 to watch it)
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
  // publishbench pulls the REAL publish graph, which reaches isomorphic-dompurify (a CJS dep with
  // import-time effects). configFile:false means no pre-bundling by default, and that interop failure
  // throws at module-EVALUATION time — uncatchable by the bench, which is how it hung for 13 minutes
  // the first time. Pre-bundle it explicitly.
  // The dzi-tile-worker imports `@render/core` BY BARE NAME, and under a bare server that barrel's
  // isomorphic-dompurify interop throws at module-evaluation time — inside the worker, where it
  // surfaces only as a silent pool fallback to the inline slicer (measured: "pooled" was quietly
  // identical to "inline" before this alias). publishbench itself imports render-core by RELATIVE
  // path, so the real publish graph is unaffected; only the worker's bare specifier is shimmed, to
  // the same geometry-only module bench.ts uses. worker-smoke.mjs is what covers the real graph.
  resolve: { alias: { "@render/core": path.join(HERE, "render-core-shim.ts") } },
  server: { port: 5388, strictPort: true, fs: { allow: [REPO] } },
});
await server.listen();
console.log("• bench server http://localhost:5388/ingest.html");

const browser = await launchBrowser({ headless: !process.env.HEADED });
const page = await browser.newPage();
page.on("console", (m) => console.log(`  [${m.type()}] ${m.text()}`));

let onPageError;
const failed = new Promise((_, reject) => { onPageError = reject; });
page.on("pageerror", (e) => { console.log(`  [pageerror] ${e.message}`); onPageError(e); });

await page.goto("http://localhost:5388/ingest.html", { waitUntil: "load" });
console.log("• running…\n");

let results;
try {
  results = await Promise.race([
    page.waitForFunction(() => window.__BENCH__, null, { timeout: 600_000 }).then((h) => h.jsonValue()),
    failed,
  ]);
} finally {
  await browser.close().catch(() => {});
  await server.close().catch(() => {});
}

console.log("\n--- JSON ---");
console.log(JSON.stringify(results, null, 2));
process.exit(results?.error ? 1 : 0);
