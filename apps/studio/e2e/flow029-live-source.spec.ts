import { test, expect } from "@playwright/test";

test.setTimeout(90_000);

test("FLOW-029 shows saved Studio work in the same-origin Viewer live source", async ({ page, context }) => {
  const note = `Live source note ${Date.now()}`;
  await page.goto("http://localhost:5173/studio/#/voynich-rosettes/o/ex-voynich.o9");
  await expect(page.getByRole("navigation", { name: "Exhibit objects" })).toBeVisible();
  const keepCopy = page.getByRole("button", { name: "Keep a copy" });
  if (await keepCopy.count()) {
    await keepCopy.click();
    await expect(page).toHaveURL(/voynich-rosettes-copy/);
  }
  await page.goto("http://localhost:5173/studio/#/voynich-rosettes-copy/o/ex-voynich.o9");
  await expect(page.getByRole("navigation", { name: "Exhibit objects" })).toBeVisible();
  await page.getByRole("button", { name: /Whole image/ }).click();
  const comment = page.locator(".note-editor-region").getByRole("textbox").first();
  await expect(comment).toBeVisible();
  await comment.fill(note);
  await comment.blur();
  await expect(page.getByRole("list", { name: "Notes on this object" })).toContainText(note);
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await expect(page.getByRole("group", { name: "Overview mode" })).toBeVisible();
  await page.waitForTimeout(2_000);

  const viewer = await context.newPage();
  await viewer.goto("http://localhost:5173/viewer/");
  await viewer.waitForTimeout(3_000);
  const exhibit = viewer.getByText(/The Rosettes \(copy\)/).first();
  await expect(exhibit).toBeVisible({ timeout: 30_000 });
  await exhibit.click();
  await viewer.waitForTimeout(2_000);
  console.log("VIEWER AFTER EXHIBIT", (await viewer.locator("body").innerText()).slice(0,3000));
  await expect(viewer.getByText(note, { exact: true })).toBeVisible({ timeout: 30_000 });
});
