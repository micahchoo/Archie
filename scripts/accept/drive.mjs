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
/** Does THIS tier tile at all? The web tier caps a master at 2400 px, below TILE_MIN_EDGE, so zero
 *  tiles is its CORRECT behaviour rather than a defect — pass `--expect-tiles false` for it. */
const EXPECT_TILES = arg("expect-tiles", "true") !== "false";
const WALK_OBJECTS = Number(arg("walk", "12"));
const ROUNDS = Number(arg("rounds", "3"));
const OUT = arg("out", "");
// The working store's record of WHICH objects were annotated. Optional: without it the drive searches
// by stepping, which is weaker (see the region-subject note below).
const WORK = arg("work", "");
const ANNOTATED = WORK && fs.existsSync(path.join(WORK, "annotated.json"))
  ? JSON.parse(fs.readFileSync(path.join(WORK, "annotated.json"), "utf8"))
  : [];
const LIBRARY = WORK && fs.existsSync(path.join(WORK, "library.json"))
  ? JSON.parse(fs.readFileSync(path.join(WORK, "library.json"), "utf8"))
  : null;
/** publish-flows.svelte.ts:195 — the longer edge above which a master gets a DZI pyramid. */
const TILE_MIN_EDGE = 4096;

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
    // STEP the way a reader does. `.rc-step` is the reader chrome's prev/next stepper and
    // `.rc-overview` its "Back to Exhibit" (reader-chrome.ts:430, :452); walking with the stepper
    // keeps the ELEMENT alive across the transition, which is the discipline
    // .claude/rules/drive-must-not-recreate-the-thing-under-test.md prescribes — and it is what a
    // reader does. The first version of this went back to the grid between every object; when its
    // guessed `button[aria-label="Back"]` matched nothing, each iteration ate a 60 s
    // `waitForFunction` and the whole drive wedged. The lesson is the one already in that rule:
    // drive the control that exists, and never let a "navigate" step have no observable effect.
    const stepNext = async () => {
      const moved = await page.evaluate(`(() => {
        const steps = ${sr}?.querySelectorAll('.rc-step') ?? [];
        const next = steps[steps.length - 1];
        if (!next || next.disabled) return false;
        next.click(); return true;
      })()`);
      if (moved) await page.waitForTimeout(400);
      return moved;
    };
    // Target the object that is KNOWN to carry notes, when the working store says which. Searching
    // by stepping is the fallback, and it was also how this first went wrong: the search read the
    // region count with NO settle after the canvas painted, got 0 on the one annotated object in the
    // exhibit, and then stepped past it through 49 unannotated ones — reporting "found NO region
    // overlays" against a tree that demonstrably carries three. `probe-dom.mjs` printed the subject
    // (regions appear by t+300 ms) and that is what settled it. Naming the object removes the race
    // AND the ambiguity: a failure now means the overlay did not draw, not that we looked elsewhere.
    let regionObj = "?", regions = 0;
    const known = ANNOTATED.filter((a) => a.slug === SLUG).map((a) => a.objectId);
    console.log(`  region subject: ${known.length} annotated object(s) recorded for ${SLUG}${known.length > 0 ? ` (first ${known[0]})` : ""}`);
    if (known.length > 0) {
      await page.evaluate(`${sr}?.querySelector('.rc-overview')?.click()`).catch(() => {});
      await page.waitForFunction(`${q("ul.grid li button[data-obj]")} > 0`, { timeout: 30_000, polling: 100 }).catch(() => {});
      await page.evaluate(`${sr}.querySelector('ul.grid li button[data-obj="${known[0]}"]')?.click()`);
      await page.waitForFunction(`!!${sr}?.querySelector('.reader-surface')?.querySelector('.openseadragon-canvas, canvas')`, { timeout: 60_000, polling: 100 }).catch(() => {});
      await page.waitForTimeout(1200);
      regions = await page.evaluate(q('svg[id^="archie-region-"]'));
      regionObj = known[0];
    } else {
      const SEARCH = Math.min(objects, 60);
      for (let i = 0; i < SEARCH && regions === 0; i++) {
        await page.waitForTimeout(1200);
        regions = await page.evaluate(q('svg[id^="archie-region-"]'));
        if (regions > 0) { regionObj = `grid#${i}`; break; }
        if (!(await stepNext())) break; // the stepper ran out — the subject is exhausted, say so
      }
    }
    if (regions === 0) {
      record(false, "an annotated object carries region overlays", `subject ${regionObj}: NO region overlays after the canvas painted — the click assertion has no subject`);
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
          for (const s of sel) {
            const n = sh?.querySelectorAll(s) ?? [];
            if (n.length > 0) return { sel: s, n: n.length, text: (n[0].textContent ?? '').slice(0, 120) };
          }
          return null;
        })()`);
        // THE CARD MUST CARRY THE NOTE, not merely exist. Found by injection: with the region
        // geometry forced to `pointer-events: none`, the hit-test degraded to the wrapper DIV, a card
        // still opened — and its whole textContent was the two chrome glyphs "⤢×". The original
        // assertion ("a .archie-note-card node appeared") passed against a click that had reached
        // nothing. An assertion on presence is not an assertion on content
        // (.claude/rules/svelte-no-typecheck-net.md: a gate proves the code compiled, never that the
        // output carries anything).
        const CHROME = /[⤢×✕✖\s]/gu;
        const body = (note?.text ?? "").replace(CHROME, "");
        const carried = body.length >= 20;
        record(!!note && carried, `a real mouse click on an annotation region opens its note WITH ITS BODY (object ${regionObj}, ${regions} region(s))`,
          note
            ? `hit-test at region centre = ${top}; note surface "${note.sel}" x${note.n} carrying ${body.length} chars of body: ${JSON.stringify(note.text)}`
            : `hit-test at region centre = ${top}; NO note surface appeared after a driven click at (${box.x.toFixed(0)},${box.y.toFixed(0)}) on a ${box.tag} of ${box.w.toFixed(0)}x${box.h.toFixed(0)}`);
      }
    }

    // ── (5) THE WALK — does retention grow, or is it bounded? ───────────────────────────────────
    // Open N objects, return to the grid, repeat. RSS is sampled at the END of each round, at the
    // same point in the cycle, so the samples are comparable rather than caught mid-decode.
    // `.rc-overview` = "Back to Exhibit" (reader-chrome.ts:430). A round is: open object 0 from the
    // grid, step forward WALK_OBJECTS times, come back. Every round covers the SAME objects, so any
    // growth across rounds is retention rather than new data.
    const backToGrid = async () => {
      await page.evaluate(`${sr}?.querySelector('.archie-note-card__dismiss')?.click()`).catch(() => {});
      await page.evaluate(`${sr}?.querySelector('.rc-overview')?.click()`).catch(() => {});
      await page.waitForFunction(`${q("ul.grid li button[data-obj]")} > 0`, { timeout: 30_000, polling: 100 }).catch(() => {});
      return await page.evaluate(q("ul.grid li button[data-obj]"));
    };
    let walkOpens = 0, walkMisses = 0;
    for (let round = 0; round < ROUNDS; round++) {
      for (let i = 0; i < WALK_OBJECTS; i++) {
        const gridN = await backToGrid();
        // PRINT THE SUBJECT. The first version of this walk reported a beautifully flat RSS across
        // three rounds while opening ONE object per round — every navigation after the first was a
        // no-op and nothing said so. A round that opens nothing produces exactly the same "bounded"
        // verdict as a round that opens twelve, which makes the flat line worthless. So the walk
        // counts what actually PAINTED and reports the misses beside it.
        if (gridN === 0) { walkMisses++; continue; }
        // DISTINCT objects per round, not the same twelve re-opened. This is the whole design of the
        // experiment and the first version got it wrong: re-visiting one fixed working set makes a
        // cache that NEVER EVICTS plateau exactly like an LRU with capacity >= that set, so the flat
        // line it produced could not distinguish the two. Retention is a question about how memory
        // scales with the number of DISTINCT objects a reader has passed through, so each round walks
        // a fresh window and the series is read as a slope against cumulative distinct opens.
        const idx = (round * WALK_OBJECTS + i) % gridN;
        await page.evaluate(`${sr}.querySelectorAll('ul.grid li button[data-obj]')[${idx}]?.click()`);
        try {
          await page.waitForFunction(`!!${sr}?.querySelector('.reader-surface')?.querySelector('.openseadragon-canvas, canvas')`, { timeout: 30_000, polling: 100 });
          walkOpens++;
        } catch { walkMisses++; }
        await page.waitForTimeout(200);
      }
      await backToGrid();
      await page.waitForTimeout(1500);
      const rss = await treeRss(rootPid);
      walk.push({ round: round + 1, opened: walkOpens, missed: walkMisses, rssBytes: rss, rssGB: +(rss / 1e9).toFixed(2) });
      console.log(`  walk round ${round + 1}: ${walkOpens} object(s) opened cumulatively (${walkMisses} miss) · RSS ${(rss / 1e9).toFixed(2)} GB`);
    }
    // THE VERDICT, and a correction worth recording because the first version of this bar was wrong
    // in a way that would have shipped a false FAIL.
    //
    // The bar was "round 1 to round N is within 25%". Measured, the series over 50 DISTINCT objects
    // is 1.04 / 1.40 / 1.52 / 1.54 / 1.59 GB — a +52.6% total that is almost entirely the FIRST
    // round. Per round of ten fresh objects the marginal cost is +0.36, +0.12, +0.02, +0.05 GB. That
    // is a warm-up followed by a plateau, and "round 1 to round N" cannot tell a warm-up from a leak;
    // it just reports the sum of both.
    //
    // What distinguishes them is the SLOPE. A cache that never evicts pays roughly the same marginal
    // cost for every fresh object, so its second-half slope matches its first-half slope. A bounded
    // one pays up front and then flattens. So the criterion is the ratio of the two half-slopes, in
    // BYTES PER DISTINCT OBJECT, and the raw series is printed either way so a reader can disagree
    // with the threshold without having to re-run anything.
    const half = Math.floor(walk.length / 2);
    const firstHalf = walk[half] ? (walk[half].rssBytes - (walk[0]?.rssBytes ?? 0)) / Math.max(1, walk[half].opened - (walk[0]?.opened ?? 0)) : 0;
    const last = walk[walk.length - 1];
    const secondHalf = walk[half] && last ? (last.rssBytes - walk[half].rssBytes) / Math.max(1, last.opened - walk[half].opened) : 0;
    const slopeRatio = firstHalf > 0 ? secondHalf / firstHalf : 0;
    const totalGrowth = (walk[0]?.rssBytes ?? 0) > 0 ? (last.rssBytes - walk[0].rssBytes) / walk[0].rssBytes : 0;
    // A slope test needs a TAIL to measure. Measured: the same tree scores ratio 0.22 over 5 rounds
    // and 0.63 over 3, because at 3 rounds the "second half" is still inside the warm-up. Fewer than
    // 4 rounds cannot answer this question, so the verdict is REFUSED rather than guessed.
    const enough = (last?.opened ?? 0) >= WALK_OBJECTS * ROUNDS * 0.8 && ROUNDS >= 4;
    record(enough && slopeRatio <= 0.4, "retention across a walk of DISTINCT objects is BOUNDED, not cumulative",
      enough
        ? `${walk.map((w) => `r${w.round}=${w.rssGB}GB@${w.opened}`).join(" ")} · marginal ${(firstHalf / 1e6).toFixed(1)} MB/object over the first half vs ${(secondHalf / 1e6).toFixed(1)} MB/object over the second (ratio ${slopeRatio.toFixed(2)}, bar ≤0.40) · total +${(totalGrowth * 100).toFixed(1)}% across ${last.opened} distinct opens, ${last.missed} miss`
        : `INCONCLUSIVE — ${last?.opened ?? 0} of ${WALK_OBJECTS * ROUNDS} intended opens painted (${last?.missed ?? 0} miss) over ${ROUNDS} round(s); the slope test needs >=4 rounds and >=80% of the intended opens`);
    timings.retention = { series: walk.map((w) => ({ round: w.round, opened: w.opened, rssGB: w.rssGB })), firstHalfBytesPerObject: firstHalf, secondHalfBytesPerObject: secondHalf, slopeRatio, totalGrowth };

    // ── (6) TILED, and with a subject that CAN tile ─────────────────────────────────────────────
    // `scripts/drive-published-tree.mjs` asserts this too and scored ZERO on this very tree — because
    // it opens grid object #0, which here is a 3312 px plate, BELOW TILE_MIN_EDGE(4096). No pyramid is
    // written for it, so no tile can be served and the FAIL says nothing about tiling. That is the
    // empty-subject hazard exactly (.claude/rules/post-review-fixes-are-unreviewed.md 1a): a confident
    // verdict over a subject incapable of producing the thing being looked for.
    //
    // So this picks an object whose OWN dimensions are above the threshold, names it, and reports the
    // dimensions beside the count — a reader can then tell "tiling is broken" from "this tier does not
    // tile", which are different findings and only one of them is a defect.
    const tileable = LIBRARY?.exhibits?.find((e) => e.slug === SLUG)?.objects
      ?.filter((o) => Math.max(o.width ?? 0, o.height ?? 0) > TILE_MIN_EDGE) ?? [];
    const beforeTiles = served.length;
    if (tileable.length === 0) {
      record(false, "a tileable object exists in this exhibit", `no object in ${SLUG} is above TILE_MIN_EDGE(${TILE_MIN_EDGE}) — the tiling assertion has no subject`);
    } else {
      const subject = tileable[0];
      await backToGrid();
      await page.evaluate(`${sr}.querySelector('ul.grid li button[data-obj="${subject.id}"]')?.click()`);
      await page.waitForFunction(`!!${sr}?.querySelector('.reader-surface')?.querySelector('.openseadragon-canvas, canvas')`, { timeout: 60_000, polling: 100 }).catch(() => {});
      await page.waitForTimeout(3000); // OSD requests tiles AFTER the canvas exists, not with it
      const t2 = served.slice(beforeTiles).filter((u) => /_files\/\d+\/\d+_\d+\.(jpe?g|png|webp)(\?|$)/i.test(u));
      timings.tiledSubject = { id: subject.id, width: subject.width, height: subject.height, tilesServed: t2.length };
      // RESPONSES, not requests — OSD asks for whatever its descriptor promises whether or not the
      // host has the bytes, so a request count measures the manifest and never the tree.
      record(t2.length > 0 || EXPECT_TILES === false,
        EXPECT_TILES === false ? "this tier serves NO tiles, as its cap requires" : "deep zoom is TILED on an object above the threshold",
        `subject ${subject.id} ${subject.width}x${subject.height} (above ${TILE_MIN_EDGE}) — ${t2.length} tile(s) served 2xx${t2.length > 0 ? `, e.g. …${t2[0].slice(t2[0].lastIndexOf("_files"))}` : ""}`);
    }

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
