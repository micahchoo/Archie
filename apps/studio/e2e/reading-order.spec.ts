import { test, expect, type Page } from "@playwright/test";

// Archie-3b9f — "Set as reading order": turn the active sort INTO the exhibit's canonical order.
//
// Why this needs a driven browser and not svelte-check: the control is behind `{#if sortMode !== …}`
// and its handler writes through `onreorder`, and BOTH of those are invisible to every static gate.
// `[[svelte-no-typecheck-net]]` is the file on this exact class — a prop typed but not destructured
// rendered a dead Cancel button at 0 errors / 0 warnings. The claim here is "clicking it reorders the
// exhibit", and only a real click can make that claim.
//
// The plate NUMBER is the assertion surface: it renders the CANONICAL reading-order position (the
// component's `orderIndexOf`), deliberately unchanged by sorting. So "number 1 is now the
// alphabetically-first plate" is exactly the property under test, and it cannot be satisfied by the
// sort alone — a sorted view leaves the numbers scrambled, which is the pre-fix state.

const commit = (page: Page) => page.getByRole("button", { name: "Set as reading order" });
const undo = (page: Page) => page.getByRole("button", { name: "Undo reading order" });
const sort = (page: Page) => page.getByLabel("Sort media items");

async function openFirstExhibit(page: Page): Promise<void> {
  await page.goto("/studio/");
  // Anchor shape borrowed from navigation.spec.ts (`button.card`). Two lessons are baked in here:
  //
  // 1. The first version GUESSED the selector (`[data-testid=library-card], .library-card, article`)
  //    and all four tests timed out at 30s against perfectly good code — a broken locator is
  //    indistinguishable from a broken feature, the false-red half of [[a-green-run-is-one-sample]].
  // 2. Then it hard-coded "The Rosettes", the exhibit navigation.spec uses — which has exactly ONE
  //    object. Both ordering tests skipped themselves, the run reported "2 passed", and the feature
  //    was untested. [[playwright-count-does-not-wait]]: watch the SKIPPED count, a conditional skip
  //    that can be reached by accident is worse than a missing test.
  //
  // So: pick by the property the test actually needs — an exhibit with 2+ objects — rather than by
  // name. If NO exhibit qualifies that is a fixture failure and must be loud, not a silent skip.
  const cards = page.locator("button.card");
  const n = await cards.count();
  for (let i = 0; i < n; i++) {
    await cards.nth(i).click();
    await expect(sort(page)).toBeVisible();
    if ((await page.locator("button.plate[data-plate-id]").count()) >= 2) return;
    await page.goBack();
    await expect(cards.first()).toBeVisible();
  }
  throw new Error(`no seeded exhibit has 2+ objects (checked ${n} cards) — this suite cannot test ordering`);
}

/** The visible plate labels, in the order the overview is showing them. The plate button carries its
 *  label as `title` (there is no separate label node in grid mode), so read the attribute. */
async function visibleLabels(page: Page): Promise<string[]> {
  const titles = await page.locator("button.plate[data-plate-id]").evaluateAll(
    (els) => els.map((e) => (e as HTMLElement).title.trim()),
  );
  return titles.filter((t) => t.length > 0);
}

test.describe("Set the active sort as the reading order (Archie-3b9f)", () => {
  test("the control is ABSENT in reading order and appears once a sort is active", async ({ page }) => {
    await openFirstExhibit(page);
    await expect(commit(page)).toHaveCount(0); // committing reading order onto itself is a no-op
    await sort(page).selectOption("name");
    await expect(commit(page)).toBeEnabled();
  });

  test("a SEARCH disables it, with the reason on the control", async ({ page }) => {
    // The decision this ticket had to make: a filtered view is a subset, so committing it would have
    // to invent a rule for the objects you cannot see. Disabled-with-a-reason, not hidden, so the
    // question "why can't I?" is answerable from the view where you asked it.
    await openFirstExhibit(page);
    await sort(page).selectOption("name");
    await page.getByLabel("Search media titles").fill("a");
    await expect(commit(page)).toBeDisabled();
    await expect(commit(page)).toHaveAttribute("title", /Clear the search first/);
    await page.getByLabel("Search media titles").fill("");
    await expect(commit(page)).toBeEnabled();
  });

  test("clicking it makes the sorted order canonical, and snaps the view back to reading order", async ({ page }) => {
    await openFirstExhibit(page);
    const before = await visibleLabels(page);
    expect(before.length, "openFirstExhibit must land on an exhibit with 2+ objects").toBeGreaterThanOrEqual(2);

    await sort(page).selectOption("name");
    const sorted = await visibleLabels(page);
    await commit(page).click();

    // The view is reading order again (eyebrow honesty O6 — it must not still claim "sorted by name"
    // once that IS the order).
    await expect(sort(page)).toHaveValue("reading");
    // And the canonical order now matches what the sort showed. Asserted against the SORTED list, not
    // against a re-sort, so a fix that merely left the sort applied cannot satisfy it.
    expect(await visibleLabels(page)).toEqual(sorted);
    // Non-vacuity: the sort actually changed something, so the line above is not comparing a list to
    // itself. If the fixture happens to be alphabetical already this skips rather than passing hollowly.
    test.skip(JSON.stringify(before) === JSON.stringify(sorted), "fixture is already in name order — nothing to prove");
  });

  test("undo puts the previous order back", async ({ page }) => {
    await openFirstExhibit(page);
    const before = await visibleLabels(page);
    expect(before.length).toBeGreaterThanOrEqual(2);
    await sort(page).selectOption("name");
    const sorted = await visibleLabels(page);
    test.skip(JSON.stringify(before) === JSON.stringify(sorted), "fixture is already in name order");

    await commit(page).click();
    await expect(undo(page)).toBeVisible();
    // Assert the commit CHANGED something before undoing it. Without this the test is vacuous against
    // the obvious injection: remove the commit call and "undo restores the previous order" is
    // trivially true, because the order never moved. Measured — it passed against exactly that.
    expect(await visibleLabels(page)).toEqual(sorted);
    await undo(page).click();
    expect(await visibleLabels(page)).toEqual(before);
  });
});
