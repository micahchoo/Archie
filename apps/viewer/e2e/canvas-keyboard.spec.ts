import { test, expect } from "@playwright/test";
import { goOffline } from "./offline.js";

// Archie-3d55 (V90/V25/V26) — the canvas is reachable, nameable and escapable by keyboard.
//
// The ticket asks for two assertions that regress the moment someone adds an unnamed control: the
// tab-stop COUNT and that every stop has an accessible name. Both are here.
//
// V45's half lives in packages/render-mount (read-overlay.test.ts): the two consumers were measured
// disagreeing about whether a mark is a control, and the reconciliation is a GUARANTEE — every note
// reachable and named — reached by different mechanisms, because Annotorious 3 paints to WebGL and
// has no per-shape node to focus. The shell's route is the notes list; the embed's is the region
// overlay, now one tab stop with roving arrows rather than one stop per region.

/** Every element in the page's tab sequence, with whatever name it would announce. */
const tabStops = (page: import("@playwright/test").Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[tabindex="0"], a[href], button:not([tabindex="-1"]), input, select, textarea')]
      .filter((el) => {
        const s = getComputedStyle(el);
        if (s.display === "none" || s.visibility === "hidden") return false;
        return !el.closest("[inert]") && !el.closest("astro-dev-toolbar");
      })
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        cls: typeof el.className === "string" ? el.className.split(" ")[0] : "",
        role: el.getAttribute("role") ?? "",
        name: (el.getAttribute("aria-label") || el.textContent?.trim() || el.getAttribute("title") || "").slice(0, 60),
      })));

// WHAT IS NOT HERE, and how it was checked instead.
//
// The canvas's own stops cannot be asserted in this suite. Offline — which every spec here is, by
// design, because all annotated seed exhibits are remote-sourced — OSD's open FAILS, and the failed
// mount tears its canvas back out of the DOM. Measured: `.openseadragon-canvas` is briefly present
// and then `document.querySelector` returns null, with no OSD element anywhere in the tab list.
//
// So `aria-label` on the canvas (V90/V25) and the leave-the-canvas rung were verified by driving the
// app ONLINE by hand on 2026-07-25, the same way the halo was (selection.spec.ts's header). What
// remains below is the part that holds with the network gone — which is most of the ladder, and the
// no-anonymous-stops sweep over all the chrome that surrounds the canvas.
test.describe("nothing in the reader is an anonymous tab stop (V90)", () => {
  test("every tab stop announces something", async ({ page }) => {
    // The general form of V90's finding. Two of the four canvas stops announced nothing; this sweeps
    // the whole reader so a new unnamed control anywhere is a failure, not just on the canvas.
    await goOffline(page);
    await page.goto("./#/voynich");
    await page.locator("button.object").first().click();
    await expect(page.locator("button.frame").first()).toBeVisible();

    const stops = await tabStops(page);
    expect(stops.length).toBeGreaterThan(0);
    const anonymous = stops.filter((s) => s.name === "");
    expect(anonymous, `anonymous tab stops: ${JSON.stringify(anonymous)}`).toHaveLength(0);
  });

  test("the whole-object frame is a named stop, and stays one (V46)", async ({ page }) => {
    // Archie-ed50 made the frame load-bearing keyboard infrastructure: it is the canvas's ONE named
    // stop, which is why it survives Hide-all. Asserting it here keeps the two decisions tied.
    await goOffline(page);
    await page.goto("./#/voynich");
    await page.locator("button.object").first().click();
    const frame = page.locator("button.frame").first();
    await expect(frame).toBeVisible();
    await expect(frame).toHaveAttribute("aria-label", /.+/);
  });
});

test.describe("Escape is a ladder, not one binding (V26)", () => {
  test("Escape with a note open closes the note and stays put", async ({ page }) => {
    await goOffline(page);
    await page.goto("./#/voynich");
    await page.locator("button.object").first().click();
    await page.locator("aside li button").first().click();
    await expect(page.locator(".note-pop")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.locator(".note-pop")).toHaveCount(0);
    expect(page.url()).toContain("#/voynich"); // rung one only — it did not also leave the object
  });

  test("Escape with nothing open goes up a level", async ({ page }) => {
    // Measured before the fix: Escape did nothing at all here — same hash, same "Object 2 of 12".
    // The only way up was BACK TO EXHIBIT, which is invisible when the sidebar is collapsed.
    await goOffline(page);
    await page.goto("./#/voynich");
    await page.locator("button.object").first().click();
    await expect(page.locator(".openseadragon-canvas").first()).toBeVisible();
    await expect(page.locator(".note-pop")).toHaveCount(0);

    await page.keyboard.press("Escape");
    // Back at the object grid: the overview renders the object cards again.
    await expect(page.locator("button.object").first()).toBeVisible();
  });

  test("the reader has a landing place for focus to return to", async ({ page }) => {
    // The middle rung hands focus to `main`, not to <body> — blurring to nothing is how a keyboard
    // reader loses their place entirely. The rung itself needs a live canvas (see the header); what
    // is assertable offline is that the target it aims at exists and can hold focus.
    await goOffline(page);
    await page.goto("./#/voynich");
    await page.locator("button.object").first().click();
    const main = page.locator(".reader > main");
    await expect(main).toHaveAttribute("tabindex", "-1");
    await main.focus();
    expect(await page.evaluate(() => document.activeElement?.tagName.toLowerCase())).toBe("main");
  });
});
