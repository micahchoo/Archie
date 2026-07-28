import { test, expect } from "@playwright/test";
import { goOffline } from "./offline.js";

// Archie-36e6 — the exhibit's credit, licence and metadata MUST be on screen in every reader.
//
// The defect: `MetadataRun` was mounted only in `ObjectGrid`, and a single-object exhibit routes
// straight past the grid to the Reader. So `voynich-rosettes` — one object, carrying an exhibit
// `requiredStatement`, a `rights` URI and three metadata entries — rendered NONE of them anywhere in
// the SPA. A IIIF requiredStatement is MUST-display, and the failure was invisible: the page looked
// complete, and the OBJECT's own credit sitting in the same corner made it look correct.
//
// THE GATE IS THE RENDERED ARTIFACT, not a unit suite. The ticket is explicit about this and so is
// `.claude/rules/svelte-no-typecheck-net.md`: a green suite over a surface that carries nothing is
// this repo's most-repeated failure. Everything below counts elements on the driven page.
//
// Offline throughout — the credit block comes from the local manifest. If it ever needed a tile to
// appear, that would itself be the regression.

/** The exhibit-level attribution, wherever it is rendered. */
const exhibitLine = ".credit .line[data-level='exhibit']";
const objectLine = ".credit .line[data-level='object']";

test.describe("exhibit-level rights reach every reader (Archie-36e6)", () => {
  test("a SINGLE-object exhibit shows the exhibit credit, licence and metadata", async ({ page }) => {
    await goOffline(page);
    // voynich-rosettes: one object ⇒ resolveLayout picks `single` ⇒ straight to the Reader, no grid.
    await page.goto("./#/voynich-rosettes");

    // Precondition: this really is the single layout. If the fixture ever grows a second object the
    // test would silently start proving the GRID case, which was never broken.
    await expect(page.locator(".reader")).toBeVisible();
    await expect(page.locator("button.object")).toHaveCount(0);

    // 1. The exhibit credit is on screen — the MUST-display obligation.
    await expect(page.locator(exhibitLine)).toHaveCount(1);
    await expect(page.locator(exhibitLine)).toContainText("Beinecke");

    // 2. Its licence rides the same line (the placement decision: named levels, always visible).
    await expect(page.locator(exhibitLine)).toContainText(/public domain|CC|Rights/i);

    // 3. The exhibit metadata run renders its rows. This is the count the ticket measured at ZERO.
    const pairs = page.locator(".reader dl.run .pair");
    expect(await pairs.count(), "exhibit metadata rows in the reader").toBeGreaterThan(0);
  });

  test("both levels are NAMED when both are shown, so two credits can't read as one", async ({ page }) => {
    await goOffline(page);
    await page.goto("./#/voynich-rosettes");
    await expect(page.locator(exhibitLine)).toBeVisible();

    // The rosettes object carries its own credit distinct from the exhibit's, so both lines show —
    // and an unnamed pair of credit sentences is indistinguishable from the same one printed twice.
    if (await page.locator(objectLine).count()) {
      await expect(page.locator(`${exhibitLine} .lvl`)).toHaveText("Exhibit");
      await expect(page.locator(`${objectLine} .lvl`)).toHaveText(/This /);
      // The echo rule's whole point: when both are shown they are NOT the same sentence.
      const ex = ((await page.locator(exhibitLine).textContent()) ?? "").trim();
      const ob = ((await page.locator(objectLine).textContent()) ?? "").trim();
      expect(ex).not.toBe(ob);
    }
  });

  test("the NARRATIVE reader carries the exhibit metadata run too", async ({ page }) => {
    await goOffline(page);
    // voynich-reading has sections ⇒ narrative. It already showed the exhibit CREDIT; the run was
    // the missing half, and a narrative exhibit therefore dropped creator/date entirely.
    await page.goto("./#/voynich-reading");
    await expect(page.locator(".narrative, .reader").first()).toBeVisible();

    await expect(page.locator(".credit .line").first()).toBeVisible();
    const pairs = page.locator("dl.run .pair");
    expect(await pairs.count(), "exhibit metadata rows in the narrative reader").toBeGreaterThan(0);
  });

  test("the GRID path is unchanged — one level, unnamed, no regression", async ({ page }) => {
    await goOffline(page);
    // The grid was never broken: ObjectGrid mounts both Credit and MetadataRun against the exhibit.
    // With one level on screen there is nothing to disambiguate, so the level word must NOT appear —
    // adding it everywhere would be chrome the placement decision explicitly refused.
    await page.goto("./#/voynich");
    await expect(page.locator("button.object").first()).toBeVisible();
    await expect(page.locator(".credit .line").first()).toBeVisible();
    await expect(page.locator(".credit .lvl")).toHaveCount(0);
    expect(await page.locator("dl.run .pair").count()).toBeGreaterThan(0);
  });
});
