// Runs scripts/perf/bench.ts in real Chromium and prints the numbers.
//
// Vite (not esbuild) serves it: it resolves the `@render/core` workspace alias and the `?worker`
// import the pool prototype needs, with no build step. Chromium (not Node) because the whole
// subject — OffscreenCanvas, convertToBlob, DOM canvas, workers — does not exist in Node.
//
// Run:  node scripts/perf/run.mjs        (add HEADED=1 to watch it)
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";
import { launchBrowser } from "../lib/driver.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");

// pnpm doesn't hoist and vite is not a root dep — resolve it from the app that owns it.
const req = createRequire(path.join(REPO, "apps/studio/package.json"));
const { createServer } = await import(pathToFileURL(req.resolve("vite")).href);

const server = await createServer({
  root: HERE,
  configFile: false,
  logLevel: "warn",
  resolve: { alias: { "@render/core": path.join(HERE, "render-core-shim.ts") } },
  server: { port: 5399, strictPort: true, fs: { allow: [REPO] } },
});
await server.listen();
const url = `http://localhost:5399/`;
console.log(`• bench server ${url}`);

const browser = await launchBrowser({ headless: !process.env.HEADED });
const page = await browser.newPage();
page.on("console", (m) => console.log(`  [${m.type()}] ${m.text()}`));

// A module-EVALUATION error (bad import) can't be caught by bench.ts's own try/catch — the module
// never runs — so __BENCH__ is never set and a bare waitForFunction would poll until timeout with
// no output. Race the wait against the first pageerror so that failure surfaces in seconds.
let onPageError;
const failed = new Promise((_, reject) => { onPageError = reject; });
page.on("pageerror", (e) => { console.log(`  [pageerror] ${e.message}`); onPageError(e); });

await page.goto(url, { waitUntil: "load" });
console.log("• running (this takes a few minutes — 8000x6000 × 5 variants)…\n");

const results = await Promise.race([
  page.waitForFunction(() => window.__BENCH__, null, { timeout: 900_000 }).then((h) => h.jsonValue()),
  failed,
]);

console.log(await page.textContent("#out"));
console.log("\n--- JSON ---");
console.log(JSON.stringify(results, null, 2));

await browser.close();
await server.close();
process.exit(results?.error ? 1 : 0);
