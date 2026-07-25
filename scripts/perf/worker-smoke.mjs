// Boots the BUILT studio workers in a real browser and proves they initialise.
//
// WHY THIS EXISTS SEPARATELY FROM bench.ts: the bench aliases @render/core to a pure-geometry shim, so
// it exercises the worker ALGORITHM but not the worker's real import graph. The shipped workers import
// the full @render/core barrel, which re-exports text/sanitize.ts — and that module calls
// DOMPurify.addHook() AT MODULE LOAD. A worker has no `document`, so this is exactly the class of
// import-time explosion that already cost one silent 13-minute hang in this session.
//
// It matters more than a normal smoke test because both worker call sites FALL BACK SILENTLY
// (sliceToDziAuto catches, bake-async catches and counts): a worker that dies on import does not break
// the app, it just quietly reverts to the slow main-thread path while looking fine. Without this check
// the measured win could simply not exist in production.
//
// Run:  node scripts/perf/worker-smoke.mjs      (expects apps/studio/dist — run `pnpm build` first)
import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { launchBrowser } from "../lib/driver.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIST = path.join(REPO, "apps/studio/dist");

const assets = await readdir(path.join(DIST, "assets"));
const workers = assets.filter((f) => /worker.*\.js$/.test(f));
if (workers.length === 0) {
  console.error("✗ no worker chunks in apps/studio/dist/assets — did the build emit them?");
  process.exit(1);
}
console.log(`• found ${workers.length} worker chunk(s): ${workers.join(", ")}`);

const MIME = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".json": "application/json" };
const server = createServer(async (req, res) => {
  try {
    const rel = decodeURIComponent((req.url ?? "/").split("?")[0]);
    const body = await readFile(path.join(DIST, rel));
    res.writeHead(200, { "content-type": MIME[path.extname(rel)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end("nope");
  }
});
await new Promise((r) => server.listen(5398, r));

const browser = await launchBrowser({ headless: true });
const page = await browser.newPage();
page.on("pageerror", (e) => console.log(`  [pageerror] ${e.message}`));
await page.goto("http://localhost:5398/index.html", { waitUntil: "domcontentloaded" }).catch(() => {});

let failed = false;
for (const w of workers) {
  const verdict = await page.evaluate(async (file) => {
    // A tiny real image so "init" does actual work (both workers decode a Blob on init or first task).
    const c = new OffscreenCanvas(64, 64);
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#c33"; ctx.fillRect(0, 0, 64, 64);
    const blob = await c.convertToBlob({ type: "image/jpeg" });

    return await new Promise((resolve) => {
      let wk;
      const done = (v) => { try { wk?.terminate(); } catch {} resolve(v); };
      const timer = setTimeout(() => done({ ok: false, why: "timeout — no reply within 10s" }), 10_000);
      try {
        wk = new Worker(`/assets/${file}`, { type: "module" });
      } catch (e) {
        clearTimeout(timer);
        return done({ ok: false, why: `constructor threw: ${e.message}` });
      }
      // An import-time throw surfaces here, NOT as a message.
      wk.onerror = (e) => { clearTimeout(timer); done({ ok: false, why: `worker error: ${e.message || "import failed"}` }); };
      wk.onmessage = (e) => {
        clearTimeout(timer);
        if (e.data?.kind === "error") return done({ ok: false, why: `worker reported: ${e.data.message}` });
        done({ ok: true, why: `replied ${e.data?.kind}` });
      };
      // Each worker has its OWN protocol — sending both shapes to both makes them report protocol
      // errors that look like failures. dzi-tile-worker: init, expect "ready". bake-worker: a master
      // job, expect "done". (Also: init is async, so a second queued message would be handled while
      // it is still awaiting its decode — "task before init" is that race, not a real defect.)
      if (file.includes("dzi-tile-worker")) wk.postMessage({ kind: "init", blob });
      else wk.postMessage({ kind: "master", id: 1, file: blob, maxDim: 32, mime: "image/jpeg", quality: 0.8 });
    });
  }, w);

  console.log(`  [${verdict.ok ? "PASS" : "FAIL"}] ${w} — ${verdict.why}`);
  if (!verdict.ok) failed = true;
}

await browser.close();
server.close();
console.log(failed ? "\n✗ a shipped worker does not boot — the fast path would silently never run" : "\n✓ all shipped workers boot");
process.exit(failed ? 1 : 0);
