import { test, expect } from "@playwright/test";
import { CANVAS, aRegionNote, goOffline, openPaintedNarrative, openPaintedNote } from "./offline.js";

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

// WHAT USED TO BE MISSING HERE. This header read: "The canvas's own stops cannot be asserted in this
// suite ... OSD's open FAILS, and the failed mount tears its canvas back out of the DOM", so
// `aria-label` on the canvas (V90/V25) and the leave-the-canvas rung "were verified by driving the app
// ONLINE by hand on 2026-07-25".
//
// That was true of every REMOTE exhibit and is still true of `voynich`, which is why the sweeps below
// stay there — a torn-out canvas is the harshest place to prove the surrounding chrome is named. It
// was never true of `screenshots`, whose 21 images are local: OSD opens, paints, and keeps its canvas.
// The canvas-anchored describes at the bottom of this file are the 2026-07-25 hand-drive, automated.
// `canvas-offline.spec.ts` asserts the premise (including that the teardown does NOT happen there).
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
    // reader loses their place entirely. This asserts the TARGET exists and can hold focus, on the
    // surface where the canvas is torn out; the rung itself is driven below on `screenshots`.
    await goOffline(page);
    await page.goto("./#/voynich");
    await page.locator("button.object").first().click();
    const main = page.locator(".reader > main");
    await expect(main).toHaveAttribute("tabindex", "-1");
    await main.focus();
    expect(await page.evaluate(() => document.activeElement?.tagName.toLowerCase())).toBe("main");
  });
});

// ---------------------------------------------------------------------------------------------
// On a PAINTED canvas (`screenshots`, local images — see canvas-offline.spec.ts). Everything below
// was hand-driven online on 2026-07-25 because offline there was no canvas to drive.
// ---------------------------------------------------------------------------------------------

/** Where focus is, described well enough to tell "in the canvas" from "landed on main". */
const focusReport = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const a = document.activeElement;
    return {
      tag: a?.tagName.toLowerCase() ?? null,
      cls: typeof a?.className === "string" ? a.className : "",
      inCanvas: !!a?.closest(".openseadragon-container"),
    };
  });

/** A cheap fingerprint of what the canvas is currently showing. */
const canvasShot = async (page: import("@playwright/test").Page) =>
  (await page.locator(CANVAS).first().screenshot()).toString("base64");

test.describe("the canvas is a named, reachable keyboard stop (V90/V25)", () => {
  test("the canvas announces itself and what its keys do", async ({ page }) => {
    // V90 found two of the canvas's four stops announcing nothing. A deep-zoom surface is the one
    // control whose keys a reader cannot guess, so the label carries them.
    await goOffline(page);
    await openPaintedNarrative(page);

    const canvas = page.locator(CANVAS).first();
    await expect(canvas).toHaveAttribute("tabindex", "0");
    await expect(canvas).toHaveAttribute("aria-label", /.+/);
    // Not merely non-empty: the label's whole job is to name the keys. "Image" would satisfy /.+/.
    await expect(canvas).toHaveAttribute("aria-label", /arrow/i);
  });

  test("arrow keys actually move the image", async ({ page }) => {
    // The label promises panning. Asserting only the attribute would let the promise outlive the
    // binding — OSD owns the arrow keys precisely BECAUSE the readers deliberately leave them unbound
    // (Reader.svelte / NarrativeReader.svelte both say so), so a stray `preventDefault` upstream is a
    // silent way to break it. Compare what is on screen before and after.
    await goOffline(page);
    await openPaintedNarrative(page);
    const canvas = page.locator(CANVAS).first();
    await canvas.focus();

    const before = await canvasShot(page);
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect
      .poll(async () => (await canvasShot(page)) !== before, { timeout: 10_000, message: "ArrowRight did not pan the canvas" })
      .toBe(true);
  });

  test("focus reaches the canvas at all", async ({ page }) => {
    await goOffline(page);
    await openPaintedNarrative(page);
    await page.locator(CANVAS).first().focus();
    expect(await focusReport(page)).toMatchObject({ inCanvas: true });
  });
});

test.describe("Escape is a ladder on a live canvas too (V26/V25)", () => {
  test("rung two: Escape hands focus back out of the canvas, and not to nothing", async ({ page }) => {
    // THE rung that had no automated cover: it is reachable only when focus is genuinely inside the
    // OSD container, which needs a canvas that opened. Focus must land on the reader's own `main`,
    // never on <body> — blurring to nothing is how a keyboard reader loses their place.
    await goOffline(page);
    await openPaintedNarrative(page);
    await page.locator(CANVAS).first().focus();
    expect(await focusReport(page)).toMatchObject({ inCanvas: true });

    await page.keyboard.press("Escape");

    await expect.poll(() => focusReport(page), { timeout: 10_000 }).toMatchObject({ tag: "main", inCanvas: false });
  });

  test("the whole ladder walks out one rung at a time", async ({ page, baseURL }) => {
    // The point of a ladder is that each press is the SMALLEST step that changes something, so a
    // reader holding Escape walks out rather than teleporting. Asserting the rungs individually would
    // not catch a collapse — a binding that jumped straight from an open note to the index passes
    // every single-rung test. Walking it in one go is what pins the order.
    const note = await aRegionNote(baseURL!);
    await goOffline(page);
    await openPaintedNote(page, note.ulid);
    await expect(page.locator(".note-pop")).toBeVisible();
    await page.locator(CANVAS).first().focus();

    // Rung 1 — close the note. It must NOT also leave the object.
    await page.keyboard.press("Escape");
    await expect(page.locator(".note-pop")).toHaveCount(0);
    await expect(page.locator(".narrative")).toHaveCount(1);
    expect(await focusReport(page)).toMatchObject({ inCanvas: true });

    // Rung 2 — leave the canvas, land on main.
    await page.keyboard.press("Escape");
    await expect.poll(() => focusReport(page), { timeout: 10_000 }).toMatchObject({ tag: "main", inCanvas: false });
    await expect(page.locator(".narrative")).toHaveCount(1); // still reading — it did not skip a rung

    // Rung 3 — up a level. For a narrative that is its object index, not an exhibit overview.
    await page.keyboard.press("Escape");
    await expect(page.locator("button.object").first()).toBeVisible();
    await expect(page.locator(".narrative")).toHaveCount(0);

    // Rung 4 — the top. The index has its own visible way back ("Back to the reading"); Escape must
    // not fall through it into the gallery, which would throw away the reader's place entirely.
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    await expect(page.locator("button.object").first()).toBeVisible();
    await expect(page.locator("button.to-read")).toHaveCount(1);
  });
});
