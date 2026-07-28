// ARTIFACT DRIVE — does a WEB-TIER published tree put its regions on the right pixels? (Archie-4b0a)
//
// The unit suites prove the projection WRITES scaled coordinates. They cannot prove the published
// artifact then renders a region over the feature the author drew it around: that is OSD's
// `imageToViewportRectangle` against `item.getContentSize()` of the image the tree actually serves,
// and jsdom has neither a layout nor a canvas. This is the gate that can fail.
//
// THE MEASUREMENT, and why it is independent of zoom, pan and window size.
//
// The fixture is a 6000x4000 master with a black square drawn at master pixels (3000,2000)-(3600,2400)
// — i.e. its centre sits at 55% across and 55% down the image. A note is authored around exactly that
// square, in master coordinates, as Studio would store it. The tree then publishes the WEB tier: a
// 2400x1600 image, and (with the fix) selectors scaled by 0.4.
//
// In the browser the drive reads two rectangles out of the shadow DOM:
//   #overlay-wrapper-archie-object-frame  — OSD's own box for the WHOLE object (drawn by the
//                                            whole-object note the fixture also carries)
//   #overlay-wrapper-archie-region-0       — OSD's box for the REGION
// and computes the region centre as a FRACTION of the object's rendered box. That fraction is what
// the author drew: 0.55, 0.55. It cannot move with the viewport, because both rectangles move together.
//
// RED-GREEN: `--no-rescale` bakes the same tree with `scaleSelectors` omitted — the defect this
// ticket fixes, reproduced exactly. The selectors then stay in 6000x4000 space while the image is
// 2400x1600, so the fraction reads ~1.375 (0.55 / 0.4) instead of 0.55 and the region is off the
// image entirely. Anything other than a FAIL there means this drive is measuring nothing.
//
// PORT: binds its own and FAILS if taken — never reuses a sibling's server
// (.claude/rules/viewer-e2e-shared-port.md). The server is closed on every exit path.
//
// Run:  cd apps/viewer && pnpm exec vite-node ../../scripts/probe/web-tier-selector-rescale.mts --port 4488
//       …            same, plus --no-rescale        (must FAIL)
import { createServer } from "node:http";
import { readFile, readdir, mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import path from "node:path";
import {
  MemoryFilesystem, publishLibrary, collectFiles, appendNew, asClientId, asLibraryId, asExhibitId, asObjectId,
  type AnnotationLog, type Library, type FsDirectory, type SelectorScale,
} from "@render/core";
import { launchBrowser } from "../lib/driver.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const EMBED_DIST = path.join(REPO, "packages/archie-viewer/dist");

const NO_RESCALE = process.argv.includes("--no-rescale");
const portArg = process.argv.indexOf("--port");
const PORT = portArg !== -1 ? Number(process.argv[portArg + 1]) : 4488;
const KEEP = process.argv.includes("--keep");

// ------------------------------------------------------------------ the fixture's numbers
const MASTER = { width: 6000, height: 4000 };
const SERVED = { width: 2400, height: 1600 }; // WEB_TIER.maxDim = 2400, aspect-preserved
const SCALE: SelectorScale = { sx: SERVED.width / MASTER.width, sy: SERVED.height / MASTER.height }; // 0.4, 0.4
/** The marker square, in MASTER pixels. Chosen off-centre and non-square-symmetric so a swapped
 *  axis or a mirrored coordinate cannot pass by accident. */
const REGION = { x: 3000, y: 2000, w: 600, h: 400 };
/** What the author drew, as a fraction of the image — the invariant the artifact must preserve. */
const WANT = { fx: (REGION.x + REGION.w / 2) / MASTER.width, fy: (REGION.y + REGION.h / 2) / MASTER.height }; // 0.55, 0.55
/** Tolerance: 1.5% of the image. The defect this gates displaces by 82% of the image width, so the
 *  band is nowhere near wide enough to swallow it — but it is wide enough for OSD's sub-pixel
 *  rounding and for the integer-pixel rounding the scaler documents. */
const TOL = 0.015;

const SLUG = "tier";
const ASSET = "plate.png";

const results: { ok: boolean; label: string; detail: string }[] = [];
const record = (ok: boolean, label: string, detail: string): void => {
  results.push({ ok, label, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
};

// ------------------------------------------------------------------ a real PNG, drawn in Node
/**
 * A minimal true-colour PNG: white ground with one black rectangle. Real bytes, so OSD decodes a real
 * image and reports a real `getContentSize()` — the whole quantity the defect turns on.
 *
 * Hand-rolled rather than pulled from a fixture because the rectangle's position IS the assertion, and
 * a fixture image would make the expected fraction a magic number nobody could re-derive.
 */
function png(width: number, height: number, box: { x: number; y: number; w: number; h: number }): Buffer {
  const raw = Buffer.alloc(height * (1 + width * 3), 0xff);
  for (let y = 0; y < height; y++) {
    const row = y * (1 + width * 3);
    raw[row] = 0; // filter: none
    if (y < box.y || y >= box.y + box.h) continue;
    raw.fill(0x00, row + 1 + box.x * 3, row + 1 + (box.x + box.w) * 3);
  }
  const chunk = (type: string, body: Buffer): Buffer => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(body.length);
    const typed = Buffer.concat([Buffer.from(type, "ascii"), body]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typed) >>> 0);
    return Buffer.concat([len, typed, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 6 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf: Buffer): number {
  let c = -1;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return c ^ -1;
}

// ------------------------------------------------------------------ bake the web-tier tree
const BASE = ""; // relative ids: the tree is served from the server root

/** The library AS THE WEB TIER PROJECTS IT: the object already carries the SERVED dimensions, because
 *  `projectLibraryForTier` rewrites them from `fitWithin` before any encode runs. That is exactly the
 *  state render-core is handed, and exactly why it cannot re-derive the factor itself. */
const library: Library = {
  id: asLibraryId("lib"),
  title: "Tier drive",
  exhibits: [{
    id: asExhibitId("ex"),
    slug: SLUG,
    title: "Tier",
    objects: [{ id: asObjectId("o1"), source: `/assets/${ASSET}`, label: "Plate", format: "image/png", ...SERVED }],
  }],
};

/** Two notes, both authored in MASTER pixel space, as the working store holds them:
 *  - a REGION note (the subject), and
 *  - a WHOLE-OBJECT note, whose only job is to make `frame-overlay.ts` draw
 *    `#archie-object-frame` — the drive's reference rectangle for "where the image is on screen".
 *    Without it there is no independent way to express the region's position as a fraction. */
function buildLog(): AnnotationLog {
  const alice = asClientId("drive");
  const canvas = `${BASE}${SLUG}/canvas/o1`;
  let log = appendNew([], {
    target: {
      type: "SpecificResource",
      source: canvas,
      selector: { type: "FragmentSelector", conformsTo: "http://www.w3.org/TR/media-frags/", value: `xywh=pixel:${REGION.x},${REGION.y},${REGION.w},${REGION.h}` },
    },
    body: { type: "TextualBody", value: "the marker square", format: "text/plain" },
    lastEditor: alice, modifiedAt: "2026-07-27T00:00:00.000Z", now: 1,
  } as never).log;
  log = appendNew(log, {
    target: canvas, // ADR-0018 whole-object note: a bare canvas IRI, no geometry
    wholeObject: true,
    body: { type: "TextualBody", value: "the whole plate", format: "text/plain" },
    lastEditor: alice, modifiedAt: "2026-07-27T00:00:01.000Z", now: 2,
  } as never).log;
  return log;
}

/** The embed bundle, exactly as `packages/archie-viewer/dist` holds it. */
async function embedBundle(): Promise<Map<string, string | ArrayBuffer | Blob>> {
  const out = new Map<string, string | ArrayBuffer | Blob>();
  for (const name of await readdir(EMBED_DIST)) {
    if (name.endsWith(".js")) out.set(name, await readFile(path.join(EMBED_DIST, name), "utf8"));
  }
  if (out.size === 0) throw new Error(`${EMBED_DIST} holds no .js — build the embed first`);
  return out;
}

async function writeTreeToDisk(root: FsDirectory, dir: string): Promise<void> {
  const files = await collectFiles(root);
  for (const [rel, content] of Object.entries(files)) {
    const file = path.join(dir, rel);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, "text" in content ? content.text : Buffer.from(content.base64, "base64"));
  }
}

// ------------------------------------------------------------------ a bare static server
const MIME: Record<string, string> = {
  ".html": "text/html", ".js": "text/javascript", ".json": "application/json",
  ".png": "image/png", ".webp": "image/webp", ".txt": "text/plain", ".xml": "application/xml", ".css": "text/css",
};
function serve(rootDir: string, port: number): Promise<() => Promise<void>> {
  const server = createServer(async (req, res) => {
    let rel = decodeURIComponent((req.url ?? "/").split("?")[0]!);
    if (rel.endsWith("/")) rel += "index.html";
    const file = path.join(rootDir, rel);
    if (!file.startsWith(rootDir)) { res.writeHead(403).end(); return; }
    try {
      // READ FIRST, then head. `res.writeHead(...).end(await readFile(f))` evaluates the head before
      // the read, so a missing file sends 200 and then throws ERR_HTTP_HEADERS_SENT from the catch.
      const buf = await readFile(file);
      res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream" }).end(buf);
    } catch {
      res.writeHead(404, { "content-type": "text/plain" }).end("not found");
    }
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject); // a taken port FAILS the run — never drive someone else's build
    server.listen(port, "127.0.0.1", () => resolve(() => new Promise<void>((r) => server.close(() => r()))));
  });
}

const sr = "document.querySelector('archie-viewer')?.shadowRoot";
const q = (sel: string) => `${sr}?.querySelectorAll(${JSON.stringify(sel)}).length ?? 0`;

async function main(): Promise<void> {
  const bytes = png(SERVED.width, SERVED.height, {
    // The marker as the SERVED image carries it — the master's square, downscaled by the tier. This is
    // the encoder's job in the real pipeline; here it is drawn directly at the served size.
    x: Math.round(REGION.x * SCALE.sx), y: Math.round(REGION.y * SCALE.sy),
    w: Math.round(REGION.w * SCALE.sx), h: Math.round(REGION.h * SCALE.sy),
  });
  const log = buildLog();
  const fs = new MemoryFilesystem();
  const bundle = await embedBundle();
  const result = await publishLibrary(fs, library, () => log, {
    baseUrl: BASE,
    getAsset: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    getViewerBundle: async () => bundle,
    // THE SUBJECT. Omitted under --no-rescale, which is the defect exactly as it shipped.
    ...(NO_RESCALE ? {} : { scaleSelectors: () => SCALE }),
  });
  record(result.unscaledSelectors.length === 0, "every selector in the tree was scalable",
    result.unscaledSelectors.length === 0 ? "0 unscaled" : JSON.stringify(result.unscaledSelectors));

  const dir = await mkdtemp(path.join(tmpdir(), "archie-tier-drive-"));
  await writeTreeToDisk(await fs.root(), dir);

  // Read the published coordinates off the ARTIFACT, before any browser is involved. A wrong number
  // here and a browser assertion would be measuring the same mistake twice.
  const page0 = JSON.parse(await readFile(path.join(dir, SLUG, "canvas", "o1", "annotations.json"), "utf8")) as { items?: Array<{ target: unknown }> };
  const values = (page0.items ?? []).map((a) => {
    const t = a.target as { selector?: { value?: string } } | string;
    return typeof t === "string" ? "(whole-object)" : t.selector?.value ?? "(none)";
  }).sort();
  const wantValue = NO_RESCALE
    ? `xywh=pixel:${REGION.x},${REGION.y},${REGION.w},${REGION.h}`
    : `xywh=pixel:${Math.round(REGION.x * SCALE.sx)},${Math.round(REGION.y * SCALE.sy)},${Math.round(REGION.w * SCALE.sx)},${Math.round(REGION.h * SCALE.sy)}`;
  console.log(`published selectors on canvas o1: ${JSON.stringify(values)}  (expected to contain ${wantValue})`);

  const stop = await serve(dir, PORT);
  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    const notFound: string[] = [];
    page.on("response", (r) => { if (r.status() >= 400) notFound.push(`${r.status()} ${r.url()}`); });

    await page.goto(`http://127.0.0.1:${PORT}/viewer.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(`${q("ul.grid li button[data-slug]")} > 0`, { timeout: 30000, polling: 300 });
    await page.evaluate(`${sr}.querySelector('button[data-slug="${SLUG}"]').click()`);
    await page.waitForFunction(`${q("ul.grid li button[data-obj]")} > 0`, { timeout: 30000, polling: 300 });
    await page.evaluate(`${sr}.querySelector('ul.grid li button[data-obj]').click()`);
    await page.waitForFunction(`!!${sr}?.querySelector('.reader-surface')?.querySelector('.openseadragon-canvas, canvas')`, { timeout: 30000, polling: 300 });
    // The overlays are added after the image opens, and OSD settles its viewport over a few frames.
    await page.waitForTimeout(3000);

    // PRINT THE SUBJECT. A fraction computed from two missing elements is `NaN`, and a drive that
    // reports a verdict without saying what it measured has measured nothing
    // (.claude/rules/post-review-fixes-are-unreviewed.md §1a).
    const measured = await page.evaluate(`(() => {
      const root = document.querySelector('archie-viewer')?.shadowRoot;
      const rectOf = (id) => {
        const el = root?.getElementById(id);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { left: r.left, top: r.top, width: r.width, height: r.height };
      };
      return {
        frame: rectOf('overlay-wrapper-archie-object-frame'),
        region: rectOf('overlay-wrapper-archie-region-0'),
        regionCount: root?.querySelectorAll('svg[id^="archie-region-"]').length ?? 0,
      };
    })()`) as { frame: { left: number; top: number; width: number; height: number } | null; region: { left: number; top: number; width: number; height: number } | null; regionCount: number };

    console.log(`\nSUBJECT: regionCount=${measured.regionCount}  frame=${JSON.stringify(measured.frame)}  region=${JSON.stringify(measured.region)}`);
    record(measured.regionCount === 1, "the object carries exactly one region overlay to measure",
      `${measured.regionCount} region overlay(s) — a fraction computed over zero would be NaN, not a pass`);
    const havePair = !!measured.frame && !!measured.region && measured.frame.width > 0 && measured.frame.height > 0;
    record(havePair, "both reference rectangles exist and the object frame is non-degenerate",
      havePair ? `frame ${measured.frame!.width.toFixed(1)}x${measured.frame!.height.toFixed(1)} px on screen` : "one of the two overlays is missing or zero-sized");

    if (havePair) {
      const f = measured.frame!;
      const r = measured.region!;
      const fx = (r.left + r.width / 2 - f.left) / f.width;
      const fy = (r.top + r.height / 2 - f.top) / f.height;
      const dx = Math.abs(fx - WANT.fx);
      const dy = Math.abs(fy - WANT.fy);
      const ok = dx <= TOL && dy <= TOL;
      record(ok, "the region sits where the author drew it, as a FRACTION of the rendered object",
        `measured (${fx.toFixed(4)}, ${fy.toFixed(4)}) vs authored (${WANT.fx.toFixed(4)}, ${WANT.fy.toFixed(4)}) — Δ (${dx.toFixed(4)}, ${dy.toFixed(4)}), tolerance ${TOL}`);
      // The region's SIZE is the same claim on the other axis of the transform: a scaler that moved
      // the origin and forgot the extent would pass the centre test and fail this one.
      const sw = r.width / f.width;
      const sh = r.height / f.height;
      const wantW = REGION.w / MASTER.width;
      const wantH = REGION.h / MASTER.height;
      const sizeOk = Math.abs(sw - wantW) <= TOL && Math.abs(sh - wantH) <= TOL;
      record(sizeOk, "the region's SIZE is the authored fraction of the object too",
        `measured (${sw.toFixed(4)}, ${sh.toFixed(4)}) vs authored (${wantW.toFixed(4)}, ${wantH.toFixed(4)})`);
    }

    if (notFound.length > 0) {
      console.log(`\nnon-2xx responses (${notFound.length}):`);
      for (const e of [...new Set(notFound)].slice(0, 10)) console.log(`  ${e}`);
    }
  } finally {
    if (browser) await browser.close();
    await stop();
    if (KEEP) console.log(`\ntree kept at ${dir}`);
    else await rm(dir, { recursive: true, force: true });
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\nRESULT: ${failed.length === 0 ? "PASS" : "FAIL"}  (${results.length - failed.length}/${results.length})  [${NO_RESCALE ? "--no-rescale (MUST FAIL)" : "rescale ON"}]`);
  process.exit(failed.length === 0 ? 0 : 1);
}

await main();
