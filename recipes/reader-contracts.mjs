// Real-browser embed contract regressions. Build @render/archie-viewer first, then run this file.
// Uses its package dist directly and publishes a local fixture through the real in-memory publisher.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { join, basename } from "node:path";

const repo = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(join(repo, "package.json"));
const { chromium } = require("playwright");
const { build } = createRequire(join(repo, "packages/archie-viewer/package.json"))("esbuild");
const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
async function bounded(promise, label) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), 10000);
    })]);
  } finally { clearTimeout(timer); }
}
const defer = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

export async function runReaderContracts() {
  const helper = await build({
    entryPoints: [join(repo, "packages/archie-viewer/src/reader-contract-fixture.ts")],
    bundle: true, format: "esm", platform: "browser", write: false, logLevel: "silent",
  });
  const html = `<!doctype html><style>archie-viewer{display:block;height:800px}</style><script type="module">
    import '/dist/archie-viewer.js';
    import { readerContractFixture } from '/fixture.js';
    window.fixture = await readerContractFixture();
    window.ready = true;
  </script>`;
  const server = createServer(async (req, res) => {
    try {
      if (req.url === "/") { res.setHeader("content-type", "text/html"); res.end(html); return; }
      res.setHeader("content-type", "text/javascript");
      if (req.url === "/fixture.js") { res.end(helper.outputFiles[0].text); return; }
      if (!req.url.startsWith("/dist/")) { res.writeHead(404).end(); return; }
      res.end(await readFile(join(repo, "packages/archie-viewer/dist", basename(req.url))));
    } catch (e) { res.writeHead(500).end(String(e)); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  let passed = 0;
  const cases = async (label, test) => {
    const page = await browser.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    const remote = [];
    await page.route("https://tracker.test/**", async route => {
      remote.push(route.request().url());
      await route.fulfill({ contentType: "image/png", body: pixel });
    });
    try {
      await page.goto(base);
      await page.waitForFunction(() => window.ready);
      await test(page, remote);
      assert.deepEqual(errors, [], "uncaught browser errors");
      ++passed;
      console.log(`  PASS  reader contract · ${label}`);
    } finally { await page.close(); }
  };
  const mount = (page, offline = false) => page.evaluate(async offline => {
    window.el = document.createElement("archie-viewer");
    el.offline = offline;
    document.body.append(el);
    await el.openLibraryFs(fixture.fs);
  }, offline);
  const target = (page, address) => page.evaluate(value => { el.target = value; }, address);
  const noteTarget = (page, id) => page.evaluate(key => { el.target = `#/contracts/a/${fixture[key]}`; }, id);

  try {
    await cases("offline covers, thumbnails, note bodies, media sheets and narrative emit no remote requests", async (page, remote) => {
      await mount(page, true);
      await target(page, "#/contracts");
      await page.locator('archie-viewer [data-obj="image"]').waitFor();
      await noteTarget(page, "mediaId");
      await page.locator("archie-viewer .archie-note-card:visible").waitFor();
      await page.locator("archie-viewer .archie-note-card__expand").click();
      await page.locator('archie-viewer [role="dialog"]:visible').waitFor();
      await target(page, "#/contracts");
      await page.locator('archie-viewer [data-act="narrative"]').click();
      await page.locator("archie-viewer .nr-prose").waitFor();
      assert.equal(await page.locator('archie-viewer [src*="tracker.test"], archie-viewer [poster*="tracker.test"], archie-viewer [srcset*="tracker.test"]').count(), 0);
      assert.deepEqual(remote, []);
    });

    await cases("Reading-only citations and same-object search activate the Reading and open paused", async page => {
      await mount(page);
      await noteTarget(page, "readingId");
      await page.locator("archie-viewer .archie-note-card:visible").waitFor();
      assert.equal(await page.locator('archie-viewer [data-reading="cipher"]').getAttribute("aria-checked"), "true");
      assert.match(await page.locator("archie-viewer .archie-note-card").innerText(), /Exclusive cipher zebra/);
      assert.deepEqual(await page.locator("archie-viewer .av audio").evaluate(n => ({ paused: n.paused, time: n.currentTime })), { paused: true, time: 0 });
      await target(page, "#/contracts/o/audio");
      await page.locator("archie-viewer .rc-find").fill("zebra");
      await page.locator('archie-viewer [aria-label="Search results"] button').click();
      await page.locator("archie-viewer .archie-note-card:visible").waitFor();
      assert.equal(await page.locator('archie-viewer [data-reading="cipher"]').getAttribute("aria-checked"), "true");
    });

    await cases("switching offline tears down live media and blocks subsequent note requests", async (page, remote) => {
      await mount(page);
      await noteTarget(page, "mediaId");
      await page.locator("archie-viewer .archie-note-card:visible").waitFor();
      assert.ok(remote.length > 0, "online control actually requested the hostile media");
      await page.evaluate(() => {
        window.oldAudio = el.shadowRoot.querySelector(".av audio");
        el.offline = true;
      });
      await page.waitForFunction(() => el.shadowRoot.querySelector(".av audio")?.readyState >= 1);
      assert.deepEqual(await page.evaluate(() => ({ src: oldAudio.getAttribute("src"), paused: oldAudio.paused })), { src: null, paused: true });
      const before = remote.length;
      await target(page, "#/");
      await noteTarget(page, "mediaId");
      await page.locator("archie-viewer .archie-note-card:visible").waitFor();
      await page.locator("archie-viewer .archie-note-card__expand").click();
      await page.locator('archie-viewer [role="dialog"]:visible').waitFor();
      assert.equal(remote.length, before);
    });

    for (const chunk of ["reading-layer", "reader"]) {
      await cases(`gallery supersedes a held ${chunk} import`, async page => {
        const held = defer();
        const started = defer();
        await page.route(new RegExp(`/dist/${chunk}-[^/]+\\.js$`), async route => {
          started.resolve(route.request().url());
          await held.promise;
          await route.continue();
        });
        await mount(page);
        await target(page, "#/contracts/o/image");
        const url = await bounded(started.promise, `${chunk} request`);
        await target(page, "#/");
        held.resolve();
        // Await that actual module's evaluation, so absence isn't asserted ahead of the stale continuation.
        await page.evaluate(url => import(url), url);
        assert.equal(await page.locator("archie-viewer .intro h1").innerText(), "Reader contracts");
        assert.equal(await page.locator("archie-viewer .reader, archie-viewer .archie-note-card").count(), 0);
      });
    }

    await cases("offline cancels a pending OSD mount without reviving it after the source arrives", async page => {
      const held = defer();
      const started = defer();
      await page.route("https://tracker.test/image.jpg", async route => {
        started.resolve();
        await held.promise;
        await route.fulfill({ contentType: "image/png", body: pixel }).catch(() => {});
      });
      await mount(page);
      await target(page, "#/contracts/o/image");
      await bounded(started.promise, "OSD source request");
      await page.evaluate(() => { el.offline = true; });
      await page.locator("archie-viewer .reader-surface .notice").waitFor();
      held.resolve();
      // A subsequent public navigation proves the cancelled opener cannot own the new surface.
      await target(page, "#/contracts/o/audio");
      await page.waitForFunction(() => el.shadowRoot.querySelector(".av audio")?.readyState >= 1);
      assert.equal(await page.locator("archie-viewer .openseadragon-container").count(), 0);
      assert.equal(await page.locator("archie-viewer .topbar .title").innerText(), "Audio");
    });
    console.log(`reader contracts: ${passed}/6 passed`);
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await runReaderContracts();
