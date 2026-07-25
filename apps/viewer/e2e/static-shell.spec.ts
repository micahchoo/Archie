import { test, expect } from "@playwright/test";
import { goOffline } from "./offline.js";

// Archie-c405 / UX-AUDIT-viewer-leaving V107/V108/V110 — what a reader without JavaScript, and what a
// crawler, actually receives.
//
// This is the spec that most needs BUILT output. The static shell is emitted from an
// `import.meta.glob` inside `getStaticPaths`; two earlier attempts used runtime fs reads and silently
// produced EMPTY object lists while the build stayed green. Nothing but measuring the shipped HTML
// caught it, which is exactly what this does.

test.describe("the page a crawler gets", () => {
  test.describe("with JavaScript off", () => {
    test.use({ javaScriptEnabled: false });

    for (const slug of ["voynich", "voynich-reading"]) {
      test(`${slug} has a readable body, not an empty island (V107)`, async ({ page }) => {
        const res = await page.goto(`./${slug}/`);
        expect(res?.status()).toBe(200);

        const shell = page.locator("#static-exhibit");
        await expect(shell).toBeVisible();
        await expect(shell.locator("h1")).not.toBeEmpty();

        // The exhibit's items, by name — the substantive claim. An earlier build emitted the heading
        // and an EMPTY list, and looked fine to anything counting elements rather than reading them.
        const items = shell.locator("li");
        expect(await items.count()).toBeGreaterThan(1);
        await expect(items.first()).not.toBeEmpty();

        // A body worth indexing, not a placeholder sentence.
        expect((await shell.innerText()).length).toBeGreaterThan(300);

        // V108: say plainly that the interactive version needs JS, rather than leaving a dead frame.
        await expect(page.locator("noscript")).toHaveCount(1);
      });
    }
  });

  test("the shell yields to the app once it hydrates", async ({ page }) => {
    // The shell is scaffolding for crawlers and no-JS readers; leaving it under a hydrated island
    // would double every heading for everyone else.
    await goOffline(page);
    await page.goto("./voynich/");
    await expect(page.locator("button.object").first()).toBeVisible();
    await expect(page.locator("#static-exhibit")).toHaveCount(0);
  });

  test("the archival page carries the narrative, not just the notes (V110)", async ({ page }) => {
    // ADR-0014's durable page had no concept of a section: a narrative exhibit's authored prose —
    // the argument the exhibit exists to make — was absent from the artifact meant to outlive the app.
    //
    // Asserted against `screenshots` deliberately: it is the one exhibit the seed's source zip OWNS,
    // so gen-published regenerates it every build. The other exhibits' archival pages are CARRIED —
    // stale committed output from an older publish — and would prove nothing about current code.
    const res = await page.goto("./published/screenshots/");
    expect(res?.status()).toBe(200);

    await expect(page.getByRole("heading", { name: "The narrative" })).toBeVisible();

    const sections = page.locator("section[id^='section-']");
    expect(await sections.count()).toBeGreaterThan(0);
    await expect(sections.first().locator("h3")).not.toBeEmpty();

    // The section rung of the cite ladder (ADR-0021) — the way back from the archive into the live
    // spine at the right place.
    const deep = page.locator("a[href*='#/screenshots/s/']");
    expect(await deep.count()).toBeGreaterThan(0);
  });
});
