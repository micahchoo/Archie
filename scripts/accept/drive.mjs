// SERVE the published tree and drive it at 1,000 objects (Archie-c74e steps 5 + the absorbed b9c4).
//
// `scripts/drive-published-tree.mjs` already asserts the shape of a published tree and is run
// unmodified beside this. THIS script exists for the three things that one deliberately does not do,
// each of which the ticket names:
//
//   1. CLICK an annotation region and assert the note opens. The existing drive reports region count
//      as a FINDING and says so ("a click assertion needs a non-empty subject"). At 1,000 objects the
//      subject exists, so the assertion can be made — and it is the hit-testing class that
//      `.claude/rules/osd-overlay-wrapper.md` proves only a real driven pointer can catch: keyboard
//      Enter and a synthetic `click()` BOTH succeed against code where a real mouse click does
//      nothing.
//   2. TIME the cold paths — gallery first card, exhibit open, object open — at 1,000 objects rather
//      than at fixture scale.
//   3. WALK, and watch retention. Archie-b9c4 asked whether studio/viewer's in-memory caches need
//      byte-budgeted LRUs. This opens N objects, returns to the grid, and repeats — sampling OS RSS
//      over the whole browser process tree, which is the instrument that sees decoded surfaces and
//      GPU memory (see harness.mjs for why `Runtime.getHeapUsage` cannot answer this).
//
// PORT: never reused, and the server FAILS on a taken port — a reused server silently drives another
// worktree's bytes (.claude/rules/viewer-e2e-shared-port.md).
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import fs from "node:fs";
import path from "node:path";
import { launchBrowser } from "../lib/driver.mjs";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  if (i !== -1 && process.argv[i + 1]) return process.argv[i + 1];
  if (fallback !== undefined) return fallback;
  throw new Error(`missing --${name}`);
};
const DIR = path.resolve(arg("dir"));
const PORT = Number(arg("port"));
const SLUG = arg("slug");
const ORIGIN_REWRITE = arg("rewrite-origin", "");
const WALK_OBJECTS = Number(arg("walk", "12"));
const ROUNDS = Number(arg("rounds", "3"));
const OUT = arg("out", "");

const results = [];
const record = (ok, label, detail) => { results.push({ ok, label, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`); };

const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".json": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".svg": "image/svg+xml", ".txt": "text/plain", ".xml": "application/xml", ".css": "text/css",
  ".dzi": "application/xml", ".tif": "image/tiff",
};

/** A BARE static server — the floor a GitHub Pages / S3 host offers. */
function serve(rootDir, port) {
  const server = createServer(async (req, res) => {
    let rel = decodeURIComponent((req.url ?? "/").split("?")[0]);
    if (rel.endsWith("/")) rel += "index.html";
    const file = path.join(rootDir, rel);
    if (!file.startsWith(rootDir)) { res.writeHead(403).end(); return; }
    try {
      const buf = await readFile(file);
      res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream" }).end(buf);
    } catch { res.writeHead(404, { "content-type": "text/plain" }).end("not found"); }
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(() => new Promise((r) => server.close(() => r()))));
  });
}

const sr = "document.querySelector('archie-viewer')?.shadowRoot";
const q = (sel) => `${sr}?.querySelectorAll(${JSON.stringify(sel)}).length ?? 0`;

const PAGE_BYTES = 4096;
async function treeRss(root) {
  const parent = new Map();
  let entries; try { entries = await fs.promises.readdir("/proc"); } catch { return 0; }
  for (const e of entries) {
    if (!/^\d+$/.test(e)) continue;
    try {
      const st = await fs.promises.readFile(`/proc/${e}/stat`, "utf8");
      parent.set(Number(e), Number(st.slice(st.lastIndexOf(")") + 2).split(" ")[1]));
    } catch { /* exited */ }
  }
  const stack = [root], seen = new Set();
  let total = 0;
  while (stack.length > 0) {
    const p = stack.pop();
    if (seen.has(p)) continue;
    seen.add(p);
    try { total += Number((await fs.promises.readFile(`/proc/${p}/statm`, "utf8")).split(" ")[1]) * PAGE_BYTES; } catch { /* exited */ }
    for (const [pid, ppid] of parent) if (ppid === p && !seen.has(pid)) stack.push(pid);
  }
  return total;
}

async function main() {
  const origin = `http://127.0.0.1:${PORT}/`;
  const stop = await serve(DIR, PORT);
  const timings = {};
  const walk = [];
  let browser;
  try {
    browser = await launchBrowser();
    const rootPid = browser.process?.()?.pid ?? process.pid;
    const page = await browser.newPage();

    // A published tree's canvas ids and `tileSource.filesPath` are ABSOLUTE at the deploy base
    // (site.ts:536) — serving it at 127.0.0.1 leaves those pointers aimed at the real host, and the
    // first run of the sibling harness scored a green TILED off tiles fetched from the LIVE site.
    // `--rewrite-origin` serves those from the LOCAL tree, so a file the artifact does not carry 404s
    // here instead of being quietly satisfied by a host.
    if (ORIGIN_REWRITE) {
      await page.route(`${ORIGIN_REWRITE}**`, async (route) => {
        const rel = decodeURIComponent(route.request().url().slice(ORIGIN_REWRITE.length).split("?")[0]);
        const file = path.join(DIR, rel.endsWith("/") || rel === "" ? `${rel}index.html` : rel);
        if (!file.startsWith(DIR)) { await route.fulfill({ status: 403, body: "" }); return; }
        try {
          await route.fulfill({ status: 200, contentType: MIME[path.extname(file)] ?? "application/octet-stream", body: await readFile(file) });
        } catch { await route.fulfill({ status: 404, contentType: "text/plain", body: "not found" }); }
      });
    }

    const served = [];
    page.on("response", (r) => { if (r.status() >= 200 && r.status() < 300) served.push(r.url()); });
    const notFound = [];
    page.on("response", (r) => { if (r.status() >= 400) notFound.push(`${r.status()} ${r.url()}`); });

    // ── (1) COLD gallery first paint ────────────────────────────────────────────────────────────
    let t = Date.now();
    await page.goto(`${origin}viewer.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(`${q("ul.grid li button[data-slug]")} > 0`, { timeout: 120_000, polling: 100 });
    timings.galleryFirstCardMs = Date.now() - t;
    const cards = await page.evaluate(q("ul.grid li button[data-slug]"));
    record(cards > 0, "gallery renders at library scale", `${cards} exhibit card(s) in ${timings.galleryFirstCardMs} ms (cold, from a bare static host)`);

    // ── (2) exhibit open ────────────────────────────────────────────────────────────────────────
    t = Date.now();
    await page.evaluate(`${sr}.querySelector('button[data-slug="${SLUG}"]').click()`);
    await page.waitForFunction(`${q("ul.grid li button[data-obj]")} > 0`, { timeout: 120_000, polling: 100 });
    timings.exhibitOpenMs = Date.now() - t;
    const objects = await page.evaluate(q("ul.grid li button[data-obj]"));
    record(objects > 0, "an exhibit's object grid renders", `${objects} object(s) in ${timings.exhibitOpenMs} ms`);

    // ── (3) object open → deep-zoom canvas ──────────────────────────────────────────────────────
    t = Date.now();
    await page.evaluate(`${sr}.querySelector('ul.grid li button[data-obj]').click()`);
    let canvas = false;
    try {
      await page.waitForFunction(`!!${sr}?.querySelector('.reader-surface')?.querySelector('.openseadragon-canvas, canvas')`, { timeout: 120_000, polling: 100 });
      canvas = true;
    } catch { /* FAIL below */ }
    timings.objectOpenMs = Date.now() - t;
    record(canvas, "an object opens onto a deep-zoom canvas", canvas ? `painted in ${timings.objectOpenMs} ms` : "never painted");

    // ── (4) CLICK an annotation region and assert the note opens ────────────────────────────────
    // Walk the grid for an object that HAS regions — with 50 notes over 1,000 objects most have none,
    // and a click assertion over an empty subject is worse than an absent one
    // (.claude/rules/post-review-fixes-are-unreviewed.md 1a). The subject is PRINTED either way.
    let regionObj = -1, regions = 0;
    for (let i = 0; i < Math.min(objects, 200) && regions === 0; i++) {
      await page.evaluate(`${sr}.querySelector('button[aria-label="Back"], button.back')?.click()`).catch(() => {});
      await page.waitForFunction(`${q("ul.grid li button[data-obj]")} > 0`, { timeout: 60_000, polling: 100 }).catch(() => {});
      await page.evaluate(`${sr}.querySelectorAll('ul.grid li button[data-obj]')[${i}]?.click()`);
      try {
        await page.waitForFunction(`!!${sr}?.querySelector('.reader-surface')?.querySelector('.openseadragon-canvas, canvas')`, { timeout: 30_000, polling: 100 });
      } catch { continue; }
      await page.waitForTimeout(700);
      regions = await page.evaluate(q('svg[id^="archie-region-"]'));
      if (regions > 0) regionObj = i;
    }
    if (regions === 0) {
      record(false, "an annotated object was reachable in the grid", `walked ${Math.min(objects, 200)} object(s), found NO region overlays — the click assertion has no subject`);
    } else {
      // A REAL driven mouse click at the region's own centre. Not `el.click()`, not keyboard Enter:
      // both succeed against code where OSD's overlay wrapper eats the pointer (osd-overlay-wrapper).
      const box = await page.evaluate(`(() => {
        const g = ${sr}.querySelector('svg[id^="archie-region-"]')?.querySelector('rect, polygon, path, ellipse, circle');
        if (!g) return null;
        const r = g.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height, tag: g.tagName };
      })()`);
      if (!box) {
        record(false, "the region overlay carries clickable geometry", "no rect/polygon inside svg[id^=archie-region-]");
      } else {
        // The DIAGNOSTIC SIGNATURE from the rule: a bare unnamed DIV at the region's centre means an
        // OSD overlay wrapper is shielding the geometry. Printed whether or not the click works.
        const top = await page.evaluate(`(() => { const e = ${sr}.elementFromPoint(${box.x}, ${box.y}); return e ? e.tagName + (e.id ? '#' + e.id : '') + (e.className && e.className.baseVal !== undefined ? '.' + e.className.baseVal : '') : 'null'; })()`);
        await page.mouse.click(box.x, box.y);
        await page.waitForTimeout(900);
        const note = await page.evaluate(`(() => {
          const sh = ${sr};
          // The embed's docked note card. The class is the one its own suite asserts on
          // (packages/archie-viewer/src/note-card.test.ts:106 '.archie-note-card'); the fallbacks are
          // there so a rename surfaces as a weaker match rather than a silent zero.
          const sel = ['.archie-note-card', '.reader-note', '.note-card', '[data-note]'];
          for (const s of sel) { const n = sh?.querySelectorAll(s) ?? []; if (n.length > 0) return { sel: s, n: n.length, text: (n[0].textContent ?? '').slice(0, 80) }; }
          return null;
        })()`);
        record(!!note, `a real mouse click on an annotation region opens its note (object #${regionObj}, ${regions} region(s))`,
          note ? `hit-test at region centre = ${top}; note surface "${note.sel}" x${note.n}: ${JSON.stringify(note.text)}`
               : `hit-test at region centre = ${top}; NO note surface appeared after a driven click at (${box.x.toFixed(0)},${box.y.toFixed(0)}) on a ${box.tag} of ${box.w.toFixed(0)}x${box.h.toFixed(0)}`);
      }
    }

    // ── (5) THE WALK — does retention grow, or is it bounded? ───────────────────────────────────
    // Open N objects, return to the grid, repeat. RSS is sampled at the END of each round, at the
    // same point in the cycle, so the samples are comparable rather than caught mid-decode.
    const back = async () => {
      await page.evaluate(`${sr}.querySelector('button[aria-label="Back"], button.back')?.click()`).catch(() => {});
      await page.waitForFunction(`${q("ul.grid li button[data-obj]")} > 0`, { timeout: 60_000, polling: 100 }).catch(() => {});
    };
    for (let round = 0; round < ROUNDS; round++) {
      for (let i = 0; i < WALK_OBJECTS; i++) {
        await back();
        await page.evaluate(`${sr}.querySelectorAll('ul.grid li button[data-obj]')[${i}]?.click()`);
        try {
          await page.waitForFunction(`!!${sr}?.querySelector('.reader-surface')?.querySelector('.openseadragon-canvas, canvas')`, { timeout: 30_000, polling: 100 });
        } catch { /* keep walking — a stall is data */ }
        await page.waitForTimeout(250);
      }
      await back();
      await page.waitForTimeout(1500);
      const rss = await treeRss(rootPid);
      walk.push({ round: round + 1, opened: (round + 1) * WALK_OBJECTS, rssBytes: rss, rssGB: +(rss / 1e9).toFixed(2) });
      console.log(`  walk round ${round + 1}: ${(round + 1) * WALK_OBJECTS} objects opened cumulatively · RSS ${(rss / 1e9).toFixed(2)} GB`);
    }
    // BOUNDED means the last round is not materially above the first. The bar is stated rather than
    // implied: +25% across ROUNDS-1 further passes over the SAME objects would be a cache that never
    // evicts. A verdict either way is the deliverable (the ticket says so explicitly).
    const first = walk[0]?.rssBytes ?? 0, last = walk[walk.length - 1]?.rssBytes ?? 0;
    const growth = first > 0 ? (last - first) / first : 0;
    record(growth <= 0.25, "retention across a repeated walk is BOUNDED, not cumulative",
      `${walk.map((w) => `r${w.round}=${w.rssGB}GB`).join(" ")} → ${(growth * 100).toFixed(1)}% from round 1 to ${walk.length} over ${walk[walk.length - 1]?.opened ?? 0} cumulative object opens (bar: ≤25%)`);

    const tiles = served.filter((u) => /_files\/\d+\/\d+_\d+\.(jpe?g|png|webp)(\?|$)/i.test(u));
    console.log(`\nFINDING — ${tiles.length} DZI tile(s) served 2xx during this drive. On the WEB tier this is expected to be ZERO: the tier caps a master at 2400 px, below TILE_MIN_EDGE (4096), so no pyramid is ever written (PROBE-tiling-threshold-2026-07-27.md: "on the web tier, no plausible threshold ever fires").`);
    if (notFound.length > 0) {
      console.log(`non-2xx (${notFound.length}), distinct:`);
      for (const e of [...new Set(notFound)].slice(0, 8)) console.log(`  ${e}`);
    }
  } finally {
    if (browser) await browser.close();
    await stop();
  }

  const failed = results.filter((r) => !r.ok);
  const summary = { dir: DIR, slug: SLUG, timings, walk, results, passed: results.length - failed.length, total: results.length };
  if (OUT) fs.writeFileSync(OUT, JSON.stringify(summary, null, 2));
  console.log(`\nRESULT: ${failed.length === 0 ? "PASS" : "FAIL"}  (${results.length - failed.length}/${results.length})  [${DIR}]`);
  process.exit(failed.length === 0 ? 0 : 1);
}

await main();
