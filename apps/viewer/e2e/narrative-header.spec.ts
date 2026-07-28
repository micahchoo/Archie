import { test, expect } from "@playwright/test";
import { goOffline } from "./offline.js";

// Archie-1474 — the narrative aside's header, and the two ways it made the Notes pane unreachable.
//
// The aside IS the scroll container (`aside { overflow: auto }`). The pane toggle is the ONLY listable
// door to an item's notes, and it used to scroll away with the header — so the further a reader got
// into a narrative, the more unreachable the notes became. Compounding it, Archie-36e6 added a
// <MetadataRun> directly above the toggle, which pushed it further down still.
//
// Two fixes, and this file gates both:
//   1. `.pane-toggle` is `position: sticky; top: 0` — it never leaves the scrollport.
//   2. The exhibit's Dublin Core rows fold into a closed-by-default <details>, so the header stops
//      growing. The CREDIT deliberately does NOT fold: it renders the IIIF `requiredStatement`, which
//      is MUST-display, and a closed <details> is not displayed.
//
// Offline: the spine, the credit and the metadata all render from the local manifest.

test.describe("the narrative aside's header (Archie-1474)", () => {
  test.beforeEach(async ({ page }) => {
    await goOffline(page);
    await page.goto("./#/voynich-reading");
    await expect(page.locator(".num").first()).toBeVisible();
  });

  test("the pane toggle stays on screen however far the spine is scrolled", async ({ page }) => {
    const aside = page.locator(".narrative aside.spine");
    const toggle = page.locator(".pane-toggle");
    await expect(toggle).toBeVisible();

    // Scroll the column to its end. `scrollTo` rather than a wheel gesture because the subject here is
    // the toggle's resting position, not any animation — see playwright-emulation-and-scroll-traps.
    const scrolled = await aside.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
      return { top: el.scrollTop, max: el.scrollHeight - el.clientHeight };
    });

    // Print the subject, not only the verdict: if the column cannot scroll, everything below is
    // vacuous — the toggle would be "still visible" because nothing ever moved.
    expect(scrolled.max, `the aside does not scroll (scrollHeight-clientHeight=${scrolled.max}) — this test proves nothing`).toBeGreaterThan(200);
    expect(scrolled.top, "the aside did not actually scroll").toBeGreaterThan(200);

    // The real assertion: after that scroll the toggle is still inside the column's visible box.
    // Before the fix its bottom sat hundreds of px ABOVE the aside's top — scrolled clean out.
    const boxes = await page.evaluate(() => {
      const a = document.querySelector(".narrative aside.spine")!.getBoundingClientRect();
      const t = document.querySelector(".pane-toggle")!.getBoundingClientRect();
      return { asideTop: a.top, asideBottom: a.bottom, top: t.top, bottom: t.bottom };
    });
    expect(boxes.bottom, "the pane toggle scrolled off the top of the aside").toBeGreaterThan(boxes.asideTop);
    expect(boxes.top, "the pane toggle is below the aside's visible area").toBeLessThan(boxes.asideBottom);

    // …and it is genuinely usable, not merely positioned: the Notes pane opens from here.
    await toggle.getByText(/Notes/).click();
    await expect(page.locator(".pane-toggle button", { hasText: /Notes/ })).toHaveAttribute("aria-pressed", "true");
  });

  test("the credit is always shown; only the metadata folds", async ({ page }) => {
    // The MUST-display half. This must be visible with no interaction at all.
    await expect(page.locator(".credit-row")).toBeVisible();

    const fold = page.locator(".meta-fold");
    await expect(fold).toBeVisible();
    // Closed by default — that is the header-shrinking half of the fix.
    await expect(fold).not.toHaveAttribute("open", /.*/);
    await expect(fold.locator("dl.run")).toBeHidden();

    // Non-vacuity: the fixture must actually carry rows, or "hidden" says nothing. voynich-reading
    // carries three dcterms entries and none of them echoes the credit, so none is demoted away.
    await fold.locator("summary").click();
    await expect(fold).toHaveAttribute("open", /.*/);
    await expect(fold.locator("dl.run .pair")).toHaveCount(3);
  });
});
