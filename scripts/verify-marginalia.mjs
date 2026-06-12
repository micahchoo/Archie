// Playwright verification for the marginalia build (worklist 2.1 cuts D/E/F).
// Drives the REAL apps (dev servers must be running): asserts margin cards exist beside the
// canvas, the focused card hosts the WADM editor (cut E), cards REFLOW on pan (the signature
// interaction), and the Viewer's read-only margin works. Screenshots land in
// docs/screenshots/auto/marginalia-*.png. Exit 0 = all assertions held.
//
// Run: node scripts/verify-marginalia.mjs   (STUDIO_URL / VIEWER_URL env to override)

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(REPO, "docs", "screenshots", "auto");
const STUDIO = process.env.STUDIO_URL ?? "http://localhost:5173/";
const VIEWER = process.env.VIEWER_URL ?? "http://localhost:4321";

const results = [];
let failed = false;
function assert(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed = true;
}
const settle = async (page, ms = 1200) => {
  try { await page.waitForLoadState("networkidle", { timeout: 8000 }); } catch {}
  await page.waitForTimeout(ms);
};

async function launch() {
  try { return await chromium.launch(); }
  catch { return await chromium.launch({ executablePath: "/usr/bin/chromium-browser" }); }
}

async function verifyStudio(browser) {
  console.log("Studio (cuts D + E):");
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(STUDIO, { waitUntil: "domcontentloaded", timeout: 20000 });
  await settle(page, 1800); // first-run seed

  await page.getByText(/voynich/i).first().click();
  await settle(page, 1200);
  const plate = page.locator("button.plate:not(.add)").first();
  if (await plate.count()) { await plate.click(); await settle(page, 1800); }

  // D: the margin exists and holds positioned cards.
  assert("margin column mounts", (await page.locator(".margin-column").count()) > 0);
  let cards = await page.locator(".margin-card").count();
  if (cards === 0) {
    // First object may be note-less — walk the rail (']' steps objects) until cards appear.
    for (let i = 0; i < 8 && cards === 0; i++) {
      await page.keyboard.press("]");
      await settle(page, 900);
      cards = await page.locator(".margin-card").count();
    }
  }
  assert("margin cards render", cards > 0, `${cards} cards`);

  if (cards > 0) {
    // The signature FIRST (nothing focused): cards REFLOW when the canvas pans. Drag from a
    // CORNER — a centre drag can grab a selected marker's edit handles instead of panning.
    const topsBefore = await page.$$eval(".margin-card", (els) => els.map((e) => e.style.top));
    const canvas = page.locator(".archie-canvas").first();
    const box = await canvas.boundingBox();
    if (box) {
      await page.mouse.move(box.x + 60, box.y + box.height - 60);
      await page.mouse.down();
      await page.mouse.move(box.x + 60, box.y + box.height - 260, { steps: 10 });
      await page.mouse.up();
      await page.waitForTimeout(800);
    }
    const topsAfter = await page.$$eval(".margin-card", (els) => els.map((e) => e.style.top));
    assert("cards reflow on pan (marginalia!)", JSON.stringify(topsBefore) !== JSON.stringify(topsAfter),
      `${topsBefore.slice(0, 3).join(",")} → ${topsAfter.slice(0, 3).join(",")}`);

    // E: clicking a card head focuses it and the WADM editor opens INSIDE the card.
    await page.locator(".margin-card .mc-head").first().click();
    await settle(page, 900);
    assert("focused card hosts the editor (cut E)", (await page.locator(".margin-card.focused .mc-editor form.wadm").count()) > 0);
    assert("no detached popover in margin mode", (await page.locator(".note-popover").count()) === 0);

    // Edit in place: type into the in-card textarea, commit, card preview updates.
    const ta = page.locator(".margin-card.focused .mc-editor textarea").first();
    if (await ta.count()) {
      await ta.fill("Marginalia verification note — edited at the locus.");
      await ta.blur();
      await settle(page, 700);
      assert("in-card edit lands in the preview", (await page.locator(".margin-card .mc-head .comment").allTextContents()).some((t) => t.includes("Marginalia verification")), "");
    }
  }
  await mkdir(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, "marginalia-studio.desktop.png") });
  console.log("  shot → docs/screenshots/auto/marginalia-studio.desktop.png");
  await ctx.close();
}

async function verifyViewer(browser) {
  console.log("Viewer (cut F):");
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${VIEWER}/voynich`, { waitUntil: "domcontentloaded", timeout: 20000 });
  await settle(page, 1800);

  // Grid layout lands on the object grid — open the first object to reach the Reader.
  if ((await page.locator(".margin-column").count()) === 0) {
    const tile = page.locator("button:has(img)").first();
    if (await tile.count()) { await tile.click(); await settle(page, 1600); }
  }
  assert("reader margin mounts", (await page.locator(".margin-column").count()) > 0);
  const notes = await page.locator(".margin-card .mc-note, .margin-list .mc-note").count();
  assert("reader margin cards render", notes > 0, `${notes} cards`);
  if (notes > 0) {
    await page.locator(".mc-note").first().click();
    await settle(page, 900);
    assert("card click opens detail (and zooms)", (await page.locator("aside.detail article").count()) > 0);
  }
  await page.screenshot({ path: path.join(OUT, "marginalia-viewer.desktop.png") });
  console.log("  shot → docs/screenshots/auto/marginalia-viewer.desktop.png");
  await ctx.close();
}

const browser = await launch();
try {
  await verifyStudio(browser);
  await verifyViewer(browser);
} finally {
  await browser.close();
}
console.log(failed ? "\nVERDICT: FAIL" : "\nVERDICT: PASS");
process.exit(failed ? 1 : 0);
