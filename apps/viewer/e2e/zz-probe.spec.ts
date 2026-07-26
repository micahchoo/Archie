// TEMPORARY PROBE — delete before commit.
import { test, expect, type Page } from "@playwright/test";
import { goOffline, openPaintedNote, aHaloNote } from "./offline.js";

test("PROBE 1b — overlay DOM shape on the exhibit that actually paints", async ({ page, baseURL }) => {
  await goOffline(page);
  const note = await aHaloNote(baseURL!);
  await openPaintedNote(page, note.ulid);
  await page.waitForTimeout(2500);
  const dump = await page.evaluate(() => {
    const ids = [...document.querySelectorAll("*")].filter((e) => e.id && /region|overlay|frame/i.test(e.id)).map((e) => `${e.tagName}#${e.id}`);
    const svgKids = [...document.querySelectorAll("svg")].map((s) => `${s.id || "(noid)"}:${[...s.children].map((c) => c.tagName).join(",")}`);
    return { ids: ids.slice(0, 20), svgKids: svgKids.slice(0, 20) };
  });
  console.log("PROBE1b", JSON.stringify(dump, null, 1));
});

async function sweep(page: Page, slug: string, found: string[]): Promise<void> {
  await page.goto(`./#/${slug}`);
  await page.reload();
  await expect(page.locator("button.object").first()).toBeVisible();
  const nCards = await page.locator("button.object").count();
  found.push(`${slug}: ${nCards} objects`);
  for (let c = 0; c < nCards; c++) {
    await page.goto(`./#/${slug}`);
    await page.reload();
    await expect(page.locator("button.object").first()).toBeVisible();
    await page.locator("button.object").nth(c).click();
    // WAIT for the aside to have entries before counting — a bare count() reads 0 on an unhydrated
    // island and sweeps nothing while looking like a clean pass.
    const notes = page.locator("aside li button");
    try {
      await expect(notes.first()).toBeVisible({ timeout: 8000 });
    } catch {
      found.push(`${slug} obj#${c}: no notes`);
      continue;
    }
    const nNotes = await notes.count();
    found.push(`${slug} obj#${c}: ${nNotes} notes`);
    for (let i = 0; i < nNotes; i++) {
      await notes.nth(i).click();
      const pop = page.locator(".note-pop");
      try {
        await expect(pop).toBeVisible({ timeout: 5000 });
      } catch {
        continue;
      }
      const hasExpand = (await pop.locator("button.expand").count()) > 0;
      const hasTile = (await pop.locator("button.tile").count()) > 0;
      if (hasExpand && hasTile) {
        await pop.locator("button.expand").click();
        await expect(page.locator(".sheet")).toBeVisible();
        const sheetTiles = await page.locator(".sheet button.tile").count();
        found.push(`  *** ${slug} obj#${c} note#${i}: EXPAND+TILE, sheetTiles=${sheetTiles}`);
        await page.keyboard.press("Escape");
        await expect(page.locator(".sheet")).toHaveCount(0);
      } else if (hasTile) {
        found.push(`  ${slug} obj#${c} note#${i}: tile, no expand`);
      }
    }
  }
}

test("PROBE 2 — is a note already both expandable AND media-bearing?", async ({ page }) => {
  test.setTimeout(600_000);
  const found: string[] = [];
  await goOffline(page);
  await sweep(page, "sampler", found);
  console.log("PROBE2-sampler", JSON.stringify(found, null, 1));
});

test("PROBE 2b — same sweep over the voynich grid", async ({ page }) => {
  test.setTimeout(900_000);
  const found: string[] = [];
  await goOffline(page);
  await sweep(page, "voynich", found);
  console.log("PROBE2-voynich", JSON.stringify(found, null, 1));
});
