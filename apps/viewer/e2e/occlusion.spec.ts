import { test, expect, type Page, type Locator } from "@playwright/test";
import { HALO, goOffline, openPaintedNote, screenshotNotes } from "./offline.js";

// Archie-40fe (V22/V71/V87) — floating chrome must not sit on the thing it is meant to help you read.
//
// GEOMETRIC assertions, on purpose. The ticket asks for bounding-box non-intersection rather than
// screenshot diffs, because these are layout facts: a restyle that moves the pill 4px is not a
// regression, a restyle that puts it back on top of the filmstrip is. Overlap survives as the thing
// being measured no matter how the surfaces are painted.
//
// V48 (chrome over the CANVAS) IS here now, at the bottom. This header used to say it could not be:
// "asserting it end-to-end needs a painted canvas — which this offline suite cannot produce". The
// `screenshots` exhibit produces one (canvas-offline.spec.ts), so the end-to-end half of the
// left-flank reservation is measurable with the network cut.

type Rect = { x: number; y: number; width: number; height: number };

const rectOf = async (l: Locator): Promise<Rect | null> => ((await l.count()) ? await l.first().boundingBox() : null);

/** Do two rects share any area at all? Touching edges is fine; overlap is not. */
const overlaps = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

const describeOverlap = (name: string, a: Rect, b: Rect): string =>
  `${name}: [${Math.round(a.x)},${Math.round(a.y)} ${Math.round(a.width)}x${Math.round(a.height)}] ` +
  `vs [${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.width)}x${Math.round(b.height)}]`;

async function openObjectWithNote(page: Page) {
  await goOffline(page);
  await page.goto("./#/voynich");
  await page.locator("button.object").first().click();
  await expect(page.locator("button.frame").first()).toBeVisible();
}

test.describe("the finder pill clears the filmstrip (V22)", () => {
  test("the pill does not overlap any filmstrip frame", async ({ page }) => {
    // Measured before the fix: pill (1102,748)–(1260,780) against frames running y 706–800 — TWO of
    // twelve covered, including the exhibit's only audio object, i.e. the one thing a reader is most
    // likely hunting for. The strip does not scroll at 12 items, so those frames could not be moved
    // out from under it.
    await openObjectWithNote(page);
    const pill = await rectOf(page.locator("button.finder-trigger"));
    test.skip(pill === null, "no finder pill on this surface");

    const frames = page.locator("button.frame");
    const n = await frames.count();
    expect(n).toBeGreaterThan(1);
    for (let i = 0; i < n; i++) {
      const f = await frames.nth(i).boundingBox();
      if (!f) continue;
      expect(overlaps(pill!, f), describeOverlap(`pill over frame ${i}`, pill!, f)).toBe(false);
    }
  });

  test("the pill still clears the strip after it is collapsed", async ({ page }) => {
    // `--strip-h` is measured live precisely because the band's height is content-driven: collapsing
    // it leaves only the handle. A static token would be right in one state and wrong in the other,
    // which is how the pill ended up inside the band in the first place.
    await openObjectWithNote(page);
    const handle = page.locator(".filmstrip .handle");
    test.skip(await handle.count() === 0, "no filmstrip handle");
    await handle.click();
    await page.waitForTimeout(400); // the band animates its collapse

    const pill = await rectOf(page.locator("button.finder-trigger"));
    const band = await rectOf(page.locator(".filmstrip"));
    if (!pill || !band) return;
    expect(overlaps(pill, band), describeOverlap("pill over collapsed band", pill, band)).toBe(false);
  });
});

test.describe("an open note clears the filmstrip (V71)", () => {
  test("the note card does not overlap any filmstrip frame", async ({ page }) => {
    // Measured before the fix: the card overlapped the band by 74px and covered SIX of twelve frames.
    // Winning the z-fight (Archie-b42d) was correct and was never the whole answer — opening a note
    // silently removed half the survey affordance the reader was using a moment earlier.
    await openObjectWithNote(page);
    await page.locator("aside li button").first().click();
    await expect(page.locator(".note-pop")).toBeVisible();

    const card = await rectOf(page.locator(".note-pop"));
    const frames = page.locator("button.frame");
    const n = await frames.count();
    for (let i = 0; i < n; i++) {
      const f = await frames.nth(i).boundingBox();
      if (!f || !card) continue;
      expect(overlaps(card, f), describeOverlap(`note card over frame ${i}`, card, f)).toBe(false);
    }
  });

  test("the note card and the finder pill do not overlap each other either", async ({ page }) => {
    // Both were lifted by the same token; lifting two surfaces onto the same row is the obvious way
    // to trade one occlusion for another.
    await openObjectWithNote(page);
    await page.locator("aside li button").first().click();
    await expect(page.locator(".note-pop")).toBeVisible();
    const card = await rectOf(page.locator(".note-pop"));
    const pill = await rectOf(page.locator("button.finder-trigger"));
    if (!card || !pill) return;
    expect(overlaps(card, pill), describeOverlap("note card over pill", card, pill)).toBe(false);
  });
});

// V49 (the AV temporal map, covered by the item strip) is fixed by the same `--strip-h` reservation
// and is STILL NOT asserted here. The timeline renders only under
// `cues.length > 0 && !mediaError && dur > 0`, and `dur` comes from media metadata — offline, the
// seed's sounded folio (archive.org) never loads, so the element does not exist to measure.
//
// The canvas assertions escaped this limit by moving to `screenshots`; V49 CANNOT follow them, and the
// reason is specific rather than structural: every one of the 21 published `screenshots` bodies is
// `type: "Image"` (measured against `public/published/screenshots/manifest.json`). There is no
// locally-sourced AUDIO or VIDEO object anywhere in the seed, so there is nothing hermetic to give a
// duration to. Closing this needs a small local media asset in a seed exhibit — a change to the seed
// and the publish fixtures, not to this suite. Until then it is a named gap, verified by an online
// drive on 2026-07-25.

test.describe("the fitted region clears the chrome that floats over the canvas (V48)", () => {
  test("the selected region is not under the legend or the note card", async ({ page, baseURL }) => {
    // `getFitOptions` is @render/mount's reservation seam, and THE VIEWER NEVER PASSED IT: every fit
    // ran on PLAIN_FIT, so `fitBounds` centred the region in the whole container while the legend and
    // the note card sat on top of the left flank. Measured with a note open at 9.3x: the two stacked
    // into a contiguous 502px column, ~22% of a 924x800 canvas, down its entire left edge — including
    // the side the fitted region's own boundary lies on. The reader asks to look closely; the app
    // zooms, then covers a fifth of the answer.
    //
    // The unit half lives in `fitBoundsRect`. This is the end-to-end half, and it is the one that
    // catches the seam never being WIRED — which is what actually shipped, with the unit tests green.
    // The halo is the region's own drawn boundary, so measuring it measures where the fit landed.
    //
    // SWEEP SEVERAL NOTES, NOT ONE. Measured with the reservation forced off: 14 of the exhibit's
    // first 16 region notes land under the legend — but the FIRST one is one of the two that do not
    // (its region is short and wide, so the unreserved fit still clears the legend's bottom edge by
    // 10px). A single-note version of this test passes against the unwired seam. Ten is comfortably
    // past the two lucky ones.
    const notes = (await screenshotNotes(baseURL!)).filter((n) => n.region).slice(0, 10);
    expect(notes.length, "not enough region notes to sweep").toBeGreaterThan(4);
    await goOffline(page);

    for (const note of notes) {
      await openPaintedNote(page, note.ulid);
      const halo = await rectOf(page.locator(HALO));
      expect(halo, `no halo for ${note.ulid} — the region was never fitted`).not.toBeNull();
      for (const sel of ["aside.legend", ".note-pop"]) {
        const chrome = await rectOf(page.locator(sel));
        if (!chrome) continue;
        expect(
          overlaps(halo!, chrome),
          describeOverlap(`${sel} over fitted region (${note.ulid})`, chrome, halo!),
        ).toBe(false);
      }
    }
  });
});

test.describe("the narrative spine can be read to its end (V87)", () => {
  test("the last spine card can be scrolled clear of the finder pill", async ({ page }) => {
    // The pill lives at the viewport's bottom-right, INSIDE the spine's x range (spine 860–1280, pill
    // 1102–1260), so it sat on whatever the reader had scrolled to — measured cutting section 1's
    // cite card mid-word. Note this got WORSE when the pill was lifted clear of the filmstrip for
    // V22: raising it moves it further up this column. The spine reserves the pill's whole footprint.
    await goOffline(page);
    await page.goto("./#/voynich-reading");
    const aside = page.locator(".narrative > aside:not(.legend)"); // the spine; .legend is the other aside
    await expect(aside).toBeVisible();

    // The whole `<li>`, NOT its `.num` title. What the pill was measured cutting is the section's
    // CONTENT — its prose and its embedded cite card ("→ open obj|") — which extends well below the
    // title. An assertion on `.num` alone passes against the unfixed padding, because the title of
    // the last section sits above the pill anyway. Checked: it did.
    const items = aside.locator("ol.sections > li");
    const n = await items.count();
    expect(n).toBeGreaterThan(1);

    await aside.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
    await page.waitForTimeout(300);

    const last = await items.nth(n - 1).boundingBox();
    const pill = await rectOf(page.locator("button.finder-trigger"));
    if (!last || !pill) return;
    expect(overlaps(last, pill), describeOverlap("pill over last spine item", last, pill)).toBe(false);
  });
});
