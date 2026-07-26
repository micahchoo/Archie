import { expect, type Page } from "@playwright/test";
import { isWholeObjectFor, selectorOf, wholeObjectFlagOf } from "@render/core";
import type { W3CAnnotation } from "@render/core";

// Most bundled sample exhibits point at a remote image service (Yale IIIF, archive.org, OSM tiles).
// Cutting those off is what makes this suite hermetic — and it also sharpens the assertions: the
// object grid, the filmstrip and the canvas chrome are all rendered from the local manifest, so they
// must be there whether or not a single tile ever arrives. A spec that needed a Yale tile to pass
// would be testing Yale's uptime.
//
// ONE exhibit is different, and the difference is load-bearing: `screenshots` owns its images. All 21
// of its canvases paint from `published/screenshots/assets/*.png`, served by the same preview server
// that serves the app. Measured on this build with the route below installed: ZERO aborted remote
// requests, ZERO responses >= 400, and an OpenSeadragon canvas carrying real ink (860x720, 660
// distinct sampled colours). The exhibit is a NARRATIVE — it shows one object per section — so a
// single arrival fetches ONE image; walking all 21 sections fetches 21 distinct local images. Both
// figures are asserted, by two separate tests, in `canvas-offline.spec.ts`.
//
// That is what lets the canvas assertions — halo, frame, keyboard, the Escape ladder, and a REAL
// mouse hit-test on a mark — live in this hermetic suite instead of in a human's hands. They were
// hand-driven online until 2026-07-25; the headers of selection.spec.ts / canvas-keyboard.spec.ts /
// occlusion.spec.ts used to say so.
//
// Prior art, checked before committing to this shape (repo CLAUDE.md): NOTHING in the IIIF corpus
// tests a painted deep-zoom canvas hermetically.
//   - cozy-iiif: raw `fetch` against live services (davidrumsey.com, iiif.io, ids.si.edu) — no msw,
//     no nock. Its suite depends on a third party being up, which is what this one refuses to do.
//   - clover-iiif: neuters canvas entirely in `src/setupTests.ts`
//     (`HTMLCanvasElement.prototype.getContext = () => ({})`), and its one info.json fixture
//     (`src/lib/iiif-test-fixtures.ts` `tileSourceResponse`) is imported by nothing.
//   - universalviewer: no canvas or manifest tests to compare against — its whole suite is three
//     files (`src/Utils.spec.ts`, `content-handlers/iiif/PubSub.spec.ts`, `.../XYWHFragment.spec.ts`),
//     none of which touch the network. (An earlier draft of this header claimed it fetched Wellcome
//     tiles. It does not: "Wellcome" appears only in bundled demo data and a build example, neither
//     run by jest. Corrected rather than dropped — a wrong citation is worse than none.)
//   - canvas-panel: ships no tests for atlas at all.
// No project checks in a tile pyramid, and none intercepts tile routes. The closest transferable idea
// is clover's two-method fake OSD viewer in `src/lib/openseadragon-helpers.test.ts`, which asserts
// overlay geometry with no viewer — which is what `packages/render-mount`'s unit suites already do.
// Serving REAL image bytes from the same origin as the app is a stronger position than any of them,
// and it needs no fixture pyramid because the seed already owns one.
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
  /** True when selecting this note makes the app draw a HALO — i.e. it has region geometry to ring. */
  halo: boolean;
  /** True when the app draws the object FRAME for it instead — no geometry to ring. */
  wholeObject: boolean;
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
    items: Array<{ width?: number; height?: number; annotations?: Array<{ items?: Array<Record<string, unknown>> }> }>;
  };
  const notes: PublishedNote[] = [];
  for (const canvas of manifest.items) {
    for (const page of canvas.annotations ?? []) {
      for (const raw of page.items ?? []) {
        const ulid = String(raw.id).split("/annotations/")[1]?.split("/")[0];
        if (!ulid) continue;
        const body = Array.isArray(raw.body) ? raw.body[0] : raw.body;
        const text = (body as { value?: string } | undefined)?.value ?? "";

        // THE APP'S OWN PREDICATE, IMPORTED — NOT A REPLICA, AND NOT "has a selector".
        //
        // The first version of this classifier asked `!!target.selector` and called that "region".
        // That is wrong in a way that hollows out the file it lives in: `frameFor` (ExhibitView) routes
        // a note to the whole-object FRAME when `isWholeObjectFor` says so, and that is a >= 75%
        // COVERAGE heuristic (`geometry/coverage.ts`), not "has no selector". Measured on this tree:
        // note 01KWT0S7NJ8SWVMNNV8P8405H7 carries `xywh=pixel:0,0,1440,900` on a 1440x900 canvas — a
        // selector, so the old classifier called it a region — and the app draws it as {halo: 0,
        // frame: 1}. So `no region-targeted notes to draw marks for` could pass on a tree where ZERO
        // halos are drawable, which is exactly the vacuity this suite exists to catch.
        //
        // Importing the predicate rather than restating it means the classifier cannot drift from the
        // app: change the threshold in coverage.ts and these helpers change with it.
        const ann = raw as unknown as W3CAnnotation;
        const selector = selectorOf(ann);
        const whole = isWholeObjectFor(selector, canvas.width ?? 0, canvas.height ?? 0, wholeObjectFlagOf(ann));
        notes.push({ ulid, text, halo: selector !== null && !whole, wholeObject: whole });
      }
    }
  }
  if (notes.length === 0) throw new Error("no notes in the published screenshots manifest");
  return notes;
}

/** The first note that actually draws a HALO, with enough body text to identify the card it opens. */
export async function aHaloNote(baseURL: string): Promise<PublishedNote> {
  const n = (await screenshotNotes(baseURL)).find((x) => x.halo && x.text.length > 12);
  if (!n) throw new Error("no halo-drawing note in the published screenshots manifest");
  return n;
}

/** The first WHOLE-OBJECT note — the case the object frame is drawn for instead of a mark. */
export async function aWholeObjectNote(baseURL: string): Promise<PublishedNote> {
  const n = (await screenshotNotes(baseURL)).find((x) => x.wholeObject);
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
 *
 * This also covers the solid-colour-placeholder case for free, which an alpha or mean-luminance test
 * would not: a flat fill has ONE distinct colour, two orders of magnitude under the bar.
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
