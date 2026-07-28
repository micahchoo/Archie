// Bulk metadata import (Archie-3754) — the drive, because the two things this slice can get wrong are
// both invisible to every static gate:
//
//   1. PROP WIRING. `onimportmetadata` crosses a component boundary. A prop can be typed and not
//      destructured, and svelte-check reports 0 errors / 0 warnings while the control never renders
//      (.claude/rules/svelte-no-typecheck-net.md — measured on `oncancel`/EmptyHall). The only thing that
//      catches it is asserting the control exists in a driven browser.
//   2. WHAT THE DIALOG ACTUALLY SHOWS. The planner's suite proves the plan; it says nothing about
//      whether the mapping step and the preview reach the DOM.
//
// The write path itself is NOT asserted here — it is `lib.patchObject` over patches the unit suite pins
// exhaustively (metadata-import.test.ts, "the patch is a KEYED PARTIAL"). Saying so is the point: this
// spec covers reach, not correctness of the patch.
import { test, expect, type Page } from "@playwright/test";

async function openOverview(page: Page) {
  await page.goto("/studio/");
  // Same library-card locator navigation.spec.ts:32 uses — one screen marker, not a guess.
  const card = page.locator("button.card").filter({ hasText: "The Rosettes" });
  await expect(card).toBeVisible();
  await card.click();
  // The Overview-mode toggle group is the overview's own marker (navigation.spec.ts:33).
  await expect(page.getByRole("group", { name: "Overview mode" })).toBeVisible();
}

test.describe("bulk metadata import", () => {
  test("the overview toolbar carries the control, and it opens the dialog", async ({ page }) => {
    await openOverview(page);

    // The wiring assertion. `toBeVisible` auto-waits, so this is not a bare count against an unhydrated
    // island (.claude/rules/playwright-count-does-not-wait.md).
    const trigger = page.getByRole("button", { name: "Import metadata…" });
    await expect(trigger).toBeVisible();

    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Import metadata" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("nothing is written until you choose Import")).toBeVisible();

    // Nothing is mapped yet, so Import must be unavailable — the preview-before-commit contract's
    // visible half.
    await expect(dialog.getByRole("button", { name: /^Import$/ })).toBeDisabled();
  });

  test("a spreadsheet drives the mapping step and the preview", async ({ page }) => {
    await openOverview(page);
    await page.getByRole("button", { name: "Import metadata…" }).click();
    const dialog = page.getByRole("dialog", { name: "Import metadata" });

    // The sheet matches on `archie_id`, so read a real object id out of the running app rather than
    // hardcoding a fixture value a seed change would silently invalidate.
    const firstPlate = (await page.locator("[data-plate-id]").first().getAttribute("data-plate-id")) ?? "";
    expect(firstPlate, "the overview rendered no plates — this test needs a seeded exhibit").not.toBe("");

    await dialog.locator("input[type=file]").setInputFiles({
      name: "catalogue.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("archie_id,Object Title,Creator\n" + `${firstPlate},A Catalogued Plate,A. Curator\n`),
    });

    // The mapping step reached the DOM with its guesses in place.
    await expect(dialog.getByText("Your columns")).toBeVisible();
    await expect(dialog.getByRole("row", { name: /Object Title/ })).toBeVisible();

    // The preview names the field in the words the object's own editor uses, and offers the commit.
    // Scoped to the PREVIEW table: the mapping step shows the same string in its "First row" column, and
    // an unscoped match would pass on the mapping table alone — proving nothing about the preview.
    await expect(dialog.locator("table.preview").getByRole("cell", { name: "A Catalogued Plate" })).toBeVisible();
    await expect(dialog.locator("table.preview").getByRole("cell", { name: "Title" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Import 1 media item" })).toBeEnabled();
  });
});
