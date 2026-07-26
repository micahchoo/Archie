import { test, expect, type Page } from "@playwright/test";
import { goOffline } from "./offline.js";

// Archie-9838 — `Reader.svelte`'s collapsed notes rail is `inert`, and the comment beside it claimed
// that removes it from the ACCESSIBILITY TREE as well as from tab order. The tab-order half was
// confirmed; the a11y-tree half did not reproduce under Playwright's `getByRole`, which still returned
// the note entry and still showed its text in the ARIA snapshot.
//
// THE INSTRUMENT WAS THE SUSPECT, and it should have been. `getByRole` and `toMatchAriaSnapshot` are
// Playwright's OWN accessibility model — a re-implementation over the DOM, not a read of the browser's
// computed tree. It does not model `inert`. The right instrument is Chromium's own computation, which
// is reachable over CDP as `Accessibility.getFullAXTree`; that is the same tree the browser hands to a
// screen reader, and the same one DevTools' Accessibility pane displays.
//
// This suite is what makes the comment in `Reader.svelte` a measured claim instead of an assumed one.
// It asserts the state of the rail's own subtree in the REAL tree, in both rail states, so a future
// change to the collapse mechanism (or a Chromium change) fails here rather than silently costing a
// screen-reader user a phantom panel.
//
// Do NOT "fix" a failure here by weakening the assertion to whatever the tooling reports. The claim is
// a user guarantee: a panel the sighted reader has collapsed must not be readable by anyone else. If
// the tree says otherwise, the hiding mechanism is what changes.

const RAIL = ".reader > aside";
const DIVIDER_COLLAPSE = ".resize-divider[aria-label='Resize notes'] button.collapse";

async function openReader(page: Page) {
  await goOffline(page);
  await page.goto("./#/voynich");
  await page.locator("button.object").first().click();
  await expect(page.locator(".reader main")).toBeVisible();
  await expect(page.locator(RAIL)).toBeVisible();
}

/**
 * Chromium's OWN accessibility tree for the page, flattened. `Accessibility.getFullAXTree` returns
 * every node the browser computed, each carrying `ignored` — which is how the browser says "this is
 * not exposed to assistive technology". A node being PRESENT in this list is not the same as it being
 * exposed; `ignored` is the property that matters, and it is precisely the distinction Playwright's
 * `getByRole` cannot make.
 */
async function axNodes(page: Page): Promise<Array<{ role: string; name: string; ignored: boolean }>> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Accessibility.enable");
  const { nodes } = (await cdp.send("Accessibility.getFullAXTree")) as unknown as {
    nodes: Array<{
      ignored?: boolean;
      role?: { value?: string };
      name?: { value?: string };
    }>;
  };
  await cdp.detach();
  return nodes.map((n) => ({
    role: String(n.role?.value ?? ""),
    name: String(n.name?.value ?? ""),
    ignored: n.ignored === true,
  }));
}

/** The rail's own content, identified by the accessible name its note list carries. */
const NOTE_LIST_NAME = "Notes on this item";

test.describe("Archie-9838 · the collapsed notes rail leaves the accessibility tree", () => {
  test("EXPANDED: the rail's note list is exposed (the control measurement)", async ({ page }) => {
    // Without this half the test below is unfalsifiable: "not in the tree" would also be satisfied by
    // a probe that never finds anything, a renamed list, or a fixture with no notes.
    await openReader(page);
    const nodes = await axNodes(page);
    const listed = nodes.filter((n) => n.name === NOTE_LIST_NAME && !n.ignored);
    expect(
      listed.length,
      `expected the expanded rail's note list ("${NOTE_LIST_NAME}") to be exposed; ` +
        `saw ${nodes.filter((n) => n.name === NOTE_LIST_NAME).length} matching node(s), ` +
        `${listed.length} of them exposed`,
    ).toBeGreaterThan(0);
  });

  test("COLLAPSED: the rail's note list is gone or ignored in Chromium's own tree", async ({ page }) => {
    // The rail collapses to `width: 0; overflow: hidden`, so its children keep layout boxes and report
    // `isVisible() === true`. `inert` is the ONLY thing doing the hiding — which is why this has to be
    // measured rather than assumed.
    await openReader(page);
    await page.locator(DIVIDER_COLLAPSE).click();
    await expect(page.locator(RAIL)).toHaveClass(/collapsed/);
    await expect(page.locator(RAIL)).toHaveAttribute("inert", /.*/);
    await page.waitForTimeout(300); // the rail animates its width

    const nodes = await axNodes(page);
    const exposed = nodes.filter((n) => n.name === NOTE_LIST_NAME && !n.ignored);
    expect(
      exposed.length,
      `the collapsed rail's note list is still EXPOSED in Chromium's accessibility tree ` +
        `(${exposed.length} node(s)). A screen-reader user can read a panel the sighted reader has ` +
        `collapsed, with no visual counterpart and no way to reach it by tab. If this fails, the fix is ` +
        `a hiding mechanism that measurably works (\`display: none\` is proven on this page — see ` +
        `Reader.svelte's \`.note-slot\`), not a weaker comment.`,
    ).toBe(0);
  });

  test("ATTRIBUTION: it is `inert` doing the hiding, not the zero-width collapse", async ({ page }) => {
    // The distinction is load-bearing, not pedantry. The rail collapses to `width: 0; overflow: hidden`,
    // and a zero-size subtree can be ignored by the a11y tree on its own — in which case the comment's
    // claim ABOUT `inert` would be unproven, and a future collapse animation that kept the box (a
    // translate, a clip-path) would silently expose the whole note list again with every test green.
    // So: collapse, strip `inert` at runtime, and re-read the browser's tree. If the list comes BACK,
    // `inert` is the mechanism and the comment is correct.
    await openReader(page);
    await page.locator(DIVIDER_COLLAPSE).click();
    await expect(page.locator(RAIL)).toHaveClass(/collapsed/);
    await page.waitForTimeout(300);

    await page.evaluate((sel) => document.querySelector(sel)?.removeAttribute("inert"), RAIL);
    await page.waitForTimeout(150);

    const nodes = await axNodes(page);
    const exposed = nodes.filter((n) => n.name === NOTE_LIST_NAME && !n.ignored);
    expect(
      exposed.length,
      `with \`inert\` removed the collapsed rail's note list is STILL not exposed, so \`inert\` is not ` +
        `what removed it — the zero-width collapse is. The comment in Reader.svelte attributes the ` +
        `guarantee to the wrong mechanism, and a collapse that keeps the box would lose it silently.`,
    ).toBeGreaterThan(0);
  });

  test("COLLAPSED: the rail is out of tab order too (the half that always reproduced)", async ({ page }) => {
    await openReader(page);
    await page.locator(DIVIDER_COLLAPSE).click();
    await expect(page.locator(RAIL)).toHaveClass(/collapsed/);

    const moved = await page.evaluate((sel) => {
      const btn = document.querySelector(`${sel} button`) as HTMLElement | null;
      if (!btn) return { found: false, moved: false };
      btn.focus();
      return { found: true, moved: document.activeElement === btn };
    }, RAIL);
    expect(moved.found, "no button inside the collapsed rail to try focusing").toBe(true);
    expect(moved.moved, "focus moved INTO the inert rail — it is reachable by keyboard").toBe(false);
  });
});
