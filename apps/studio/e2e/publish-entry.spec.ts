import { test, expect } from "@playwright/test";

// THE SPLIT ENTRY POINT (Q-15) — one header control, two verbs.
//
// "Publish" opens the site half (the home card, or the first-run setup); "Export a copy…" opens the
// artifact half directly. Driven, because `intent` is a NEW PROP threaded App → publish-flows →
// Publish.svelte, and a prop can be typed and never destructured while svelte-check reports 0/0
// (.claude/rules/svelte-no-typecheck-net.md — that exact defect shipped a dead Cancel button once).

const TEMPLATE_HASH = "#/voynich-rosettes/o/ex-voynich.o9";
const COPY_HASH = "#/voynich-rosettes-copy/o/ex-voynich.o9";
const IDENTITY_KEY = "archie.displayName.v1";

test.setTimeout(90_000);

test.beforeEach(async ({ page }) => {
  await page.addInitScript((key) => {
    try { localStorage.setItem(key, "E2E Tester"); } catch { /* private mode */ }
  }, IDENTITY_KEY);
  await page.goto(`/studio/${TEMPLATE_HASH}`);
  await page.getByRole("button", { name: /^Keep a copy$/i }).click();
  await expect(page).toHaveURL(/voynich-rosettes-copy/);
  await page.goto(`/studio/${COPY_HASH}`);
});

test("Export a copy… opens the artifact half directly", async ({ page }) => {
  await page.locator('[data-action="export-a-copy"]').click();
  const dialog = page.getByRole("dialog", { name: "Publish" });

  await expect(dialog.getByRole("heading", { name: /export a copy/i })).toBeVisible();
  // The artifacts are all here, including the viewable PAIR that is the reason this half exists.
  await expect(dialog.locator('[data-export="zip"]')).toBeVisible();
  await expect(dialog.locator('[data-export="single-file"]')).toBeVisible();
  await expect(dialog.locator('[data-export="folder-viewer"]')).toBeVisible();
  // And NOT the site question — that is the whole point of splitting them. This negative is the
  // load-bearing half: an ignored `intent` prop lands on the destination screen, which would still
  // pass any assertion about the dialog merely being open.
  await expect(dialog.locator("[data-destination]")).toHaveCount(0);
});

test("Publish opens the site half, not the exports", async ({ page }) => {
  await page.locator("button.publish-signal").click();
  const dialog = page.getByRole("dialog", { name: "Publish" });

  await expect(dialog.getByRole("heading", { name: /where should this library live/i })).toBeVisible();
  await expect(dialog.locator("[data-destination]")).toHaveCount(3);
  await expect(dialog.locator('[data-export="zip"]')).toHaveCount(0);
});

test("the two entries are independent — each visit honours the button that opened it", async ({ page }) => {
  // `intent` is read on OPEN only, so a stale value would make the SECOND visit wrong while the
  // first looked perfect. Both orders, in one test, because that is the failure this catches.
  const dialog = page.getByRole("dialog", { name: "Publish" });

  await page.locator('[data-action="export-a-copy"]').click();
  await expect(dialog.getByRole("heading", { name: /export a copy/i })).toBeVisible();
  await dialog.getByRole("button", { name: /^Cancel$|^← Back$/ }).first().click();
  await page.keyboard.press("Escape");

  await page.locator("button.publish-signal").click();
  await expect(dialog.getByRole("heading", { name: /where should this library live/i })).toBeVisible();

  await page.keyboard.press("Escape");
  await page.locator('[data-action="export-a-copy"]').click();
  await expect(dialog.getByRole("heading", { name: /export a copy/i })).toBeVisible();
});
