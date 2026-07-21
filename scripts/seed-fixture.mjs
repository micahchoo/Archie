// Archie Phase-1 verification fixture seeder (SCALE-GALLERY spike S2 §fixture).
//
// The bundled seed exhibits (apps/studio/src/seed-data.ts) point at REMOTE IIIF sources, so they
// never touch the /assets OPFS master path — the very path Phase 1 (incremental autosave, lazy
// masters, overview virtualization) needs to exercise. This script builds a REAL OPFS-backed library
// of 70 imported-asset objects by driving the Studio UI exactly as a user would.
//
// ROUTE TAKEN (spike S2 caveat): REAL folder ingest via `page.setInputFiles` on the hidden
// `<input webkitdirectory>` (LibraryHome.svelte:248-253, deliberately chosen "cross-browser +
// testable"). We generate placeholder PNGs IN-PAGE via canvas.toDataURL (no image files committed,
// no canvas npm dep), write them to a throwaway .scratch dir as three flat folders, and upload each
// folder separately — a flat folder's 2-segment webkitRelativePath makes `planFolderImportGroups`
// (folder-import.ts:72) treat it as one exhibit named by `folderNameFrom` (the folder basename). This
// runs the SAME ingest a human triggers (newExhibitFromFolder → addObjectFromFile → OPFS master +
// baked thumbnail), NOT a store-writer shortcut, so the fixture matches production bytes.
//
// PERSISTENCE: OPFS is per-origin and ephemeral in a fresh Playwright context, so we use
// `launchPersistentContext(profileDir)` under .scratch/ (gitignored) — the library survives across
// runs and the same profile can be opened for manual testing. FOLDER-BOUND mode (Phase 1.1 autosave)
// still needs the one-time native FSA directory-picker gesture, which Playwright can't drive — do that
// by hand once against this profile, then autosave-touch testing proceeds against that folder.
//
// Run:   node scripts/seed-fixture.mjs           (idempotent — skips if already seeded)
//        node scripts/seed-fixture.mjs --fresh    (wipe the profile + generated images, reseed)
// Needs: playwright resolvable + a chromium (bundled or system). The Studio dev server (:5173) is
//        booted automatically if it isn't already running.

import { mkdir, writeFile, rm, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { sleep, PLATE_SELECTOR, launchPersistentProfile, ensureStudioServer } from "./lib/driver.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// The Studio dev server serves under base `/studio/` (apps/studio/vite.config.ts:30) and Vite
// auto-increments the port when 5173/5174 are taken — so DISCOVER the URL, never hardcode it.
const STUDIO_CANDIDATES = [process.env.STUDIO_URL, "http://localhost:5174/studio/", "http://localhost:5173/studio/"].filter(Boolean);
const PROFILE_DIR = process.env.SEED_PROFILE ?? path.join(REPO, ".scratch", "seed-profile");
const SRC_DIR = path.join(REPO, ".scratch", "seed-src");
const VERIFY_SHOT = path.join(REPO, ".scratch", "seed-verify.png");
const VIEWPORT = { width: 1440, height: 900 };
const FRESH = process.argv.includes("--fresh");

// The library to build: 2×30 + 1×10 = 70 objects (plan Verification). Folder basename = exhibit title.
const EXHIBITS = [
  { name: "Coastal Survey", prefix: "CS", count: 30, hue: 205 },
  { name: "Archive Scans", prefix: "AS", count: 30, hue: 28 },
  { name: "Field Notes", prefix: "FN", count: 10, hue: 145 },
];

// Varied aspect ratios so the later justified-wall / density work has real data; a couple per exhibit
// exceed 4096px on an edge so the publish-time DZI tiling path (site.ts tileObject, edge > 4096) fires.
const SIZES = [
  [1600, 1200], [1200, 1600], [1400, 1400], [2600, 1000], [1000, 1800],
  [4200, 2400], [1800, 1150], [1150, 1800], [4400, 2100], [2000, 1333],
];

const log = (msg) => console.log(msg);

/** Render one flat-color placeholder PNG with a big visible label, in-page, and write it to disk. */
async function writePlaceholder(genPage, filePath, { w, h, big, hue }) {
  const dataUrl = await genPage.evaluate(({ w, h, big, hue }) => {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const ctx = c.getContext("2d");
    ctx.fillStyle = `hsl(${hue}, 42%, 40%)`; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgba(255,255,255,0.94)"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = `bold ${Math.round(Math.min(w, h) * 0.42)}px sans-serif`;
    ctx.fillText(big, w / 2, h / 2);
    ctx.font = `${Math.round(Math.min(w, h) * 0.06)}px sans-serif`;
    ctx.fillText(`${w}×${h}`, w / 2, Math.round(h * 0.84));
    return c.toDataURL("image/png"); // flat bg → deflate compresses even the >4096px plates tiny
  }, { w, h, big, hue });
  await writeFile(filePath, Buffer.from(dataUrl.split(",")[1], "base64"));
}

/** Generate the three source folders of numbered PNGs (idempotent unless --fresh). Returns per-exhibit dir. */
async function generateImages(context) {
  const dirs = {};
  const gen = await context.newPage();
  try {
    await gen.goto("about:blank");
    for (const ex of EXHIBITS) {
      const dir = path.join(SRC_DIR, ex.name);
      dirs[ex.name] = dir;
      const have = existsSync(dir) ? (await readdir(dir)).filter((f) => f.endsWith(".png")).length : 0;
      if (!FRESH && have >= ex.count) { log(`• Images for "${ex.name}" already present (${have}) — skipping generation`); continue; }
      await mkdir(dir, { recursive: true });
      for (let i = 1; i <= ex.count; i++) {
        const [w, h] = SIZES[(i - 1) % SIZES.length];
        const nn = String(i).padStart(2, "0");
        await writePlaceholder(gen, path.join(dir, `${ex.prefix}-${nn}.png`), { w, h, big: `${ex.prefix}-${nn}`, hue: ex.hue });
      }
      log(`• Generated ${ex.count} placeholder PNGs for "${ex.name}" (varied aspect ratios; some >4096px)`);
    }
  } finally { await gen.close(); }
  return dirs;
}

/** Is this exhibit already in the library (by card title)? */
async function hasExhibitCard(page, name) {
  return (await page.locator("button.card", { hasText: name }).count()) > 0;
}

/** The count shown on an exhibit's library card (0 if the card/meta isn't there yet). Meta text is
 *  CSS-uppercased ("30 MEDIA ITEMS · /SLUG"), so read case-insensitively. */
async function cardCount(page, name) {
  const meta = await page.locator("button.card", { hasText: name }).first().locator(".meta").innerText().catch(() => "");
  const m = meta.match(/(\d+)\s+media item/i);
  return m ? Number(m[1]) : 0;
}

/** Drive the WHOLE fixture in ONE folder ingest: uploading the wrapper (.scratch/seed-src, which holds
 *  the three exhibit subfolders) gives 3-segment webkitRelativePaths, so planFolderImportGroups
 *  (folder-import.ts:72) splits them into 3 exhibits ("per-subfolder" is the dialog's default
 *  grouping) and — being "several new exhibits" — lands back at the LIBRARY (App.svelte:544), where
 *  the cards are assertable. A single flat folder would instead open the new exhibit's editor and
 *  hide the library cards.
 *  ROUTE (updated 2026-07-20): the bare LibraryHome webkitdirectory input is retired — the folder
 *  path now lives inside CreateExhibitDialog ("New exhibit" tile → "From a media folder" path card
 *  → hidden input → primary submit → oncreatefromfolder, the same downstream handler as before). */
async function ingestAll(page) {
  await page.getByText("New exhibit", { exact: true }).first().click();
  const folderCard = page.locator("button.path-card", { hasText: "From a media folder" }).first();
  await folderCard.waitFor({ state: "visible", timeout: 8000 });
  await folderCard.click();
  const input = page.locator('input[type="file"][webkitdirectory]').first();
  if (!(await input.count())) throw new Error("folder-ingest input (webkitdirectory) not found in the create dialog's folder path");
  await input.setInputFiles(SRC_DIR); // → onDirChange → applyFolderFiles (summary + per-subfolder grouping)
  // Archie-5478: `.dialog button.btn-primary` alone is DOM-order-reliant — every other studio dialog
  // (IdentityPrompt, MergeReview, Publish, SaveZipDialog, BulkRightsDialog, ReadingsModal) is also a
  // `.dialog` with its own `.btn-primary`, so `.first()` silently picks the wrong button if any of
  // those happen to be mounted at the same time. `.path-actions` is CreateExhibitDialog's own wrapper
  // around each path's Cancel/Submit pair (unique to this component — grep confirms no other .svelte
  // uses the class), so scoping through it can only ever match THIS dialog's submit button.
  const submit = page.locator(".dialog .path-actions button.btn-primary").first();
  await submit.waitFor({ state: "visible", timeout: 8000 });
  for (let i = 0; i < 40 && !(await submit.isEnabled()); i++) await sleep(250); // summary lands async
  await submit.click(); // → submitFolder → oncreatefromfolder → newExhibitFromFolder (all 3 groups)
  // The import bakes 70 masters+thumbs then alerts "Added 70 files to 3 exhibits" (auto-accepted by the
  // page dialog handler). Poll until every target exhibit shows its full count.
  for (let i = 0; i < 180; i++) {
    const counts = await Promise.all(EXHIBITS.map((ex) => cardCount(page, ex.name)));
    if (EXHIBITS.every((ex, k) => counts[k] >= ex.count)) return counts.reduce((a, b) => a + b, 0);
    await sleep(1000);
  }
  const counts = await Promise.all(EXHIBITS.map((ex) => cardCount(page, ex.name)));
  throw new Error(`ingest did not reach target counts (got ${counts.join("/")}, want ${EXHIBITS.map((e) => e.count).join("/")})`);
}

/** Best-effort: add a note to a couple of objects so recently-annotated sort + note-count have data.
 *  Canvas drawing (Annotorious/OSD) is not reliably scriptable headlessly, so this is guarded and
 *  NEVER fails the run — it reports what it managed. */
async function tryAnnotate(page) {
  try {
    await page.locator("button.card", { hasText: EXHIBITS[0].name }).first().click();
    await sleep(1500);
    const plate = page.locator(PLATE_SELECTOR).first();
    if (!(await plate.count())) return { ok: false, why: "no plate on overview" };
    await plate.click();
    await sleep(2500); // OSD deep-zoom mount
    // Arm a rectangle tool if a recognizable control exists, drag a box on the canvas, type + save.
    const tool = page.locator('button[title*="ectangle"], button[aria-label*="ectangle"], button[title*="box" i]').first();
    if (!(await tool.count())) return { ok: false, why: "no draw-tool control found (canvas draw not scriptable)" };
    await tool.click();
    const canvas = page.locator("canvas").first();
    const box = await canvas.boundingBox();
    if (!box) return { ok: false, why: "canvas has no bounding box" };
    await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.35);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6, { steps: 8 });
    await page.mouse.up();
    await sleep(600);
    const ta = page.locator("textarea").first();
    if (!(await ta.count())) return { ok: false, why: "no note textarea appeared after draw" };
    await ta.fill("Seed fixture note.");
    await sleep(400);
    return { ok: true, why: "added 1 note on first object (best-effort)" };
  } catch (e) {
    return { ok: false, why: String(e.message).slice(0, 100) };
  }
}

async function main() {
  const t0 = Date.now();
  log(`\n=== Archie fixture seed ===  (${FRESH ? "--fresh: wiping first" : "idempotent"})`);
  if (FRESH) { await rm(PROFILE_DIR, { recursive: true, force: true }); await rm(SRC_DIR, { recursive: true, force: true }); }
  await mkdir(path.join(REPO, ".scratch"), { recursive: true });

  const { url: STUDIO, stop: stopServer } = await ensureStudioServer({ repo: REPO, candidates: STUDIO_CANDIDATES, log });
  const context = await launchPersistentProfile(PROFILE_DIR, { viewport: VIEWPORT });
  let created = 0;
  try {
    await generateImages(context);
    const page = context.pages()[0] ?? await context.newPage();
    page.on("dialog", (d) => { void d.accept().catch(() => {}); }); // accept the "Added N files…" import summary
    await page.goto(STUDIO, { waitUntil: "domcontentloaded", timeout: 30000 });
    try { await page.waitForLoadState("networkidle", { timeout: 8000 }); } catch {}
    await sleep(1500); // first paint + any bundled-seed hydrate

    const already = await Promise.all(EXHIBITS.map((ex) => hasExhibitCard(page, ex.name)));
    if (!FRESH && already.every(Boolean)) {
      log(`• All ${EXHIBITS.length} exhibits already seeded — skipping ingest (use --fresh to reseed)`);
    } else {
      log(`• Ingesting all ${EXHIBITS.length} exhibits in one folder import (${EXHIBITS.reduce((a, e) => a + e.count, 0)} objects)…`);
      created = await ingestAll(page);
      log(`  ✓ imported ${created} objects across ${EXHIBITS.length} exhibits`);
    }

    const note = await tryAnnotate(page);
    log(`• Annotations (best-effort): ${note.ok ? "OK" : "SKIPPED"} — ${note.why}`);

    // Verify: reload from OPFS and assert all three cards with correct counts.
    await page.goto(STUDIO, { waitUntil: "domcontentloaded", timeout: 30000 });
    await sleep(1500);
    const summary = [];
    for (const ex of EXHIBITS) {
      const card = page.locator("button.card", { hasText: ex.name }).first();
      const present = (await card.count()) > 0;
      const meta = present ? await card.locator(".meta").innerText().catch(() => "") : "";
      const ok = present && new RegExp(`\\b${ex.count}\\b\\s+media item`, "i").test(meta);
      summary.push({ name: ex.name, expected: ex.count, ok, meta: meta.trim() });
    }
    await page.screenshot({ path: VERIFY_SHOT, fullPage: true }); // full page so all 9 cards (6 bundled + 3 seeded) show

    const allOk = summary.every((s) => s.ok);
    log(`\n--- Verification ---`);
    for (const s of summary) log(`  [${s.ok ? "OK" : "FAIL"}] ${s.name}: expected ${s.expected} — "${s.meta}"`);
    log(`\n=== ${allOk ? "SEEDED OK" : "SEED INCOMPLETE"} ===`);
    log(`Exhibits: ${summary.length}  ·  Objects created this run: ${created}  ·  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    log(`Profile (OPFS lives here): ${PROFILE_DIR}`);
    log(`Verify screenshot: ${VERIFY_SHOT}`);
    log(`\nOpen Studio against this library:`);
    log(`  1) start the studio dev server:  pnpm --filter @archie/studio dev`);
    log(`  2) launch chromium with this profile:`);
    log(`     chromium --user-data-dir="${PROFILE_DIR}" ${STUDIO}`);
    log(`  (folder-bound autosave testing: bind a folder once via the native picker, then edit)`);
    if (!allOk) process.exitCode = 1;
  } finally {
    await context.close();
    stopServer();
  }
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
