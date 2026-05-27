// Archie documentation screenshot capture.
//
// One-shot, best-effort capture of the two running dev apps for the docs layer.
//   Viewer (Astro, :4321) — file-routed, trivial: one shot per page.
//   Studio (Svelte SPA, :5173) — NO url routing; views are driven by clicking
//   through the seeded demo exhibits (Voynich grid, Bidar map, AV recording).
//
// Captures are desktop only (1440x900) — Archie is not optimized for mobile.
// Studio capture is best-effort: a missed selector is logged to the manifest as
// `skipped` and the sweep continues — it never crashes the whole run.
//
// Run:  node scripts/capture-screenshots.mjs
// Needs: playwright resolvable (installed in a sibling temp dir is fine) + a
// chromium (bundled, or system /usr/bin/chromium-browser via fallback).
//
// Output: docs/screenshots/auto/<name>.<viewport>.png  + manifest.json

import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// OUT_DIR lets a temp-dir copy (where playwright is installed) still write into the repo.
const OUT = process.env.OUT_DIR ?? path.join(REPO, "docs", "screenshots", "auto");

const STUDIO = process.env.STUDIO_URL ?? "http://localhost:5173/";
const VIEWER = process.env.VIEWER_URL ?? "http://localhost:4321";

// Desktop only — Archie's apps are not optimized for mobile, so a mobile shot
// would misrepresent the product. Add a viewport here only if that changes.
const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
};

// One place to edit when the UI churns. Text anchors, not brittle CSS paths.
const EXHIBITS = {
  voynich: /voynich/i,
  bidar: /techno-futures|bidar/i,
  av: /field recording|dholak/i,
};

const manifest = [];
function record(name, viewport, status, detail) {
  manifest.push({ name, viewport, status, detail, at: new Date().toISOString() });
  console.log(`  [${status}] ${name}.${viewport}${detail ? ` — ${detail}` : ""}`);
}

async function settle(page, ms = 1000) {
  try { await page.waitForLoadState("networkidle", { timeout: 8000 }); } catch {}
  await page.waitForTimeout(ms); // OSD/Annotorious canvas + WaveSurfer need extra time
}

async function shoot(page, name, viewport) {
  const file = path.join(OUT, `${name}.${viewport}.png`);
  await page.screenshot({ path: file, fullPage: false });
  record(name, viewport, "captured", path.relative(REPO, file));
}

// ---- Viewer: file-routed, one shot per page per viewport ----
async function captureViewer(browser, viewport) {
  const pages = [
    ["viewer-home", `${VIEWER}/`],
    ["viewer-voynich", `${VIEWER}/voynich`],
    ["viewer-av", `${VIEWER}/av`],
    ["viewer-bidar", `${VIEWER}/bidar`],
  ];
  for (const [name, url] of pages) {
    const ctx = await browser.newContext({ viewport: VIEWPORTS[viewport] });
    const page = await ctx.newPage();
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
      await settle(page);
      await shoot(page, name, viewport);
    } catch (e) {
      record(name, viewport, "skipped", String(e.message).slice(0, 120));
    }
    await ctx.close();
  }
}

// ---- Studio: drive the SPA through the seeded exhibits (fresh state each run) ----
async function captureStudio(browser, viewport) {
  const ctx = await browser.newContext({ viewport: VIEWPORTS[viewport] }); // fresh = clean seed
  const page = await ctx.newPage();
  try {
    await page.goto(STUDIO, { waitUntil: "domcontentloaded", timeout: 20000 });
    await settle(page, 1800); // first-run seed into IndexedDB/OPFS
    await shoot(page, "studio-library", viewport); // LibraryHome — "Your library"

    // Enter an image exhibit (Voynich) -> overview -> open first object -> canvas editor.
    const voynich = page.getByText(EXHIBITS.voynich).first();
    if (await voynich.count()) {
      await voynich.click();
      await settle(page, 1200);
      await shoot(page, "studio-overview", viewport); // ExhibitOverview — "Inside an exhibit"

      // Overview objects are `<button class="plate">`; a single click opens the editor
      // (onopenobject). Exclude the trailing ".plate.add" (the "Add object" tile).
      const plate = page.locator("button.plate:not(.add)").first();
      if (await plate.count()) {
        await plate.click();
        await settle(page, 1600); // OSD deep-zoom tiles need time to paint
        await shoot(page, "studio-editor-image", viewport); // canvas editor — "Annotate an image"
      } else {
        record("studio-editor-image", viewport, "skipped", "no .plate object found on overview");
      }
    } else {
      record("studio-overview", viewport, "skipped", "voynich exhibit not found in library");
    }
  } catch (e) {
    record("studio-flow-image", viewport, "skipped", String(e.message).slice(0, 120));
  }
  await ctx.close();

  // Separate clean run for the AV editor (sound exhibit).
  const ctx2 = await browser.newContext({ viewport: VIEWPORTS[viewport] });
  const page2 = await ctx2.newPage();
  try {
    await page2.goto(STUDIO, { waitUntil: "domcontentloaded", timeout: 20000 });
    await settle(page2, 1800);
    const av = page2.getByText(EXHIBITS.av).first();
    if (await av.count()) {
      await av.click();
      await settle(page2, 1200);
      // Single-object exhibits open straight into the editor (App.svelte:234) — no overview.
      // If an overview DID appear (multi-object), click its first plate first.
      const obj = page2.locator("button.plate:not(.add)").first();
      if (await obj.count()) { await obj.click(); await settle(page2, 1200); }
      await settle(page2, 1800); // AvEditor mounts WaveSurfer — needs extra settle
      await shoot(page2, "studio-editor-av", viewport); // AvEditor — "Annotate audio & video"
    } else {
      record("studio-editor-av", viewport, "skipped", "av exhibit not found");
    }
  } catch (e) {
    record("studio-flow-av", viewport, "skipped", String(e.message).slice(0, 120));
  }
  await ctx2.close();
}

async function launch() {
  // Prefer bundled chromium; fall back to system chromium (snap) with --no-sandbox.
  try {
    return await chromium.launch({ headless: true });
  } catch (e) {
    console.log(`  bundled chromium failed (${e.message.slice(0, 80)}); trying system chromium`);
    return await chromium.launch({
      headless: true,
      executablePath: "/usr/bin/chromium-browser",
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
  }
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await launch();
  for (const viewport of Object.keys(VIEWPORTS)) {
    console.log(`\n== ${viewport} ==`);
    await captureViewer(browser, viewport);
    await captureStudio(browser, viewport);
  }
  await browser.close();
  await writeFile(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
  const ok = manifest.filter((m) => m.status === "captured").length;
  const skip = manifest.filter((m) => m.status === "skipped").length;
  console.log(`\nDONE: ${ok} captured, ${skip} skipped. Manifest: docs/screenshots/auto/manifest.json`);
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
