// Heap peaks on a LARGE library (Archie-b9c4) — the measurement that decides whether Archie's
// in-memory caches need byte-budgeted LRUs and heap-scaled concurrency.
//
// Rides the existing 70-object scale drill rather than inventing a corpus: scripts/seed-fixture.mjs
// seeds three real exhibits (30 + 30 + 10) through the Studio UI with production bytes, and
// scale-check.mjs already knows how to walk them. This samples the JS heap along that same walk.
//
// WHY CDP AND NOT `performance.memory`: the latter is quantised to 100 KB buckets and, in a
// cross-origin-isolated context, is gated behind a flag. `Runtime.getHeapUsage` over CDP reports the
// V8 heap directly and needs no flag, so the numbers are comparable run to run.
//
// A caveat this script cannot remove, stated so nobody over-reads its output: the V8 heap does NOT
// include decoded image surfaces, OSD tile textures, or GPU memory — exactly the things a "cache
// budget" would be about. What it does measure honestly is whether JS-side retention grows without
// bound as a library is walked, which is the question that decides whether an LRU is needed at all.
//
// Run:  node scripts/perf/heaprun.mjs
import { fileURLToPath } from "node:url";
import path from "node:path";
import { launchPersistentProfile } from "../lib/driver.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");
// The dev server serves the app under /studio/, not the origin root — hitting the root gets a 404
// and every sample below reads an empty page's heap, which looks like a wonderfully small number.
const URL_BASE = process.env.STUDIO_URL ?? "http://localhost:5173/studio/";
const PROFILE = path.join(REPO, ".heaprun-profile");

const MB = (bytes) => +(bytes / 1048576).toFixed(1);

async function heapMB(cdp) {
  // Collect first so the reading is retained bytes, not garbage awaiting a sweep — otherwise every
  // sample reads as a "peak" and the trend is noise.
  await cdp.send("HeapProfiler.collectGarbage");
  const { usedSize } = await cdp.send("Runtime.getHeapUsage");
  return MB(usedSize);
}

const ctx = await launchPersistentProfile(PROFILE, { headless: !process.env.HEADED });
const page = ctx.pages()[0] ?? (await ctx.newPage());
const cdp = await ctx.newCDPSession(page);
await cdp.send("HeapProfiler.enable");

const samples = [];
const mark = async (label) => {
  const mb = await heapMB(cdp);
  samples.push({ label, mb });
  console.log(`  ${String(mb).padStart(7)} MB  ${label}`);
};

try {
  console.log(`• studio at ${URL_BASE}`);
  await page.goto(URL_BASE, { waitUntil: "load" });
  await page.waitForTimeout(1500);
  await mark("boot (library home)");

  // Walk into the biggest exhibit and back out, twice. The SECOND pass is the one that matters: if
  // JS-side retention is bounded, pass 2 lands where pass 1 did. If it climbs, something is holding.
  for (const pass of [1, 2]) {
    const card = page.locator('[data-testid="exhibit-card"], .exhibit-card, button', { hasText: "Coastal Survey" }).first();
    if ((await card.count()) === 0) {
      console.log("  ! no seeded library found — run `node scripts/scale-check.mjs` first (it seeds).");
      break;
    }
    await card.click();
    await page.waitForTimeout(2500);
    await mark(`pass ${pass}: overview open (30 plates)`);

    const plate = page.locator(".plate, [data-obj]").first();
    if (await plate.count()) {
      await plate.click();
      await page.waitForTimeout(2500);
      await mark(`pass ${pass}: object open (canvas mounted)`);
      await page.goBack().catch(() => {});
      await page.waitForTimeout(1200);
    }
    await page.goto(URL_BASE, { waitUntil: "load" });
    await page.waitForTimeout(1500);
    await mark(`pass ${pass}: back at library home`);
  }
} finally {
  await ctx.close();
}

const peak = samples.reduce((a, s) => (s.mb > a.mb ? s : a), samples[0] ?? { label: "—", mb: 0 });
const home = samples.filter((s) => s.label.includes("library home"));
console.log("\n— summary —");
console.log(`peak: ${peak.mb} MB at "${peak.label}"`);
if (home.length >= 2) {
  const drift = +(home[home.length - 1].mb - home[0].mb).toFixed(1);
  console.log(`retention drift across a full walk (home → home): ${drift >= 0 ? "+" : ""}${drift} MB`);
  console.log(drift > 25
    ? "  ⇒ JS-side retention GROWS across a walk — a budgeted LRU has something to reclaim."
    : "  ⇒ JS-side retention is BOUNDED across a walk — an LRU would reclaim little.");
}
