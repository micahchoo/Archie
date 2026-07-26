import { test, expect, type Page } from "@playwright/test";
import { goOffline } from "./offline.js";

// V102 / V106 — Archie-3ea1: the cite panel.
//
// The audit's headline finding: for a tool whose purpose is citable annotation there was NO clipboard
// or share affordance anywhere in the read surface. Every rung was addressable after Archie-99b1 and
// none of them was copyable.
//
// EVERY GRAIN IS ASSERTED FROM THE CLIPBOARD, not from the textarea that displays it. Reading the DOM
// node would pass against a Copy button wired to the wrong value, or to nothing at all — and "the
// text is on screen" is not the deliverable, "the text is on your clipboard" is.

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

const clip = (page: Page): Promise<string> => page.evaluate(() => navigator.clipboard.readText());

/** Open an object in voynich, then the cite panel over it. */
async function openCiteOnObject(page: Page) {
  await goOffline(page);
  await page.goto("./#/voynich");
  await page.locator("button.object").first().click();
  await expect(page.locator("button.frame").first()).toBeVisible();
  await page.locator("button.cite-trigger").click();
  await expect(page.locator('[role="dialog"][aria-label^="Cite"]')).toBeVisible();
}

const grainCopy = (page: Page, name: string) =>
  page.getByRole("button", { name: `Copy ${name}` });

test.describe("the cite panel (V102)", () => {
  test("the LINK grain copies exactly the current address", async ({ page }) => {
    await openCiteOnObject(page);
    const href = await page.evaluate(() => location.href);
    await grainCopy(page, "link").click();
    // Equality, not both-non-empty: the whole point is that the panel READS the address rather than
    // re-deriving it. A second derivation that drifts is the failure this asserts against.
    expect(await clip(page)).toBe(href);
    expect(href).toMatch(/#\/voynich\/o\//);
  });

  test("the CITATION grain copies a reference carrying the credit and the licence", async ({ page }) => {
    await openCiteOnObject(page);
    await grainCopy(page, "citation").click();
    const text = await clip(page);
    // The object's own requiredStatement — a MUST-display credit has to survive being cited.
    expect(text).toContain("Beinecke");
    expect(text).toContain("creativecommons.org/publicdomain/mark/1.0/");
    expect(text).toContain(await page.evaluate(() => location.href));
  });

  test("the CONTENT STATE grain round-trips through decodeContentState", async ({ page }) => {
    // Content State names an ANNOTATION on a canvas, so it appears at the note grain.
    await goOffline(page);
    await page.goto("./#/voynich");
    await page.locator("button.object").first().click();
    await page.locator("aside li button").first().click();
    await expect.poll(() => page.evaluate(() => location.hash)).toMatch(/\/a\//);
    await page.locator("button.cite-trigger").click();
    await expect(page.locator('[role="dialog"][aria-label^="Cite"]')).toBeVisible();

    await grainCopy(page, "iiif content state").click();
    const encoded = await clip(page);
    expect(encoded.length).toBeGreaterThan(20);

    // Decode with the SAME codec the app ships (base64url → JSON), and assert it is a real Content
    // State rather than merely a long string.
    const decoded = await page.evaluate((e) => {
      let b64 = e.replace(/-/g, "+").replace(/_/g, "/");
      while (b64.length % 4) b64 += "=";
      return JSON.parse(decodeURIComponent(atob(b64)));
    }, encoded);
    expect(decoded.type).toBe("Annotation");
    expect(decoded.motivation).toBe("highlighting");
    expect(decoded.target.source).toContain("/canvas/");
  });

  test("the Content State grain is ABSENT at exhibit grain, not fabricated", async ({ page }) => {
    // An exhibit has no annotation to encode. Offering an empty or invented payload would be worse
    // than offering nothing — it decodes to a target that does not exist.
    await goOffline(page);
    await page.goto("./#/voynich");
    await expect(page.locator("button.object").first()).toBeVisible();
    await page.locator("button.cite-trigger").click();
    await expect(page.locator('[role="dialog"][aria-label^="Cite"]')).toBeVisible();
    await expect(grainCopy(page, "link")).toBeVisible();
    await expect(grainCopy(page, "iiif content state")).toHaveCount(0);
  });

  test("it is a DIALOG: focus moves in, Tab is trapped, Escape returns focus", async ({ page }) => {
    // Archie-40fe spent a whole ticket getting floating chrome off the canvas; this panel must be a
    // dialog, not a new persistent surface. Same assertions note.spec.ts makes of the other dialogs.
    await openCiteOnObject(page);
    const dialog = page.locator('[role="dialog"][aria-label^="Cite"]');
    await expect(dialog).toHaveAttribute("aria-modal", "true");

    // focus moved INTO the dialog
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);

    // Tab several times — focus must never leave the dialog
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Tab");
      expect(
        await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')),
        `Tab ${i + 1} escaped the dialog`,
      ).toBe(true);
    }

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    // focus returned to the trigger
    expect(await page.evaluate(() => document.activeElement?.className ?? "")).toContain("cite-trigger");
  });

  test("the panel does not cover the canvas — it replaces chrome, it does not add it", async ({ page }) => {
    // The V48 guard restated for this surface: closing the panel must leave NOTHING new floating.
    await openCiteOnObject(page);
    await page.keyboard.press("Escape");
    await expect(page.locator('[role="dialog"][aria-label^="Cite"]')).toHaveCount(0);
    await expect(page.locator(".cite-scrim")).toHaveCount(0);
  });
});
