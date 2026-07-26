import { test, expect, type Page } from "@playwright/test";
import { goOffline } from "./offline.js";

// Archie-dbbc (V60/V64) — one note surface.
//
// V60 counted the note on screen: TWICE on select, THREE times on expand. V64 measured the third copy
// carrying LESS than the first — the reading sheet was labelled the bare literal "Note" while the card
// it expanded from said "Note — Herbal, f1r", so asking to see more of a note lost the answer to which
// note it was. The fix is structural (`ReadingSheet` renders `NotePopup size="sheet"`, so there is one
// content renderer), and these assertions are the things that would still be true if someone rebuilt a
// second one: a COUNT of visible copies, and an EQUALITY between the two identity strings.
//
// The equality is the load-bearing shape. Asserting "the sheet has a non-empty aria-label" passes
// against the exact defect V64 recorded — "Note" is non-empty. Only comparing it to the card's own
// name catches it.
//
// Offline, like the rest of the suite: the sidebar note path renders from the local manifest.

async function openFirstNote(page: Page) {
  await goOffline(page);
  await page.goto("./#/voynich");
  await page.locator("button.object").first().click();
  const note = page.locator("aside li button").first();
  await expect(note).toBeVisible();
  await note.click();
  await expect(page.locator(".note-pop")).toBeVisible();
  return note;
}

async function openSheet(page: Page) {
  const expand = page.locator(".note-pop button.expand");
  test.skip((await expand.count()) === 0, "this note has no expandable text");
  await expand.click();
  await expect(page.locator(".sheet")).toBeVisible();
}

test.describe("only ONE note-content element is on screen at a time (V60)", () => {
  test("with the sheet open, exactly one element renders the note's body", async ({ page }) => {
    // Measured before the fix: `.note-pop` stayed in the DOM and legible behind the scrim — V60's
    // third copy. The card is hidden rather than unmounted (its ⤢ is the trigger `use:dialog` returns
    // focus to), so the assertion is on what is VISIBLE, which is what a reader can actually read.
    await openFirstNote(page);
    await expect(page.locator(".note-body:visible")).toHaveCount(1);
    await openSheet(page);
    await expect(page.locator(".note-body:visible")).toHaveCount(1);
    await expect(page.locator(".note-pop")).toBeHidden();
  });

  test("closing the sheet brings the card back — hidden is not gone", async ({ page }) => {
    await openFirstNote(page);
    await openSheet(page);
    await page.locator(".sheet-close").click();
    await expect(page.locator(".sheet")).toHaveCount(0);
    await expect(page.locator(".note-pop")).toBeVisible();
    await expect(page.locator(".note-body:visible")).toHaveCount(1);
  });

  test("the sidebar entry marks position instead of restating the note", async ({ page }) => {
    // V60's other copy: the selected list card and the floating card showed the same sentence in two
    // type treatments ~900px apart. The list is the INDEX — it keeps reading colour, tags and position
    // and drops the prose that is, right now, fully legible on screen.
    const trigger = await openFirstNote(page);
    const preview = await page.locator("aside li button").first().locator(".card-preview").count();
    expect(preview).toBe(0);
    await expect(trigger).toHaveAttribute("aria-current", "true");
    // Case-insensitive: the mark is set in the index's chrome voice, so `text-transform: uppercase`
    // is what a reader actually sees. The wording is pinned exactly in `product-copy.test.ts`.
    expect((await trigger.innerText()).trim()).toMatch(/^note \d+ of \d+ · open$/i);

    // Unselected siblings still preview — the index has not stopped being an index.
    const others = page.locator("aside li button:not([aria-current])");
    expect(await others.count()).toBeGreaterThan(0);
    expect(await others.first().locator(".card-preview").count()).toBe(1);

    // …and the preview COMES BACK when the note closes. Asserted directly rather than inferred from
    // `aria-current` clearing (note.spec.ts): both are driven by the same selected-ness, so that one
    // is a proxy. A de-emphasis that never reverted would quietly erode the list one note at a time.
    await page.locator(".note-pop button.close").click();
    await expect(page.locator(".note-pop")).toHaveCount(0);
    await expect(trigger.locator(".card-preview")).toHaveCount(1);
    await expect(trigger.locator(".card-open")).toHaveCount(0);
  });
});

test.describe("one modal at a time — the sheet never stacks (Archie-dbbc review)", () => {
  /** Every element currently claiming `aria-modal="true"`, named by a stable class. */
  const openModals = (page: Page) =>
    page.evaluate(() =>
      [...document.querySelectorAll('[aria-modal="true"]')].map(
        (e) => (e.className || "").toString().split(/\s+/)[0] || e.tagName.toLowerCase(),
      ),
    );

  test("a tag chip inside the sheet REPLACES it with the finder", async ({ page }) => {
    // Introduced by this branch and caught in review. Giving the sheet the card's whole prop set
    // closed a real gap (tags/media/geo used to vanish on expand) and opened this: the sheet is
    // `aria-modal="true"`, and so is the finder it can now reach. Two of them at once is a false
    // statement to assistive tech in both directions — each says everything outside it is hidden and
    // one is demonstrably wrong — and it strands a mouse reader behind two escapes.
    await goOffline(page);
    await page.goto("./#/voynich");
    await page.locator("button.object").first().click();
    const reading = page.locator('.legend .opt[role="radio"]').nth(1); // tags ride on reading-scoped notes
    await expect(reading).toBeVisible();
    await reading.click();

    const notes = page.locator("aside li");
    const n = await notes.count();
    let found = false;
    for (let i = 0; i < n; i++) {
      await notes.nth(i).locator("button").first().click();
      await expect(page.locator(".note-pop")).toBeVisible();
      if ((await page.locator(".note-pop .tags .tag").count()) === 0) continue;
      const expand = page.locator(".note-pop button.expand");
      if ((await expand.count()) === 0) continue;
      found = true;
      await expand.click();
      await expect(page.locator(".sheet")).toBeVisible();
      expect(await openModals(page)).toEqual(["sheet"]);

      await page.locator(".sheet .tags .tag").first().click();
      // Wait for BOTH transitions to settle before snapshotting: `openModals` is a one-shot evaluate
      // with no auto-wait, so asserting on it while the finder is still mounting reads `[]` and the
      // test would claim a pass the app has not earned yet (it read `[]` exactly once, in the run
      // that caught this).
      await expect(page.locator(".sheet")).toHaveCount(0);
      await expect(page.locator(".finder")).toBeVisible();
      // Exactly one modal, and it is the finder — not ["sheet","finder"].
      expect(await openModals(page)).toEqual(["finder"]);
      break;
    }
    expect(found, "no expandable tagged note — the fixture no longer exercises this").toBe(true);
  });

  test("never two `aria-modal` elements, on any route out of the sheet", async ({ page }) => {
    // The media tile is the second route: NoteLightbox is `aria-modal="true"` as well. Asserted as an
    // invariant over the whole document rather than per-pair, so a THIRD modal surface reachable from
    // the note lands on this test instead of on a reader.
    //
    // THE ESCAPE ROUTE ONLY. This test drives `#/voynich`, which carries no media-bearing note, so the
    // media tile named above is covered by the two tests BELOW instead — that gap is what `Archie-0cc6`
    // was filed for, and the name of this test was the whole problem: it claimed a route its body never
    // took, and reverting the `onmedia` guard left the file at 18/18 passing.
    await openFirstNote(page);
    await openSheet(page);
    expect(await openModals(page)).toEqual(["sheet"]);
    await page.keyboard.press("Escape");
    await expect(page.locator(".sheet")).toHaveCount(0);
    expect(await openModals(page)).toEqual([]);
  });

  // ── the media route, in BOTH readers (Archie-0cc6) ──────────────────────────────────────────────
  //
  // THE TICKET'S PREMISE WAS WRONG, AND CHECKING IT IS WHY THERE IS NO NEW FIXTURE HERE. `Archie-0cc6`
  // states that "no note in the fixture is both expandable and media-bearing, because a note needs
  // `text` to show the ⤢", and asks for a fixture to be added. Driven — every object, every note, both
  // readers, offline, on the built bundle — the sampler exhibit already has TWO, and each shows a tile
  // inside the open sheet:
  //   · `sampler` object 2 (`si1`), note 0 — `samplerMediaNotes[0]`, a whole-object note. Original
  //     sampler content; it predates the ticket.
  //   · `sampler` object 1 (`sa1`), note 4 — the `t=240,270` cue added by V53's AV slice.
  // The voynich sweep found none, which is consistent with the ticket's measurement and is almost
  // certainly the exhibit it was taken on. So the fixture was never thin; the coverage was. Adding a
  // third media note to satisfy the letter of the ticket would be fixture bloat with no path behind
  // it — the opposite of what this slice is for.
  //
  // Two tests rather than one, because the guard is implemented TWICE (`Reader.svelte` and the AV
  // reader), and one passing says nothing about the other.

  /** Walk an object's notes to the first that is both expandable and media-bearing, and open its sheet. */
  async function openSheetOnAMediaNote(page: Page, objectHasText: string): Promise<void> {
    await goOffline(page);
    await page.goto("./#/sampler");
    // `reload()` because a `goto` to the hash the page is already on is a no-op — no navigation, no
    // `hashchange`, no re-mount (the trap `av-surface.spec.ts:104-107` records).
    await page.reload();
    const object = page.locator("button.object", { hasText: objectHasText });
    await expect(object).toHaveCount(1);
    await object.click();

    const notes = page.locator("aside li button, .cues li button");
    await expect(notes.first()).toBeVisible();
    const n = await notes.count();
    for (let i = 0; i < n; i++) {
      await notes.nth(i).click();
      const pop = page.locator(".note-pop");
      await expect(pop).toBeVisible();
      if ((await pop.locator("button.tile").count()) === 0) continue;
      const expand = pop.locator("button.expand");
      if ((await expand.count()) === 0) continue;
      await expand.click();
      await expect(page.locator(".sheet")).toBeVisible();
      await expect(page.locator(".sheet button.tile")).toHaveCount(1);
      return;
    }
    // NOT `test.skip`. A seed that stops carrying a note with both text and media has removed this
    // gate's subject, and that is a failure to fix rather than a green run with a quiet skip in it —
    // the idiom the tags test at the bottom of this file already sets.
    throw new Error(`no expandable media-bearing note on "${objectHasText}" — the fixture no longer exercises the media route`);
  }

  /** Open the tile inside the sheet and assert the lightbox REPLACED the sheet rather than stacking. */
  async function assertLightboxReplacesSheet(page: Page): Promise<void> {
    await page.locator(".sheet button.tile").click();
    // Wait for BOTH transitions before snapshotting: `openModals` is a one-shot `evaluate` with no
    // auto-wait, so reading it mid-transition yields a passing answer the app has not earned. The tag
    // test above records this reading `[]` exactly once, in the run that caught it.
    await expect(page.locator(".sheet")).toHaveCount(0);
    await expect(page.locator("div.lb[role='dialog']")).toBeVisible();
    expect(await openModals(page)).toEqual(["lb"]);
  }

  test("a media tile inside the sheet REPLACES it with the lightbox — the image reader", async ({ page }) => {
    // `si1`'s whole-object note: prose plus a markdown image, so `splitNoteMedia` leaves text behind
    // (which is what makes the ⤢ appear at all) and lifts the picture into a `NoteMedia` tile. The
    // remote image is blocked by `goOffline` and that is fine — the tile is a `<button>` that renders
    // and stays clickable either way, so the affordance is what is under test, not Yale's uptime.
    await openSheetOnAMediaNote(page, "carries a picture");
    expect(await openModals(page)).toEqual(["sheet"]);
    await assertLightboxReplacesSheet(page);
  });

  test("a media tile inside the sheet REPLACES it with the lightbox — the AV reader", async ({ page }) => {
    // The same guard in the other implementation, reached through a TIME-RANGED note's card. Both
    // readers clear `readingSheet` on `onmedia`; reverting either one alone leaves the other's test
    // green, which is why this is not parameterised away into one run.
    await openSheetOnAMediaNote(page, "listen with a transcript");
    expect(await openModals(page)).toEqual(["sheet"]);
    await assertLightboxReplacesSheet(page);
  });
});

test.describe("the sheet is the card at a larger size (V64)", () => {
  test("the sheet's accessible name EQUALS the card's, not merely non-empty", async ({ page }) => {
    await openFirstNote(page);
    const cardName = await page.locator(".note-pop").getAttribute("aria-label");
    expect(cardName).toMatch(/^Note — .+/); // the card really is carrying an identity to lose
    await openSheet(page);
    expect(await page.locator(".sheet").getAttribute("aria-label")).toBe(cardName);
  });

  test("the sheet SHOWS the same identity line the card showed", async ({ page }) => {
    // The aria name and the visible eyebrow are the same value through the same component, so a reader
    // who cannot hear the label still sees what they are reading. Read via textContent: the card is
    // display:none by then, and innerText of a hidden element is "".
    await openFirstNote(page);
    const cardEyebrow = await page.locator(".note-pop .np-eyebrow").evaluate((e) => e.textContent?.trim() ?? "");
    expect(cardEyebrow.length).toBeGreaterThan(0);
    await openSheet(page);
    const sheetEyebrow = await page.locator(".sheet .np-eyebrow").evaluate((e) => e.textContent?.trim() ?? "");
    expect(sheetEyebrow).toBe(cardEyebrow);
  });

  test("expanding does not drop the note's tags", async ({ page }) => {
    // The old sheet rendered `text` alone, so a note's tags, media and geo readout silently vanished at
    // the moment the reader asked for MORE of it. One renderer means the sheet gains every field.
    //
    // A READING must be activated first: in the Voynich seed the tags ride on reading-scoped notes
    // (fixtures/voynich.ts — every entry with `tags:` also has `reading:`), so the default base-notes
    // list carries none and this test would skip itself into vacuity. Picking a reading from the
    // legend is what a reader does to see them, and it is the state the assertion is about.
    await goOffline(page);
    await page.goto("./#/voynich");
    await page.locator("button.object").first().click();
    const reading = page.locator('.legend .opt[role="radio"]').nth(1); // [0] is "General notes"
    await expect(reading).toBeVisible();
    await reading.click();

    const notes = page.locator("aside li");
    const n = await notes.count();
    let found = false;
    for (let i = 0; i < n; i++) {
      await notes.nth(i).locator("button").first().click();
      await expect(page.locator(".note-pop")).toBeVisible();
      const tags = await page.locator(".note-pop .tags .tag").allInnerTexts();
      if (tags.length === 0) continue;
      found = true;
      await openSheet(page);
      expect(await page.locator(".sheet .tags .tag").allInnerTexts()).toEqual(tags);
      break;
    }
    // NOT `test.skip`: a seed that stops carrying tagged notes has removed this gate's subject, and
    // that should be a failure to fix rather than a green run with a quiet skip in it.
    expect(found, "no note on this object carries tags — the fixture no longer exercises this").toBe(true);
  });
});
