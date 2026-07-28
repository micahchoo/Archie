import { test, expect } from "@playwright/test";

// A library with nothing publishable in it must REFUSE and explain, not build an empty site.
//
// The defect this pins shipped silently and had no gate of any kind. Every seeded exhibit carries
// `seedVersion` (apps/studio/src/seed-data.ts:65-84) and `buildFullLibrary` filters templates out via
// `workingToLibrary` (packages/render-core/src/publish/working.ts:177) — so a FRESH profile, which is
// examples-only, projected a library with zero exhibits. Every destination then did its job perfectly:
// the zip built, the deploy pushed, the deposit copy wrote itself, and each produced a gallery with no
// cards while reporting success. Nothing in the app said "there is nothing here".
//
// The fresh profile IS the fixture — no setup makes this state, it is where every new author starts.
// That is also why the assertion is on the refusal screen rather than on some downstream artifact: the
// point is that the author is told BEFORE choosing a destination.
const HASH_EDITOR = "#/voynich-rosettes/o/ex-voynich.o9";

test.setTimeout(60_000);

test("a library of only examples refuses to publish, and says why", async ({ page }) => {
  await page.goto(`/studio/${HASH_EDITOR}`);
  await page.locator(".publish-signal").click();

  const skip = page.getByRole("button", { name: /skip for now/i });
  if (await skip.isVisible().catch(() => false)) await skip.click();

  const dialog = page.getByRole("dialog", { name: "Publish" });
  await expect(dialog.getByRole("heading", { name: /nothing to publish yet/i })).toBeVisible();

  // The way FORWARD is named, not just the refusal — an author who is only told "no" is stuck.
  await expect(dialog.getByText(/keep a copy/i)).toBeVisible();

  // And no destination is reachable. Since Archie-c367 the destinations are a radio list, so this
  // asserts on the rows themselves — zero of them — rather than on the four card buttons that used to
  // stand where they stand. `toHaveCount` waits rather than racing the surface's own render.
  await expect(dialog.locator("[data-destination]")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Publish", exact: true })).toHaveCount(0);
  // Nor the additional export actions — a deposit bag or an .html file of an empty library is the
  // same empty site in a different wrapper.
  await expect(dialog.getByRole("button", { name: /deposit a copy/i })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: /one .*\.html.* file/i })).toHaveCount(0);
});

test("forking an example clears the refusal — the destinations come back", async ({ page }) => {
  // The other half of the claim: the refusal is about the library's CONTENT, not a dead screen. If
  // this passed while the first test passed against a permanently-disabled chooser, the feature would
  // be indistinguishable from "publish is broken".
  await page.goto(`/studio/${HASH_EDITOR}`);
  await page.getByRole("button", { name: /^keep a copy$/i }).click();
  await expect(page).toHaveURL(/voynich-rosettes-copy/);

  // keepCopy lands on the copy's EXHIBIT, and `.publish-signal` lives in the object-editor header
  // (App.svelte), so step into the object. The copy carries its source's object ids verbatim
  // (`objects: ex.objects.map((o) => ({ ...o }))`, App.svelte:931) — hence the same `ex-voynich.o9`.
  await page.goto(`/studio/#/voynich-rosettes-copy/o/ex-voynich.o9`);
  await page.locator(".publish-signal").click();
  const skip = page.getByRole("button", { name: /skip for now/i });
  if (await skip.isVisible().catch(() => false)) await skip.click();

  const dialog = page.getByRole("dialog", { name: "Publish" });
  await expect(dialog.getByRole("heading", { name: /publish your library/i })).toBeVisible();
  // All four destinations come back, and one of them arrives pre-selected from the probe.
  await expect(dialog.locator("[data-destination]")).toHaveCount(4);
  await expect(dialog.locator("[data-destination]").filter({ hasText: "Recommended" })).toHaveCount(1);
});
