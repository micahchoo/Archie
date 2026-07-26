import { test, expect } from "@playwright/test";
import { CANVAS, FRAME, HALO, canvasInk, goOfflineCounting, openPaintedNarrative, openPaintedNote, screenshotNotes } from "./offline.js";

// THE PREMISE, ASSERTED. Every canvas test in this suite — the halo in selection.spec.ts, the
// keyboard ladder in canvas-keyboard.spec.ts, the V48 clearance in occlusion.spec.ts — rests on one
// fact: `screenshots` is a self-contained exhibit whose images come from the same origin as the app,
// so OpenSeadragon opens and paints with the network cut.
//
// That fact is a property of the SEED and of the publish step, not of any code those specs touch. If
// someone repoints a screenshots object at a remote service, or the publish step stops copying the
// assets, every one of those specs would go quietly vacuous — asserting nothing about a canvas that
// no longer exists, and still passing, which is precisely how selection.spec.ts's `no halo before
// anything is selected` came to assert nothing on `voynich`. So the premise gets its own failing
// test rather than a comment.
//
// Measured on the build this was written against: 21 distinct local images, 0 aborted remote
// requests, 0 responses >= 400, canvas 860x720 with 660 distinct sampled colours, 87 published
// notes (68 region-targeted, 19 whole-object).

test.describe("the screenshots exhibit is self-contained (the premise every canvas spec rests on)", () => {
  test("it paints a deep-zoom canvas with the network cut", async ({ page }) => {
    const traffic = await goOfflineCounting(page);
    await openPaintedNarrative(page);

    // Ink, not presence. OSD mounts its canvas before any tile arrives, so `toBeVisible` is true of a
    // blank viewer — see canvasInk's header for why DISTINCT COLOURS is the measure and not alpha.
    expect(await canvasInk(page), "the canvas mounted but never painted").toBeGreaterThan(50);

    expect(traffic.blocked, `remote requests: ${traffic.blocked.join(" | ")}`).toHaveLength(0);
    expect(traffic.bad, `4xx/5xx: ${traffic.bad.join(" | ")}`).toHaveLength(0);
    expect(traffic.failed, `failed: ${traffic.failed.join(" | ")}`).toHaveLength(0);
    expect(traffic.images.size).toBeGreaterThan(0);
    for (const url of traffic.images) expect(url).toMatch(/^http:\/\/(localhost|127\.0\.0\.1)/);
  });

  test("every section's image is served locally, not just the first", async ({ page }) => {
    // One local cover would be enough to make the first assertion pass while twenty remote folios sat
    // behind it — which is the shape gallery.spec.ts already found once for exhibit covers. Walk the
    // whole spine and require one local image per section.
    const traffic = await goOfflineCounting(page);
    await openPaintedNarrative(page);

    const items = page.locator("aside ol.sections > li");
    const n = await items.count();
    expect(n).toBeGreaterThan(1);
    for (let i = 0; i < n; i++) {
      await items.nth(i).locator("button, a").first().click();
      await expect.poll(() => canvasInk(page), { timeout: 20_000 }).toBeGreaterThan(50);
    }

    expect(traffic.images.size, `sections ${n}, local images ${traffic.images.size}`).toBeGreaterThanOrEqual(n);
    expect(traffic.blocked, `remote requests: ${traffic.blocked.join(" | ")}`).toHaveLength(0);
    expect(traffic.bad, `4xx/5xx: ${traffic.bad.join(" | ")}`).toHaveLength(0);
  });

  test("it carries both kinds of note the canvas draws differently", async ({ page, baseURL }) => {
    // The halo specs need a note that DRAWS A HALO; the frame specs need one that draws the FRAME.
    // A regeneration that dropped either kind would leave those specs skipping or throwing inside a
    // helper rather than reporting the real cause, so name the requirement here.
    //
    // "Draws a halo" is not "has a selector" — see `screenshotNotes`. Asserting the weaker property
    // would let this test pass on a tree where every selector covers its whole canvas and NOTHING
    // draws a halo, which is the exact vacuity mode this file exists to catch.
    const notes = await screenshotNotes(baseURL!);
    const halo = notes.filter((n) => n.halo);
    const whole = notes.filter((n) => n.wholeObject);
    expect(halo.length, "no halo-drawing notes to ring").toBeGreaterThan(0);
    expect(whole.length, "no whole-object notes to draw a frame for").toBeGreaterThan(0);

    // And the classification is checked against the APP, not just against itself: drive one of each
    // and require the canvas to draw what the predicate promised. A pure-data test cannot notice that
    // it has drifted from the renderer; this is what makes the promise binding.
    await goOfflineCounting(page);
    await openPaintedNote(page, halo[0]!.ulid);
    await expect(page.locator(HALO)).toHaveCount(1);
    await openPaintedNote(page, whole[0]!.ulid);
    await expect(page.locator(FRAME)).toHaveCount(1);
    await expect(page.locator(HALO)).toHaveCount(0);
  });

  test("OSD stays in the DOM — the failed-mount teardown does not happen here", async ({ page }) => {
    // On the remote exhibits, a failed open tears the canvas back out: `.openseadragon-canvas` is
    // briefly present and then `querySelector` returns null (canvas-keyboard.spec.ts's old header has
    // the measurement). That teardown is what made every canvas assertion unassertable offline, so
    // assert its ABSENCE explicitly rather than inferring it from a passing test elsewhere.
    await goOfflineCounting(page);
    await openPaintedNarrative(page);
    await page.waitForTimeout(3000);
    await expect(page.locator(CANVAS)).toHaveCount(1);
  });
});
