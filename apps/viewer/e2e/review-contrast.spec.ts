import { createRequire } from "node:module";
import { test, expect } from "@playwright/test";
import { goOffline } from "./offline.js";

const require = createRequire(import.meta.url);

test("mobile gallery keeps readable text and its first exhibit above the fold", async ({ page }) => {
  await goOffline(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./");
  await expect(page.locator("a.card").first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);

  const summary = page.locator("#gallery-summary");
  const more = page.getByRole("button", { name: "Read more", exact: true });
  await expect(more).toBeVisible();
  await expect(more).toHaveAttribute("aria-expanded", "false");
  const collapsed = (await summary.boundingBox())!.height;
  const firstTitle = page.locator(".c-title").first();
  await expect(firstTitle).toBeInViewport({ ratio: 1 });
  const titleBox = (await firstTitle.boundingBox())!;
  expect(titleBox.y + titleBox.height).toBeLessThan(844 * 0.8);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);

  await more.click();
  const less = page.getByRole("button", { name: "Show less", exact: true });
  await expect(less).toHaveAttribute("aria-expanded", "true");
  await expect.poll(async () => (await summary.boundingBox())!.height).toBeGreaterThan(collapsed);
  await less.click();
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await expect.poll(async () => (await summary.boundingBox())!.height).toBe(collapsed);

  await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
  const failures = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: typeof import("axe-core") }).axe;
    const result = await axe.run(document, { runOnly: ["color-contrast"] });
    return result.violations.map(({ id, nodes }) => ({ id, nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })) }));
  });
  expect(failures).toEqual([]);
});
