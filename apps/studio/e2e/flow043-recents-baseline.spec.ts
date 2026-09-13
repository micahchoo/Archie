import { test, expect } from "@playwright/test";

test.setTimeout(120_000);

test("FLOW-043 saves a folder binding and manages its recent entry", async ({ page }) => {
  page.on("dialog", (dialog) => void dialog.accept());
  await page.addInitScript(() => {
    const g = globalThis as typeof globalThis & { FileSystemDirectoryHandle?: { prototype: object } };
    const proto = g.FileSystemDirectoryHandle?.prototype as (object & { queryPermission?: unknown; requestPermission?: unknown }) | undefined;
    if (proto) {
      Object.defineProperty(proto, "queryPermission", { configurable: true, value: async () => "granted" });
      Object.defineProperty(proto, "requestPermission", { configurable: true, value: async () => "granted" });
    }
    (window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker = async () =>
      await (await navigator.storage.getDirectory()).getDirectoryHandle("flow043-fixture", { create: true });
  });
  console.log("STEP initial");
  await page.goto("http://localhost:5173/studio/#/");
  await expect(page.getByRole("heading", { name: /Library/ })).toBeVisible();
  await page.getByRole("button", { name: /New exhibit/ }).first().click();
  await page.getByText("Start empty", { exact: true }).click();
  await page.getByRole("textbox", { name: /title/i }).fill("FLOW043 empty");
  await page.getByRole("button", { name: /Create exhibit/ }).click();
  await expect(page.getByRole("heading", { name: /FLOW043 empty/ })).toBeVisible();
  await page.goto("http://localhost:5173/studio/#/");
  await expect(page.getByRole("heading", { name: /Library/ })).toBeVisible();
  const save = page.getByRole("button", { name: /Save to disk/ });
  await expect(save).toBeVisible({ timeout: 20_000 });
  console.log("STEP save");
  await save.click();
  await expect(page.getByText(/Saved · folder/)).toBeVisible({ timeout: 60_000 });
  console.log("STEP reload");
  await page.reload();
  await expect(page.getByRole("heading", { name: /Library/ })).toBeVisible();
  await page.getByRole("button", { name: /Recents/ }).click();
  const recent = page.locator("button.recent").filter({ hasText: "flow043-fixture" }).first();
  await expect(recent).toBeVisible({ timeout: 20_000 });
  const recentName = await recent.locator(".r-name").innerText();
  console.log("STEP recent");
  await recent.click();
  await expect(page.getByText(/Living in folder/)).toBeVisible({ timeout: 60_000 });
  const forget = page.getByRole("button", { name: new RegExp(`Forget ${recentName}`) });
  if (await forget.count() === 0) await page.getByRole("button", { name: /Recents/ }).click();
  await expect(forget).toBeVisible();
  await forget.click();
  await expect(page.getByRole("button", { name: new RegExp(`Forget ${recentName}`) })).toHaveCount(0);
  await page.getByRole("button", { name: /Close/ }).click();
  await expect(page.getByText(/Living in this browser/)).toBeVisible();
});
