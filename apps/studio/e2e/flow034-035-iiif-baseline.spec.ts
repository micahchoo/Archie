import { test, expect } from "@playwright/test";

const host = "https://archie-iiif.test";
const manifest = (title: string, image: string) => ({
  "@context": "https://iiif.io/api/presentation/3/context.json",
  type: "Manifest",
  label: { none: [title] },
  items: [{ type: "Canvas", label: { none: ["Page 1"] }, width: 800, height: 600,
    items: [{ type: "AnnotationPage", items: [{ type: "Annotation", motivation: "painting", body: { type: "Image", id: image } }] }] }],
});

async function openIiif(page: import("@playwright/test").Page) {
  await page.goto("/studio/");
  await page.getByRole("button", { name: /New exhibit/ }).first().click();
  await page.getByText("From a IIIF link", { exact: true }).click();
  await expect(page.getByRole("heading", { name: "From a IIIF link" })).toBeVisible();
}

test.describe("FLOW-034/035 IIIF import journeys", () => {
  test("FLOW-034 imports a single IIIF manifest as a titled exhibit and survives reload", async ({ page }) => {
    const url = `${host}/manifest-one.json`;
    await page.route(`${host}/**`, async (route) => {
      const requestUrl = route.request().url();
      if (requestUrl.endsWith("manifest-one.json")) {
        await route.fulfill({ json: manifest("Fixture Manifest One", `${host}/images/one.jpg`) });
      } else {
        await route.fulfill({ status: 404, body: "not found" });
      }
    });
    await openIiif(page);
    await page.getByLabel("IIIF link").fill(url);
    await expect(page.getByText("Found it.")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Fixture Manifest One", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Create exhibit", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Fixture Manifest One", exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("group", { name: "Media items — reading order" })).toContainText("Page 1");
    await page.reload();
    await expect(page.getByRole("heading", { name: "Fixture Manifest One", exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("group", { name: "Media items — reading order" })).toContainText("Page 1");
  });

  test("FLOW-035 selects one IIIF Collection member and Cancel leaves the library unchanged", async ({ page }) => {
    const collectionUrl = `${host}/collection.json`;
    const firstUrl = `${host}/manifest-one.json`;
    const secondUrl = `${host}/manifest-two.json`;
    await page.route(`${host}/**`, async (route) => {
      const requestUrl = route.request().url();
      if (requestUrl.endsWith("collection.json")) {
        await route.fulfill({ json: { "@context": "https://iiif.io/api/presentation/3/context.json", type: "Collection", label: { none: ["Fixture Collection"] }, items: [
          { id: firstUrl, type: "Manifest", label: { none: ["Selected Member"] } },
          { id: secondUrl, type: "Manifest", label: { none: ["Unselected Member"] } },
        ] } });
      } else if (requestUrl.endsWith("manifest-one.json")) {
        await route.fulfill({ json: manifest("Selected Member", `${host}/images/one.jpg`) });
      } else if (requestUrl.endsWith("manifest-two.json")) {
        await route.fulfill({ json: manifest("Unselected Member", `${host}/images/two.jpg`) });
      } else {
        await route.fulfill({ status: 404, body: "not found" });
      }
    });
    await openIiif(page);
    await page.getByLabel("IIIF link").fill(collectionUrl);
    await expect(page.getByText("Fixture Collection", { exact: true })).toBeVisible({ timeout: 15_000 });
    const rows = page.getByRole("list", { name: "Manifests to import as exhibits" }).getByRole("listitem");
    await expect(rows).toHaveCount(2);
    await rows.nth(1).getByRole("checkbox").uncheck();
    await expect(page.getByRole("button", { name: "Create 1 exhibit", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Create 1 exhibit", exact: true }).click();
    await expect(page.getByRole("button", { name: /Selected Member 1 media item/ })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: /Unselected Member/ })).toHaveCount(0);
    await page.goto("/studio/");
    const before = await page.locator("body").innerText();
    await page.getByRole("button", { name: /New exhibit/ }).first().click();
    await page.getByText("From a IIIF link", { exact: true }).click();
    await page.getByLabel("IIIF link").fill(collectionUrl);
    await expect(page.getByText("Fixture Collection", { exact: true })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByText("Fixture Collection", { exact: true })).toHaveCount(0);
    await expect(page.locator("body")).toContainText(before.includes("Selected Member") ? "Selected Member" : "Library");
  });
});
