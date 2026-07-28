// PROTOTYPE DRIVE — can ONE .html file render a full exhibit (image + clickable annotations) from
// `file://` with the network cut? (Archie-c34f, unblocked by Archie-5582's research.)
//
// WHAT ALREADY EXISTED ON THIS BASE, and what did not. Two halves of the answer were already in the
// tree and neither had ever met a browser:
//   • `packages/archie-viewer/build.mjs` `buildSingleFile` (f637dd3) — the IIFE, no-splitting target
//     in `dist-single/`, because browsers refuse ES *module* scripts from a `file://` origin and
//     `splitting:false` leaves esbuild nowhere to emit `element.ts`'s `await import("./reader.js")`
//     as a sibling fetch.
//   • `apps/studio/src/single-file-export.ts` `buildSingleFileHtml` (d620093) — the document: bundle
//     inlined in a classic `<script>`, library inlined as base64 in a non-executing `<script>`, boot
//     code calling `el.openFile(new Blob([bytes]))`.
// What was MISSING is everything between and after: nothing produced a real `.html` from a real
// fixture, and nothing drove one. `single-file-export.test.ts` asserts the document's *shape*
// (no `type=module`, no relative fetch, three `</script>`) — it cannot know whether the element
// boots, whether the image paints, or whether a region is clickable. This script closes that gap.
//
// THE ROUTE, and why not the other one. The ticket text suggests rendering the annotated image to
// pixels (OSD + Annotorious → a flat canvas). This takes the other road — inline the LIVE embed —
// on three grounds, each checkable:
//   1. `packages/archie-viewer` is ALREADY a zero-external-dependency bundle by construction
//      (ADR-0019: OSD is bundled IN, "a CDN consumer has no build step"). A pixel route would have
//      to invent a renderer; this one reuses the shipped one.
//   2. The data problem is already solved by an EXISTING public seam. `ArchieViewerElement.openFile`
//      (element.ts:350) takes a `Blob` — the drag-drop vector — and `load.ts:93 openLibraryFromFile`
//      composes `@render/core`'s canonical `openArchieLibrary`, whose `loadPortableExhibit` rewrites
//      every asset ref to a `blob:` URL (load.ts:57-60). So a `.archie.zip` carried as base64 in the
//      document yields images with no fetch of any kind. No new API, no relaxed trust boundary
//      (.claude/rules/untrusted-archive-open-seam.md holds — this composes the seam, it does not
//      copy it).
//   3. FIDELITY. Pixels lose deep zoom, lose the note surface, lose every region's identity. The
//      research ledger (docs/research/tldraw-self-contained-export-2026-07-27.md, "What this implies
//      for a single-file HTML Archie exhibit") independently reached the de-scoping conclusion that
//      Archie's own static page is already structurally self-contained and "only IMAGES stand
//      between the current page and one file" — i.e. the pixel machinery tldraw needs is machinery
//      Archie does not need. The cost the same ledger names — base64 is +33% and unstreamable — is
//      real and is why this is a SMALL-exhibit affordance; it is reported below in bytes, not
//      hand-waved.
//
// THE FIXTURE, and the trap in it. `screenshots` is the ONLY exhibit in the committed tree with
// LOCAL `assets/` bytes (every other one is remote IIIF: Yale, archive.org, OSM tiles) — so it is
// the only one that can be offline at all. It also carries ZERO annotations that survive
// `loadLibrary`: its `annotations/history/*.json` targets `https://archie.demo/screenshots/canvas/o1`
// while its canvases are `…/canvas/ex-screenshots.o1` — a base AND an id-grammar mismatch
// (apps/viewer/scripts/reexport-library-zip.mts's header records the same rot). Driving it as-is
// gives a click assertion with an EMPTY SUBJECT that reports "no note" against perfectly good code —
// exactly the false red `scripts/proto/self-replicating-publish.mts` hit first time. So this script
// AUTHORS its probe note through the real spine (`appendNew` → `libraryToZip` → the published
// annotation page), same as that donor, and PRINTS the region count so an empty subject cannot hide.
//
// RED-GREEN, and it takes TWO levers because one of them only proves a precondition. `--no-library`
// emits the same document with an EMPTY base64 payload: the boot fails and every later assertion goes
// red — but reds 2 and 3 are then *precondition* failures (no library ⇒ no gallery ⇒ nothing to
// click), which prove nothing about those assertions themselves
// (.claude/rules/post-review-fixes-are-unreviewed.md: "a red run is only evidence if it is red for
// the reason you intended"). `--no-assets` is the isolating lever: the manifest is emitted with the
// image BYTES withheld, so the gallery and the region overlay still work and only the image
// assertion can fail. The two remaining assertions were isolated by injections into the code they
// gate rather than by a flag; the measurements are in the ticket's report.
//
// Run:  cd apps/viewer && pnpm exec vite-node ../../scripts/prototypes/single-file-export.mts
// Flags: --objects N (default 1) · --out <path> · --keep · --no-library · --no-assets (RED runs)
import { readFile, readdir, stat, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import {
  MemoryFilesystem, libraryToZip, loadLibrary, appendNew, asClientId,
  type AnnotationLog, type FsDirectory, type Library,
} from "@render/core";
import { buildSingleFileHtml } from "../../apps/studio/src/single-file-export.js";
import { launchBrowser } from "../lib/driver.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SOURCE_TREE = path.join(REPO, "apps/viewer/public/published");
const SINGLE_BUNDLE = path.join(REPO, "packages/archie-viewer/dist-single/archie-viewer.single.js");

const NO_LIBRARY = process.argv.includes("--no-library");
const NO_ASSETS = process.argv.includes("--no-assets");
const KEEP = process.argv.includes("--keep");
const argAfter = (flag: string): string | undefined => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
};
const OBJECTS = Number(argAfter("--objects") ?? 1);
const OUT_ARG = argAfter("--out");

// The only offline-capable exhibit in the committed tree — see the header.
const SLUG = "screenshots";
const PROBE_NOTE = "A note authored by the single-file export drive.";
// The export's own base. It is INTERNAL: nothing in the artifact resolves it over the network (the
// element reads the zip through the fs seam). It matters only because the authored record's target
// and the published canvas id must agree, so both are derived from this one constant.
const BASE = "https://archie.local/";

const results: { ok: boolean; label: string; detail: string }[] = [];
const record = (ok: boolean, label: string, detail: string): void => {
  results.push({ ok, label, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
};

// ------------------------------------------------------------------ bake

/** Read a disk directory into an fs-seam directory, recursively (donor: self-replicating-publish.mts). */
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

interface Baked { html: string; htmlBytes: number; zipBytes: number; bundleBytes: number; objects: number; notes: number }

async function bake(): Promise<Baked> {
  const src = new MemoryFilesystem();
  await loadDirInto(await src.root(), SOURCE_TREE);
  const loaded = await loadLibrary(src);

  const exhibit = loaded.library.exhibits.find((e) => e.slug === SLUG);
  if (!exhibit) throw new Error(`fixture tree has no "${SLUG}" exhibit`);
  if (exhibit.objects.length === 0) throw new Error(`"${SLUG}" carries no objects`);

  // SUBSET to N objects — the ticket scopes this to a single-object exhibit, and base64 makes size
  // the whole question. Keeping the first N is safe here because the exhibit has no sections/readings
  // structure to dangle against (a narrative exhibit would need its Ranges pruned too).
  const objects = exhibit.objects.slice(0, Math.max(1, OBJECTS));
  const kept: Library = {
    ...loaded.library,
    exhibits: [{ ...exhibit, objects }],
  };

  // The authored probe note. The fixture's own history does not survive loadLibrary (header), so a
  // drive that clicked "its" annotations would be clicking nothing. This travels the real spine.
  const obj = objects[0]!;
  const w = obj.width ?? 1000, h = obj.height ?? 1000;
  const log = appendNew([], {
    target: {
      type: "SpecificResource",
      source: `${BASE}${SLUG}/canvas/${obj.id}`,
      selector: {
        type: "FragmentSelector",
        conformsTo: "http://www.w3.org/TR/media-frags/",
        // Generous and centred: the drive clicks the centre, and a sliver would turn a hit-testing
        // gate into a coordinate lottery.
        value: `xywh=pixel:${Math.round(w * 0.2)},${Math.round(h * 0.2)},${Math.round(w * 0.6)},${Math.round(h * 0.6)}`,
      },
    },
    body: { type: "TextualBody", value: PROBE_NOTE },
    lastEditor: asClientId("single-file-drive"),
    modifiedAt: "2026-07-28T00:00:00.000Z",
    now: 1,
  }).log;
  const getLog = (id: string): AnnotationLog => (id === exhibit.id ? log : []);

  // `loadLibrary` inverts published asset URLs back to the working `/assets/{name}` form, so the
  // re-publish must hand the bytes back or the manifest ships pointers to nothing (donor comment).
  const getAsset = async (slug: string, name: string): Promise<ArrayBuffer | null> => {
    if (NO_ASSETS) return null; // the isolating RED lever — see the header
    try {
      const exDir = await (await src.root()).getDirectory(slug);
      return await (await (await exDir.getDirectory("assets")).getFile(name)).readable();
    } catch { return null; }
  };

  const { zip, missingAssets } = await libraryToZip(kept, getLog, { baseUrl: BASE, getAsset });
  for (const m of missingAssets) console.warn(`missing bytes: ${m.exhibitSlug}/${m.name} (object ${m.objectId})`);
  // A manifest that references a file the tree lacks is Archie-19d7's invariant; this prototype
  // refuses rather than emitting one. `--no-assets` deliberately steps past it to make the image
  // assertion falsifiable in isolation.
  if (missingAssets.length > 0 && !NO_ASSETS) throw new Error("refusing to emit an export whose manifest points at bytes it does not carry");

  const bundle = await readFile(SINGLE_BUNDLE, "utf8");
  // The RED run: same document, EMPTY payload. Everything else is byte-identical, so a green result
  // here would prove the assertions are not reading the library at all.
  const libraryBytes = NO_LIBRARY ? new Uint8Array(0) : zip;
  const html = buildSingleFileHtml({ bundle, libraryBytes, title: exhibit.title });

  return {
    html,
    htmlBytes: Buffer.byteLength(html, "utf8"),
    zipBytes: zip.byteLength,
    bundleBytes: Buffer.byteLength(bundle, "utf8"),
    objects: objects.length,
    notes: log.length,
  };
}

// ------------------------------------------------------------------ drive

/** Inside the page: the element's open shadow root. */
const sr = `document.querySelector('archie-viewer')?.shadowRoot`;
const q = (sel: string): string => `(${sr}?.querySelectorAll(${JSON.stringify(sel)}).length ?? 0)`;

async function main(): Promise<void> {
  const baked = await bake();
  const dir = OUT_ARG ? path.dirname(path.resolve(OUT_ARG)) : await mkdtemp(path.join(tmpdir(), "archie-singlefile-"));
  const file = OUT_ARG ? path.resolve(OUT_ARG) : path.join(dir, "exhibit.html");
  await writeFile(file, baked.html, "utf8");

  console.log(`\nBAKED — ${baked.objects} object(s), ${baked.notes} annotation record(s)`);
  console.log(`  library zip   ${baked.zipBytes} bytes (${(baked.zipBytes / 1024).toFixed(1)} KB)`);
  console.log(`  IIFE bundle   ${baked.bundleBytes} bytes (${(baked.bundleBytes / 1024).toFixed(1)} KB)`);
  console.log(`  ONE .html     ${baked.htmlBytes} bytes (${(baked.htmlBytes / 1024).toFixed(1)} KB / ${(baked.htmlBytes / 1048576).toFixed(2)} MB)`);
  console.log(`  → ${file}${NO_LIBRARY ? "   [--no-library: RED run, empty payload]" : ""}`);

  let browser: Awaited<ReturnType<typeof launchBrowser>> | undefined;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();

    // THE NETWORK IS CUT, and cut in two independent ways so neither one alone is the whole claim:
    //   (a) every non-file/data/blob request is ABORTED at the route — so a viewer that needed the
    //       network would visibly fail rather than quietly succeed on a warm cache;
    //   (b) every request of any scheme is COUNTED and printed — so "0 requests" is a number read
    //       off the run, not an inference from (a).
    const requests: string[] = [];
    const blocked: string[] = [];
    page.on("request", (r) => requests.push(r.url()));
    await page.route("**/*", async (route) => {
      const u = route.request().url();
      if (u.startsWith("file://") || u.startsWith("data:") || u.startsWith("blob:")) return route.continue();
      blocked.push(u);
      return route.abort();
    });
    const consoleErrors: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
    page.on("pageerror", (e) => consoleErrors.push(String(e.message)));

    await page.goto(pathToFileURL(file).href, { waitUntil: "domcontentloaded" });

    // (1) the element upgraded and the library opened — the gallery is the first thing it renders.
    let cards = 0;
    try {
      await page.waitForFunction(`${q("ul.grid li button[data-slug]")} > 0`, { timeout: 20000, polling: 300 });
      cards = await page.evaluate(q("ul.grid li button[data-slug]")) as number;
    } catch { /* stays 0 → FAIL below */ }
    record(cards > 0, "the inlined bundle boots from file:// and the inlined library opens", `${cards} exhibit card(s)`);

    // (2) the deep-zoom canvas mounts and PAINTS. Present-in-the-DOM is not painted: a canvas of zero
    //     area, or one that never drew a tile, satisfies a selector and shows nothing. So the check
    //     reads the canvas's own pixels — see .claude/rules/post-review-fixes-are-unreviewed.md 1a
    //     (a probe must examine a non-empty subject).
    let canvas = false;
    let paint = { w: 0, h: 0, nonBlank: 0 };
    if (cards > 0) {
      await page.evaluate(`${sr}.querySelector('button[data-slug="${SLUG}"]').click()`);
      await page.waitForFunction(`${q("ul.grid li button[data-obj]")} > 0`, { timeout: 20000, polling: 300 });
      await page.evaluate(`${sr}.querySelector('ul.grid li button[data-obj]').click()`);
      try {
        await page.waitForFunction(`!!${sr}?.querySelector('.reader-surface')?.querySelector('.openseadragon-canvas, canvas')`, { timeout: 25000, polling: 300 });
        canvas = true;
        // Sample the drawing buffer: count pixels that are neither transparent nor the flat page
        // background. An image that never decoded leaves this at 0 while the element looks healthy.
        await page.waitForFunction(`(() => {
          const c = ${sr}?.querySelector('.reader-surface canvas');
          if (!c || !c.width || !c.height) return false;
          const x = c.getContext('2d');
          if (!x) return true;
          const d = x.getImageData(0, 0, c.width, c.height).data;
          let n = 0;
          for (let i = 0; i < d.length; i += 4 * 97) if (d[i + 3] > 8) n++;
          return n > 50;
        })()`, { timeout: 25000, polling: 500 }).catch(() => {});
        paint = await page.evaluate(`(() => {
          const c = ${sr}?.querySelector('.reader-surface canvas');
          if (!c) return { w: 0, h: 0, nonBlank: 0 };
          const x = c.getContext('2d');
          if (!x) return { w: c.width, h: c.height, nonBlank: -1 };
          const d = x.getImageData(0, 0, c.width, c.height).data;
          let n = 0;
          for (let i = 0; i < d.length; i += 4 * 97) if (d[i + 3] > 8) n++;
          return { w: c.width, h: c.height, nonBlank: n };
        })()`) as { w: number; h: number; nonBlank: number };
      } catch { /* FAIL below */ }
    }
    record(canvas && paint.w > 0 && paint.h > 0 && paint.nonBlank !== 0,
      "the object's image renders — the canvas has area and painted pixels",
      `canvas ${paint.w}x${paint.h}, ${paint.nonBlank} sampled non-transparent pixels`);

    // (3) a REAL mouse click on a region opens ITS note. Keyboard Enter and a synthetic
    //     `dispatchEvent(new MouseEvent('click'))` BOTH pass against code where a real pointer does
    //     nothing, because OSD wraps every overlay in a div that eats clicks
    //     (.claude/rules/osd-overlay-wrapper.md — and this renderer, `read-mount`, is precisely the
    //     one where that signature can appear). Only a driven pointer sequence can fail here.
    let noteText = "";
    let regions = -1;
    let clickedAt = "";
    let hitTarget = "";
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
        // The overlay-wrapper diagnostic signature, recorded either way: a bare unnamed DIV here
        // means a wrapper is shielding the geometry.
        hitTarget = await page.evaluate(`(() => {
          const e = ${sr}.elementFromPoint(${box.x}, ${box.y});
          return e ? e.tagName + (e.id ? '#' + e.id : '') + (e.className && e.className.baseVal !== undefined ? '.' + e.className.baseVal : '') : 'null';
        })()`) as string;
        await page.mouse.click(box.x, box.y);
        await page.waitForFunction(`!!${sr}?.querySelector('.archie-note-card')`, { timeout: 10000, polling: 200 });
        noteText = (await page.evaluate(`${sr}.querySelector('.archie-note-card').textContent.trim()`)) as string;
      } catch { /* FAIL below */ }
    }
    // PRINT THE SUBJECT: a region count of 0 is an empty subject and reads as a broken feature.
    record(regions > 0 && noteText.includes(PROBE_NOTE),
      "a REAL mouse click on an annotation region opens ITS note",
      `${regions} region overlay(s); clicked ${clickedAt || "nowhere"}; hit target ${hitTarget || "n/a"}; card = ${noteText ? JSON.stringify(noteText.slice(0, 80)) : "none"}`);

    // (4) THE CLAIM. Not one byte came from anywhere but this file. Counted, not assumed.
    const nonLocal = requests.filter((u) => !u.startsWith("file://") && !u.startsWith("data:") && !u.startsWith("blob:"));
    record(nonLocal.length === 0, "ZERO network requests — nothing outside the document was contacted",
      `${requests.length} request(s) total, ${nonLocal.length} non-local, ${blocked.length} aborted at the route`);
    const schemes = [...new Set(requests.map((u) => u.split(":")[0]))];
    console.log(`\nREQUEST FINDING — schemes seen: ${schemes.join(", ") || "none"}. file:// = the document itself; blob:/data: never leave the process.`);
    for (const u of nonLocal.slice(0, 5)) console.log(`  non-local: ${u.slice(0, 160)}`);

    if (consoleErrors.length > 0) {
      console.log(`\nconsole/page errors (${consoleErrors.length}):`);
      for (const e of consoleErrors.slice(0, 6)) console.log(`  ${e.slice(0, 200)}`);
    }
    console.log(`\nARTIFACT — one file, ${baked.htmlBytes} bytes (${(baked.htmlBytes / 1048576).toFixed(2)} MB): ${baked.zipBytes} B of library → ${Math.round((baked.zipBytes * 4) / 3)} B base64, plus ${baked.bundleBytes} B of viewer. Exact counts, not MB — the base64 inflation is the whole cost question and rounding hides it.`);
  } finally {
    if (browser) await browser.close();
    if (KEEP || OUT_ARG) console.log(`\nkept: ${file}`);
    else await rm(dir, { recursive: true, force: true }).catch(() => {});
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\nRESULT: ${failed.length === 0 ? "PASS" : "FAIL"}  (${results.length - failed.length}/${results.length})`);
  process.exit(failed.length === 0 ? 0 : 1);
}

await main();
