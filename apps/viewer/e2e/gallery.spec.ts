import { test, expect } from "@playwright/test";
import { goOffline } from "./offline.js";

// Archie-a897 / UX-AUDIT-viewer-browse V6/V7/V20/V21 — the gallery inherits Studio's LibraryHome
// decisions: search spans exhibits AND images, covers resolve, the wall opens dense.

test.describe("the gallery", () => {
  test.beforeEach(async ({ page }) => {
    await goOffline(page);
    await page.goto("./");
    await expect(page.locator("a.card").first()).toBeVisible();
  });

  test("a tree-relative cover resolves against the published tree (V7)", async ({ page }) => {
    // The audit first read this as "the exhibit declares no cover". It doesn't: the cover WAS
    // declared and on disk, and the src was a tree-relative ref ("screenshots/assets/...") emitted
    // into a page served from a different depth, so it 404'd. `publishedAssetUrl` anchors it.
    //
    // The seed's `screenshots` exhibit is the only one with a LOCAL cover — every other sample points
    // at a remote IIIF service — so it is both the regression case and the one cover this offline
    // suite can prove actually decodes.
    const srcs = await page.locator("img.cover").evaluateAll((els) =>
      els.map((e) => (e as HTMLImageElement).getAttribute("src") ?? ""),
    );
    expect(srcs.length).toBeGreaterThan(0);

    // No src may be a bare tree-relative ref — that is the bug's exact signature.
    for (const s of srcs) {
      expect(s, `cover src must be absolute or root-anchored, got ${s}`).toMatch(/^([a-z][a-z0-9+.-]*:|\/\/|\/)/i);
    }

    const local = srcs.find((s) => s.includes("/published/"));
    expect(local, "the seed's local cover should be anchored under /published/").toBeTruthy();

    // Anchored is not the same as loading — assert the bytes actually decoded.
    const decoded = await page.locator(`img.cover[src="${local}"]`).evaluate(
      (e) => (e as HTMLImageElement).complete && (e as HTMLImageElement).naturalWidth > 0,
    );
    expect(decoded, `${local} did not decode`).toBe(true);
  });

  test("search reaches images as well as exhibits (V6)", async ({ page }) => {
    // Before the fix the lens was an either/or toggle, so a title search could not see images at all.
    // Searching shows BOTH groups, each with its own count, and hides the lens while it does.
    await page.locator("input.search").fill("ros");
    const heads = page.locator("h2.group-head");
    await expect(heads).toHaveCount(2);
    await expect(heads.nth(0)).toHaveText(/^Exhibits \(\d+\)$/);
    await expect(heads.nth(1)).toHaveText(/^Images \(\d+\)$/);

    // A term in the seed that matches on both sides, so this fails if either half stops being searched.
    await expect(heads.nth(0)).not.toHaveText("Exhibits (0)");
    await expect(heads.nth(1)).not.toHaveText("Images (0)");
  });

  test("the image wall opens compact (V20)", async ({ page }) => {
    // Comfortable was the default; on a wall whose whole job is "show me everything at once" that
    // made the first screen show a handful of tiles. Compact is the arrival state now.
    await page.locator(".views button", { hasText: "All images" }).click();
    await expect(page.locator("a.tile").first()).toBeVisible();

    const on = page.locator(".density button.on");
    await expect(on).toHaveCount(1);
    await expect(on).toHaveText("Compact");
    await expect(on).toHaveAttribute("aria-pressed", "true");
  });
});
