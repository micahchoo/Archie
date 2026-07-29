import { test, expect, type Page } from "@playwright/test";

// THE HOME CARD (Q-15) — the return visit, driven.
//
// The claim: once a library has a home, opening Publish states where it lives and offers ONE button,
// rather than re-posing the destination question. And "Change where this publishes…" genuinely
// disowns the home rather than merely navigating away from it.
//
// Driven rather than unit-tested because every one of those is prop WIRING and routing, which
// svelte-check is structurally blind to (.claude/rules/svelte-no-typecheck-net.md) and which the
// studio suite has no mount harness for.

const TEMPLATE_HASH = "#/voynich-rosettes/o/ex-voynich.o9";
const COPY_HASH = "#/voynich-rosettes-copy/o/ex-voynich.o9";
const IDENTITY_KEY = "archie.displayName.v1";
// The key `deploy/remembered.ts` writes. Hard-coded rather than imported: this file runs in Node
// against a built app, and a drifted key must show up as a RED test here, not as a silent skip.
const HOME_KEY = "archie:deploy:archie-studio-library";
const HOME_URL = "https://e2e-tester.github.io/rosettes/";

test.setTimeout(90_000);

/** Seed the identity AND a remembered home, before any app script runs. */
async function seedHome(page: Page, publishedAt: number | null) {
  await page.addInitScript(
    ([idKey, homeKey, url, stamp]) => {
      try {
        localStorage.setItem(idKey as string, "E2E Tester");
        localStorage.setItem(
          homeKey as string,
          JSON.stringify({
            target: { owner: "e2e-tester", repo: "rosettes", branch: "gh-pages" },
            url,
            ...(stamp === null ? {} : { publishedAt: stamp }),
          }),
        );
      } catch { /* private mode */ }
    },
    [IDENTITY_KEY, HOME_KEY, HOME_URL, publishedAt] as const,
  );
}

async function openPublishOnAFork(page: Page) {
  await page.goto(`/studio/${TEMPLATE_HASH}`);
  await page.getByRole("button", { name: /^Keep a copy$/i }).click();
  await expect(page).toHaveURL(/voynich-rosettes-copy/);
  await page.goto(`/studio/${COPY_HASH}`);
  await page.locator(".publish-signal").click();
  const skip = page.getByRole("button", { name: /skip for now/i });
  if (await skip.isVisible().catch(() => false)) await skip.click();
  return page.getByRole("dialog", { name: "Publish" });
}

test("a library with a home opens on the sheet, not on the destination question", async ({ page }) => {
  await seedHome(page, Date.now() - 2 * 24 * 60 * 60 * 1000); // two days ago
  const dialog = await openPublishOnAFork(page);

  // The sheet, addressed by its primary action rather than by prose.
  await expect(dialog.locator('[data-action="publish-changes"]')).toBeVisible();
  await expect(dialog.getByRole("heading", { name: /publish your changes/i })).toBeVisible();

  // It STATES the home instead of asking for one. The negative half is the load-bearing one: a sheet
  // that also drew the destination rows would leave the redesign a no-op and this test would pass on
  // the positive assertions alone.
  await expect(dialog.locator(`[data-home-url="${HOME_URL}"]`)).toHaveText(HOME_URL);
  await expect(dialog.locator("[data-destination]")).toHaveCount(0);

  // And it says when, in the author's terms.
  await expect(dialog.locator("[data-last-published]")).toContainText(/2 days ago/i);
});

test("a home written before publishedAt existed says nothing, never 'never'", async ({ page }) => {
  // Every record written before Q-15 lacks the timestamp. An author who has published a dozen times
  // must not be told they never have — absence renders as absence.
  await seedHome(page, null);
  const dialog = await openPublishOnAFork(page);

  await expect(dialog.locator('[data-action="publish-changes"]')).toBeVisible();
  await expect(dialog.locator(`[data-home-url="${HOME_URL}"]`)).toHaveText(HOME_URL);
  await expect(dialog.locator("[data-last-published]")).toHaveCount(0);
  // Whatever else it says, it must not claim the library has never been published.
  await expect(dialog.getByText(/never/i)).toHaveCount(0);
});

test("Change where this publishes… disowns the home and returns to the destination question", async ({ page }) => {
  await seedHome(page, Date.now() - 60_000);
  const dialog = await openPublishOnAFork(page);
  await expect(dialog.locator('[data-action="publish-changes"]')).toBeVisible();

  await dialog.locator('[data-action="change-home"]').click();

  // The setup flow is back, with its rows.
  await expect(dialog.getByRole("heading", { name: /where should this library live/i })).toBeVisible();
  await expect(dialog.locator("[data-destination]")).toHaveCount(3);
  await expect(dialog.locator('[data-action="publish-changes"]')).toHaveCount(0);

  // DISOWNED, not merely navigated past. The store is the thing that decides which surface the NEXT
  // visit gets, so a version of this that only flipped a component flag would look identical here and
  // spring back to the sheet on reopen — which is what this assertion catches.
  const stored = await page.evaluate((k) => localStorage.getItem(k), HOME_KEY);
  expect(stored, "the home must be cleared from storage, not just skipped in the UI").toBeNull();
});
