import { test, expect, type Page, type Locator } from "@playwright/test";
import { goOffline } from "./offline.js";

// Archie-40fe (V22/V71/V87) — floating chrome must not sit on the thing it is meant to help you read.
//
// GEOMETRIC assertions, on purpose. The ticket asks for bounding-box non-intersection rather than
// screenshot diffs, because these are layout facts: a restyle that moves the pill 4px is not a
// regression, a restyle that puts it back on top of the filmstrip is. Overlap survives as the thing
// being measured no matter how the surfaces are painted.
//
// V48 (chrome over the CANVAS) is not here: it is fixed in `fitBoundsRect`'s left-flank reservation
// and unit-tested there, and asserting it end-to-end needs a painted canvas — which this offline
// suite cannot produce (selection.spec.ts's header has the measurement).

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
