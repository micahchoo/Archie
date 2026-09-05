import { test, expect, type Page } from "@playwright/test";

test.use({ screenshot: "on" });

// Exercise the production command wiring through the UI. Whole-image notes use the same
// create command as a drawn region without depending on remote IIIF tiles or pointer geometry.
const objectId = "ex-voynich.o9";
const copySlug = "voynich-rosettes-copy";
const notes = (page: Page) => page.getByRole("list", { name: "Notes on this object" });
const comment = (page: Page) => page.locator(".note-editor-region textarea").first();
const undo = (page: Page) => page.getByRole("group", { name: "Note history" }).getByRole("button", { name: "↶ Undo", exact: true });
const redo = (page: Page) => page.getByRole("group", { name: "Note history" }).getByRole("button", { name: "↷ Redo", exact: true });

async function savedEditor(page: Page) {
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (route) => route.abort());
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.goto(`/studio/#/voynich-rosettes/o/${objectId}`);
  await page.getByRole("button", { name: "Keep a copy", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`#/` + copySlug + "$"));
  await page.locator(`[data-plate-id="${objectId}"]`).click();
  await expect(notes(page).locator(".note-opt").first()).toBeVisible();
  await expect(undo(page)).toBeVisible();
}

async function editComment(page: Page, text: string) {
  await comment(page).fill(text);
  await comment(page).blur();
  await expect(notes(page)).toContainText(text);
}

async function reopenSaved(page: Page) {
  // Leaving the editor awaits its save. Reopening and reloading then read actual OPFS content,
  // independent of the temporary undo overlay or a still-mounted form.
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.locator(`[data-plate-id="${objectId}"]`).click();
  await page.reload();
  await expect(notes(page).locator(".note-opt").first()).toBeVisible();
  await expect(undo(page)).toBeDisabled();
}

test("two completed note creations undo and redo separately", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await savedEditor(page);
  const count = await notes(page).locator(".note-opt").count();
  const create = page.getByRole("button", { name: /Whole image/ });
  await create.click();
  await expect(notes(page).locator(".note-opt")).toHaveCount(count + 1);
  const first = await notes(page).locator(".note-opt[aria-expanded=true]").getAttribute("data-note-id");
  await create.click();
  await expect(notes(page).locator(".note-opt")).toHaveCount(count + 2);
  await undo(page).click();
  await expect(notes(page).locator(".note-opt")).toHaveCount(count + 1);
  await expect(notes(page).locator(`[data-note-id="${first}"]`)).toBeVisible();
  await undo(page).click();
  await expect(notes(page).locator(".note-opt")).toHaveCount(count);
  await redo(page).click();
  await expect(notes(page).locator(`[data-note-id="${first}"]`)).toBeVisible();
  await expect(notes(page).locator(".note-opt")).toHaveCount(count + 1);
  await redo(page).click();
  await expect(notes(page).locator(".note-opt")).toHaveCount(count + 2);
  expect(errors).toEqual([]);
});

test("edit after undo becomes the visible and saved note", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await savedEditor(page);
  const row = notes(page).locator(".note-opt").first();
  const id = await row.getAttribute("data-note-id");
  await row.click();
  const original = await comment(page).inputValue();
  await editComment(page, "A first interpretation to undo");
  await undo(page).click();
  await expect(comment(page)).toHaveValue(original);
  await editComment(page, "A revised interpretation after undo");
  await expect(redo(page)).toBeDisabled();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(notes(page).locator(`[data-note-id="${id}"]`)).toContainText("A revised interpretation after undo");
  await reopenSaved(page);
  await expect(notes(page).locator(`[data-note-id="${id}"]`)).toContainText("A revised interpretation after undo");
  await expect(notes(page)).not.toContainText("A first interpretation to undo");
  expect(errors).toEqual([]);
});

test("a deleted note restored by undo can be edited and saved", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await savedEditor(page);
  const count = await notes(page).locator(".note-opt").count();
  const row = notes(page).locator(".note-opt").first();
  const id = await row.getAttribute("data-note-id");
  await row.click();
  const original = await comment(page).inputValue();
  await page.getByRole("button", { name: "Delete note", exact: true }).click();
  await expect(notes(page).locator(".note-opt")).toHaveCount(count - 1);
  await undo(page).click();
  const restored = notes(page).locator(`[data-note-id="${id}"]`);
  await expect(restored).toBeVisible();
  await expect(notes(page).locator(".note-opt")).toHaveCount(count);
  await restored.click();
  await expect(comment(page)).toHaveValue(original);
  await editComment(page, "A restored note with a new interpretation");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(restored).toContainText("A restored note with a new interpretation");
  await expect(redo(page)).toBeDisabled();
  await reopenSaved(page);
  await expect(notes(page).locator(".note-opt")).toHaveCount(count);
  await expect(restored).toContainText("A restored note with a new interpretation");
  expect(errors).toEqual([]);
});
