// Runs scripts/perf/fsbench.ts (the publish WRITE path) in real Chromium.
//
// Same harness shape as run.mjs — see its header for why vite + Chromium and why the pageerror race
// matters. Different page (fs.html) and no @render/core alias: fsbench.ts imports the fs backends by
// direct path, so the DOMPurify-at-import-time barrel is never pulled in.
//
// Run:  node scripts/perf/fsrun.mjs        (add HEADED=1 to watch it)
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
  server: { port: 5397, strictPort: true, fs: { allow: [REPO] } },
});
await server.listen();
console.log("• bench server http://localhost:5397/fs.html");

const browser = await launchBrowser({ headless: !process.env.HEADED });
const page = await browser.newPage();
page.on("console", (m) => console.log(`  [${m.type()}] ${m.text()}`));

let onPageError;
const failed = new Promise((_, reject) => { onPageError = reject; });
page.on("pageerror", (e) => { console.log(`  [pageerror] ${e.message}`); onPageError(e); });

await page.goto("http://localhost:5397/fs.html", { waitUntil: "load" });
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
