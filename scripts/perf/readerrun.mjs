// Bench 4 — the READER path, measured on the BUILT viewer in real Chromium.
//
// Both perf sweeps so far were author-side (publish, ingest, the editing spine). This is the path
// most people actually experience: land on a gallery, open an object, see the canvas.
//
// It serves apps/viewer/dist (run `pnpm build` first) and drives LOCAL routes only — the `sampler`
// and `language-atlas` fixtures under public/published. The `voynich` route deliberately loads folios
// from Yale's remote IIIF service, so timing it would measure their CDN, not Archie.
//
// Reported per route:
//   nav→DCL / nav→load  — the document and its subresources
//   hydrated            — the Svelte island is interactive (gallery cards in the DOM)
//   transferred JS      — bytes of script actually pulled for that route
// and for an object open: click → `.openseadragon-canvas` present.
//
// Run:  node scripts/perf/readerrun.mjs        (HEADED=1 to watch)
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { launchBrowser } from "../lib/driver.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIST = path.join(REPO, "apps/viewer/dist");

const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".woff2": "font/woff2", ".txt": "text/plain", ".zip": "application/zip",
};

const server = createServer(async (req, res) => {
  try {
    let rel = decodeURIComponent((req.url ?? "/").split("?")[0]);
    let file = path.join(DIST, rel);
    // Astro emits directory-style routes; serve index.html for a directory request.
    if ((await stat(file).catch(() => null))?.isDirectory()) file = path.join(file, "index.html");
    const body = await readFile(file);
    // content-length matters: without it Playwright's response headers carry no size and every
    // byte total silently reads 0 — which is how the first run of this bench reported "JS 0 KB".
    res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream", "content-length": String(body.byteLength) });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
});
await new Promise((r) => server.listen(5395, r));
const BASE = "http://localhost:5395";
console.log(`• serving apps/viewer/dist at ${BASE}\n`);

const browser = await launchBrowser({ headless: !process.env.HEADED });
const results = {};

for (const route of ["/", "/sampler", "/language-atlas", "/published/sampler"]) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  let jsBytes = 0;
  let jsRequests = 0;
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", async (r) => {
    if (!/\.(js|mjs)$/.test(new URL(r.url()).pathname)) return;
    jsRequests++;
    jsBytes += Number(r.headers()["content-length"] ?? 0);
  });

  const t0 = Date.now();
  const resp = await page.goto(BASE + route, { waitUntil: "domcontentloaded" }).catch(() => null);
  if (!resp || !resp.ok()) { console.log(`  ${route.padEnd(20)} — not served (${resp?.status() ?? "no response"})`); await ctx.close(); continue; }
  const dcl = Date.now() - t0;
  await page.waitForLoadState("load").catch(() => {});
  const load = Date.now() - t0;

  // Hydrated = the gallery island has painted its object cards. A generic "some clickables exist"
  // heuristic is worthless here: the SSR shell already ships nav links and the layout toggle, so it
  // went green at 100 ms on every route whether or not the island had run.
  let hydrated = null;
  let cards = 0;
  try {
    await page.waitForFunction(() => document.querySelectorAll("button.object").length > 0, null, { timeout: 15_000 });
    hydrated = Date.now() - t0;
    cards = await page.evaluate(() => document.querySelectorAll("button.object").length);
  } catch { /* left null — reported as a MISS, never silently as 0 */ }

  console.log(`  ${route.padEnd(20)} DCL ${String(dcl).padStart(4)} ms   load ${String(load).padStart(4)} ms   cards ${hydrated === null ? "MISS" : String(cards).padStart(2) + " @" + String(hydrated).padStart(4) + "ms"}   JS ${(jsBytes / 1024).toFixed(0).padStart(4)} KB in ${jsRequests}${errors.length ? `   [${errors.length} pageerror]` : ""}`);
  if (errors.length) for (const e of errors.slice(0, 2)) console.log(`      ! ${e}`);
  results[route] = { dcl, load, hydrated, cards, jsKB: +(jsBytes / 1024).toFixed(1), jsRequests, errors };
  await ctx.close();
}

// Opening an object is the second half of the reader path: the canvas engine is lazy-loaded, so this
// is where OpenSeadragon's ~230 KB actually arrives.
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  let jsBytes = 0;
  page.on("response", (r) => { if (/\.(js|mjs)$/.test(new URL(r.url()).pathname)) jsBytes += Number(r.headers()["content-length"] ?? 0); });
  await page.goto(`${BASE}/sampler`, { waitUntil: "load" }).catch(() => {});
  const beforeKB = jsBytes / 1024;
  // An IMAGE object — the video/audio cards mount wavesurfer/<video>, not OpenSeadragon. The card
  // labels prefix those with a glyph, so filter them out rather than trusting card order.
  const card = page.locator("button.object").filter({ hasNotText: /[\u25B6\u266A]/ }).first();
  const t = Date.now();
  let canvasMs = null;
  try {
    await card.click({ timeout: 5000 });
    await page.waitForSelector(".openseadragon-canvas, canvas", { timeout: 20_000 });
    canvasMs = Date.now() - t;
  } catch { /* reported as a miss */ }
  console.log(`\n  open an object      click→canvas ${canvasMs === null ? "MISS (no canvas within 20s)" : String(canvasMs) + " ms"}   extra JS ${((jsBytes / 1024) - beforeKB).toFixed(0)} KB`);
  results.objectOpen = { canvasMs, extraKB: +((jsBytes / 1024) - beforeKB).toFixed(1) };
  await ctx.close();
}

await browser.close();
server.close();
console.log(`\n--- JSON ---\n${JSON.stringify(results, null, 2)}`);
