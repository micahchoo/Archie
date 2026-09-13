import { test, expect } from "@playwright/test";

test.setTimeout(120_000);

test("FLOW-042 surfaces a quota write failure and retries successfully", async ({ page }) => {
  await page.addInitScript(() => {
    const g = globalThis as typeof globalThis & { FileSystemDirectoryHandle?: { prototype: object }; __archieFailNextWrite?: boolean };
    const dirProto = g.FileSystemDirectoryHandle?.prototype as (object & { queryPermission?: unknown; requestPermission?: unknown }) | undefined;
    if (dirProto) {
      Object.defineProperty(dirProto, "queryPermission", { configurable: true, value: async () => "granted" });
      Object.defineProperty(dirProto, "requestPermission", { configurable: true, value: async () => "granted" });
    }
    (window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker = async () =>
      await (await navigator.storage.getDirectory()).getDirectoryHandle("flow042-fixture", { create: true });
    g.__archieQuotaHits = 0;
    const fileProto = (globalThis as unknown as { FileSystemFileHandle?: { prototype: object } }).FileSystemFileHandle?.prototype as
      (object & { createWritable?: (...args: unknown[]) => Promise<unknown> }) | undefined;
    if (fileProto?.createWritable) {
      const original = fileProto.createWritable;
      Object.defineProperty(fileProto, "createWritable", { configurable: true, value: async function(this: object, ...args: unknown[]) {
        if (g.__archieFailNextWrite) {
          g.__archieFailNextWrite = false;
          g.__archieQuotaHits = (g.__archieQuotaHits ?? 0) + 1;
          throw new DOMException("device full", "QuotaExceededError");
        }
        return original.apply(this, args);
      }});
    }
  });
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  page.on("dialog", (dialog) => void dialog.accept());
  await page.goto("http://localhost:5173/studio/#/");
  await expect(page.getByRole("heading", { name: /Library/ })).toBeVisible();
  await page.getByRole("button", { name: /New exhibit/ }).first().click();
  await page.getByText("Start empty", { exact: true }).click();
  await page.getByRole("textbox", { name: /title/i }).fill("FLOW042 empty");
  await page.getByRole("button", { name: /Create exhibit/ }).click();
  await expect(page.getByRole("heading", { name: /FLOW042 empty/ })).toBeVisible();
  await page.goto("http://localhost:5173/studio/#/");
  await page.getByRole("button", { name: /Save to disk/ }).click();
  await expect(page.getByText(/Saved · folder/)).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Details — Library" }).click();
  const details = page.getByRole("dialog", { name: /Library details/ });
  await page.evaluate(() => { (window as unknown as { __archieFailNextWrite: boolean }).__archieFailNextWrite = true; });
  await details.getByRole("textbox").first().fill("FLOW042 recovered title");
  await details.getByRole("button", { name: /Close|Done/ }).click();
  await expect(page.getByRole("button", { name: /Retry save/ })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /Retry save/ }).click();
  await expect.poll(async () => page.evaluate(() => (window as unknown as { __archieQuotaHits: number }).__archieQuotaHits)).toBe(1);
  await page.waitForTimeout(2_000);
  await page.reload();
  await page.getByRole("button", { name: /Details —/ }).first().click();
  await expect(page.getByRole("dialog", { name: /Library details/ }).getByRole("textbox").first()).toHaveValue("FLOW042 recovered title");
  expect(pageErrors).toEqual([]);
});
