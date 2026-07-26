import { test, expect, type Page } from "@playwright/test";
import { goOffline } from "./offline.js";

// V101 / V24 / V84 / V52 — Archie-99b1: the address tracks the deepest open rung.
//
// `route.ts` has always PARSED `/o/`, `/a/`, `/s/`, `?xywh` and `?t`, and arrival has always honoured
// them. Nothing ever WROTE one. Every rung of the cite ladder was readable and unreachable.
//
// THE ASSERTION IS THE ROUND TRIP, not the string. A test that only checked "a hash was written"
// would pass against an address nothing can parse — which is precisely how V100 survived a green
// suite. So each case drives to a state, reads `location.hash`, RELOADS, and asserts the same state
// came back. That is the only property a reader actually cares about: the URL they copied works.

const hash = (page: Page): Promise<string> => page.evaluate(() => location.hash);

test.describe("the address follows the reader (V101)", () => {
  test("opening an object writes /o/ and survives a reload (V24)", async ({ page }) => {
    await goOffline(page);
    await page.goto("./#/voynich");
    await page.locator("button.object").first().click();
    await expect(page.locator("button.frame").first()).toBeVisible();

    const written = await hash(page);
    expect(written, "an opened object must be addressable").toMatch(/^#\/voynich\/o\/[^/?]+$/);

    // The round trip: the same address, cold, lands on the same object rather than the grid.
    await page.reload();
    await expect(page.locator("button.frame").first()).toBeVisible();
    expect(await hash(page)).toBe(written);
  });

  test("stepping back to the grid drops the rung — the address never lies about depth", async ({ page }) => {
    await goOffline(page);
    await page.goto("./#/voynich");
    await page.locator("button.object").first().click();
    await expect(page.locator("button.frame").first()).toBeVisible();
    expect(await hash(page)).toMatch(/\/o\//);

    // Escape is a LADDER (Archie-3d55), not one binding: with focus parked inside the canvas
    // container the first press only leaves the canvas. Walk it until the grid is back — which is
    // the reader's real experience, and keeps this test about the ADDRESS rather than about how many
    // rungs the ladder happens to have today.
    const grid = page.locator("button.object").first();
    for (let i = 0; i < 4 && !(await grid.isVisible().catch(() => false)); i++) {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(200);
    }
    await expect(grid).toBeVisible();
    await expect.poll(() => hash(page)).toBe("#/voynich");
  });

  test("selecting a note writes /a/<logicalId>, and it resolves on reload", async ({ page }) => {
    await goOffline(page);
    await page.goto("./#/voynich");
    await page.locator("button.object").first().click();
    const note = page.locator("aside li button").first();
    await expect(note).toBeVisible();
    const noteText = ((await note.textContent()) ?? "").trim().slice(0, 30);
    await note.click();

    // A ULID, not a full IRI — the grammar route.ts reads. Archie-67b6 is what makes this honest;
    // before it, writing this address would have produced a link that could not resolve.
    await expect.poll(() => hash(page)).toMatch(/^#\/voynich\/a\/[0-9A-HJKMNP-TV-Z]{26}/);
    const written = await hash(page);

    await page.reload();
    await expect(page.locator("body")).toContainText(noteText, { timeout: 20000 });
    expect(await hash(page)).toBe(written);
  });

  test("selection uses replaceState — Back leaves the exhibit, it does not walk notes", async ({ page }) => {
    // The explicit decision on this ticket. Escape and Back both already mean "up a level"; a history
    // entry per selection would silently redefine Back as "the previous note", which is a worse
    // contract and impossible to undo once readers rely on it.
    await goOffline(page);
    await page.goto("./");                       // the gallery — a real previous entry to go back TO
    // Navigate by CLICKING, not a second goto: two gotos to different hashes of the same document
    // make the history entry the test needs ambiguous, and the exhibit may re-sync onto a different
    // object (measured — the notes list came back empty that way).
    await page.locator('a.card[href="#/voynich"]').click();
    await page.locator("button.object").first().click();
    await expect(page.locator("button.frame").first()).toBeVisible();
    const notes = page.locator("aside li button");
    await expect(notes.first()).toBeVisible();
    const n = Math.min(await notes.count(), 3);
    expect(n, "need several notes to prove Back doesn't walk them").toBeGreaterThan(1);
    for (let i = 0; i < n; i++) { await notes.nth(i).click(); await page.waitForTimeout(150); }

    await page.goBack();
    // ONE step back leaves the exhibit. If selections had pushed, this would still be inside voynich,
    // walking backwards through the notes just clicked.
    await expect.poll(() => hash(page), { timeout: 10000 }).not.toMatch(/\/a\//);
  });

  test("the narrative spine is addressable — /s/ survives a reload (V84)", async ({ page }) => {
    // V84: the spine had no address at all, so stepping out to the index and back lost your place.
    await goOffline(page);
    await page.goto("./#/screenshots");
    const items = page.locator("aside ol.sections > li");
    await expect(items.first()).toBeVisible();
    const n = await items.count();
    expect(n).toBeGreaterThan(2);

    // Move off section 0 — landing on 0 by accident would make this pass vacuously.
    await items.nth(2).click();
    await expect.poll(() => hash(page), { timeout: 10000 }).toMatch(/^#\/screenshots\/s\/.+/);
    const written = await hash(page);

    await page.reload();
    await expect(items.first()).toBeVisible();
    expect(await hash(page), "the spine must come back to the same beat").toBe(written);
  });
});
