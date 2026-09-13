import { test, expect, type Page } from "@playwright/test";

async function openOwnedOverview(page: Page) {
  await page.goto("/studio/");
  const card = page.locator("button.card").filter({ hasText: "The Rosettes" }).first();
  await expect(card).toBeVisible();
  await card.click();
  await expect(page.getByRole("group", { name: "Overview mode" })).toBeVisible();
  await page.goto("/studio/#/voynich-rosettes/o/ex-voynich.o9");
  await expect(page.getByRole("navigation", { name: "Exhibit objects" })).toBeVisible();
  await page.getByRole("button", { name: "Keep a copy" }).click();
  await expect(page).toHaveURL(/voynich-rosettes-copy/);
  await expect(page.getByRole("group", { name: "Overview mode" })).toBeVisible();
}

test("FLOW-051 adds a direct remote media link to the selected exhibit", async ({ page }) => {
  await page.route("https://example.test/media/flower.png", (route) => route.fulfill({
    status: 200,
    contentType: "image/png",
    body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"),
  }));
  await openOwnedOverview(page);
  await page.getByRole("button", { name: "Add media" }).first().click();
  await page.getByText("From a link", { exact: true }).click();
  await page.locator("#linkUrl").fill("https://example.test/media/flower.png");
  await page.locator("#linkLabel").fill("Remote flower");
  await page.locator(".dialog").getByRole("button", { name: "Add to exhibit", exact: true }).click();
  await expect(page.locator('button.plate[title="Remote flower"]')).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1_000);
  await page.reload();
  await page.goto("/studio/#/voynich-rosettes-copy");
  await expect(page.getByRole("group", { name: "Overview mode" })).toBeVisible();
  await expect(page.locator('button.plate[title="Remote flower"]')).toBeVisible({ timeout: 15_000 });
});

test("FLOW-052 creates a named map with a selected region", async ({ page }) => {
  await page.route("https://tile.openstreetmap.org/**", (route) => route.abort());
  await openOwnedOverview(page);
  await page.getByRole("button", { name: "Add media" }).first().click();
  await page.getByText("A map", { exact: true }).click();
  await page.locator("#mapName").fill("London map");
  await page.getByRole("button", { name: "Greater London" }).click();
  await page.locator(".dialog").getByRole("button", { name: "Add to exhibit", exact: true }).click();
  await expect(page.locator('button.plate[title="London map"]')).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1_000);
  await page.reload();
  await page.goto("/studio/#/voynich-rosettes-copy");
  await expect(page.getByRole("group", { name: "Overview mode" })).toBeVisible();
  await expect(page.locator('button.plate[title="London map"]')).toBeVisible({ timeout: 15_000 });
});
