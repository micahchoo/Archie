// A THROWAWAY DOM probe kept in the tree, per .claude/rules/post-review-fixes-are-unreviewed.md 1a:
// the drive's first region search reported "NO region overlays" over 50 objects of an exhibit that
// demonstrably carries three, and the verdict was indistinguishable from a real defect. This printed
// the SUBJECT — which object ids the grid actually holds, which of them are annotated, how long the
// overlays take to appear, and whether `.rc-overview` really returns to the grid — and that is what
// settled it.
//
// Run: node scripts/accept/probe-dom.mjs --dir <web tree> --slug series-01 --port 4578
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { launchBrowser } from "../lib/driver.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const DIR = path.resolve(arg("dir", "/mnt/Ghar/archie-accept-c74e/pub-web"));
const WORK = path.resolve(arg("work", "/mnt/Ghar/archie-accept-c74e/work"));
const SLUG = arg("slug", "series-01");
const PORT = Number(arg("port", "4578"));
const ORIGIN_REWRITE = arg("rewrite-origin", "https://accept.example/thousand/");

const MIME = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".webp": "image/webp", ".jpg": "image/jpeg", ".txt": "text/plain", ".xml": "application/xml" };
const server = createServer(async (req, res) => {
  let rel = decodeURIComponent((req.url ?? "/").split("?")[0]);
  if (rel.endsWith("/")) rel += "index.html";
  const f = path.join(DIR, rel);
  // Read BEFORE writing the head: `writeHead(200).end(await readFile(...))` sends the 200 first, so a
  // missing file then throws ERR_HTTP_HEADERS_SENT inside the catch instead of answering 404.
  let buf;
  try { buf = await readFile(f); } catch { res.writeHead(404).end("not found"); return; }
  res.writeHead(200, { "content-type": MIME[path.extname(f)] ?? "application/octet-stream" }).end(buf);
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

const browser = await launchBrowser();
const page = await browser.newPage();
await page.route(`${ORIGIN_REWRITE}**`, async (route) => {
  const rel = decodeURIComponent(route.request().url().slice(ORIGIN_REWRITE.length).split("?")[0]);
  const f = path.join(DIR, rel.endsWith("/") || rel === "" ? `${rel}index.html` : rel);
  try { await route.fulfill({ status: 200, contentType: MIME[path.extname(f)] ?? "application/octet-stream", body: await readFile(f) }); }
  catch { await route.fulfill({ status: 404, body: "not found" }); }
});
const sr = "document.querySelector('archie-viewer')?.shadowRoot";
await page.goto(`http://127.0.0.1:${PORT}/viewer.html`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(`${sr}?.querySelectorAll('ul.grid li button[data-slug]').length > 0`, { timeout: 60_000, polling: 100 });
await page.evaluate(`${sr}.querySelector('button[data-slug="${SLUG}"]').click()`);
await page.waitForFunction(`${sr}?.querySelectorAll('ul.grid li button[data-obj]').length > 0`, { timeout: 60_000, polling: 100 });

console.log("grid obj ids (first 3):", await page.evaluate(`Array.from(${sr}.querySelectorAll('ul.grid li button[data-obj]')).slice(0,3).map(b=>b.dataset.obj)`));
const annotated = JSON.parse(await readFile(path.join(WORK, "annotated.json"), "utf8"));
const here = annotated.filter((a) => a.slug === SLUG);
console.log(`annotated in ${SLUG}:`, here.map((a) => a.objectId));
if (here.length === 0) { console.log("SUBJECT IS EMPTY — no annotated object in this exhibit"); await browser.close(); server.close(); process.exit(1); }

await page.evaluate(`${sr}.querySelector('ul.grid li button[data-obj="${here[0].objectId}"]').click()`);
await page.waitForFunction(`!!${sr}?.querySelector('.reader-surface')?.querySelector('.openseadragon-canvas, canvas')`, { timeout: 60_000, polling: 100 });
let t = 0;
for (const ms of [300, 700, 1000, 2000, 4000]) {
  await page.waitForTimeout(ms); t += ms;
  console.log(`t+${t}ms after canvas: ${await page.evaluate(`${sr}.querySelectorAll('svg[id^="archie-region-"]').length`)} region(s)`);
}
console.log("chrome:", await page.evaluate(`JSON.stringify({overview: !!${sr}.querySelector('.rc-overview'), steps: ${sr}.querySelectorAll('.rc-step').length, acts: Array.from(${sr}.querySelectorAll('[data-act]')).map(b=>b.dataset.act+(b.disabled?':disabled':''))})`));
await page.evaluate(`${sr}.querySelector('.rc-overview')?.click()`);
await page.waitForTimeout(1500);
console.log("after .rc-overview click, grid buttons:", await page.evaluate(`${sr}.querySelectorAll('ul.grid li button[data-obj]').length`));
await browser.close();
server.close();
