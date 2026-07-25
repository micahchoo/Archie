import { test, expect } from "@playwright/test";
import { goOffline } from "./offline.js";

// Archie-4635 / UX-AUDIT-viewer-arrival V1–V4: "Open another library" was a ONE-WAY DOOR — it tore
// the open library down before asking for a new one, so a misclick cost you your place with no way
// back. The fix makes the chooser a surface over the library rather than a replacement for it.
//
// This spec is the reason the whole suite exists. The Cancel button was typed on EmptyHall's $props()
// and omitted from the destructuring beside it, so `{#if oncancel}` referenced a name that did not
// exist and the button silently never rendered — svelte-check: 1464 files, 0 errors, 0 warnings.
// Nothing static can see that. Only a browser can.

test.describe("arrival is recoverable", () => {
  test.beforeEach(async ({ page }) => {
    await goOffline(page);
    await page.goto("./");
    await expect(page.locator("a.card").first()).toBeVisible();
  });

  test("the gallery arrives with its exhibits", async ({ page }) => {
    expect(await page.locator("a.card").count()).toBeGreaterThan(0);
    await expect(page.locator("button.open-another")).toBeVisible();
  });

  test("opening the chooser offers a way back (V1)", async ({ page }) => {
    const before = await page.locator("a.card").count();

    await page.locator("button.open-another").click();
    await expect(page.getByRole("heading", { name: "Open a library" })).toBeVisible();

    // THE regression guard: a way out must RENDER, not merely be wired.
    const cancel = page.locator("button.cancel");
    await expect(cancel).toBeVisible();
    await expect(cancel).toHaveText(/keep reading this library/i);

    await cancel.click();
    // The library was never torn down, so it comes back whole — not re-fetched, not empty.
    await expect(page.locator("a.card")).toHaveCount(before);
  });

  test("Escape is the same door as Cancel", async ({ page }) => {
    const before = await page.locator("a.card").count();
    await page.locator("button.open-another").click();
    await expect(page.locator("button.cancel")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.locator("a.card")).toHaveCount(before);
    await expect(page.locator("button.cancel")).toHaveCount(0);
  });

  test("the library's chrome steps aside while choosing (V2)", async ({ page }) => {
    await expect(page.locator(".topbar")).toBeVisible();
    await page.locator("button.open-another").click();
    // Showing a topbar that navigates a library you are in the middle of replacing is a lie about
    // where you are; the shell hides it for the duration and restores it on cancel.
    await expect(page.locator(".topbar")).toHaveCount(0);
    await page.locator("button.cancel").click();
    await expect(page.locator(".topbar")).toBeVisible();
  });

  test("a cold arrival has no way back, and offers none", async ({ context }) => {
    // With no library open there is nothing to cancel BACK to, so the button must be absent rather
    // than present-and-dead. `oncancel` is passed only when phase === "ready" — this is the other
    // half of that contract, and the reason the prop is optional in the first place.
    const cold = await context.newPage();
    await goOffline(cold);
    await cold.goto("./#/__no-such-library__");
    await expect(cold.locator("button.cancel")).toHaveCount(0);
    await cold.close();
  });
});
