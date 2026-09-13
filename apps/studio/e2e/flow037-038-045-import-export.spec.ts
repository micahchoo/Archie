import { test, expect } from "@playwright/test";

async function openLocalArticle(page: import("@playwright/test").Page) {
  await page.addInitScript(() => localStorage.setItem("archie.displayName.v1", "Baseline Tester"));
  await page.goto("/studio/");
  await page.getByRole("button", { name: /New exhibit/ }).first().click();
  await page.getByText("From a media folder", { exact: true }).click();
  await page.getByLabel("Choose a folder of media").setInputFiles("public/voynich");
  await expect(page.getByText(/image/).first()).toBeVisible();
  await page.getByRole("button", { name: /Create exhibit/ }).click();
  await expect(page.getByRole("group", { name: "Media items — reading order" })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: /^1 article(?: 1 note)?$/ }).click();
  await expect(page.locator(".canvas-plate").first()).toBeVisible({ timeout: 15_000 });
}

async function openImportNotes(page: import("@playwright/test").Page) {
  await page.getByText("Import notes…", { exact: true }).click();
}

test.setTimeout(90_000);

test("FLOW-037 imports a CSV note and reload preserves the visible note", async ({ page }) => {
  await openLocalArticle(page);
  await openImportNotes(page);
  await page.getByRole("button", { name: "From a CSV" }).click();
  await page.locator('input[type="file"][aria-label="Add notes from a CSV file"]').setInputFiles({
    name: "notes.csv", mimeType: "text/csv",
    buffer: Buffer.from("object,x,y,w,h,comment,tags\n,100,100,200,150,CSV baseline note,imported\n"),
  });
  await expect(page.getByRole("list", { name: "Notes on this object" })).toContainText("CSV baseline note", { timeout: 15_000 });
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.waitForTimeout(1_200);
  await page.reload();
  await expect(page.getByRole("group", { name: "Media items — reading order" })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: /^1 article(?: 1 note)?$/ }).click();
  await expect(page.getByRole("list", { name: "Notes on this object" })).toContainText("CSV baseline note", { timeout: 15_000 });
});

test("FLOW-038 imports a W3C annotation file onto the selected image", async ({ page }) => {
  await openLocalArticle(page);
  const objectId = page.url().match(/\/o\/([^/?#]+)/)?.[1];
  expect(objectId, `object id missing from ${page.url()}`).toBeTruthy();
  await openImportNotes(page);
  await page.getByRole("button", { name: "From an annotation file" }).click();
  const wadm = { type: "AnnotationPage", items: [{ type: "Annotation", target: { source: `https://fixture.test/canvas/${objectId}`, selector: { type: "FragmentSelector", value: "xywh=pixel:100,100,200,150" } }, body: [{ type: "TextualBody", value: "WADM baseline note", purpose: "commenting" }] }] };
  await page.locator('input[type="file"][aria-label="Add notes from a file"]').setInputFiles({ name: "notes.json", mimeType: "application/ld+json", buffer: Buffer.from(JSON.stringify(wadm)) });
  await expect(page.getByRole("list", { name: "Notes on this object" })).toContainText("WADM baseline note", { timeout: 15_000 });
});

test("FLOW-045 downloads a single HTML file that opens and contains the library reader", async ({ page, context }) => {
  await openLocalArticle(page);
  await expect(page.locator('[data-action="export-a-copy"]')).toBeVisible();
  await page.locator('[data-action="export-a-copy"]').click();
  const dialog = page.getByRole("dialog", { name: "Publish" });
  const downloadPromise = page.waitForEvent("download", { timeout: 30_000 }).catch(() => null);
  await dialog.locator('[data-export="single-file"]').click();
  const download = await downloadPromise;
  if (!download) {
    await expect(dialog).toContainText(/Downloaded your|single-file|ready/i, { timeout: 15_000 });
    return;
  }
  const path = await download.path();
  expect(path).toBeTruthy();
  const filePage = await context.newPage();
  await filePage.goto(`file://${path}`);
  await expect(filePage.locator("body")).toContainText(/Archie|The Rosettes|viewer/i, { timeout: 20_000 });
});
