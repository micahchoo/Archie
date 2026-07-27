import { test, expect, type Page } from "@playwright/test";
import { goOffline } from "./offline.js";

// V106 / Archie-9eeb — the finder said WHAT it found and never WHERE it was.
//
// This spec exists because the capability was twice recorded as delivered without this surface ever
// being touched. `Archie-3ea1` and `Archie-99b1` both closed V106's substrate honestly — the address
// grammar parses and writes every rung — and `SearchOverlay.svelte` went on rendering a bare body and
// some tags. So the assertions below are deliberately about the RENDERED DOM of the running app, not
// about `locateNotes`. `search-index.test.ts` proves the projection; only a driven browser proves a
// reader can see it. (.claude/rules/svelte-no-typecheck-net.md: a gate proves the code COMPILED,
// never that the output CARRIES anything.)
//
// `screenshots` deliberately, for three reasons at once: its images are LOCAL so this runs hermetic;
// it is a NARRATIVE, so it exercises the section rung as well as the object rung; and every one of
// its 21 sections activates a DISTINCT canvas, so `locateNotes`'s sole-occupant rule fires for every
// note. Its notes also live only on READING pages, which makes the test stronger — a locus that
// stopped at the base annotation page would place none of them.
//
// Every expected string is read from the published manifest at runtime. A literal object label would
// rot the next time the tree is regenerated and would then assert nothing while looking green.

interface PlacedNote {
  ulid: string;
  text: string;
  /** The authored label of the canvas this note targets — what the locus line must say. */
  canvasLabel: string;
  /** The title of the section that activates that canvas — the narrative rung of the locus. */
  sectionTitle: string;
}

/** Every note in the published tree, paired with the place the finder is required to name. */
async function placedNotes(baseURL: string): Promise<{ notes: PlacedNote[]; total: number }> {
  const res = await fetch(new URL("published/screenshots/manifest.json", baseURL));
  const manifest = (await res.json()) as {
    items: Array<{ id: string; label?: Record<string, string[]>; annotations?: Array<{ items?: Array<Record<string, unknown>> }> }>;
    structures?: Array<{ label?: Record<string, string[]>; items?: Array<string | { id: string }> }>;
  };
  const first = (l?: Record<string, string[]>): string => (l ? (Object.values(l)[0]?.[0] ?? "") : "");

  // canvas id → section title. The spine may in principle revisit a canvas; if it did here, the app
  // would (correctly) name no section, so assert the 1:1 the fixture actually has rather than trust it.
  const sectionOfCanvas = new Map<string, string>();
  const seen = new Set<string>();
  for (const s of manifest.structures ?? []) {
    for (const it of s.items ?? []) {
      const canvasId = (typeof it === "string" ? it : it.id).split("#")[0]!;
      if (seen.has(canvasId)) sectionOfCanvas.delete(canvasId); // two sections ⇒ no sole owner
      else sectionOfCanvas.set(canvasId, first(s.label));
      seen.add(canvasId);
    }
  }

  const notes: PlacedNote[] = [];
  const ids = new Set<string>();
  for (const canvas of manifest.items) {
    const canvasLabel = first(canvas.label);
    const sectionTitle = sectionOfCanvas.get(canvas.id) ?? "";
    for (const page of canvas.annotations ?? []) {
      for (const raw of page.items ?? []) {
        ids.add(String(raw.id));
        const ulid = String(raw.id).split("/annotations/")[1]?.split("/")[0];
        const body = Array.isArray(raw.body) ? raw.body[0] : raw.body;
        const text = (body as { value?: string } | undefined)?.value ?? "";
        if (!ulid || !canvasLabel || !sectionTitle) continue;
        notes.push({ ulid, text, canvasLabel, sectionTitle });
      }
    }
  }
  if (notes.length === 0) throw new Error("no placed notes in the published screenshots manifest");
  return { notes, total: ids.size };
}

/**
 * Open the exhibit and its finder, the way a reader does — click the visible trigger.
 *
 * Waits on `.finder-input`, which the overlay itself renders, before returning. The overlay is behind
 * a lazy `import()` (`ExhibitView.svelte:31`, `SearchOverlayLazy`), so anything measured before it
 * hydrates measures an empty panel — and a count taken there reads 0 while looking like a finding
 * (.claude/rules/playwright-count-does-not-wait.md).
 */
async function openFinder(page: Page): Promise<void> {
  await page.goto("./#/screenshots");
  const trigger = page.locator("button.finder-trigger");
  await expect(trigger).toBeVisible({ timeout: 30_000 });
  await trigger.click();
  await expect(page.locator("input.finder-input")).toBeVisible({ timeout: 30_000 });
}

test.describe("a finder result says where it lives (V106)", () => {
  test("a hit names the object it sits on, and the section that shows it", async ({ page, baseURL }) => {
    const { notes } = await placedNotes(baseURL!);
    // A note with enough prose to address a single row by its own words.
    const probe = notes.find((n) => n.text.length > 24)!;
    await goOffline(page);
    await openFinder(page);

    // Query the note's own words, then address the row by its body text. Filtering by the text the
    // row must contain is what stops this from asserting against whichever row happened to rank first.
    const snippet = probe.text.replace(/\s+/g, " ").slice(0, 40);
    await page.locator("input.finder-input").fill(snippet);
    const row = page.locator(".finder-results li").filter({ hasText: snippet }).first();
    await expect(row).toBeVisible();

    // The object rung: the canvas's OWN authored label, read from the manifest above.
    await expect(row.locator(".locus-object")).toHaveText(probe.canvasLabel);
    // The narrative rung: the section that activates it. `toHaveText` is exact, so a locus that
    // silently fell back to the object name for both rungs fails here rather than passing.
    await expect(row.locator(".locus-section")).toHaveText(probe.sectionTitle);
  });

  test("EVERY result carries a locus — none is left unplaced", async ({ page, baseURL }) => {
    const { total } = await placedNotes(baseURL!);
    await goOffline(page);
    await openFinder(page);

    // An empty query is the browse state: every note in the exhibit, across every reading. Both counts
    // are asserted against a denominator READ FROM THE PUBLISHED TREE, so a fixture that gains or
    // loses notes moves the expectation instead of quietly weakening it. `toHaveCount` auto-waits;
    // a bare `count()` here would read 0 against the not-yet-hydrated island and, branched on, would
    // turn this test green while it measured nothing.
    await expect(page.locator(".finder-results .result")).toHaveCount(total);
    await expect(page.locator(".finder-results .result-locus")).toHaveCount(total);
    await expect(page.locator(".finder-results .locus-object")).toHaveCount(total);
    await expect(page.locator(".finder-results .locus-section")).toHaveCount(total);
  });

  test("the locus names are the exhibit's real places, not ids", async ({ page, baseURL }) => {
    // The failure this guards is the plausible one: rendering `where.objectId` instead of its label.
    // Counts alone cannot see it — 87 ULIDs count exactly like 87 names.
    const { notes } = await placedNotes(baseURL!);
    const realLabels = new Set(notes.map((n) => n.canvasLabel));
    await goOffline(page);
    await openFinder(page);
    await expect(page.locator(".finder-results .locus-object").first()).toBeVisible();

    const rendered = await page.locator(".finder-results .locus-object").allTextContents();
    const strays = [...new Set(rendered)].filter((t) => !realLabels.has(t));
    expect(strays, `locus text not found among the exhibit's canvas labels: ${strays.join(", ")}`).toEqual([]);
    // ...and the set actually spans the exhibit, so this cannot pass on one label repeated 87 times.
    expect(new Set(rendered).size).toBeGreaterThan(5);
  });

  test("activating a hit lands on that note's own rung, not the object's top", async ({ page, baseURL }) => {
    const { notes } = await placedNotes(baseURL!);
    const probe = notes.find((n) => n.text.length > 24)!;
    await goOffline(page);
    await openFinder(page);

    const snippet = probe.text.replace(/\s+/g, " ").slice(0, 40);
    await page.locator("input.finder-input").fill(snippet);
    const row = page.locator(".finder-results li").filter({ hasText: snippet }).first();
    await expect(row).toBeVisible();
    await row.locator("button.result").click();

    // The address is the artifact. `arriveAtNote` is the one route out of the finder, and it feeds
    // ExhibitView's single `locus` derivation (`:206`) — so the bar naming this note's rung is proof
    // the finder handed off a note and not merely an object. `#/screenshots` alone (the exhibit) or
    // `#/screenshots/o/<id>` (the object's top) are exactly the two wrong answers.
    await expect(page).toHaveURL(new RegExp(`#/screenshots/a/${probe.ulid}(\\?|$)`), { timeout: 30_000 });
    // And the note itself is open, not just addressed.
    await expect(page.locator("body")).toContainText(probe.text.slice(0, 40), { timeout: 30_000 });
  });
});
