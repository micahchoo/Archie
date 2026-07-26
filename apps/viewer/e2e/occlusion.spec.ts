import { test, expect, type Page, type Locator } from "@playwright/test";
import { HALO, goOffline, openPaintedNote, screenshotNotes } from "./offline.js";

// Archie-40fe (V22/V71/V87) — floating chrome must not sit on the thing it is meant to help you read.
//
// GEOMETRIC assertions, on purpose. The ticket asks for bounding-box non-intersection rather than
// screenshot diffs, because these are layout facts: a restyle that moves the pill 4px is not a
// regression, a restyle that puts it back on top of the filmstrip is. Overlap survives as the thing
// being measured no matter how the surfaces are painted.
//
// V48 (chrome over the CANVAS) IS here now, at the bottom. This header used to say it could not be:
// "asserting it end-to-end needs a painted canvas — which this offline suite cannot produce". The
// `screenshots` exhibit produces one (canvas-offline.spec.ts), so the end-to-end half of the
// left-flank reservation is measurable with the network cut.
//
// Measuring it found a GAP IN THE FIX, not just a missing test: the reservation is horizontal-only,
// so a region tall enough to make the fit height-constrained is still clipped by the note card. Two
// of the exhibit's 67 halo notes are in that state on the unmodified build. It is asserted as what it
// is — see the V48 describe — and is being filed separately; do not fix V48 here.

type Rect = { x: number; y: number; width: number; height: number };

const rectOf = async (l: Locator): Promise<Rect | null> => ((await l.count()) ? await l.first().boundingBox() : null);

/**
 * A rect read only once it has stopped moving. `fitBounds` ANIMATES, so a box sampled the instant a
 * note opens is mid-flight — over a 67-note sweep that is a reliable source of phantom overlaps. Two
 * identical consecutive reads is the settle condition; a fixed sleep would be both slower and less
 * certain.
 */
async function settled(page: Page, selector: string): Promise<Rect | null> {
  let prev: string | null = null;
  for (let i = 0; i < 12; i++) {
    const box = await rectOf(page.locator(selector));
    const now = JSON.stringify(box);
    if (now === prev) return box;
    prev = now;
    await page.waitForTimeout(120);
  }
  return rectOf(page.locator(selector));
}

/** Do two rects share any area at all? Touching edges is fine; overlap is not. */
const overlaps = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

const describeOverlap = (name: string, a: Rect, b: Rect): string =>
  `${name}: [${Math.round(a.x)},${Math.round(a.y)} ${Math.round(a.width)}x${Math.round(a.height)}] ` +
  `vs [${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.width)}x${Math.round(b.height)}]`;

async function openObjectWithNote(page: Page) {
  await goOffline(page);
  await page.goto("./#/voynich");
  await page.locator("button.object").first().click();
  await expect(page.locator("button.frame").first()).toBeVisible();
}

test.describe("the finder pill clears the filmstrip (V22)", () => {
  test("the pill does not overlap any filmstrip frame", async ({ page }) => {
    // Measured before the fix: pill (1102,748)–(1260,780) against frames running y 706–800 — TWO of
    // twelve covered, including the exhibit's only audio object, i.e. the one thing a reader is most
    // likely hunting for. The strip does not scroll at 12 items, so those frames could not be moved
    // out from under it.
    await openObjectWithNote(page);
    const pill = await rectOf(page.locator("button.finder-trigger"));
    test.skip(pill === null, "no finder pill on this surface");

    const frames = page.locator("button.frame");
    const n = await frames.count();
    expect(n).toBeGreaterThan(1);
    for (let i = 0; i < n; i++) {
      const f = await frames.nth(i).boundingBox();
      if (!f) continue;
      expect(overlaps(pill!, f), describeOverlap(`pill over frame ${i}`, pill!, f)).toBe(false);
    }
  });

  test("the pill still clears the strip after it is collapsed", async ({ page }) => {
    // `--strip-h` is measured live precisely because the band's height is content-driven: collapsing
    // it leaves only the handle. A static token would be right in one state and wrong in the other,
    // which is how the pill ended up inside the band in the first place.
    await openObjectWithNote(page);
    const handle = page.locator(".filmstrip .handle");
    test.skip(await handle.count() === 0, "no filmstrip handle");
    await handle.click();
    await page.waitForTimeout(400); // the band animates its collapse

    const pill = await rectOf(page.locator("button.finder-trigger"));
    const band = await rectOf(page.locator(".filmstrip"));
    if (!pill || !band) return;
    expect(overlaps(pill, band), describeOverlap("pill over collapsed band", pill, band)).toBe(false);
  });
});

test.describe("an open note clears the filmstrip (V71)", () => {
  test("the note card does not overlap any filmstrip frame", async ({ page }) => {
    // Measured before the fix: the card overlapped the band by 74px and covered SIX of twelve frames.
    // Winning the z-fight (Archie-b42d) was correct and was never the whole answer — opening a note
    // silently removed half the survey affordance the reader was using a moment earlier.
    await openObjectWithNote(page);
    await page.locator("aside li button").first().click();
    await expect(page.locator(".note-pop")).toBeVisible();

    const card = await rectOf(page.locator(".note-pop"));
    const frames = page.locator("button.frame");
    const n = await frames.count();
    for (let i = 0; i < n; i++) {
      const f = await frames.nth(i).boundingBox();
      if (!f || !card) continue;
      expect(overlaps(card, f), describeOverlap(`note card over frame ${i}`, card, f)).toBe(false);
    }
  });

  test("the note card and the finder pill do not overlap each other either", async ({ page }) => {
    // Both were lifted by the same token; lifting two surfaces onto the same row is the obvious way
    // to trade one occlusion for another.
    await openObjectWithNote(page);
    await page.locator("aside li button").first().click();
    await expect(page.locator(".note-pop")).toBeVisible();
    const card = await rectOf(page.locator(".note-pop"));
    const pill = await rectOf(page.locator("button.finder-trigger"));
    if (!card || !pill) return;
    expect(overlaps(card, pill), describeOverlap("note card over pill", card, pill)).toBe(false);
  });
});

// V49 (the AV temporal map, covered by the item strip) is fixed by the same `--strip-h` reservation
// and is STILL NOT asserted here. The timeline renders only under
// `cues.length > 0 && !mediaError && dur > 0`, and `dur` comes from media metadata — offline, the
// seed's sounded folio (archive.org) never loads, so the element does not exist to measure.
//
// The canvas assertions escaped this limit by moving to `screenshots`; V49 CANNOT follow them, and the
// reason is specific rather than structural: every one of the 21 published `screenshots` bodies is
// `type: "Image"` (measured against `public/published/screenshots/manifest.json`). There is no
// locally-sourced AUDIO or VIDEO object anywhere in the seed, so there is nothing hermetic to give a
// duration to. Closing this needs a small local media asset in a seed exhibit — a change to the seed
// and the publish fixtures, not to this suite. Until then it is a named gap, verified by an online
// drive on 2026-07-25.

test.describe("the fitted region clears the chrome that floats over the canvas (V48)", () => {
  test("the selected region is not under the legend or the note card", async ({ page, baseURL }) => {
    // `getFitOptions` is @render/mount's reservation seam, and THE VIEWER NEVER PASSED IT: every fit
    // ran on PLAIN_FIT, so `fitBounds` centred the region in the whole container while the legend and
    // the note card sat on top of the left flank. Measured with a note open at 9.3x: the two stacked
    // into a contiguous 502px column, ~22% of a 924x800 canvas, down its entire left edge — including
    // the side the fitted region's own boundary lies on. The reader asks to look closely; the app
    // zooms, then covers a fifth of the answer.
    //
    // The unit half lives in `fitBoundsRect`. This is the end-to-end half, and it is the one that
    // catches the seam never being WIRED — which is what actually shipped, with the unit tests green.
    // The halo is the region's own drawn boundary, so measuring it measures where the fit landed.
    //
    // SWEEP EVERY HALO NOTE — the width is not a choice. A first draft swept one note, and a second
    // swept ten; both numbers were picked by watching the result, which is how a sweep gets tuned to
    // stay green. There are 67 halo-drawing notes and this opens all of them, so there is no width
    // left to tune. (~35s. That is the price of the repo's only end-to-end gate on this fix.)
    //
    // Measured with the reservation forced off, this goes red on the 2nd note. Measured with it ON,
    // it goes red on nothing EXCEPT the height-constrained case below — which is a real gap, not a
    // tuning artefact, and is named rather than sliced out of the sweep.
    // This test's cost is deliberate and scales with the fixture: it opens EVERY halo note, and the
    // sweep width is explicitly not a tuning knob (see above). So its budget has to scale with the
    // sweep rather than the sweep being cut to fit the budget. ~29s locally; the suite default is
    // 60_000, which CI overran on 2026-07-26 — it failed partway through with "the deep-zoom canvas
    // never painted", which reads like a WebGL problem and was really the clock running out mid-sweep
    // (99 other tests passed, including canvas-dependent ones in selection.spec.ts). If this ever
    // fails again on paint, check the elapsed time BEFORE suspecting the canvas.
    test.setTimeout(240_000);

    const notes = (await screenshotNotes(baseURL!)).filter((n) => n.halo);
    expect(notes.length, "not enough halo notes to sweep").toBeGreaterThan(20);
    await goOffline(page);

    const offenders: string[] = [];
    for (const note of notes) {
      await openPaintedNote(page, note.ulid);
      const halo = await settled(page, HALO);
      expect(halo, `no halo for ${note.ulid} — the classifier promised one`).not.toBeNull();
      const canvas = await rectOf(page.locator(".openseadragon-canvas"));

      for (const sel of ["aside.legend", ".note-pop"]) {
        const chrome = await rectOf(page.locator(sel));
        if (!chrome || !overlaps(halo!, chrome)) continue;

        // THE KNOWN GAP (V48 is horizontal-only). `fitBoundsRect` returns
        // `{ x: box.x - w * l, y: box.y, w, h: box.h }` — it widens the rect and slides it left, and
        // NEVER touches y or h. When a region is tall enough that the fit is HEIGHT-constrained,
        // widening changes no zoom and the slide is the only effect, so nothing can lift the region
        // clear of a card anchored to the bottom-left. Measured on this tree: exactly two notes, both
        // ~1:4 aspect, fitted to 626px of a 720px canvas, clipped by `.note-pop` (never the legend,
        // which is top-left and which the horizontal slide does clear).
        //
        // So the assertion says what actually holds rather than what we wish did: the reservation
        // clears the chrome for every region EXCEPT one that fills the canvas height. An offender
        // that is NOT height-constrained is a genuine regression and fails here.
        const fillsHeight = canvas !== null && halo!.height >= canvas.height * 0.8;
        expect(
          fillsHeight,
          `${describeOverlap(`${sel} over fitted region (${note.ulid})`, chrome, halo!)} — and this ` +
            `region does NOT fill the canvas height, so the horizontal-only reservation should have ` +
            `cleared it. That is a regression, not the known gap.`,
        ).toBe(true);
        offenders.push(`${note.ulid}(${sel})`);
      }
    }

    // RATCHET, so the named gap cannot quietly widen. Two today. If V48 grows a vertical reservation
    // this drops to zero and still passes — a fix must never be punished by its own regression test —
    // but a third offender appearing is a failure that names itself.
    expect(offenders.length, `height-constrained occlusions: ${offenders.join(", ")}`).toBeLessThanOrEqual(2);
  });
});

test.describe("the narrative spine can be read to its end (V87)", () => {
  test("the last spine card can be scrolled clear of the finder pill", async ({ page }) => {
    // The pill lives at the viewport's bottom-right, INSIDE the spine's x range (spine 860–1280, pill
    // 1102–1260), so it sat on whatever the reader had scrolled to — measured cutting section 1's
    // cite card mid-word. Note this got WORSE when the pill was lifted clear of the filmstrip for
    // V22: raising it moves it further up this column. The spine reserves the pill's whole footprint.
    await goOffline(page);
    await page.goto("./#/voynich-reading");
    const aside = page.locator(".narrative > aside:not(.legend)"); // the spine; .legend is the other aside
    await expect(aside).toBeVisible();

    // The whole `<li>`, NOT its `.num` title. What the pill was measured cutting is the section's
    // CONTENT — its prose and its embedded cite card ("→ open obj|") — which extends well below the
    // title. An assertion on `.num` alone passes against the unfixed padding, because the title of
    // the last section sits above the pill anyway. Checked: it did.
    const items = aside.locator("ol.sections > li");
    const n = await items.count();
    expect(n).toBeGreaterThan(1);

    await aside.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
    await page.waitForTimeout(300);

    const last = await items.nth(n - 1).boundingBox();
    const pill = await rectOf(page.locator("button.finder-trigger"));
    if (!last || !pill) return;
    expect(overlaps(last, pill), describeOverlap("pill over last spine item", last, pill)).toBe(false);
  });
});
