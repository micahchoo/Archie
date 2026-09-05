import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { goOffline } from "./offline.js";

test("foreign source survives reader address updates, reload, links, and Back", async ({ page, baseURL }) => {
  await goOffline(page);
  const source = new URL("review-source/", baseURL!).href;
  await page.route(`${source}**`, async route => {
    const relative = new URL(route.request().url()).pathname.split("/review-source/")[1]!;
    try {
      const data = await readFile(new URL(`../public/published/${relative}`, import.meta.url));
      await route.fulfill({ status: 200, contentType: relative.endsWith(".json") ? "application/json" : "application/octet-stream",
        body: relative.endsWith(".json") ? data.toString().replaceAll("The Rosettes", "FOREIGN ROSETTES") : data });
    } catch { await route.fulfill({ status: 404, body: "Not found" }); }
  });
  await page.goto(`./#/voynich-rosettes?src=${encodeURIComponent(source)}`);
  const foreign = page.getByText("FOREIGN ROSETTES", { exact: true }).first();
  await expect(foreign).toBeVisible();
  await expect(page).toHaveURL(/\/o\/.*src=/);
  expect(new URLSearchParams(new URL(page.url()).hash.split("?")[1]).get("src")).toBe(source);
  await page.reload();
  await expect(foreign).toBeVisible();
  // Every shell breadcrumb is already a shareable source-qualified link.
  for (const href of await page.locator('a[href^="#/"]').evaluateAll(links => links.map(a => a.getAttribute("href")!))) {
    expect(new URLSearchParams(href.split("?")[1]).get("src")).toBe(source);
  }
  await page.evaluate(() => { location.hash = "#/voynich-rosettes"; });
  await expect(page.getByText("The Rosettes", { exact: true }).first()).toBeVisible();
  await page.goBack();
  await expect(foreign).toBeVisible();
  expect(page.url()).toContain("src=");
});
