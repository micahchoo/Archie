// Shared drive for the Archie-c74e acceptance pages: a bare vite server, a real Chromium, and a
// memory sampler that can actually see what this run is about.
//
// MEMORY — why the sampler is OS RSS over the whole browser process tree, and not `Runtime.getHeapUsage`.
// Archie-c74e absorbed Archie-b9c4 (heap-aware cache budgets) and its own text disqualifies the V8
// heap number in advance: `Runtime.getHeapUsage` does NOT include decoded image surfaces, OSD tile
// textures, or GPU memory — *exactly* what a cache budget would be about. Chromium puts decoded
// bitmaps and canvas backing stores in the RENDERER and GPU processes' address spaces, so the
// instrument that sees them is the operating system's. `/proc/<pid>/statm` summed over the launched
// browser's whole process tree is that instrument, and it is honest about what it is: resident set,
// including shared mappings, sampled at 1 Hz. It over-counts shared pages across processes and it
// cannot attribute a byte to a cache. It CAN answer the two questions the ticket asks — what was the
// peak, and does it grow without bound across a walk — which the heap number cannot.
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import fsp from "node:fs/promises";
import path from "node:path";
import { launchBrowser } from "../lib/driver.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(HERE, "..", "..");

/** Every pid under `root` (inclusive), read from /proc — Chromium forks a renderer, a GPU process and
 *  N utility processes, and the decoded surfaces live in the ones that are NOT the browser process. */
async function processTree(root) {
  const pids = [];
  let entries;
  try { entries = await fsp.readdir("/proc"); } catch { return pids; }
  const parent = new Map();
  for (const e of entries) {
    if (!/^\d+$/.test(e)) continue;
    try {
      const stat = await fsp.readFile(`/proc/${e}/stat`, "utf8");
      // The comm field can contain spaces and parens — parse from the LAST ')'.
      const after = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
      parent.set(Number(e), Number(after[1]));
    } catch { /* the process exited between readdir and read — normal */ }
  }
  const stack = [root];
  const seen = new Set();
  while (stack.length > 0) {
    const p = stack.pop();
    if (seen.has(p)) continue;
    seen.add(p); pids.push(p);
    for (const [pid, ppid] of parent) if (ppid === p && !seen.has(pid)) stack.push(pid);
  }
  return pids;
}

const PAGE_BYTES = 4096;
async function treeRssBytes(root) {
  let total = 0, n = 0;
  for (const pid of await processTree(root)) {
    try {
      const statm = await fsp.readFile(`/proc/${pid}/statm`, "utf8");
      total += Number(statm.split(" ")[1]) * PAGE_BYTES; // field 2 = resident
      n++;
    } catch { /* exited */ }
  }
  return { bytes: total, procs: n };
}

/**
 * Boot vite on `port` rooted at scripts/accept, open `page` in Chromium, and resolve when the page
 * sets `window.__BENCH__`.
 *
 * `onSample` is called ~1 Hz with `{ t, rssBytes, procs }` so a caller can build its own timeline.
 */
export async function runPage({ pageUrlPath, port, allow = [], timeoutMs = 6 * 3600_000, onConsole, sampleMs = 1000, mounts = {}, initScript = null }) {
  const req = createRequire(path.join(REPO, "apps/studio/package.json"));
  const { createServer } = await import(pathToFileURL(req.resolve("vite")).href);
  const server = await createServer({
    root: HERE,
    configFile: false,
    logLevel: "warn",
    // The bare `@render/core` specifier is narrowed — see scripts/accept/render-core-shim.ts.
    resolve: { alias: { "@render/core": path.join(HERE, "render-core-shim.ts") } },
    server: { port, strictPort: true, fs: { allow: [REPO, ...allow] } },
    plugins: [{
      // Static mounts: `{ "/viewer-dist": "<abs dir>" }`. Vite's own `/@fs/` escape hatch would serve
      // these too, but through its TRANSFORM pipeline — a `.js` under /@fs is rewritten as a module,
      // and the embed bundle must reach the published tree BYTE-FOR-BYTE or the tree ships a viewer
      // that only works behind a dev server.
      name: "accept-mounts",
      configureServer(s) {
        s.middlewares.use(async (rq, rs, next) => {
          const url = (rq.url ?? "").split("?")[0];
          for (const [prefix, dir] of Object.entries(mounts)) {
            if (!url.startsWith(prefix + "/")) continue;
            const file = path.join(dir, decodeURIComponent(url.slice(prefix.length + 1)));
            if (!file.startsWith(dir)) { rs.statusCode = 403; rs.end(); return; }
            try {
              const buf = await fsp.readFile(file);
              rs.setHeader("content-type", "application/octet-stream");
              rs.end(buf);
            } catch { rs.statusCode = 404; rs.end("not found"); }
            return;
          }
          next();
        });
      },
    }],
  });
  await server.listen();
  const url = `http://localhost:${port}${pageUrlPath}`;
  console.log(`• page ${url}`);

  const browser = await launchBrowser({ headless: !process.env.HEADED });
  const page = await browser.newPage();
  if (initScript) await page.addInitScript(initScript);
  page.on("console", (m) => { const s = `  [${m.type()}] ${m.text()}`; console.log(s); onConsole?.(m); });
  let onPageError;
  const failed = new Promise((_, reject) => { onPageError = reject; });
  page.on("pageerror", (e) => { console.log(`  [pageerror] ${e.message}`); onPageError(e); });

  // The browser's own pid — Playwright exposes it via the underlying process.
  const rootPid = browser.process?.()?.pid ?? process.pid;
  const samples = [];
  let peak = { bytes: 0, procs: 0, t: 0 };
  const t0 = Date.now();
  const timer = setInterval(async () => {
    const s = await treeRssBytes(rootPid);
    const sample = { t: (Date.now() - t0) / 1000, rssBytes: s.bytes, procs: s.procs };
    samples.push(sample);
    if (s.bytes > peak.bytes) peak = { bytes: s.bytes, procs: s.procs, t: sample.t };
    onSampleHook?.(sample);
  }, sampleMs);
  let onSampleHook = null;

  await page.goto(url, { waitUntil: "load" });
  let results;
  try {
    results = await Promise.race([
      page.waitForFunction(() => window.__BENCH__, null, { timeout: timeoutMs }).then((h) => h.jsonValue()),
      failed,
    ]);
  } finally {
    clearInterval(timer);
    await browser.close().catch(() => {});
    await server.close().catch(() => {});
  }
  return { results, memory: { peakRssBytes: peak.bytes, peakProcs: peak.procs, peakAtSec: peak.t, samples } };
}
