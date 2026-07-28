import { test, expect, type Page } from "@playwright/test";

// The export surface (Archie-c367) — driven, because the thing under test is prop WIRING and hit
// targets, which svelte-check is structurally blind to (.claude/rules/svelte-no-typecheck-net.md:
// a prop can be typed and not bound, and nothing static complains).
//
// The four claims, one test each:
//   1. the probe's recommendation arrives PRE-SELECTED, and it is a destination that actually fits;
//   2. an unavailable destination is GREYED WITH ITS REASON and is NEVER silently swapped — the
//      centrepiece, and the one red-greened by forcing `showDirectoryPicker` away;
//   3. switching quality re-states every number (the projection cache is keyed on the tier, so a
//      control that moves nothing on screen is a control the engine never heard);
//   4. the embed snippet is on the success panel, where a URL exists — and nowhere earlier.
//
// The fixture is the same one publish-empty.spec.ts uses: fork a seeded example with "Keep a copy",
// which is the only way to get a publishable library without inventing one.

const TEMPLATE_HASH = "#/voynich-rosettes/o/ex-voynich.o9";
const COPY_HASH = "#/voynich-rosettes-copy/o/ex-voynich.o9";
const IDENTITY_KEY = "archie.displayName.v1";

test.setTimeout(90_000);

/** Pre-seed the identity so the publish click never meets the name prompt. */
async function seedIdentity(page: Page) {
  await page.addInitScript((key) => {
    try { localStorage.setItem(key, "E2E Tester"); } catch { /* private mode */ }
  }, IDENTITY_KEY);
}

/** Remove the folder picker BEFORE any script runs, so `folderSinkSupported()` is false — the
 *  Firefox/Safari condition, reproduced in Chromium. This is the injection the greyed-row test
 *  red-greens against. */
async function removeFolderPicker(page: Page) {
  await page.addInitScript(() => {
    // @ts-expect-error non-optional in the lib types, deletable at runtime.
    delete window.showDirectoryPicker;
  });
}

/** Fork the seeded example into a real, publishable library and open the Publish surface on it. */
async function openPublishOnAFork(page: Page) {
  await page.goto(`/studio/${TEMPLATE_HASH}`);
  await page.getByRole("button", { name: /^Keep a copy$/i }).click();
  await expect(page).toHaveURL(/voynich-rosettes-copy/);
  await page.goto(`/studio/${COPY_HASH}`);
  await page.locator(".publish-signal").click();
  const skip = page.getByRole("button", { name: /skip for now/i });
  if (await skip.isVisible().catch(() => false)) await skip.click();
  const dialog = page.getByRole("dialog", { name: "Publish" });
  await expect(dialog.getByRole("heading", { name: /publish your library/i })).toBeVisible();
  return dialog;
}

test("the probe's recommendation arrives pre-selected, on a destination that fits", async ({ page }) => {
  await seedIdentity(page);
  const dialog = await openPublishOnAFork(page);

  // The list itself: all four destinations, always. `toHaveCount` waits, so this cannot read 0 against
  // an un-rendered surface (.claude/rules/playwright-count-does-not-wait.md).
  await expect(dialog.locator("[data-destination]")).toHaveCount(4);

  // Exactly one row carries the Recommended badge, and it is the checked one. Keyed on the badge
  // rather than on a position, so re-ordering the list cannot make this pass by accident.
  const recommended = dialog.locator("[data-destination]").filter({ hasText: "Recommended" });
  await expect(recommended).toHaveCount(1);
  await expect(recommended.getByRole("radio")).toBeChecked();
  // A pre-selected row that does not fit would be the silent swap wearing a different hat.
  await expect(recommended).toHaveAttribute("data-available", "true");

  // And the recommendation is explained in the author's own numbers, not just badged.
  await expect(dialog.locator(".rec-why")).not.toBeEmpty();

  // Publish is live on it.
  await expect(dialog.getByRole("button", { name: "Publish", exact: true })).toBeEnabled();
});

test("an unavailable destination is greyed WITH ITS REASON, and nothing is swapped in for it", async ({ page }) => {
  // THE CENTREPIECE. Before this ticket, a browser with no folder picker turned "to a local folder"
  // into a silent .zip download — two buttons, one artifact, no explanation. Red-green: with
  // `showDirectoryPicker` present this test cannot fail (the rows are available), which is exactly
  // why the injection is the setup rather than an afterthought.
  await seedIdentity(page);
  await removeFolderPicker(page);

  const downloads: string[] = [];
  page.on("download", (d) => downloads.push(d.suggestedFilename()));

  const dialog = await openPublishOnAFork(page);
  await expect(dialog.locator("[data-destination]")).toHaveCount(4);

  for (const id of ["folder", "object-storage"]) {
    const row = dialog.locator(`[data-destination="${id}"]`);
    // STILL DRAWN. The failure this guards against is a row that quietly disappears.
    await expect(row).toBeVisible();
    await expect(row).toHaveAttribute("data-available", "false");
    // Not selectable — a disabled radio, not a live one that then does something else.
    await expect(row.getByRole("radio")).toBeDisabled();
    // AND IT SAYS WHY, in words the author can act on (Archie-c85f's desktop-or-Chrome reason).
    await expect(row.locator(".d-reason")).toContainText(/desktop app or Chrome/i);
  }

  // Nothing was substituted: no download fired, and the checked row is not one of the two refusals.
  expect(downloads, "an unavailable destination must not quietly produce a file").toEqual([]);
  const checked = dialog.locator("[data-destination]").filter({ has: page.locator("input:checked") });
  await expect(checked).toHaveCount(1);
  await expect(checked).toHaveAttribute("data-available", "true");

  // Clicking the greyed row's label changes nothing — the selection stays where it was.
  const before = await checked.getAttribute("data-destination");
  await dialog.locator('[data-destination="folder"]').click({ force: true });
  await expect(dialog.locator("[data-destination]").filter({ has: page.locator("input:checked") }))
    .toHaveAttribute("data-destination", before!);
  expect(downloads).toEqual([]);
});

test("switching quality re-states the numbers on the destinations", async ({ page }) => {
  await seedIdentity(page);
  const dialog = await openPublishOnAFork(page);

  const zipFacts = dialog.locator('[data-destination="zip"] .d-facts');
  const ghFacts = dialog.locator('[data-destination="github-pages"] .d-facts');
  await expect(zipFacts).toBeVisible();

  const archivalRadio = dialog.getByRole("radio", { name: /Archival/ });
  const webRadio = dialog.getByRole("radio", { name: /^Web/ });

  await archivalRadio.check();
  await expect(archivalRadio).toBeChecked();
  const archivalZip = (await zipFacts.textContent())!.trim();
  const archivalGh = (await ghFacts.textContent())!.trim();
  const archivalTierSize = (await dialog.locator(".tier .t-size").first().textContent())!.trim();
  expect(archivalZip, "the zip row must state some numbers to compare").not.toBe("");

  await webRadio.check();
  await expect(webRadio).toBeChecked();
  // The web tier re-encodes every image at 2,400 px, so the same destinations report different bytes.
  // If the tier control moved nothing on screen, it moved nothing in the engine either — the
  // projection cache is keyed on the tier (publish-flows `cachedSiteTier`).
  await expect(zipFacts).not.toHaveText(archivalZip);
  await expect(ghFacts).not.toHaveText(archivalGh);
  expect(archivalTierSize).not.toBe("");

  // And back — the control is a real two-way choice, not a one-way door.
  await archivalRadio.check();
  await expect(zipFacts).toHaveText(archivalZip);
});

test("the embed snippet is on the success panel, not on the chooser", async ({ page }) => {
  // The decided placement (Archie-c367, 2026-07-27): the snippet is meaningless until a URL exists.
  // The negative half is the load-bearing one — a snippet that also sat on the chooser would make the
  // move a no-op, and this test would pass either way without it.
  await seedIdentity(page);
  // Remove the OS save picker so the zip save takes the OPFS-staged sink, which ends in an
  // `<a download>` anchor — the only sink Playwright's download API can intercept (same reasoning as
  // loop.spec.ts's `installInit`). The FOLDER picker is deliberately left in place here, so this test
  // runs against the fully-available option set.
  await page.addInitScript(() => {
    // @ts-expect-error non-optional in the lib types, deletable at runtime.
    delete window.showSaveFilePicker;
  });

  const dialog = await openPublishOnAFork(page);
  await expect(dialog.getByRole("button", { name: /Put an exhibit inside another page/i })).toHaveCount(0);
  await expect(dialog.locator("pre.cmd")).toHaveCount(0);

  // Reach the success panel through the zip destination's own success screen instead of the GitHub
  // wizard (which needs a network push): the .archie.zip has no address, so its panel carries the
  // ?src= share form — the snippet appears the moment a URL is supplied there, which is the same
  // "a URL exists first" rule stated in the other direction.
  await dialog.getByRole("radio", { name: /One \.zip file/ }).check();
  await dialog.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: /share a working copy/i })).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    dialog.getByRole("button", { name: "Save copy" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.archie\.zip$/);

  const url = dialog.getByRole("textbox", { name: /Public URL of the uploaded/i });
  await expect(url).toBeVisible();
  // No URL yet ⇒ no snippet. That IS the rule.
  await expect(dialog.locator("pre.cmd")).toHaveCount(0);

  await url.fill("https://example.org/my-library.archie.zip");
  // Three blocks appear together: the share link, the web-component embed, and the iframe fallback.
  // Asserted on `pre.cmd` rather than on the raw text, because a <pre><code> nest matches a text
  // locator twice and the count would then be measuring the markup, not the feature.
  await expect(dialog.locator("pre.cmd").filter({ hasText: "<iframe" })).toHaveCount(1);
  await expect(dialog.locator("pre.cmd").filter({ hasText: "<archie-viewer" })).toHaveCount(1);
  // Three blocks, no more: share link, web component, iframe. The URL the author typed is carried
  // into two of them (the link itself, and the iframe that wraps the link) — asserted as 3 total
  // rather than as a per-block URL count, which would be measuring the composition rather than the
  // feature.
  await expect(dialog.locator("pre.cmd")).toHaveCount(3);
  await expect(dialog.locator("pre.cmd").filter({ hasText: "example.org%2Fmy-library" })).toHaveCount(2);
});
