// Drive an ALREADY-BAKED published tree in a real browser (Archie-8d3d).
//
// scripts/proto/self-replicating-publish.mts proves the same claims, but it BAKES its own fixture
// tree as step one, so it cannot be pointed at the artifact that is about to be pushed. This one
// takes `--dir` (a baked tree) or `--url` (a live host) and asserts against exactly those bytes —
// the artifact, not a re-derivation of it. The assertion set is the prototype's, plus one it did not
// have and this ticket needs (see TILED below).
//
// Everything the embed does here — module resolution, hit-testing, OSD's tile requests — is
// invisible to vitest and to `astro check`. Only a driven browser can fail on it.
//
// Usage:
//   node scripts/drive-published-tree.mjs --dir /tmp/baked --port 4482 [--slug documents-d]
//   node scripts/drive-published-tree.mjs --url https://user.github.io/repo/ [--slug documents-d]
//
// PORT: never reused. The server binds its own and FAILS if the port is taken, because a reused
// server silently drives another worktree's build — .claude/rules/viewer-e2e-shared-port.md.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { launchBrowser } from "./lib/driver.mjs";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  if (i !== -1 && process.argv[i + 1]) return process.argv[i + 1];
  if (fallback !== undefined) return fallback;
  throw new Error(`missing --${name}`);
};
const DIR = process.argv.includes("--dir") ? path.resolve(arg("dir")) : null;
const URL_TARGET = process.argv.includes("--url") ? arg("url") : null;
const PORT = Number(arg("port", "4482"));
const SLUG = arg("slug", "documents-d");
const REWRITE_ORIGIN = process.argv.includes("--rewrite-origin") ? arg("rewrite-origin") : null;
if (!DIR && !URL_TARGET) throw new Error("pass --dir <baked tree> or --url <live base>");

const results = [];
const record = (ok, label, detail) => {
  results.push({ ok, label, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
};

const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".json": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".svg": "image/svg+xml", ".txt": "text/plain", ".xml": "application/xml", ".css": "text/css",
};

/** A BARE static server: path -> file, `/` -> index.html, 404 otherwise. No SPA rewrite, no history
 *  fallback, no directory listing — the floor a GitHub Pages / S3 host offers. If the tree needs
 *  more than this, it is not "any static host". */
function serve(rootDir, port) {
  const server = createServer(async (req, res) => {
    let rel = decodeURIComponent((req.url ?? "/").split("?")[0]);
    if (rel.endsWith("/")) rel += "index.html";
    const file = path.join(rootDir, rel);
    if (!file.startsWith(rootDir)) { res.writeHead(403).end(); return; }
    try {
      const buf = await readFile(file);
      res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream" }).end(buf);
    } catch {
      res.writeHead(404, { "content-type": "text/plain" }).end("not found");
    }
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject); // a taken port FAILS the run — never silently reuse someone else's
    server.listen(port, "127.0.0.1", () => resolve(() => new Promise((r) => server.close(() => r()))));
  });
}

// NULL-SAFE on purpose: a `waitForFunction` predicate that THROWS is not retried, it rejects. During
// a navigation the old document is still current, where `<archie-viewer>` does not exist — optional
// chaining turns that throw into a `false` the poller waits through.
const sr = "document.querySelector('archie-viewer')?.shadowRoot";
const q = (sel) => `${sr}?.querySelectorAll(${JSON.stringify(sel)}).length ?? 0`;

async function main() {
  const origin = URL_TARGET ?? `http://127.0.0.1:${PORT}/`;
  const stop = DIR ? await serve(DIR, PORT) : async () => {};
  let browser;
  try {
    // Tree shape, read off the ARTIFACT rather than from a publish return value.
    if (DIR) {
      const has = async (rel) => { try { await stat(path.join(DIR, rel)); return true; } catch { return false; } };
      record(await has("viewer.html"), "viewer.html ships in the tree", await has("viewer.html") ? "present" : "ABSENT");
      record(await has("_viewer/archie-viewer.js"), "_viewer/ carries the embed entry", await has("_viewer/archie-viewer.js") ? "present" : "ABSENT");
      record(await has(".nojekyll"), ".nojekyll ships beside _viewer (GitHub Pages runs Jekyll)", await has(".nojekyll") ? "present" : "ABSENT");
      const page = await readFile(path.join(DIR, SLUG, "index.html"), "utf8");
      const link = `href="../viewer.html#/${SLUG}"`;
      record(page.includes(link), "the exhibit page links to the TREE's viewer, relatively",
        page.includes(link) ? `../viewer.html#/${SLUG}` : "no tree-relative viewer link");
    }

    browser = await launchBrowser();
    const page = await browser.newPage();

    // A published tree's `tileSource.filesPath` and canvas image `id` are ABSOLUTE at the deploy base
    // (site.ts:536, `${baseUrl}${slug}/…`) — that is what IIIF ids are for. Serving the baked tree at
    // 127.0.0.1 therefore leaves those pointers aimed at the REAL host, and the first run of this
    // harness scored a green "deep zoom is TILED" off 32 tiles fetched from the LIVE, still-broken
    // site. It measured production, not the artifact. Precisely
    // .claude/rules/viewer-e2e-shared-port.md's question: did this run against MY bytes?
    //
    // So when `--rewrite-origin` is given, every request to the deploy base is served from the LOCAL
    // tree instead. Any file the artifact does not carry then 404s here rather than being quietly
    // satisfied by the host — which is the whole point.
    // `route.continue({url})` cannot cross protocols (https -> http), so the local bytes are
    // FULFILLED directly. A path the artifact lacks answers 404 here, exactly as the bare server does.
    if (DIR && REWRITE_ORIGIN) {
      await page.route(`${REWRITE_ORIGIN}**`, async (route) => {
        const rel = decodeURIComponent(route.request().url().slice(REWRITE_ORIGIN.length).split("?")[0]);
        const file = path.join(DIR, rel.endsWith("/") || rel === "" ? `${rel}index.html` : rel);
        if (!file.startsWith(DIR)) { await route.fulfill({ status: 403, body: "" }); return; }
        try {
          await route.fulfill({
            status: 200,
            contentType: MIME[path.extname(file)] ?? "application/octet-stream",
            body: await readFile(file),
          });
        } catch {
          await route.fulfill({ status: 404, contentType: "text/plain", body: "not found" });
        }
      });
    }

    const foreign = [];
    page.on("request", (r) => {
      const u = r.url();
      if (!u.startsWith(origin) && !u.startsWith("data:") && !u.startsWith("blob:")) foreign.push(u);
    });
    // RESPONSES, not requests — and the distinction is not pedantry, it is what makes the TILED
    // assertion below able to fail. Counting requests scored 50 tiles GREEN against a tree whose
    // pyramid had been DELETED: OSD asks for the tiles its descriptor promises whether or not the
    // host has them, so a request count measures the manifest, never the bytes. Only a 2xx says the
    // tree actually delivered a tile. Proven red-green: pyramid removed -> 0 served, FAIL.
    const served = [];
    page.on("response", (r) => { if (r.status() >= 200 && r.status() < 300) served.push(r.url()); });
    const consoleErrors = [];
    page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
    // NAME the failures. "Failed to load resource: 404" without a URL is a verdict with no subject —
    // it cannot distinguish a missing chunk of the viewer from a lazily-probed optional sidecar.
    const notFound = [];
    page.on("response", (r) => { if (r.status() >= 400) notFound.push(`${r.status()} ${r.url()}`); });

    await page.goto(`${origin}viewer.html`, { waitUntil: "domcontentloaded" });

    // (1) the element booted from the TREE's OWN bundle and rendered the gallery
    let cards = 0;
    try {
      await page.waitForFunction(`${q("ul.grid li button[data-slug]")} > 0`, { timeout: 30000, polling: 300 });
      cards = await page.evaluate(q("ul.grid li button[data-slug]"));
    } catch { /* stays 0 -> FAIL below */ }
    record(cards > 0, "the tree's own bundle boots and renders the gallery", `${cards} exhibit card(s)`);

    // (2) open the exhibit, then its first object -> the deep-zoom canvas
    let canvas = false;
    let objects = 0;
    if (cards > 0) {
      await page.evaluate(`${sr}.querySelector('button[data-slug="${SLUG}"]').click()`);
      await page.waitForFunction(`${q("ul.grid li button[data-obj]")} > 0`, { timeout: 30000, polling: 300 });
      objects = await page.evaluate(q("ul.grid li button[data-obj]"));
      await page.evaluate(`${sr}.querySelector('ul.grid li button[data-obj]').click()`);
      try {
        await page.waitForFunction(`!!${sr}?.querySelector('.reader-surface')?.querySelector('.openseadragon-canvas, canvas')`, { timeout: 30000, polling: 300 });
        canvas = true;
      } catch { /* FAIL below */ }
    }
    record(canvas, "a deep-zoom canvas mounts from the tree's own tiles", canvas ? `.openseadragon-canvas present (${objects} object(s) in the grid)` : "never painted");

    // (3) TILED, not merely painted. This assertion is NOT in the prototype and it is the one this
    // ticket turns on: a canvas element appears whether OSD is deep-zooming a DZI pyramid or showing
    // ONE flat 5184x3456 master, so "canvas present" cannot distinguish working deep zoom from the
    // degraded fallback. `loadLibrary` DROPS `tileSource` on a round trip (site.ts:846), so a naive
    // republish ships exactly that fallback with every other check green. Read the WIRE instead.
    await page.waitForTimeout(2500); // OSD requests tiles after the canvas exists, not with it
    const tiles = served.filter((u) => /_files\/\d+\/\d+_\d+\.(jpe?g|png|webp)(\?|$)/i.test(u));
    record(tiles.length > 0, "deep zoom is TILED — the tree SERVED DZI pyramid tiles, not one flat master",
      tiles.length > 0
        ? `${tiles.length} tile(s) served 2xx, e.g. …${tiles[0].slice(tiles[0].lastIndexOf("_files"))}`
        : "ZERO tiles served — either tileSource was lost on the round trip, or the pyramid is not in the tree");

    // (4) region overlays. PRINT THE SUBJECT: a count of 0 is an EMPTY subject, and reads as a broken
    // feature when it is a library with no live notes. Reported as a FINDING, never as a pass — an
    // assertion over nothing is worse than an absent one.
    let regions = 0;
    if (canvas) {
      await page.waitForTimeout(1000);
      regions = await page.evaluate(q('svg[id^="archie-region-"]'));
    }
    console.log(`\nannotation FINDING — ${regions} region overlay(s) on this object. A click assertion needs a non-empty subject; with 0 published heads there is nothing to click and a "pass" here would measure nothing.`);

    // (5) a hash deep link routes into the tree's own viewer
    let deepLinked = false;
    if (cards > 0) {
      await page.goto(`${origin}viewer.html#/${SLUG}`, { waitUntil: "domcontentloaded" });
      try {
        await page.waitForFunction(`${q("ul.grid li button[data-obj]")} > 0`, { timeout: 30000, polling: 300 });
        deepLinked = true;
      } catch { /* FAIL below */ }
    }
    record(deepLinked, `viewer.html#/${SLUG} deep-links into the exhibit`, deepLinked ? `landed on ${SLUG}'s object grid` : "never routed");

    // (6) the ARCHIVAL page's own link, followed the way a reader would — a real click, so the
    // relative `../viewer.html` is resolved by the browser rather than by this script.
    let fromArchive = false;
    if (cards > 0) {
      await page.goto(`${origin}${SLUG}/index.html`, { waitUntil: "domcontentloaded" });
      await page.click(`a[href="../viewer.html#/${SLUG}"]`);
      try {
        await page.waitForFunction(`${q("ul.grid li button[data-obj]")} > 0`, { timeout: 30000, polling: 300 });
        fromArchive = true;
      } catch { /* FAIL below */ }
    }
    record(fromArchive, "the archival page's relative link reaches the viewer", page.url());

    // (7) NO EXTERNAL *CODE*. The self-containment claim, and the hard one.
    const foreignScripts = foreign.filter((u) => /\.m?js(\?|$)/.test(u));
    record(foreignScripts.length === 0, "NOT ONE BYTE of script comes from outside the tree",
      foreignScripts.length === 0
        ? `0 external scripts (${foreign.length} external request(s) total)`
        : foreignScripts.slice(0, 3).join(", "));
    if (foreign.length > 0) {
      const hosts = [...new Set(foreign.map((u) => { try { return new global.URL(u).host; } catch { return u; } }))];
      console.log(`external-request FINDING — ${foreign.length} request(s) to ${hosts.join(", ")}`);
    }

    if (notFound.length > 0) {
      console.log(`\nnon-2xx responses (${notFound.length}):`);
      for (const e of [...new Set(notFound)].slice(0, 10)) console.log(`  ${e}`);
    }
    if (consoleErrors.length > 0) {
      console.log(`console errors (${consoleErrors.length}):`);
      for (const e of consoleErrors.slice(0, 6)) console.log(`  ${e.slice(0, 200)}`);
    }
  } finally {
    if (browser) await browser.close();
    await stop();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\nRESULT: ${failed.length === 0 ? "PASS" : "FAIL"}  (${results.length - failed.length}/${results.length})  [target ${DIR ?? URL_TARGET}]`);
  process.exit(failed.length === 0 ? 0 : 1);
}

await main();
