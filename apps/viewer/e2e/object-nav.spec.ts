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

/**
 * The Showroom Sampler's object grid — the multi-object exhibit that carries video, audio AND image
 * objects (fixtures/sampler.ts), i.e. the only seed where the AV reader has siblings to step.
 *
 * The `toBeVisible` is load-bearing, not defensive politeness: `Locator.count()` does NOT auto-wait,
 * so counting straight after `goto` reads 0 against an island that has not hydrated yet. That is how
 * a first draft of these AV tests "passed" — one skipped itself on `n < 2` and the other reported
 * "no AV object in the sampler", both while the sampler was sitting there perfectly fine.
 */
async function openSamplerGrid(page: Page) {
  await page.goto("./#/sampler");
  const cards = page.locator("button.object");
  await expect(cards.first()).toBeVisible();
  return cards;
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

  test("stepping objects does NOT carry the open note forward (flip-and-read is gone)", async ({ page }) => {
    // Archie-01a6 removed `stepIntoReading`. The old note-card stepper deliberately selected the next
    // object's FIRST note so the card would survive the step — because the control the reader had just
    // clicked lived INSIDE that card, and letting it close would have pulled the button out from under
    // them mid-gesture. The canvas nav does not move or close when a note closes, so the reason is
    // gone; a nav control whose effect depends on whether a note happens to be open is a control that
    // behaves differently for invisible reasons.
    //
    // Neither ticket asked for this, so it is asserted rather than assumed — this test is what makes
    // the new behaviour a decision on the record instead of a silent removal. If the project restores
    // flip-and-read, this is the test to invert, deliberately.
    await openGridObject(page);
    await page.locator("aside li button").first().click();
    await expect(page.locator(".note-pop")).toBeVisible();

    await page.locator(".canvas-nav .cn-step").last().click();
    await expect(page.locator(".canvas-nav .cn-pos")).toHaveText(/^Object 2 of \d+$/);
    // Landed on the next object with nothing opened on the reader's behalf.
    await expect(page.locator(".note-pop")).toHaveCount(0);
    await expect(page.locator("aside li button[aria-current]")).toHaveCount(0);
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

test.describe("EXACTLY ONE object-nav landmark, on every surface", () => {
  // The landmark question this slice actually raises. The `"Objects in this exhibit"` name did not
  // disappear when the stepper left the aside — it MIGRATED to `.canvas-nav`. The failure mode to
  // guard is therefore not absence but DUPLICATION: two landmarks with the same name make a
  // screen-reader user rotoring by landmark visit both to find which one steps objects. Landmark
  // roles and accessible names are invisible to svelte-check and to `tsc`, so this is the only gate.
  const objectNavLandmarks = (page: Page) => page.locator('nav[aria-label="Objects in this exhibit"]');

  test("grid reader: one, and it is the canvas nav — in BOTH sidebar states", async ({ page }) => {
    await openGridObject(page);
    await expect(objectNavLandmarks(page)).toHaveCount(1);
    expect(await objectNavLandmarks(page).evaluate((e) => e.classList.contains("canvas-nav"))).toBe(true);
    // The aside footer is deliberately NOT a landmark. Asserted as node containment rather than by
    // name: a name-based check here is worthless, because `.canvas-nav` carries the very same name and
    // satisfies it from outside the sidebar. (Measured — the name-based form is green either way.)
    const backUp = page.locator("aside .object-nav button.overview");
    await expect(backUp).toBeVisible();
    expect(await backUp.evaluate((el) => !!el.closest("nav"))).toBe(false);
    // …and the reason that is acceptable rather than a loss: the way up is ALREADY inside a landmark.
    // This is the load-bearing half — without it, "it's covered elsewhere" is an assumption.
    const crumbs = page.locator('nav[aria-label="Breadcrumb"]');
    await expect(crumbs).toHaveCount(1);
    await expect(crumbs.locator("button.crumb-link, a")).not.toHaveCount(0);

    await toggleAside(page, "notes");
    await expect(page.locator("aside.collapsed")).toHaveCount(1);
    await expect(objectNavLandmarks(page)).toHaveCount(1);
  });

  test("narrative: one, and it is the canvas nav", async ({ page }) => {
    await openNarrative(page);
    await expect(page.locator('nav[aria-label="Sections in this narrative"]')).toHaveCount(1);
    await expect(objectNavLandmarks(page)).toHaveCount(0); // the narrative steps sections, not objects
  });

  test("AV: one, and it is the SIDEBAR stepper — the surface with no canvas chrome", async ({ page }) => {
    await goOffline(page);
    const cards = await openSamplerGrid(page);
    const n = await cards.count();
    let found = false;
    for (let i = 0; i < n; i++) {
      await openSamplerGrid(page);
      await cards.nth(i).click();
      await expect(page.locator("aside")).toBeVisible(); // the reader surface mounted
      if ((await page.locator("aside .object-nav .stepper").count()) === 0) continue;
      found = true;
      await expect(page.locator(".canvas-nav")).toHaveCount(0); // no canvas chrome on this surface…
      await expect(objectNavLandmarks(page)).toHaveCount(1); // …so the aside's stepper carries the name
      expect(await objectNavLandmarks(page).evaluate((e) => e.classList.contains("stepper"))).toBe(true);
      break;
    }
    expect(found, "no AV object in the sampler — the fixture no longer exercises this").toBe(true);
  });
});

test.describe("the AV path keeps its stepper — the opt-in this slice's argument rests on", () => {
  test("an AV object in a multi-object exhibit can still reach its siblings", async ({ page }) => {
    // MediaPlayer is the sanctioned (and only) opter into SidebarObjectNav's stepper: an AV object has
    // no canvas chrome for the nav to live in, so deleting it there would strand an AV reader with no
    // way to the next object at all. That claim had no gate; this is it.
    await goOffline(page);
    const cards = await openSamplerGrid(page);
    const n = await cards.count();
    expect(n, "the sampler is no longer multi-object — this gate has lost its subject").toBeGreaterThan(1);

    // Walk the grid until an object renders the AV surface (no canvas nav, a sidebar stepper instead).
    let found = false;
    for (let i = 0; i < n; i++) {
      await openSamplerGrid(page);
      await cards.nth(i).click();
      await expect(page.locator("aside")).toBeVisible(); // the reader surface mounted
      const stepper = page.locator("aside .object-nav .stepper");
      if ((await stepper.count()) === 0) continue;
      found = true;
      // The AV surface has NO canvas nav — that is why the sidebar one must exist.
      await expect(page.locator(".canvas-nav")).toHaveCount(0);
      const pos = stepper.locator(".pos");
      await expect(pos).toHaveText(/^Object \d+ of \d+$/); // same wording as the canvas nav
      const before = await pos.innerText();
      // Step in whichever direction is live, so the assertion holds whether the AV object the walk
      // landed on is first, middle or last. A `test.skip` on "last sibling" would quietly stop
      // exercising the navigation on the day the fixture's object order changed.
      const next = stepper.locator("button.step").last();
      const prev = stepper.locator("button.step").first();
      const live = (await next.isDisabled()) ? prev : next;
      await expect(live).toBeEnabled(); // a 1-object list would fail here, and should
      await live.click();
      await expect(pos).not.toHaveText(before); // it really navigates, not just renders
      break;
    }
    expect(found, "no AV object in the sampler — the fixture no longer exercises this").toBe(true);
  });
});
