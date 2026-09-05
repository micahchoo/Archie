import { createRequire } from "node:module";
import { test, expect } from "@playwright/test";

const require = createRequire(import.meta.url);

test("the library save indicator names its browser destination", async ({ page }) => {
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (route) => route.abort());
  await page.goto("/studio/");
  await expect(page.locator(".safety-state[role=status]")).toHaveText("Saved · this browser");
});

test("sample overview text has sufficient contrast and identifies authored titles", async ({ page }) => {
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (route) => route.abort());
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/studio/#/sampler");
  await expect(page.locator(".plate[data-plate-id]")).toHaveCount(3);
  await expect(page.locator(".safety-state[role=status]")).toHaveText("Example · edits aren't kept");
  await page.evaluate(() => document.fonts.ready);

  // Read the actual laid-out title, not its hover tooltip or accessible name.
  const title = page.locator(".plate .lbl").first();
  await expect(title).toContainText("Big Buck Bunny");
  const titleSize = await title.evaluate((element) => ({
    height: element.getBoundingClientRect().height,
    lineHeight: Number.parseFloat(getComputedStyle(element).lineHeight),
  }));
  expect(titleSize.height).toBeGreaterThan(titleSize.lineHeight * 1.9);
  expect(titleSize.height).toBeLessThanOrEqual(titleSize.lineHeight * 2 + 1);

  await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
  const failures = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: typeof import("axe-core") }).axe;
    const result = await axe.run(document, { runOnly: ["color-contrast"] });
    return result.violations.map(({ id, nodes }) => ({ id, nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })) }));
  });
  expect(failures).toEqual([]);
});
