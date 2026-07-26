import { test, expect } from "@playwright/test";
import { goOffline } from "./offline.js";

// Archie-9a81 (V40/V80) and Archie-c831 (V27/V28) — the read surface.
//
// Every assertion here holds with the network cut, by design: the object grid, the filmstrip and the
// canvas chrome are rendered from the local manifest. If one of them started needing a tile to
// appear, that would itself be the regression.

test.describe("the read surface", () => {
  test("the zoom cue is anchored to the canvas it describes (V40)", async ({ page }) => {
    await goOffline(page);
    await page.goto("./#/voynich");
    await page.locator("button.object").first().click();

    const cue = page.locator(".scale-cue");
    await expect(cue).toBeVisible();
    // V40's defect was that the cue sat OUTSIDE `<main>` while being positioned `right:` against the
    // row that ALSO held the notes aside — so it painted 264px inside the sidebar, on the object
    // title. The fix then was to move it INTO `<main>`, and this test asserted that containment.
    //
    // THAT SUBJECT IS GONE (ADR-0019's layout row, 2026-07-26): the cue is not positioned against
    // anything any more, it is a flow member of the canvas chrome bar. Containment in `<main>` would
    // now be the WRONG assertion — it would mean the readout was back on the image. What survives is
    // the property V40 was really about: the cue belongs to the canvas it reports on, and it is not
    // on top of it.
    expect(await cue.evaluate((e) => !!e.closest(".canvas-dock"))).toBe(true);
    const cueBox = await cue.boundingBox();
    const canvasBox = await page.locator(".reader main").boundingBox();
    expect(cueBox && canvasBox, "no boxes to compare").toBeTruthy();
    expect(
      cueBox!.y + cueBox!.height <= canvasBox!.y + 1,
      `the zoom cue [y ${Math.round(cueBox!.y)}..${Math.round(cueBox!.y + cueBox!.height)}] is not clear ` +
        `of the canvas [y ${Math.round(canvasBox!.y)}..]`,
    ).toBe(true);
    await expect(cue).toHaveText(/Zoom/);
  });

  test("the narrative reader's chrome is anchored too (V80)", async ({ page }) => {
    // V40 and V80 turned out to be one bug wearing two components' clothes; a fix to Reader alone
    // would leave NarrativeReader drifting. Both get a guard so they can't diverge again.
    await goOffline(page);
    await page.goto("./#/voynich-reading");
    const chrome = page.locator(".canvas-chrome-right");
    await expect(chrome).toBeVisible();
    // Same change of subject as V40 above: the group is a flow member of the narrative's chrome bar,
    // so the assertion is that it sits IN the bar and clear of the canvas, not inside `<main>`.
    expect(await chrome.evaluate((e) => !!e.closest(".canvas-dock"))).toBe(true);
    const chromeBox = await chrome.boundingBox();
    const canvasBox = await page.locator(".narrative main").boundingBox();
    expect(chromeBox && canvasBox, "no boxes to compare").toBeTruthy();
    expect(
      chromeBox!.y + chromeBox!.height <= canvasBox!.y + 1,
      `the narrative's canvas chrome is not clear of its canvas`,
    ).toBe(true);
  });

  test.describe("the filmstrip is one stop, not N (V27/V28)", () => {
    test.beforeEach(async ({ page }) => {
      await goOffline(page);
      await page.goto("./#/voynich");
      await page.locator("button.object").first().click();
      await expect(page.locator("button.frame").first()).toBeVisible();
    });

    test("exactly one frame is in the tab order", async ({ page }) => {
      const frames = page.locator("button.frame");
      expect(await frames.count()).toBeGreaterThan(1);
      // Roving tabindex (docs/research/a11y-interactions.md): a 12-item strip that costs 12 Tab
      // presses to walk past is a wall between the canvas and everything after it.
      await expect(page.locator('button.frame[tabindex="0"]')).toHaveCount(1);
    });

    test("arrow keys move within the strip", async ({ page }) => {
      const frames = page.locator("button.frame");
      const n = await frames.count();
      const labelOf = (i: number) => frames.nth(i).getAttribute("aria-label");
      const focused = () => page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? null);

      await frames.first().focus();
      expect(await focused()).toBe(await labelOf(0));

      await page.keyboard.press("ArrowRight");
      expect(await focused()).toBe(await labelOf(1));

      await page.keyboard.press("ArrowLeft");
      expect(await focused()).toBe(await labelOf(0));

      await page.keyboard.press("End");
      expect(await focused()).toBe(await labelOf(n - 1));

      await page.keyboard.press("Home");
      expect(await focused()).toBe(await labelOf(0));
    });

    test("each frame says which item it is", async ({ page }) => {
      // "item 3 of 12" — position is the thing a screen-reader user cannot see and the visual
      // strip conveys for free.
      const frames = page.locator("button.frame");
      const n = await frames.count();
      await expect(frames.first()).toHaveAttribute("aria-label", new RegExp(`item 1 of ${n}$`));
      await expect(frames.nth(n - 1)).toHaveAttribute("aria-label", new RegExp(`item ${n} of ${n}$`));
    });
  });
});
