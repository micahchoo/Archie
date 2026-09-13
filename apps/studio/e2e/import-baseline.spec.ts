import { test, expect } from "@playwright/test";
import { resolve } from "node:path";

const imageFixture = resolve(process.cwd(), "public/voynich");
const unsupportedFixture = resolve(process.cwd(), "e2e/fixtures");

async function openFolderImport(page: import("@playwright/test").Page) {
  await page.addInitScript(() => localStorage.setItem("archie.displayName.v1", "Baseline Tester"));
  await page.goto("/studio/");
  await page.getByRole("button", { name: /New exhibit/ }).first().click();
  await page.getByText("From a media folder", { exact: true }).click();
  await expect(page.getByRole("heading", { name: "From a media folder" })).toBeVisible();
}

test.describe("integration baseline: local media import", () => {
  test("FLOW-030 imports a local PNG and shows it in the exhibit", async ({ page }) => {
    await openFolderImport(page);
    await page.getByLabel("Choose a folder of media").setInputFiles(imageFixture);
    await expect(page.getByText(/image/).first()).toBeVisible();
    const create = page.getByRole("button", { name: /Create exhibit|Add to exhibit/ });
    await expect(create).toBeEnabled();
    await create.click();
    const media = page.getByRole("group", { name: "Media items — reading order" });
    await expect(media).toBeVisible({ timeout: 15_000 });
    await expect(media.getByRole("button", { name: /^1 article$/ })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("group", { name: "Media items — reading order" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: /^1 article$/ })).toBeVisible();
  });

  test("FLOW-033 refuses an unsupported file and keeps the existing media", async ({ page }) => {
    await openFolderImport(page);
    await page.getByLabel("Choose a folder of media").setInputFiles(unsupportedFixture);
    await expect(page.getByText(/No images, audio, or video found/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Create exhibit|Add to exhibit/ })).toBeDisabled();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByText("Library", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText("Library", { exact: true })).toBeVisible();
  });
});
