import { test, expect, type Page, type Locator } from "@playwright/test";
import { HALO, goOffline, openPaintedNote, screenshotNotes } from "./offline.js";

// ADR-0019's LAYOUT ROW, shell side: persistent chrome docks OUT of the canvas and never sits on the
// image. GEOMETRIC assertions, on purpose — these are layout facts, and overlap survives as the thing
// being measured however the surfaces are painted. A restyle that moves a control 4px is not a
// regression; a restyle that puts it back on top of the image is.
//
// WHAT THIS FILE USED TO ASSERT, AND WHY NONE OF IT HAS A SUBJECT ANY MORE (rewritten 2026-07-26).
// Four suites measured Archie-40fe's reservation model — the finder pill clearing the filmstrip band
// (V22), an open note card clearing it (V71), the pill and the card clearing each other, and the
// narrative spine's last card scrolling clear of the pill (V87). Every one of those pairs is now a set
// of SIBLINGS in a flow row or column: the pill and the filmstrip are both children of ExhibitView's
// `.chrome-dock`, the note card is a row of the reader's stage, and the spine is a flex sibling of the
// whole stage. Siblings in normal flow cannot overlap, so those tests would assert a property of CSS
// rather than of this app. They are replaced, not dropped: the suites below assert the stronger
// statement the four were approximating — no chrome touches the canvas at all.
//
// The V48 sweep survives and gets STRICTER. It swept all 67 halo-drawing notes on `screenshots` and
// ratcheted a known gap at TWO offenders, because `fitBoundsRect`'s reservation could only slide a
// region horizontally and so could never lift a height-constrained one clear of a bottom-anchored
// card (Archie-c30a). The ratchet is gone and the count is zero — which is what c30a's own Verify
// section asked for ("drop the ratcheted count to zero and watch the sweep pass"). It is kept rather
// than deleted because it is still measuring something real and end-to-end: that a FITTED region
// lands inside the canvas box and stays there.

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

const areaOf = (a: Rect, b: Rect): number =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

const describeOverlap = (name: string, a: Rect, b: Rect): string =>
  `${name}: [${Math.round(a.x)},${Math.round(a.y)} ${Math.round(a.width)}x${Math.round(a.height)}] ` +
  `vs [${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.width)}x${Math.round(b.height)}]`;

/**
 * The NAMED SET of persistent docked chrome in the shell, mirroring `recipes/smoke.mjs`'s array for
 * the embed. Naming the set rather than sweeping "everything visible" is deliberate and is documented
 * in ADR-0019's layout row: the OSD locator mini-map is a real, named exception (it is OSD's own
 * navigator and a map OF the image), and a gate that quietly excluded it while claiming to cover
 * everything would be lying about its own scope. Adding a docked surface means adding it here.
 */
const DOCKED = [
  ".topbar",          // ViewerShell's bar — breadcrumb | carousel | open-another
  ".canvas-dock",     // the reader's own chrome row: legend, object/section nav, zoom readout
  "aside.legend",     // the reading legend, inside .canvas-dock
  ".note-dock",       // the open note's row, under the canvas
  ".chrome-dock",     // ExhibitView's bottom bar: cite · item strip · find
  ".filmstrip",       // inside .chrome-dock
  "button.finder-trigger",
  "button.cite-trigger",
];

/** Every docked element currently on screen, with its overlap against `canvas`. */
async function dockedBoxes(page: Page, canvas: Rect): Promise<Array<{ sel: string; box: Rect; overlap: number }>> {
  const out: Array<{ sel: string; box: Rect; overlap: number }> = [];
  for (const sel of DOCKED) {
    const box = await rectOf(page.locator(sel));
    // A zero box is not evidence of clearance — it is an element that is not rendered. Skipping it
    // (rather than counting it as clear) is what stops "everything is hidden" reading as a pass; the
    // non-emptiness assertion in each test is the other half of that guard.
    if (!box || box.width === 0 || box.height === 0) continue;
    out.push({ sel, box, overlap: Math.round(areaOf(box, canvas)) });
  }
  return out;
}

async function openObjectWithNote(page: Page) {
  await goOffline(page);
  await page.goto("./#/voynich");
  await page.locator("button.object").first().click();
  await expect(page.locator(".reader main")).toBeVisible();
}

test.describe("the grid reader's chrome docks out of the canvas (ADR-0019 layout row)", () => {
  test("no docked chrome overlaps the canvas, with a note open", async ({ page }) => {
    await openObjectWithNote(page);
    await page.locator("aside li button").first().click();
    await expect(page.locator(".note-pop")).toBeVisible();

    const canvas = await rectOf(page.locator(".reader main"));
    expect(canvas, "no canvas box to measure against").not.toBeNull();

    const boxes = await dockedBoxes(page, canvas!);
    // Non-empty, or "nothing overlaps" is the trivially-true reading of a reader that rendered no
    // chrome at all. The filmstrip, the dock and the note row are all expected here.
    expect(boxes.length, `docked chrome found: ${boxes.map((b) => b.sel).join(", ")}`).toBeGreaterThanOrEqual(3);

    for (const b of boxes) {
      expect(b.overlap, describeOverlap(`${b.sel} over the canvas`, b.box, canvas!)).toBe(0);
    }
  });

  test("the canvas centre hit-tests to the canvas, not to chrome", async ({ page }) => {
    // The geometric half above can be satisfied by an element that is elsewhere and STILL in the hit
    // path through a wrapper — that is exactly how V68 shipped (`.claude/rules/osd-overlay-wrapper.md`).
    // A driven hit test is the only thing that sees it; a synthetic click would pass either way.
    await openObjectWithNote(page);
    await page.locator("aside li button").first().click();
    await expect(page.locator(".note-pop")).toBeVisible();

    const canvas = await rectOf(page.locator(".reader main"));
    expect(canvas).not.toBeNull();
    const hit = await page.evaluate(
      ([cx, cy, sels]) => {
        const el = document.elementFromPoint(cx as number, cy as number);
        if (!el) return { tag: "null", chrome: false };
        return {
          tag: el.tagName.toLowerCase(),
          chrome: (sels as string[]).some((s) => el.closest(s) !== null),
        };
      },
      [Math.round(canvas!.x + canvas!.width / 2), Math.round(canvas!.y + canvas!.height / 2), DOCKED] as const,
    );
    expect(hit.chrome, `elementFromPoint at the canvas centre → <${hit.tag}>, which is inside docked chrome`).toBe(false);
  });
});

test.describe("the narrative reader's chrome docks out of the canvas (ADR-0019 layout row)", () => {
  test("no docked chrome overlaps the narrative's canvas", async ({ page }) => {
    // V87 lived here: the finder pill floated at the viewport's bottom-right, inside the spine's x
    // range, and sat on whatever the reader had scrolled to. The spine is a flex sibling of the whole
    // stage now and the pill is in the bottom bar, so this asserts the general property instead of
    // that one pair.
    await goOffline(page);
    await page.goto("./#/voynich-reading");
    await expect(page.locator(".narrative main")).toBeVisible();

    const canvas = await rectOf(page.locator(".narrative main"));
    expect(canvas).not.toBeNull();
    const boxes = await dockedBoxes(page, canvas!);
    expect(boxes.length, `docked chrome found: ${boxes.map((b) => b.sel).join(", ")}`).toBeGreaterThanOrEqual(2);
    for (const b of boxes) {
      expect(b.overlap, describeOverlap(`${b.sel} over the narrative canvas`, b.box, canvas!)).toBe(0);
    }
  });

  test("the spine can be read to its end without chrome on the last card", async ({ page }) => {
    // The surviving half of V87 that is still about THIS app rather than about CSS: the spine's last
    // section must be fully reachable by scrolling. It used to reserve the pill's whole footprint in
    // its own bottom padding (`--strip-h` + `--finder-h`); it reserves nothing now, so if the spine's
    // column were mis-sized against the docked bars the last card would be clipped by the viewport.
    await goOffline(page);
    await page.goto("./#/voynich-reading");
    const aside = page.locator(".narrative > aside:not(.legend)");
    await expect(aside).toBeVisible();

    const items = aside.locator("ol.sections > li");
    const n = await items.count();
    expect(n).toBeGreaterThan(1);

    await aside.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
    await page.waitForTimeout(300);

    const last = await items.nth(n - 1).boundingBox();
    const asideBox = await rectOf(aside);
    expect(last, "no last spine item").not.toBeNull();
    expect(asideBox).not.toBeNull();
    // The whole `<li>`, NOT its `.num` title — what the pill was measured cutting is the section's
    // CONTENT (its prose and its embedded cite card), which extends well below the title.
    expect(
      Math.round(last!.y + last!.height),
      `the last spine item ends at ${Math.round(last!.y + last!.height)} but the spine's own box ends at ` +
        `${Math.round(asideBox!.y + asideBox!.height)} — it cannot be scrolled fully into view`,
    ).toBeLessThanOrEqual(Math.round(asideBox!.y + asideBox!.height) + 1);
  });
});

test.describe("a fitted region lands inside the canvas and clear of the chrome (V48)", () => {
  test("every halo note fits inside the canvas box with nothing on it", async ({ page, baseURL }) => {
    // `getFitOptions` was @render/mount's reservation seam, and THE VIEWER NEVER PASSED IT: every fit
    // ran on PLAIN_FIT, so `fitBounds` centred the region in the whole container while the legend and
    // the note card sat on top of the left flank — measured with a note open at 9.3x, the two stacked
    // into a contiguous 502px column, ~22% of a 924x800 canvas, down its entire left edge. That seam is
    // now DELETED rather than wired: nothing overlays the canvas, so the plain fit is the correct fit.
    //
    // The sweep stays because it is the only end-to-end check that the fit lands where the reader can
    // see it, and its ratchet drops from TWO known offenders to ZERO. The two were both ~1:4 regions
    // fitted to 626px of a 720px canvas, clipped by the bottom-left note card: height-constrained, and
    // therefore unreachable by a reservation that could only slide a region sideways (Archie-c30a).
    // Docking removes the class, not the instances — so the assertion is now unconditional and there is
    // no "known gap" branch left to relax.
    //
    // SWEEP EVERY HALO NOTE — the width is not a choice. Earlier drafts swept one note, then ten; both
    // numbers were picked by watching the result, which is how a sweep gets tuned to stay green. There
    // are 67 halo-drawing notes and this opens all of them.
    test.setTimeout(240_000);

    const notes = (await screenshotNotes(baseURL!)).filter((n) => n.halo);
    expect(notes.length, "not enough halo notes to sweep").toBeGreaterThan(20);
    await goOffline(page);

    const offenders: string[] = [];
    // A timeout reports the symptom at whatever boundary it happened to trip, not the reason: when this
    // overran on 2026-07-26 it surfaced as "the deep-zoom canvas never painted", which is a true
    // statement about a false cause. This budget trips FIRST, and says how far the sweep actually got.
    const startedAt = Date.now();
    const SWEEP_BUDGET_MS = 200_000; // under the 240s test timeout, so this message wins the race
    for (const [i, note] of notes.entries()) {
      const elapsed = Date.now() - startedAt;
      expect(
        elapsed,
        `the sweep ran out of budget after ${i}/${notes.length} notes in ${Math.round(elapsed / 1000)}s. ` +
          `This is a CLOCK failure, not a canvas one — check the elapsed time before suspecting WebGL, ` +
          `and raise test.setTimeout above rather than narrowing the sweep.`,
      ).toBeLessThan(SWEEP_BUDGET_MS);
      await openPaintedNote(page, note.ulid);
      const halo = await settled(page, HALO);
      expect(halo, `no halo for ${note.ulid} — the classifier promised one`).not.toBeNull();

      for (const sel of ["aside.legend", ".note-pop", ".canvas-dock", ".chrome-dock"]) {
        const chrome = await rectOf(page.locator(sel));
        if (!chrome || chrome.width === 0) continue;
        if (!overlaps(halo!, chrome)) continue;
        offenders.push(describeOverlap(`${sel} over the fitted region (${note.ulid})`, chrome, halo!));
      }
    }

    // ZERO, unconditionally. The ratchet that used to sit here allowed two known height-constrained
    // occlusions because the reservation model structurally could not clear them. There is no
    // reservation and no gap; an offender here is a docked surface that has come loose.
    expect(offenders.length, `chrome on a fitted region: ${offenders.join(" | ")}`).toBe(0);
  });
});
