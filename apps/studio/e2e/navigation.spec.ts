import { test, expect, type Page } from "@playwright/test";

// Back/forward navigation gate (Archie-d80f). Drives the REAL Studio App through a real browser
// history so the ADR-0024 place machinery — App.svelte `syncUrl` / `applyPlace` / `onLocationChange`
// over place.ts's hash grammar — is exercised the one way vitest's pure-module posture can't: a
// mounted App + genuine popstate/hashchange traversal. Covers the two residual non-blocking hazards
// the ticket named: rapid-traversal overlap, and `committedUrl` claiming an unreached URL if
// `gotoPlace` throws.
//
// Fixture the walk leans on (verified in apps/studio/src/seed-data.ts): the bundled example exhibit
// "The Rosettes", slug `voynich-rosettes`, is a SINGLE-object exhibit whose one object is `o9`.
const SLUG = "voynich-rosettes";
const OBJ = "o9";
const HASH_LIBRARY = "#/";
const HASH_OVERVIEW = `#/${SLUG}`;
const HASH_EDITOR = `#/${SLUG}/o/${OBJ}`;

// place.ts's URL grammar (the shapes assertions must land on): library `#/`, overview `#/{slug}`,
// editor `#/{slug}/o/{objectId}`. Kept here so scenario 1 asserts the SHAPE, not only the fixture value.
const GRAMMAR = {
  overview: /^#\/[^/]+$/,
  editor: /^#\/[^/]+\/o\/[^/]+$/,
};

// --- Screen markers: role/label selectors, one per screen, mutually exclusive. ---
//   library : the "The Rosettes" exhibit CARD (LibraryHome only)
//   overview: the "Overview mode" grid/list toggle group (ExhibitOverview only)
//   editor  : the "Exhibit objects" filmstrip nav (App editor header only)
// (A bare heading "The Rosettes" is shared by overview AND editor headers, so it can't distinguish
// them; these three are each single-screen.)
const marker = (page: Page) => ({
  libraryCard: page.locator("button.card").filter({ hasText: "The Rosettes" }),
  overviewGroup: page.getByRole("group", { name: "Overview mode" }),
  editorNav: page.getByRole("navigation", { name: "Exhibit objects" }),
  // The degrade/fallback notice (App.svelte noticeFor → .collab-note). Matched by a stable slice of its
  // copy that dodges the curly apostrophe in "isn’t".
  degradeNotice: page.getByText(/in this library anymore/),
  openObject: page.locator(`[data-plate-id="${OBJ}"]`),
});

const hashOf = (page: Page) => page.evaluate(() => location.hash);

async function expectLibrary(page: Page) {
  const m = marker(page);
  await expect(m.libraryCard.first()).toBeVisible();
  await expect(m.overviewGroup).toBeHidden();
  await expect(m.editorNav).toBeHidden();
  expect(await hashOf(page)).toBe(HASH_LIBRARY);
}
async function expectOverview(page: Page) {
  const m = marker(page);
  await expect(m.overviewGroup).toBeVisible();
  await expect(m.editorNav).toBeHidden();
  expect(await hashOf(page)).toBe(HASH_OVERVIEW);
}
async function expectEditor(page: Page) {
  const m = marker(page);
  await expect(m.editorNav).toBeVisible();
  await expect(m.overviewGroup).toBeHidden();
  expect(await hashOf(page)).toBe(HASH_EDITOR);
}

// The core invariant the rapid-traversal scenario guards: WHEREVER the app settles, the URL in the
// address bar and the rendered screen name the SAME place (committedUrl is never torn from the view).
// This deliberately does NOT predict the landing place — browsers are free to coalesce a burst of
// synchronous history.go() calls, so the honest assertion is consistency, not a fixed end-state.
async function expectConsistent(page: Page) {
  // Let the last async gotoPlace settle before reading the committed URL.
  await page.waitForTimeout(500);
  const h = await hashOf(page);
  if (h === HASH_LIBRARY) await expectLibrary(page);
  else if (GRAMMAR.editor.test(h)) await expectEditor(page);
  else await expectOverview(page);
  return h;
}

// Collect uncaught exceptions (pageerror) and app-origin console errors. pageerror is the signature of
// the re-entrancy hazards (a concurrent applyPlace / a gotoPlace throw surfaces as an uncaught rejection
// or throw). Console errors are filtered to drop browser resource noise — "The Rosettes" streams folios
// from a remote IIIF service, so tile/CORS/4xx load failures are expected and are NOT app faults.
const RESOURCE_NOISE =
  /Failed to load resource|net::ERR|ERR_|status of 4|status of 5|IIIF|openseadragon|CORS|Content Security|favicon|preload/i;

function trackErrors(page: Page) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !RESOURCE_NOISE.test(m.text())) consoleErrors.push(m.text());
  });
  return { pageErrors, consoleErrors };
}

async function boot(page: Page) {
  await page.goto("/studio/");
  await expectLibrary(page);
}

// Library → overview → editor, asserting URL + screen agree at every rung.
async function walkToEditor(page: Page) {
  const m = marker(page);
  await m.libraryCard.first().click();
  await expectOverview(page);
  await m.openObject.click();
  await expectEditor(page);
}

test.describe("Studio place navigation (Archie-d80f)", () => {
  test("1. forward walk: library → overview → editor, URL grammar + screen agree", async ({ page }) => {
    const errs = trackErrors(page);
    await boot(page);

    await marker(page).libraryCard.first().click();
    await expectOverview(page);
    expect(await hashOf(page)).toMatch(GRAMMAR.overview);

    await marker(page).openObject.click();
    await expectEditor(page);
    expect(await hashOf(page)).toMatch(GRAMMAR.editor);

    expect(errs.pageErrors, `uncaught errors: ${errs.pageErrors.join(" | ")}`).toEqual([]);
    expect(errs.consoleErrors, `console errors: ${errs.consoleErrors.join(" | ")}`).toEqual([]);
  });

  test("2. back twice unwinds editor → overview → library; forward twice re-traverses", async ({ page }) => {
    const errs = trackErrors(page);
    await boot(page);
    await walkToEditor(page);

    await page.goBack();
    await expectOverview(page);
    await page.goBack();
    await expectLibrary(page);

    await page.goForward();
    await expectOverview(page);
    await page.goForward();
    await expectEditor(page);

    expect(errs.pageErrors, errs.pageErrors.join(" | ")).toEqual([]);
    expect(errs.consoleErrors, errs.consoleErrors.join(" | ")).toEqual([]);
  });

  test("3. rapid back/forward: end state is consistent, no error, no uncaught throw", async ({ page }) => {
    const errs = trackErrors(page);
    await boot(page);
    await walkToEditor(page); // history: [library, overview, editor], cursor at editor

    // Fire several traversals in ONE synchronous batch — the popstate+hashchange re-entrancy stress:
    // multiple gestures land before the app's async gotoPlace can settle. Wherever it comes to rest,
    // URL and screen must agree.
    await page.evaluate(() => {
      history.go(-1);
      history.go(-1);
      history.go(1);
    });
    const landedA = await expectConsistent(page);

    // A second burst in the opposite direction — same invariant.
    await page.evaluate(() => {
      history.go(1);
      history.go(-1);
      history.go(1);
    });
    const landedB = await expectConsistent(page);

    // Bookend with a settled, awaited traversal to prove the machinery still tracks after the bursts.
    await page.goto("/studio/");
    await expectLibrary(page);
    console.log(`[rapid-traversal] settled at ${landedA} then ${landedB}`);

    expect(errs.pageErrors, `uncaught during rapid traversal: ${errs.pageErrors.join(" | ")}`).toEqual([]);
    expect(errs.consoleErrors, `console errors: ${errs.consoleErrors.join(" | ")}`).toEqual([]);
  });

  test("4. manual hash edit: valid place navigates; nonsense slug degrades to library WITH notice, URL honest", async ({ page }) => {
    const errs = trackErrors(page);
    await boot(page);

    // A hand-typed VALID overview place drives the view there (hashchange → applyPlace).
    await page.evaluate((h) => { location.hash = h; }, HASH_OVERVIEW);
    await expectOverview(page);

    // A hand-typed NONSENSE slug can't resolve: ADR-0024 degrades UP to the library and NAMES what was
    // missing. The committedUrl/gotoPlace-throws hazard: the address bar must NOT keep claiming the
    // unreachable slug — it must reflect where the app actually landed (`#/`).
    await page.evaluate(() => { location.hash = "#/no-such-exhibit-xyz"; });
    const notice = marker(page).degradeNotice;
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("no-such-exhibit-xyz"); // the missing slug is named in the notice
    await expectLibrary(page); // includes hash === "#/": the bar does not claim the unreachable URL
    expect(await hashOf(page)).not.toBe("#/no-such-exhibit-xyz");

    expect(errs.pageErrors, errs.pageErrors.join(" | ")).toEqual([]);
    expect(errs.consoleErrors, errs.consoleErrors.join(" | ")).toEqual([]);
  });

  test("5. no double-transition: one back moves exactly one rung", async ({ page }) => {
    const errs = trackErrors(page);
    await boot(page);
    await walkToEditor(page);

    // A single back must land on the immediate parent (overview), not skip a rung — a skip would mean a
    // phantom extra history entry was pushed during a prior traversal.
    await page.goBack();
    await expectOverview(page);

    // One more back reaches library. Reaching it in EXACTLY two backs from the editor proves the walk
    // pushed exactly two entries (overview, editor) — no duplicates.
    await page.goBack();
    await expectLibrary(page);

    // Forward returns cleanly to the same overview (round-trips, no drift).
    await page.goForward();
    await expectOverview(page);

    expect(errs.pageErrors, errs.pageErrors.join(" | ")).toEqual([]);
    expect(errs.consoleErrors, errs.consoleErrors.join(" | ")).toEqual([]);
  });
});
