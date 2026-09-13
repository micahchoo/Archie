import { test, expect } from "@playwright/test";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

test("FLOW-031 drops a supported image onto the selected owned exhibit", async ({ page }) => {
  await page.goto("/studio/#/voynich-rosettes/o/ex-voynich.o9");
  await expect(page.getByRole("navigation", { name: "Exhibit objects" })).toBeVisible();
  const keepCopy = page.getByRole("button", { name: "Keep a copy" });
  if (await keepCopy.count()) {
    await keepCopy.click();
    await expect(page).toHaveURL(/voynich-rosettes-copy/);
  }
  await page.goto("/studio/#/voynich-rosettes-copy/o/ex-voynich.o9");
  await expect(page.getByRole("navigation", { name: "Exhibit objects" })).toBeVisible();
  await page.locator("main").evaluate((el, bytes) => {
      const dt = new DataTransfer();
      dt.items.add(new File([new Uint8Array(bytes)], "Dropped image.png", { type: "image/png" }));
      el.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }));
  }, Array.from(png));
  await expect(page.getByText("Dropped image", { exact: true })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await expect(page.getByRole("group", { name: "Overview mode" })).toBeVisible();
  await page.waitForTimeout(1_000);
  await page.reload();
  await page.goto("/studio/#/voynich-rosettes-copy");
  await expect(page.getByRole("group", { name: "Overview mode" })).toBeVisible();
  await expect(page.locator('button.plate[title="Dropped image"]')).toBeVisible({ timeout: 15_000 });
});
