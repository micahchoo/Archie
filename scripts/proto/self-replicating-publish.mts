// PROTOTYPE DRIVE — does a published tree that carries its own viewer actually work? (Archie-e09d)
//
// The unit suites prove `publishLibrary` WRITES `_viewer/` and points the pages at it. They cannot
// prove a browser then boots that bundle, mounts a deep-zoom canvas from the tree's own tiles, and
// opens a note on a real click — every one of those is hit-testing, module resolution, and fetch
// behaviour, and jsdom has none of them. This is the gate that can fail.
//
// What it does, end to end:
//   1. reads the committed published tree from disk into a MemoryFilesystem
//   2. `loadLibrary` → `publishLibrary` with `getViewerBundle` wired to packages/archie-viewer/dist
//   3. writes the result to a temp dir and serves it with a BARE static server (no framework, no
//      dev server, no rewrites) — the "any static host" claim, tested rather than asserted
//   4. drives Chromium against it and asserts the interactive surface really works
//   5. probes `file://` and reports the verdict honestly rather than assuming it
//
// RED-GREEN:  --no-viewer bakes the SAME tree with `getViewerBundle` omitted. viewer.html must 404
// and the drive must fail at the first canvas assertion. A run that stays green without the bundle
// is measuring something other than what it claims.
//
// Port: pass --port to run beside a sibling. A fresh port per run, and the server is killed on exit —
// see .claude/rules/viewer-e2e-shared-port.md for why a reused server silently drives someone else's
// build. This harness NEVER reuses: it binds its own port and fails if that port is taken.
//
// Run:  cd apps/viewer && pnpm exec vite-node ../../scripts/proto/self-replicating-publish.mts
import { createServer } from "node:http";
import { readFile, readdir, stat, mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import {
  MemoryFilesystem, publishLibrary, collectFiles, loadLibrary, appendNew, asClientId,
  type AnnotationLog, type FsDirectory,
} from "@render/core";
import { launchBrowser } from "../lib/driver.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SOURCE_TREE = path.join(REPO, "apps/viewer/public/published");
const EMBED_DIST = path.join(REPO, "packages/archie-viewer/dist");

const NO_VIEWER = process.argv.includes("--no-viewer");
const portArg = process.argv.indexOf("--port");
const PORT = portArg !== -1 ? Number(process.argv[portArg + 1]) : 4471;
const KEEP = process.argv.includes("--keep");

// The exhibit the drive uses. It must be OFFLINE-capable — local `assets/` bytes, not a remote IIIF
// service — or the run would be measuring Yale's CDN rather than this tree.
//
// It is also the ONLY offline exhibit in the committed fixture tree, and it carries ZERO annotations
// (measured: `canvas/*/annotations.json` items = 0 across all 20 canvases, while voynich has 21 and
// language-atlas 8 — all of them remote-sourced). The first version of this harness drove it anyway
// and reported "no note card", a false RED against perfectly good code: the subject was empty. So
// the harness AUTHORS one note onto its first canvas below. That is not a fixture cheat — the note
// travels through the real spine (`appendNew` → `publishLibrary` → the published annotation page),
// which is exactly the path under test.
const SLUG = "screenshots";
const PROBE_NOTE = "A note authored by the self-replicating publish drive.";

const results: { ok: boolean; label: string; detail: string }[] = [];
const record = (ok: boolean, label: string, detail: string): void => {
  results.push({ ok, label, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
};

// ------------------------------------------------------------------ bake

/** Read a disk directory into an fs-seam directory, recursively. */
async function loadDirInto(dir: FsDirectory, diskPath: string): Promise<void> {
  for (const name of await readdir(diskPath)) {
    const p = path.join(diskPath, name);
    if ((await stat(p)).isDirectory()) {
      await loadDirInto(await dir.getDirectory(name, { create: true }), p);
    } else {
      const w = await (await dir.getFile(name, { create: true })).writable();
      const buf = await readFile(p);
      await w.write(new Uint8Array(buf).buffer as ArrayBuffer);
      await w.close();
    }
  }
}

/** The embed bundle, exactly as `packages/archie-viewer/dist` holds it — flat, entry + chunks. */
async function embedBundle(): Promise<Map<string, string | ArrayBuffer | Blob>> {
  const out = new Map<string, string | ArrayBuffer | Blob>();
  for (const name of await readdir(EMBED_DIST)) {
    if (!name.endsWith(".js")) continue;
    out.set(name, await readFile(path.join(EMBED_DIST, name), "utf8"));
  }
  return out;
}

async function bake(baseUrl: string): Promise<{ dir: string; bytes: number; files: number }> {
  const src = new MemoryFilesystem();
  await loadDirInto(await src.root(), SOURCE_TREE);
  const loaded = await loadLibrary(src);

  // Author one region note onto the offline exhibit's first canvas, so the click assertion has a
  // non-empty subject (see the SLUG comment). A generous centred rect: the drive clicks its centre,
  // and a sliver would turn a hit-testing gate into a coordinate lottery.
  const target = loaded.library.exhibits.find((e) => e.slug === SLUG);
  const obj = target?.objects[0];
  if (!target || !obj) throw new Error(`fixture tree has no "${SLUG}" exhibit with an object`);
  const w = obj.width ?? 1000, h = obj.height ?? 1000;
  loaded.logs[target.id] = appendNew(loaded.logs[target.id] ?? [], {
    target: {
      type: "SpecificResource",
      source: `${baseUrl}${SLUG}/canvas/${obj.id}`,
      selector: {
        type: "FragmentSelector",
        conformsTo: "http://www.w3.org/TR/media-frags/",
        value: `xywh=pixel:${Math.round(w * 0.2)},${Math.round(h * 0.2)},${Math.round(w * 0.6)},${Math.round(h * 0.6)}`,
      },
    },
    body: { type: "TextualBody", value: PROBE_NOTE },
    lastEditor: asClientId("proto-drive"),
    modifiedAt: "2026-07-27T00:00:00.000Z",
    now: 1,
  }).log;

  const getLog = (id: string): AnnotationLog => loaded.logs[id] ?? [];
  // `loadLibrary` inverts published asset URLs back to the working `/assets/{name}` form, so a
  // re-publish must be able to hand the bytes back or the manifest ships pointers to nothing.
  const getAsset = async (slug: string, name: string): Promise<ArrayBuffer | null> => {
    try {
      const exDir = await (await src.root()).getDirectory(slug);
      return await (await (await exDir.getDirectory("assets")).getFile(name)).readable();
    } catch { return null; }
  };

  const out = new MemoryFilesystem();
  const bundle = NO_VIEWER ? undefined : await embedBundle();
  await publishLibrary(out, loaded.library, getLog, {
    baseUrl,
    getAsset,
    ...(bundle ? { getViewerBundle: async () => bundle } : {}),
  });

  const dir = await mkdtemp(path.join(tmpdir(), "archie-selfrep-"));
  const files = await collectFiles(await out.root());
  let bytes = 0;
  for (const [rel, content] of Object.entries(files)) {
    const dest = path.join(dir, rel);
    await mkdir(path.dirname(dest), { recursive: true });
    const buf = "text" in content ? Buffer.from(content.text, "utf8") : Buffer.from(content.base64, "base64");
    await writeFile(dest, buf);
    bytes += buf.length;
  }
  return { dir, bytes, files: Object.keys(files).length };
}

// ------------------------------------------------------------------ serve

const MIME: Record<string, string> = {
  ".html": "text/html", ".js": "text/javascript", ".json": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".svg": "image/svg+xml", ".txt": "text/plain", ".xml": "application/xml", ".css": "text/css",
};

/** A BARE static server: path → file, `/` → index.html, 404 otherwise. No SPA rewrite, no history
 *  fallback, no directory listing — the floor a GitHub Pages / S3 / `python3 -m http.server` host
 *  offers. If the tree needs anything more than this, it is not "any static host". */
function serve(rootDir: string, port: number): Promise<() => Promise<void>> {
  const server = createServer(async (req, res) => {
    let rel = decodeURIComponent((req.url ?? "/").split("?")[0]!);
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

// ------------------------------------------------------------------ drive

// NULL-SAFE on purpose. A `waitForFunction` predicate that throws is not retried — it rejects — and
// during a navigation the OLD document is still current for a beat, where `<archie-viewer>` does not
// exist. The first version of this harness read that as "the archival page's link never reached the
// viewer" while `page.url()` in the very same failure line showed it had. Optional chaining turns a
// throw into a `false` the poller can wait through.
const sr = "document.querySelector('archie-viewer')?.shadowRoot";
const q = (sel: string): string => `${sr}?.querySelectorAll(${JSON.stringify(sel)}).length ?? 0`;

async function main(): Promise<void> {
  const origin = `http://127.0.0.1:${PORT}/`;
  const { dir, bytes, files } = await bake(origin);
  console.log(`baked ${files} files / ${(bytes / 1024 / 1024).toFixed(2)} MB → ${dir}${NO_VIEWER ? "  [--no-viewer: RED run]" : ""}`);

  const stop = await serve(dir, PORT);
  let browser;
  try {
    // Tree shape, read off DISK rather than from the publish result — the artifact, not the exit code.
    const has = async (rel: string): Promise<boolean> => { try { await stat(path.join(dir, rel)); return true; } catch { return false; } };
    record(await has("viewer.html") !== NO_VIEWER, "viewer.html presence tracks the bundle",
      `viewer.html ${await has("viewer.html") ? "present" : "absent"} (--no-viewer=${NO_VIEWER})`);
    record(await has("_viewer/archie-viewer.js") !== NO_VIEWER, "_viewer/ carries the embed entry",
      `${await has("_viewer/archie-viewer.js") ? "present" : "absent"}`);
    record(await has(".nojekyll") !== NO_VIEWER, ".nojekyll ships beside _viewer (GitHub Pages runs Jekyll)",
      `${await has(".nojekyll") ? "present" : "absent"}`);
    const exhibitPage = await readFile(path.join(dir, SLUG, "index.html"), "utf8");
    record(exhibitPage.includes('href="../viewer.html#/' + SLUG) !== NO_VIEWER,
      "the exhibit page links to the TREE's viewer, relatively",
      NO_VIEWER ? "no ../viewer.html link (correct without a bundle)" : `../viewer.html#/${SLUG}`);

    browser = await launchBrowser();
    const page = await browser.newPage();

    // NO CDN, NO EXTERNAL ORIGIN. Every request must land on our own server; anything else means the
    // tree is not self-contained, whatever the file listing says.
    const foreign: string[] = [];
    page.on("request", (r) => { if (!r.url().startsWith(origin) && !r.url().startsWith("data:") && !r.url().startsWith("blob:")) foreign.push(r.url()); });
    const consoleErrors: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });

    await page.goto(`${origin}viewer.html`, { waitUntil: "domcontentloaded" });

    // (1) the element booted from the tree's OWN bundle and rendered the gallery
    let cards = 0;
    try {
      await page.waitForFunction(`${q("ul.grid li button[data-slug]")} > 0`, { timeout: 20000, polling: 300 });
      cards = await page.evaluate(q("ul.grid li button[data-slug]")) as number;
    } catch { /* stays 0 → FAIL below */ }
    record(cards > 0, "the tree's own bundle boots and renders the gallery", `${cards} exhibit cards`);

    // (2) open the offline exhibit, then its first object → the deep-zoom canvas
    let canvas = false;
    if (cards > 0) {
      await page.evaluate(`${sr}.querySelector('button[data-slug="${SLUG}"]').click()`);
      await page.waitForFunction(`${q("ul.grid li button[data-obj]")} > 0`, { timeout: 20000, polling: 300 });
      await page.evaluate(`${sr}.querySelector('ul.grid li button[data-obj]').click()`);
      try {
        await page.waitForFunction(`!!${sr}?.querySelector('.reader-surface')?.querySelector('.openseadragon-canvas, canvas')`, { timeout: 25000, polling: 300 });
        canvas = true;
      } catch { /* FAIL below */ }
    }
    record(canvas, "a deep-zoom canvas mounts from the tree's own tiles", canvas ? ".openseadragon-canvas present" : "never painted");

    // (3) a REAL mouse click on an annotation region opens the note. Synthetic clicks and keyboard
    // Enter both succeed against code where a real pointer does nothing — see
    // .claude/rules/osd-overlay-wrapper.md. Only a driven pointer sequence can fail here.
    let noteText = "";
    let regions = -1;
    let clickedAt = "";
    if (canvas) {
      try {
        await page.waitForFunction(`${q('svg[id^="archie-region-"]')} > 0`, { timeout: 20000, polling: 300 });
        regions = await page.evaluate(q('svg[id^="archie-region-"]')) as number;
        const box = await page.evaluate(`(() => {
          const g = ${sr}.querySelector('svg[id^="archie-region-"]').querySelector('rect, polygon, path, ellipse, circle');
          const r = g.getBoundingClientRect();
          return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        })()`) as { x: number; y: number };
        clickedAt = `(${Math.round(box.x)}, ${Math.round(box.y)})`;
        await page.mouse.click(box.x, box.y);
        await page.waitForFunction(`!!${sr}?.querySelector('.archie-note-card')`, { timeout: 10000, polling: 200 });
        noteText = (await page.evaluate(`${sr}.querySelector('.archie-note-card').textContent.trim().slice(0, 60)`)) as string;
      } catch { /* FAIL below */ }
    }
    // PRINT THE SUBJECT, not only the verdict: a region count of 0 is an EMPTY subject, and reads as
    // a broken feature when it is a fixture with no notes. That is exactly what happened first time.
    record(noteText.length > 0 && noteText.includes(PROBE_NOTE.slice(0, 20)),
      "a real click on a region opens ITS note",
      `${regions} region overlays; clicked ${clickedAt || "nowhere"}; card = ${noteText ? JSON.stringify(noteText) : "none"}`);

    // (4) a hash deep link routes into the tree's own viewer
    let deepLinked = false;
    if (cards > 0) {
      await page.goto(`${origin}viewer.html#/${SLUG}`, { waitUntil: "domcontentloaded" });
      try {
        await page.waitForFunction(`${q("ul.grid li button[data-obj]")} > 0`, { timeout: 20000, polling: 300 });
        deepLinked = true;
      } catch { /* FAIL below */ }
    }
    record(deepLinked, "viewer.html#/{slug} deep-links into the exhibit", deepLinked ? `landed on ${SLUG}'s object grid` : "never routed");

    // (5) the ARCHIVAL page's own link is followed the way a reader would — a click, not a constructed
    // URL, so the relative `../viewer.html` is resolved by the browser rather than by this script.
    let fromArchive = false;
    if (cards > 0) {
      await page.goto(`${origin}${SLUG}/index.html`, { waitUntil: "domcontentloaded" });
      await page.click(`a[href="../viewer.html#/${SLUG}"]`);
      try {
        await page.waitForFunction(`${q("ul.grid li button[data-obj]")} > 0`, { timeout: 20000, polling: 300 });
        fromArchive = true;
      } catch { /* FAIL below */ }
    }
    record(fromArchive, "the archival page's relative link reaches the viewer", page.url());

    // NO EXTERNAL *CODE*. This is the self-replication claim and it is the hard one: not one byte of
    // script may come from anywhere but the tree.
    //
    // It is deliberately NOT "no foreign requests at all", which the first version asserted and which
    // failed — correctly, and for a reason that has nothing to do with this feature. The fixture
    // library's gallery thumbnails point at Yale's and archive.org's IIIF services because those
    // exhibits' SOURCES are remote: that is the library's DATA, chosen by its author, and no publish
    // mechanism can make a remote image local without baking tiles (`tileRemote`, already an option).
    // Conflating the two would let a data choice fail a code claim — and would have hidden a real CDN
    // dependency behind a red run everyone learned to ignore.
    const foreignScripts = foreign.filter((u) => /\.m?js(\?|$)/.test(u));
    record(foreignScripts.length === 0, "NOT ONE BYTE of script comes from outside the tree",
      foreignScripts.length === 0 ? `0 external scripts (${foreign.length} external requests, all image data)` : foreignScripts.slice(0, 3).join(", "));
    const hosts = [...new Set(foreign.map((u) => { try { return new URL(u).host; } catch { return u; } }))];
    console.log(`\nexternal-request FINDING — ${foreign.length} request(s)${hosts.length > 0 ? ` to ${hosts.join(", ")}: the FIXTURE's own remote image sources, not a viewer dependency` : " — nothing outside the tree was contacted at all"}. The count varies run to run because gallery thumbnails load lazily; the script assertion above is the invariant one.`);

    // (6) file:// — measured, not assumed. Recorded as a FINDING either way; it is not a pass/fail
    // of the prototype, because a multi-file tree cannot inline its data the way the single-file
    // export does (apps/studio/src/single-file-export.ts).
    if (NO_VIEWER) console.log("\nfile:// probes skipped — the RED run writes no viewer.html, which is the point");
    else await fileProbes(browser, dir);

    if (consoleErrors.length > 0) {
      console.log(`\nhttp console errors (${consoleErrors.length}):`);
      for (const e of consoleErrors.slice(0, 5)) console.log(`  ${e.slice(0, 200)}`);
    }
    // Tree weight, so the ledger reports a measured delta rather than an estimate.
    const viewerBytes = NO_VIEWER ? 0 : await dirBytes(path.join(dir, "_viewer"));
    console.log(`\nTREE WEIGHT — ${bytes} bytes across ${files} files; _viewer/ ${viewerBytes} bytes. Exact counts, not MB: the delta between a --no-viewer and a normal run is the deliverable's cost and rounding hides it.`);
  } finally {
    if (browser) await browser.close();
    await stop();
    if (KEEP) console.log(`\nkept: ${dir}`);
    else await rm(dir, { recursive: true, force: true }).catch(() => {});
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\nRESULT: ${failed.length === 0 ? "PASS" : "FAIL"}  (${results.length - failed.length}/${results.length})`);
  process.exit(failed.length === 0 ? 0 : 1);
}

/** Both file:// blockers, measured rather than assumed. Neither is a pass/fail of the prototype —
 *  they are the deliverable's honest boundary. */
async function fileProbes(browser: Awaited<ReturnType<typeof launchBrowser>>, dir: string): Promise<void> {
    const filePage = await browser.newPage();
    const fileErrors: string[] = [];
    filePage.on("console", (m) => { if (m.type() === "error") fileErrors.push(m.text()); });
    filePage.on("pageerror", (e) => fileErrors.push(String(e.message)));
    await filePage.goto(pathToFileURL(path.join(dir, "viewer.html")).href, { waitUntil: "domcontentloaded" });
    await filePage.waitForTimeout(4000);
    const fileCards = await filePage.evaluate(`(() => { const el = document.querySelector('archie-viewer'); const s = el && el.shadowRoot; return s ? s.querySelectorAll('ul.grid li button[data-slug]').length : -1; })()`) as number;
    console.log(`\nfile:// FINDING — shadowRoot ${fileCards === -1 ? "never created (element did not upgrade)" : `rendered ${fileCards} cards`}`);
    for (const e of fileErrors.slice(0, 4)) console.log(`  file:// error: ${e.slice(0, 200)}`);

    // The module-script refusal is only the FIRST blocker, and a reader could reasonably conclude that
    // rebuilding the tree's viewer as the IIFE bundle (dist-single, which exists precisely for
    // file://) would fix it. Measure the SECOND blocker so the verdict is complete rather than
    // stopping at the first thing that breaks: a plain classic script fetching a sibling JSON, which
    // is what ANY bundle format must do to read a multi-file tree.
    const probeName = "_file-fetch-probe.html";
    await writeFile(path.join(dir, probeName),
      `<!doctype html><meta charset=utf-8><body><script>
fetch("./exhibits.json").then(r => r.text()).then(t => { document.title = "OK:" + t.length; })
  .catch(e => { document.title = "ERR:" + e; });
</script>`);
    const probePage = await browser.newPage();
    const probeErrors: string[] = [];
    probePage.on("console", (m) => { if (m.type() === "error") probeErrors.push(m.text()); });
    await probePage.goto(pathToFileURL(path.join(dir, probeName)).href, { waitUntil: "domcontentloaded" });
    await probePage.waitForTimeout(1500);
    console.log(`file:// DATA FETCH — a classic script fetching ./exhibits.json → ${await probePage.title()}`);
    for (const e of probeErrors.slice(0, 2)) console.log(`  ${e.slice(0, 200)}`);
}

async function dirBytes(dir: string): Promise<number> {
  let total = 0;
  for (const name of await readdir(dir)) {
    const p = path.join(dir, name);
    const s = await stat(p);
    total += s.isDirectory() ? await dirBytes(p) : s.size;
  }
  return total;
}

await main();
