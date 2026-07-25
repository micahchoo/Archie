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
// RATCHET MODE:  node scripts/perf/readerrun.mjs --check
//
// Fails if a route's arrival payload exceeds its budget in reader-budget.json. This exists because
// the viewer drifted to 302 KB gz of eager canvas engine with nothing watching — the app had no
// equivalent of the embed's `eagerGzKB` gate (build.mjs --check), which is precisely why the
// regression survived. Measured in a real browser rather than from a manifest: what the reader
// actually downloads is the number that matters, and it already needs Chromium here.
//
// Budgets are RAW transferred JS bytes on arrival, per route. Update reader-budget.json deliberately
// when a payload legitimately grows; do not widen it to make a red run pass.
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

// Hydration means different markup per route: the gallery index paints exhibit cards (`a.card`),
// an exhibit route paints object cards (`button.object`). One shared selector cannot express both,
// and a generic "some clickables exist" heuristic is worse than useless here — the SSR shell already
// ships nav links, so it went green at 100 ms whether or not the island had run.
const ROUTES = [
  { path: "/", ready: "a.card" },
  { path: "/sampler", ready: "button.object" },
  { path: "/language-atlas", ready: "button.object" },
];

for (const { path: route, ready } of ROUTES) {
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

  let hydrated = null;
  let cards = 0;
  try {
    await page.waitForFunction((sel) => document.querySelectorAll(sel).length > 0, ready, { timeout: 15_000 });
    hydrated = Date.now() - t0;
    cards = await page.evaluate((sel) => document.querySelectorAll(sel).length, ready);
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

if (!process.argv.includes("--check")) {
  console.log(`\n--- JSON ---\n${JSON.stringify(results, null, 2)}`);
  process.exit(0);
}

const budgetPath = path.join(REPO, "scripts/perf/reader-budget.json");
const budget = JSON.parse(await readFile(budgetPath, "utf8"));
let failed = false;
console.log("\n--- ratchet ---");
for (const [route, limitKB] of Object.entries(budget.routes)) {
  const got = results[route];
  if (!got) { console.log(`  ??  ${route.padEnd(20)} not measured — route missing from the build?`); failed = true; continue; }
  // A route whose island never hydrated has a meaninglessly small payload; treat it as a failure
  // rather than a pass, or a broken page reads as the best possible score.
  if (got.cards === 0 || got.hydrated === null) { console.log(`  FAIL ${route.padEnd(20)} island never hydrated (cards=${got.cards})`); failed = true; continue; }
  const ok = got.jsKB <= limitKB;
  if (!ok) failed = true;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${route.padEnd(20)} ${got.jsKB.toFixed(0).padStart(5)} KB / ${String(limitKB).padStart(5)} KB budget`);
}
const openLimit = budget.objectOpenExtraKB;
if (openLimit !== undefined) {
  const got = results.objectOpen;
  const ok = got?.canvasMs !== null && got.extraKB <= openLimit;
  if (!ok) failed = true;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${"object open".padEnd(20)} ${(got?.extraKB ?? 0).toFixed(0).padStart(5)} KB / ${String(openLimit).padStart(5)} KB budget${got?.canvasMs === null ? "   (canvas never appeared)" : ""}`);
}
console.log(failed ? "\n\u2717 reader payload over budget — see scripts/perf/reader-budget.json" : "\n\u2713 reader payload within budget");
process.exit(failed ? 1 : 0);
