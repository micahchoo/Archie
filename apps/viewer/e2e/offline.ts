import { expect, type Page } from "@playwright/test";

// Most bundled sample exhibits point at a remote image service (Yale IIIF, archive.org, OSM tiles).
// Cutting those off is what makes this suite hermetic — and it also sharpens the assertions: the
// object grid, the filmstrip and the canvas chrome are all rendered from the local manifest, so they
// must be there whether or not a single tile ever arrives. A spec that needed a Yale tile to pass
// would be testing Yale's uptime.
//
// ONE exhibit is different, and the difference is load-bearing: `screenshots` owns its images. All 21
// of its canvases paint from `published/screenshots/assets/*.png`, served by the same preview server
// that serves the app. Measured on this build with the route below installed: 21 distinct image
// responses, ZERO aborted remote requests, ZERO responses >= 400, and an OpenSeadragon canvas
// carrying real ink (860x720, 660 distinct sampled colours). See `canvas-offline.spec.ts`, which
// asserts exactly that so the premise cannot rot silently.
//
// That is what lets the canvas assertions — halo, frame, keyboard, the Escape ladder, and a REAL
// mouse hit-test on a mark — live in this hermetic suite instead of in a human's hands. They were
// hand-driven online until 2026-07-25; the headers of selection.spec.ts / canvas-keyboard.spec.ts /
// occlusion.spec.ts used to say so.
//
// Prior art, checked before committing to this shape (repo CLAUDE.md): NOTHING in the IIIF corpus
// tests a painted deep-zoom canvas hermetically. cozy-iiif and universalviewer's suites fetch live
// manifests (iiif.io cookbook, Wellcome tiles); clover-iiif neuters canvas entirely in
// `src/setupTests.ts` (`HTMLCanvasElement.prototype.getContext = () => ({})`) and its one info.json
// fixture (`src/lib/iiif-test-fixtures.ts` `tileSourceResponse`) is imported by nothing; canvas-panel
// ships no tests for atlas at all. No project checks in a tile pyramid, and none intercepts tile
// routes. The closest transferable idea is clover's two-method fake OSD viewer in
// `src/lib/openseadragon-helpers.test.ts`, which asserts overlay geometry with no viewer — which is
// what `packages/render-mount`'s unit suites already do. Serving REAL image bytes from the same
// origin as the app is a stronger position than any of them, and it needs no fixture pyramid because
// the seed already owns one.
export async function goOffline(page: Page): Promise<void> {
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (route) => route.abort());
}

/** What the page actually asked the network for, so "hermetic" is measured rather than assumed. */
export interface TrafficLog {
  /** Non-localhost requests the offline route aborted. Must be empty for `screenshots`. */
  blocked: string[];
  /** Requests the browser failed outright (DNS, abort, connection reset). */
  failed: string[];
  /** Responses with status >= 400. */
  bad: string[];
  /** Distinct image URLs that actually came back. */
  images: Set<string>;
}

/**
 * Install the offline route AND record what crossed it. Use instead of `goOffline` when the point of
 * the test is that nothing remote was needed — `goOffline` alone aborts silently, so a spec that
 * quietly depends on a remote tile looks identical to one that does not.
 */
export async function goOfflineCounting(page: Page): Promise<TrafficLog> {
  const log: TrafficLog = { blocked: [], failed: [], bad: [], images: new Set() };
  page.on("requestfailed", (r) => {
    const u = r.url();
    if (!/^https?:\/\/(localhost|127\.0\.0\.1)/.test(u)) return; // remote aborts are the point, not a fault
    log.failed.push(`${u} :: ${r.failure()?.errorText}`);
  });
  page.on("response", (r) => {
    if (r.status() >= 400) log.bad.push(`${r.status()} ${r.url()}`);
    if (r.request().resourceType() === "image") log.images.add(r.url());
  });
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (route) => {
    log.blocked.push(route.request().url());
    return route.abort();
  });
  return log;
}

/** A published note taken from the tree the app is about to serve. */
export interface PublishedNote {
  ulid: string;
  text: string;
  /** True when the note targets a REGION (has a selector) — the case that draws a mark and a halo. */
  region: boolean;
}

/**
 * Every note in the published `screenshots` manifest, read at runtime.
 *
 * Never hard-code an id here: annotation ids are ULIDs minted by the generator, so a literal would rot
 * the next time the tree is regenerated and would then assert the degrade path while looking like it
 * asserts the happy one — the exact trap note-address.spec.ts's header records.
 */
export async function screenshotNotes(baseURL: string): Promise<PublishedNote[]> {
  const res = await fetch(new URL("published/screenshots/manifest.json", baseURL));
  const manifest = (await res.json()) as {
    items: Array<{ annotations?: Array<{ items?: Array<{ id: string; body?: unknown; target?: unknown }> }> }>;
  };
  const notes: PublishedNote[] = [];
  for (const canvas of manifest.items) {
    for (const page of canvas.annotations ?? []) {
      for (const a of page.items ?? []) {
        const ulid = a.id.split("/annotations/")[1]?.split("/")[0];
        if (!ulid) continue;
        const body = Array.isArray(a.body) ? a.body[0] : a.body;
        const text = (body as { value?: string } | undefined)?.value ?? "";
        const t = a.target;
        notes.push({ ulid, text, region: typeof t === "object" && t !== null && !!(t as { selector?: unknown }).selector });
      }
    }
  }
  if (notes.length === 0) throw new Error("no notes in the published screenshots manifest");
  return notes;
}

/** The first REGION note with enough body text to identify the card it opens. */
export async function aRegionNote(baseURL: string): Promise<PublishedNote> {
  const n = (await screenshotNotes(baseURL)).find((x) => x.region && x.text.length > 12);
  if (!n) throw new Error("no region-targeted note in the published screenshots manifest");
  return n;
}

/** The first WHOLE-OBJECT note (no selector) — the case the object frame is drawn for. */
export async function aWholeObjectNote(baseURL: string): Promise<PublishedNote> {
  const n = (await screenshotNotes(baseURL)).find((x) => !x.region);
  if (!n) throw new Error("no whole-object note in the published screenshots manifest");
  return n;
}

export const CANVAS = ".openseadragon-canvas";
export const HALO = "#archie-selection-halo";
export const FRAME = "#archie-object-frame";

/**
 * Open `screenshots` at a note's address and wait until the deep-zoom canvas has actually PAINTED.
 *
 * `toBeVisible()` on the canvas is not enough: OSD inserts its canvas before a tile arrives, so a
 * spec that proceeds on visibility alone would run its assertions against a blank surface and would
 * still pass if the image never loaded at all. Polling for ink is the difference between "the
 * element mounted" and "the reader can see the object".
 */
export async function openPaintedNote(page: Page, ulid: string): Promise<void> {
  await page.goto(`./#/screenshots/a/${ulid}`);
  await expect(page.locator(CANVAS).first()).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => canvasInk(page), { timeout: 30_000, message: "the deep-zoom canvas never painted" })
    .toBeGreaterThan(50);
}

/** Open `screenshots` at its leading section and wait for the canvas to paint. */
export async function openPaintedNarrative(page: Page): Promise<void> {
  await page.goto("./#/screenshots");
  await expect(page.locator(CANVAS).first()).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => canvasInk(page), { timeout: 30_000, message: "the deep-zoom canvas never painted" })
    .toBeGreaterThan(50);
}

/**
 * How many DISTINCT colours a sparse sample of the OSD drawing canvas contains.
 *
 * Distinct colours rather than "any non-transparent pixel", because OSD paints its background over
 * the whole canvas the moment it mounts — a blank viewer is already opaque, and an alpha test would
 * report it as painted. A real photographic tile lands in the hundreds; the seed's screenshots
 * measure ~660. The bar callers use (50) is far above an empty viewer and far below any real image.
 */
export async function canvasInk(page: Page): Promise<number> {
  return page.evaluate(() => {
    const c = document.querySelector(".openseadragon-canvas canvas") as HTMLCanvasElement | null;
    if (!c) return -1;
    const g = c.getContext("2d", { willReadFrequently: true });
    if (!g) return -1;
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const seen = new Set<string>();
    for (let i = 0; i < d.length; i += 4 * 97) seen.add(`${d[i]},${d[i + 1]},${d[i + 2]},${d[i + 3]}`);
    return seen.size;
  });
}

/** A rect, or null when the element is not there — so a missing surface reads as "nothing to clear". */
export async function boxOf(page: Page, selector: string): Promise<DOMRect | null> {
  return page.evaluate((s) => {
    const e = document.querySelector(s);
    return e ? (e.getBoundingClientRect().toJSON() as DOMRect) : null;
  }, selector);
}
