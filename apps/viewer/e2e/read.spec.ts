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
    // The cue sat OUTSIDE <main>, so at narrow widths it drifted off the image it was reporting on.
    // Being inside <main> is the whole fix — assert the containment, not the pixels.
    expect(await cue.evaluate((e) => !!e.closest("main"))).toBe(true);
    await expect(cue).toHaveText(/Zoom/);
  });

  test("the narrative reader's chrome is anchored too (V80)", async ({ page }) => {
    // V40 and V80 turned out to be one bug wearing two components' clothes; a fix to Reader alone
    // would leave NarrativeReader drifting. Both get a guard so they can't diverge again.
    await goOffline(page);
    await page.goto("./#/voynich-reading");
    const chrome = page.locator(".canvas-chrome-right");
    await expect(chrome).toBeVisible();
    expect(await chrome.evaluate((e) => !!e.closest("main"))).toBe(true);
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
