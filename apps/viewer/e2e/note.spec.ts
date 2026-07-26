import { test, expect } from "@playwright/test";
import { goOffline } from "./offline.js";

// Archie-c831 (V61/V62/V63) — the note journey: opening a note, dismissing it, expanding it.
//
// Every assertion here was driven by hand when the fixes were written and then thrown away. That is
// the gap this file closes: three focus-management fixes shipped with nothing standing behind them,
// and focus management is invisible to svelte-check, to `tsc`, and to jsdom.
//
// Offline, like the rest of the suite. The SIDEBAR note path works with the network cut — the note
// list is rendered from the local manifest — which is what makes this journey testable at all. The
// canvas/marker path is not (see selection.spec.ts's header for why).

/** The active element, described well enough to tell two controls apart. */
const active = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const a = document.activeElement;
    if (!a) return null;
    return {
      tag: a.tagName.toLowerCase(),
      cls: a.className || "",
      label: a.getAttribute("aria-label") || "",
      text: (a.textContent || "").trim().slice(0, 40),
    };
  });

async function openFirstNote(page: import("@playwright/test").Page) {
  await goOffline(page);
  await page.goto("./#/voynich");
  await page.locator("button.object").first().click();
  const note = page.locator("aside li button").first();
  await expect(note).toBeVisible();
  await note.click();
  await expect(page.locator(".note-pop")).toBeVisible();
  return note;
}

test.describe("opening a note (V61)", () => {
  test("the card that appears has a name and a role", async ({ page }) => {
    // The card used to be a bare <div>: no role, no label, no live region. A screen-reader user got
    // no announcement and nothing within reach — the note simply existed, silently, later in the
    // document. A named region is the minimum that makes it findable.
    await openFirstNote(page);
    const pop = page.locator(".note-pop");
    await expect(pop).toHaveAttribute("role", "region");
    await expect(pop).toHaveAttribute("aria-label", /note/i);
  });

  test("the card is focusable as a whole, not only through its buttons", async ({ page }) => {
    // tabindex="-1" is what lets focus be MOVED here programmatically without adding a tab stop.
    await openFirstNote(page);
    await expect(page.locator(".note-pop")).toHaveAttribute("tabindex", "-1");
  });

  test("it is NOT a modal — the canvas beside it stays usable", async ({ page }) => {
    // Deliberate, and worth pinning: the card floats beside a live canvas. Declaring aria-modal
    // here would tell assistive tech the rest of the page is hidden while it demonstrably isn't —
    // which is the exact defect V63 found on the reading sheet, and must not be "fixed" into here.
    await openFirstNote(page);
    expect(await page.locator(".note-pop").getAttribute("aria-modal")).toBeNull();
  });
});

test.describe("dismissing a note (V62)", () => {
  test("Escape closes it and returns focus to the note that opened it", async ({ page }) => {
    await openFirstNote(page);
    await page.keyboard.press("Escape");
    await expect(page.locator(".note-pop")).toHaveCount(0);
    const a = await active(page);
    expect(a?.tag).toBe("button");
    expect(a?.cls).not.toContain("np-icon"); // back on the trigger, not left on a dead control
  });

  test("the card's own × does the same thing", async ({ page }) => {
    // The whole finding: Escape already did the right thing and the button never learned it. A
    // keyboard reader reaches × in two presses and was being dropped on <body> — losing their place
    // in a twelve-object exhibit. Both dismissals must land in the same spot.
    //
    // Asserted by ELEMENT IDENTITY, not by a text snapshot (changed 2026-07-25, Archie-dbbc). The
    // snapshot form read the trigger's text WHILE the note was open and compared it after close —
    // which silently assumed the list entry looks the same in both states. It no longer does: an
    // entry whose note is open marks position ("Note 1 of 7 · Open") instead of restating the note
    // (V60), so the text changes back on close and the old assertion failed against correct
    // behaviour. Worse than fragile, it was INVERTED: it could pass only if the open-mark STUCK.
    //
    // Compared by true NODE IDENTITY, via an elementHandle taken BEFORE the click. A `Locator`
    // re-resolves after the action, so `trigger.evaluate(el => el === document.activeElement)` would
    // assert only "whatever is first in the list NOW has focus" — a future change that reordered the
    // list on close and restored focus by index would pass it. The handle is the node actually clicked.
    const trigger = await openFirstNote(page);
    const handle = await trigger.elementHandle();
    expect(handle).not.toBeNull();
    await page.locator(".note-pop button.close").click();
    await expect(page.locator(".note-pop")).toHaveCount(0);

    const a = await active(page);
    expect(a?.tag).toBe("button");
    expect(await handle!.evaluate((el) => el === document.activeElement)).toBe(true); // the trigger itself, not <body>
  });

  test("dismissing also clears the canvas's selection, not just the card", async ({ page }) => {
    // anvil ADR-0007 F5: "on close, the WC must call `anno.cancelSelected()` to clear the canvas's
    // selected state." A close that only unmounts the card leaves the canvas believing a region is
    // still selected. Archie's equivalent is that × routes through the same `selected = null` the
    // list drives, which the sidebar entry's `aria-current` reflects.
    const trigger = await openFirstNote(page);
    await expect(trigger).toHaveAttribute("aria-current", "true");
    await page.locator(".note-pop button.close").click();
    await expect(page.locator(".note-pop")).toHaveCount(0);
    await expect(page.locator("aside li button[aria-current]")).toHaveCount(0);
  });
});

test.describe("expanding a note into the reading sheet (V63)", () => {
  async function openSheet(page: import("@playwright/test").Page) {
    await openFirstNote(page);
    const expand = page.locator(".note-pop button.expand");
    test.skip(await expand.count() === 0, "this note has no expandable text");
    await expand.click();
    await expect(page.locator(".sheet")).toBeVisible();
  }

  test("focus moves INTO the sheet on open", async ({ page }) => {
    // `aria-modal="true"` was declared while focus stayed on the ⤢ button behind the scrim. That is
    // worse than declaring nothing: the AT is told everything outside is hidden, and the keyboard
    // is still out there.
    await openSheet(page);
    expect(await page.locator(".sheet").evaluate((el) => el.contains(document.activeElement))).toBe(true);
  });

  test("Tab is trapped inside it", async ({ page }) => {
    // Measured before the fix: ⤢ → × → sheet-close → the finder pill → BODY. Two presses and the
    // keyboard was loose in the page behind the scrim.
    await openSheet(page);
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("Tab");
      expect(await page.locator(".sheet").evaluate((el) => el.contains(document.activeElement))).toBe(true);
    }
  });

  test("Escape closes it and returns focus to the ⤢ that opened it", async ({ page }) => {
    await openSheet(page);
    await page.keyboard.press("Escape");
    await expect(page.locator(".sheet")).toHaveCount(0);
    const a = await active(page);
    expect(a?.cls).toContain("expand"); // the trigger, not <body>
  });

  test("it really is a dialog, and says so", async ({ page }) => {
    await openSheet(page);
    const sheet = page.locator(".sheet");
    await expect(sheet).toHaveAttribute("role", "dialog");
    await expect(sheet).toHaveAttribute("aria-modal", "true");
    await expect(sheet).toHaveAttribute("aria-label", /.+/);
  });
});
