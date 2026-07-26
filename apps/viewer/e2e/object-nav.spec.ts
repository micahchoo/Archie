import { test, expect, type Page } from "@playwright/test";
import { goOffline } from "./offline.js";

// Archie-01a6 (V65; materially reduces V23) — object/section nav belongs in the canvas chrome.
//
// The ticket asks for FOUR states: both reading modes × sidebar open and collapsed. That count is the
// finding, not a thoroughness ritual. Before this, the grid reader's real object stepper lived inside
// the collapsible aside and vanished with it, and a substitute stepper had grown into the NOTE CARD
// that appeared only in the collapsed state — so of the four states, no single control was present in
// more than two, and the one that was present in the collapsed pair stepped a noun its container did
// not own. Asserting one state would have passed against the broken build.
//
// Offline, like the rest of the suite: the object list, the section spine and the canvas chrome all
// render from the local manifest, so the nav must be there whether or not a tile ever arrives.

/** Collapse (or re-show) a reader's aside through its real control, as a reader would. */
async function toggleAside(page: Page, label: string) {
  const btn = page.locator(`button.collapse[aria-label="Hide ${label}"], button.collapse[aria-label="Show ${label}"]`);
  await expect(btn).toBeVisible();
  await btn.click();
}

async function openGridObject(page: Page) {
  await goOffline(page);
  await page.goto("./#/voynich");
  await page.locator("button.object").first().click();
  await expect(page.locator("button.frame").first()).toBeVisible();
}

async function openNarrative(page: Page) {
  await goOffline(page);
  await page.goto("./#/voynich-reading");
  await expect(page.locator(".num").first()).toBeVisible();
}

test.describe("the nav is present in BOTH sidebar states (V65's discoverability half)", () => {
  test("grid reader — sidebar open, then collapsed", async ({ page }) => {
    await openGridObject(page);
    const nav = page.locator(".canvas-nav");

    // OPEN
    await expect(nav).toBeVisible();
    expect(await nav.evaluate((e) => !!e.closest("main"))).toBe(true); // canvas chrome, not the aside
    await expect(page.locator(".canvas-nav .cn-pos")).toHaveText(/^Object \d+ of \d+$/);

    // COLLAPSED — the state the old stepper disappeared in
    await toggleAside(page, "notes");
    await expect(page.locator("aside.collapsed")).toHaveCount(1);
    await expect(nav).toBeVisible();
    await expect(page.locator(".canvas-nav .cn-pos")).toHaveText(/^Object \d+ of \d+$/);
  });

  test("narrative — spine open, then collapsed", async ({ page }) => {
    await openNarrative(page);
    const nav = page.locator(".canvas-nav");

    await expect(nav).toBeVisible();
    expect(await nav.evaluate((e) => !!e.closest("main"))).toBe(true);
    await expect(page.locator(".canvas-nav .cn-pos")).toHaveText(/^Section \d+ of \d+$/);

    await toggleAside(page, "narrative");
    await expect(page.locator("aside.collapsed")).toHaveCount(1);
    await expect(nav).toBeVisible();
    await expect(page.locator(".canvas-nav .cn-pos")).toHaveText(/^Section \d+ of \d+$/);
  });
});

test.describe("the visible label speaks the noun (V65's label half)", () => {
  test("the button's own name and the position agree about the unit", async ({ page }) => {
    // The defect: `‹ Prev  2 / 12  Next ›` on screen while the aria said "Object 2 of 12". The two
    // channels are now one string from `product-copy`, so this asserts them TOGETHER — a visible
    // "2 / 12" beside an aria "Object 2 of 12" would pass a check of either one alone.
    await openGridObject(page);
    const pos = page.locator(".canvas-nav .cn-pos");
    await expect(pos).toHaveText(/^Object \d+ of \d+$/);
    const next = page.locator(".canvas-nav .cn-step").last();
    // Prev/next name their DESTINATION, and name the unit when there is none left.
    await expect(next).toHaveAttribute("aria-label", /^(Next object: .+|This is the last object)$/);
    await expect(page.locator(".canvas-nav")).toHaveAttribute("aria-label", "Objects in this exhibit");
  });

  test("the narrative names sections, not objects", async ({ page }) => {
    await openNarrative(page);
    await expect(page.locator(".canvas-nav .cn-pos")).toHaveText(/^Section \d+ of \d+$/);
    await expect(page.locator(".canvas-nav")).toHaveAttribute("aria-label", "Sections in this narrative");
  });
});

test.describe("the nav actually steps the thing it names", () => {
  test("grid reader: forward then back returns to the same object", async ({ page }) => {
    await openGridObject(page);
    const pos = page.locator(".canvas-nav .cn-pos");
    const start = await pos.innerText();
    await page.locator(".canvas-nav .cn-step").last().click();
    await expect(pos).not.toHaveText(start);
    await page.locator(".canvas-nav .cn-step").first().click();
    await expect(pos).toHaveText(start);
  });

  test("narrative: stepping moves the spine's own position indicator too", async ({ page }) => {
    // The spine eyebrow and the canvas nav are two readouts of one index — V23 is exactly the class of
    // bug where two such readouts drift. Assert they move together, not merely that each exists.
    await openNarrative(page);
    const navPos = page.locator(".canvas-nav .cn-pos");
    const spinePos = page.locator(".spine-pos");
    await expect(navPos).toHaveText(/^Section 1 of \d+$/);
    await page.locator(".canvas-nav .cn-step").last().click();
    await expect(navPos).toHaveText(/^Section 2 of \d+$/);
    // Compared case-insensitively: the spine eyebrow is uppercased by its chrome voice, the canvas
    // pill is not. The WORD SEQUENCE is what must agree — that both say "Section 2 of 6" and not
    // "Section 2 of 6" beside "2 / 6". Casing is each surface's own typography.
    const norm = (s: string) => s.replace(/^·\s*/, "").trim().toLowerCase();
    expect(norm(await spinePos.innerText())).toBe(norm(await navPos.innerText()));
  });

  test("the ends are disabled rather than silently inert", async ({ page }) => {
    await openNarrative(page);
    await expect(page.locator(".canvas-nav .cn-step").first()).toBeDisabled();
    await expect(page.locator(".canvas-nav .cn-step").first()).toHaveAttribute("aria-label", "This is the first section");
  });
});

test.describe("the note card carries no stepper, in any of the four states", () => {
  for (const collapsed of [false, true]) {
    test(`grid reader, sidebar ${collapsed ? "collapsed" : "open"}`, async ({ page }) => {
      await openGridObject(page);
      await page.locator("aside li button").first().click();
      await expect(page.locator(".note-pop")).toBeVisible();
      if (collapsed) await toggleAside(page, "notes");
      await expect(page.locator(".note-pop")).toBeVisible();
      // Nothing inside the card navigates anything: no nav landmark, and no leftover stepper markup.
      await expect(page.locator(".note-pop nav")).toHaveCount(0);
      await expect(page.locator(".np-stepper")).toHaveCount(0);
    });
  }

  for (const collapsed of [false, true]) {
    test(`narrative, spine ${collapsed ? "collapsed" : "open"}`, async ({ page }) => {
      await openNarrative(page);
      await page.locator(".pane-toggle button", { hasText: /Notes/ }).click();
      const note = page.locator(".notes-list li button").first();
      test.skip((await note.count()) === 0, "this narrative's first section has no notes");
      await note.click();
      await expect(page.locator(".note-pop")).toBeVisible();
      if (collapsed) await toggleAside(page, "narrative");
      await expect(page.locator(".note-pop")).toBeVisible();
      await expect(page.locator(".note-pop nav")).toHaveCount(0);
      await expect(page.locator(".np-stepper")).toHaveCount(0);
    });
  }
});

test.describe("one object nav per reader (the half of V23 this ticket can move)", () => {
  test("the grid reader's aside offers the way UP, not a second stepper", async ({ page }) => {
    await openGridObject(page);
    // "Back to Exhibit" stays — it is the step the canvas chrome does NOT carry.
    await expect(page.locator("aside button.overview")).toBeVisible();
    // …and the aside's own stepper is gone, so the reader is not offered two controls that step the
    // same list with different labels a screen apart.
    await expect(page.locator("aside .stepper")).toHaveCount(0);
    await expect(page.locator(".canvas-nav")).toHaveCount(1);
  });
});
