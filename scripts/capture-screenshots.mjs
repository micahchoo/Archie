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
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
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
// Studio LibraryHome renders each exhibit as `button.card > span.title` = the exhibit
// TITLE (not the slug), so these regexes match the seeded titles (apps/studio/src/seed-data.ts):
//   "The Whole Manuscript" (voynich/grid) · "The Rosettes" (voynich-rosettes/single) ·
//   "Reading the Unreadable" (voynich-reading/narrative) · the atlas + geo-map titles.
// The o12 sound object (the only AV in the seed) lives INSIDE the Voynich exhibits — there is
// no standalone audio exhibit, so the AV editor is reached by opening that object (see below).
// Match the exhibit TITLE exactly — a loose substring like /voynich/ also hits each card's slug
// subtitle span ("· /voynich-rosettes"), so `.first()` would grab the wrong card and never navigate.
const EXHIBITS = {
  voynich: /^The Whole Manuscript$/, // grid exhibit — all 11 folios + the o12 sound page
  narrative: /^Reading the Unreadable$/, // narrative exhibit — the 6-beat spine
  av: /^Reading the Unreadable$|^The Whole Manuscript$/, // exhibit containing the o12 sound object
  sampler: /^Showroom Sampler$/, // AV + note-media demo — carries the sv1 video object
};

// Click an exhibit card by its title. `getByText(exact)` lands on the `span.title` inside
// `button.card`; clicking the span bubbles to the card's onclick (openExhibit). Returns the
// card-title locator (already clicked). Throws if no card matches.
async function clickExhibitCard(page, titleRe) {
  const title = page.getByText(titleRe, { exact: true }).first();
  if (!(await title.count())) throw new Error(`exhibit card not found: ${titleRe}`);
  await title.click();
  return title;
}

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
  await captureViewerStates(browser, viewport);
}

// Open a note popup in the viewer Reader by selecting the first note in the sidebar list.
// The list card is a `<button>` carrying the note prose; clicking it selects the note,
// which floats the NotePopup (NotePopup.svelte) over the canvas. Returns true on success.
// Open a note popup with an expand control in the grid Reader. The grid index lists objects as
// `button.object`; clicking one enters that object's reader, whose sidebar lists notes as
// `aside li button`. Clicking a note card floats the NotePopup (`.note-pop`); notes with prose
// expose the expand ⤢ (`button.np-icon.expand`). Returns true once expand is visible.
async function selectFirstViewerNote(page) {
  // Enter the first object's reader (grid index → object).
  const obj = page.locator("button.object").first();
  if (await obj.count()) {
    try { await obj.click({ timeout: 4000 }); await page.waitForTimeout(1500); } catch {}
  }
  const cards = page.locator("aside li button");
  const n = await cards.count();
  for (let i = 0; i < Math.min(n, 8); i++) {
    try {
      await cards.nth(i).click({ timeout: 3000 });
      const popped = await page
        .locator("button.np-icon.expand")
        .first()
        .waitFor({ state: "visible", timeout: 2000 })
        .then(() => true)
        .catch(() => false);
      if (popped) return true;
    } catch {}
  }
  return false;
}

// ---- Viewer NEW states: narrative route + finder overlay + reading sheet ----
// (viewer-lightbox needs a note carrying media — no seed fixture has one; recorded skipped.)
async function captureViewerStates(browser, viewport) {
  // viewer-narrative — the NarrativeReader route (sections present ⇒ narrative layout).
  await onePage(browser, viewport, "viewer-narrative", `${VIEWER}/voynich-reading`, async (page) => {
    await settle(page, 1400);
  });

  // viewer-search — the finder overlay (SearchOverlay), opened from the chrome affordance
  // `button.finder-trigger` (aria-label "Find a note (⌘K)"); falls back to the ⌘K / "/" accelerators.
  await onePage(browser, viewport, "viewer-search", `${VIEWER}/voynich`, async (page) => {
    await settle(page, 1000);
    const trigger = page.locator("button.finder-trigger").first();
    if (await trigger.count()) {
      await trigger.click();
    } else {
      await page.keyboard.press("Control+k");
    }
    await page.waitForTimeout(700);
  });

  // viewer-sheet — the expanded ReadingSheet with the ReadingLegend visible. Use the GRID Reader
  // route (/voynich) — its sidebar renders the `li > button` note list that selectFirstViewerNote
  // targets (the narrative route uses NarrativeReader, a different list shape). The grid exhibit is
  // multi-reading (cipher/hoax/abjad) ⇒ the legend renders. Select a note (popup floats), then click
  // its expand control `button.np-icon.expand` (⤢).
  await onePage(browser, viewport, "viewer-sheet", `${VIEWER}/voynich`, async (page) => {
    await settle(page, 1400);
    const ok = await selectFirstViewerNote(page);
    if (!ok) throw new Error("no selectable note in reader sidebar");
    await page.waitForTimeout(600);
    const expand = page.locator("button.np-icon.expand").first();
    if (!(await expand.count())) throw new Error("note popup expand (⤢) not found");
    await expand.click();
    await page.waitForTimeout(700);
  });

  // viewer-av — the MediaPlayer (AV + transcript). The Showroom Sampler's AUDIO object (sa1) carries
  // time-ranged transcript notes; clicking it from the grid enters the MediaPlayer reader (the <audio>
  // element + the transcript spine + the timeline mark strip).
  await onePage(browser, viewport, "viewer-av", `${VIEWER}/sampler`, async (page) => {
    await settle(page, 1400);
    const audio = page.locator("button.object").filter({ hasText: /recording|transcript|Kryptogramm|Audio/i }).first();
    if (!(await audio.count())) throw new Error("sampler audio object not found in grid");
    await audio.click();
    // Wait for the MediaPlayer surface: the <audio> element + a transcript timeline mark.
    await page.locator("audio, button.tl-mark").first().waitFor({ state: "visible", timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(1200);
  });

  // viewer-lightbox — NoteLightbox opened from a NoteMedia `.tile`. The Sampler's IMAGE object (si1)
  // carries a note with an embedded picture; the grid Reader renders that note's NoteMedia tile.
  // Click the image object → select the media-bearing note → click its `.tile` thumbnail.
  await onePage(browser, viewport, "viewer-lightbox", `${VIEWER}/sampler`, async (page) => {
    await settle(page, 1400);
    const img = page.locator("button.object").filter({ hasText: /picture|page with a note|related/i }).first();
    if (!(await img.count())) throw new Error("sampler image object not found in grid");
    await img.click();
    await page.waitForTimeout(1800);
    // Select notes until one floats a popup carrying a NoteMedia tile.
    const cards = page.locator("aside li button");
    const n = await cards.count();
    let tile = null;
    for (let i = 0; i < Math.min(n, 8); i++) {
      try {
        await cards.nth(i).click({ timeout: 3000 });
        await page.waitForTimeout(500);
        const t = page.locator(".tile").first();
        if (await t.count()) { tile = t; break; }
      } catch {}
    }
    if (!tile) throw new Error("no NoteMedia .tile found after selecting notes");
    await tile.click();
    // The lightbox is a full-screen overlay — give it a beat to mount the media.
    await page.waitForTimeout(1200);
  });
}

// One-context, navigate + run an interaction, then shoot. Best-effort: a thrown interaction
// records `skipped` with the reason and the sweep continues — one failure never aborts the batch.
async function onePage(browser, viewport, name, url, interact) {
  const ctx = await browser.newContext({ viewport: VIEWPORTS[viewport] });
  const page = await ctx.newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
    await settle(page);
    if (interact) await interact(page);
    await shoot(page, name, viewport);
  } catch (e) {
    record(name, viewport, "skipped", String(e.message).slice(0, 120));
  }
  await ctx.close();
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
    const voynich = page.getByText(EXHIBITS.voynich, { exact: true }).first();
    if (await voynich.count()) {
      await voynich.click();
      await settle(page, 1200);
      await shoot(page, "studio-overview", viewport); // ExhibitOverview — "Inside an exhibit"

      // Overview objects are `<button class="plate">`; a single click opens the editor
      // (onopenobject). Exclude the trailing ".plate.add" (the "Add object" tile). Plates paint
      // after the tableau lays out — wait for one so a fast first-context run doesn't miss them.
      const plate = page.locator("button.plate:not(.add)").first();
      try { await plate.waitFor({ state: "visible", timeout: 6000 }); } catch {}
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
    const av = page2.getByText(EXHIBITS.av, { exact: true }).first();
    if (await av.count()) {
      await av.click();
      await settle(page2, 1200);
      // The only AV object is o12 (the sound page) INSIDE the multi-object Voynich exhibit, so this
      // lands on the overview. Open the SOUND plate specifically (its caption carries "Kryptogramm"
      // / the ♪ glyph, not a folio label) so the AvEditor (WaveSurfer) mounts, not the image editor.
      const soundPlate = page2.locator("button.plate", { hasText: /Kryptogramm|Audio|♪/ }).first();
      const anyPlate = page2.locator("button.plate:not(.add)").last(); // o12 is the last plate
      const target = (await soundPlate.count()) ? soundPlate : anyPlate;
      try { await target.waitFor({ state: "visible", timeout: 6000 }); } catch {}
      if (await target.count()) { await target.click(); await settle(page2, 1200); }
      await settle(page2, 1800); // AvEditor mounts WaveSurfer — needs extra settle
      await shoot(page2, "studio-editor-av", viewport); // AvEditor — "Annotate audio & video"
    } else {
      record("studio-editor-av", viewport, "skipped", "av exhibit not found");
    }
  } catch (e) {
    record("studio-flow-av", viewport, "skipped", String(e.message).slice(0, 120));
  }
  await ctx2.close();

  await captureStudioStates(browser, viewport);
}

// Open the grid Voynich exhibit ("The Whole Manuscript") and descend into its first object's
// editor. Returns { ctx, page } positioned in the editor, or null if the path broke.
async function openStudioEditor(browser, viewport) {
  const ctx = await browser.newContext({ viewport: VIEWPORTS[viewport] });
  const page = await ctx.newPage();
  await page.goto(STUDIO, { waitUntil: "domcontentloaded", timeout: 20000 });
  await settle(page, 1800); // first-run seed into IndexedDB/OPFS
  try { await clickExhibitCard(page, EXHIBITS.voynich); } catch { await ctx.close(); return null; }
  await settle(page, 1200); // multi-object exhibit ⇒ overview
  // Plates paint after the overview tableau lays out — wait for one, then open it to enter the editor.
  const plate = page.locator("button.plate:not(.add)").first();
  try { await plate.waitFor({ state: "visible", timeout: 6000 }); } catch {}
  if (await plate.count()) {
    await plate.click();
    await settle(page, 1600); // OSD/AvEditor mount
  }
  return { ctx, page };
}

// ---- Studio NEW states: readings · narrative · video · map · cite · meta · ingest · publish · shortcuts ----
async function captureStudioStates(browser, viewport) {
  // studio-meta — exhibit metadata + rights. The LibraryHome per-card pencil (`button.edit-meta`,
  // aria-label "Edit details for …") opens the shared DetailsEditor + RightsEditor drawer.
  await studioOne(browser, viewport, "studio-meta", async (page) => {
    await page.goto(STUDIO, { waitUntil: "domcontentloaded", timeout: 20000 });
    await settle(page, 1800);
    const pencil = page.locator("button.edit-meta").first();
    if (!(await pencil.count())) throw new Error("library per-card edit-meta pencil not found");
    await pencil.click();
    await page.waitForTimeout(700);
  });

  // studio-shortcuts — the `?` cheat-sheet overlay (ShortcutsHelp; dialog aria-label "Keyboard shortcuts").
  await studioOne(browser, viewport, "studio-shortcuts", async (page) => {
    await page.goto(STUDIO, { waitUntil: "domcontentloaded", timeout: 20000 });
    await settle(page, 1800);
    await page.keyboard.press("Shift+Slash"); // "?"
    await page.waitForTimeout(500);
    if (!(await page.locator('[aria-label="Keyboard shortcuts"]').count())) {
      await page.keyboard.press("?");
      await page.waitForTimeout(400);
    }
  });

  // studio-publish — the Publish dialog. `button.publish-signal` ("Publish & share…") lives in the
  // EDITOR view header (App.svelte view === "editor"; the `{:else}` block at the exhibit/object
  // crumb), so descend into the object editor first, then click it.
  await studioEditorOne(browser, viewport, "studio-publish", async (page) => {
    const pub = page.locator("button.publish-signal").first();
    try { await pub.waitFor({ state: "visible", timeout: 5000 }); } catch {}
    if (!(await pub.count())) throw new Error("publish-signal button not found (editor)");
    await pub.click();
    await page.waitForTimeout(1100); // dialog chunk (fflate/dompurify) loads on first open
  });

  // The remaining states live in the editor — open it once per state (fresh seed each context).
  // studio-readings — the readings rail's `button.manage` ("Manage readings…") opens ReadingsModal.
  await studioEditorOne(browser, viewport, "studio-readings", async (page) => {
    const manage = page.locator("button.manage").first();
    if (!(await manage.count())) throw new Error("readings rail manage button not found");
    await manage.click();
    await page.waitForTimeout(600);
  });

  // studio-narrative — the editor sidebar's Narrative accordion (`button.panel-head` controlling
  // the narrative panel). Expanding it reveals the NarrativeEditor section composer.
  await studioEditorOne(browser, viewport, "studio-narrative", async (page) => {
    const head = page.locator('button.panel-head[aria-controls="panel-body-narrative"]').first();
    const fallback = page.getByRole("button", { name: /narrative/i }).first();
    const btn = (await head.count()) ? head : fallback;
    if (!(await btn.count())) throw new Error("narrative panel head not found");
    await btn.click();
    await page.waitForTimeout(600);
  });

  // studio-map — the Add-Map modal. The "+ Map" toggle (`button.add-obj-toggle`,
  // title "Add a map (geo-annotation)") opens AddMapModal.
  await studioEditorOne(browser, viewport, "studio-map", async (page) => {
    const map = page.locator('button[title="Add a map (geo-annotation)"]').first();
    if (!(await map.count())) throw new Error("+ Map toggle not found");
    await map.click();
    await page.waitForTimeout(700);
  });

  // studio-ingest — the media ingest form. The "+ Media" toggle reveals the URL field
  // (input placeholder "Link to an image, audio, or video") — the IIIF/media picker entry.
  await studioEditorOne(browser, viewport, "studio-ingest", async (page) => {
    const media = page.getByRole("button", { name: /\+ Media/i }).first();
    if (!(await media.count())) throw new Error("+ Media toggle not found");
    await media.click();
    await page.waitForTimeout(500);
    // Bring the URL field into view to anchor the shot on the ingest affordance.
    const field = page.locator('input[placeholder="Link to an image, audio, or video"]').first();
    if (await field.count()) await field.scrollIntoViewIfNeeded().catch(() => {});
  });

  // studio-cite — the cite palette (CmdK; dialog aria-label "Cite a note or exhibit"). It is
  // field-agnostic and requires a NOTE BEING EDITED (a Comment textarea focused) — otherwise ⌘K
  // shows the "Open a note first" hint instead of the palette. So: open a note (its textarea
  // appears), then press ⌘K.
  await studioEditorOne(browser, viewport, "studio-cite", async (page) => {
    const noteSel = page.locator(".notes li button, .note-list button, aside li button, .note-rail button").first();
    if (await noteSel.count()) {
      try {
        await noteSel.click({ timeout: 3000 });
        // Wait for the comment editor (textarea) — that's the field ⌘K cites into.
        await page.locator("textarea").first().waitFor({ state: "visible", timeout: 3000 }).catch(() => {});
      } catch {}
    }
    await page.keyboard.press("Control+k");
    const opened = await page.locator('[aria-label="Cite a note or exhibit"]')
      .first().waitFor({ state: "visible", timeout: 2500 }).then(() => true).catch(() => false);
    if (!opened) { await page.keyboard.press("Meta+k"); await page.waitForTimeout(600); }
    else await page.waitForTimeout(400);
  });

  // studio-editor-video — open the Showroom Sampler exhibit and its VIDEO object (sv1). AvEditor
  // renders a <video> + frame-draw overlay when mediaType === "video". Open the exhibit → overview →
  // click the video plate (its caption carries "Big Buck Bunny" / the ▶ glyph, not the ♪ audio one).
  await studioOne(browser, viewport, "studio-editor-video", async (page) => {
    await page.goto(STUDIO, { waitUntil: "domcontentloaded", timeout: 20000 });
    await settle(page, 1800);
    await clickExhibitCard(page, EXHIBITS.sampler);
    await settle(page, 1200); // → overview (multi-object: video + audio + image)
    const videoPlate = page.locator("button.plate", { hasText: /Big Buck Bunny|annotate a frame|▶/ }).first();
    const firstPlate = page.locator("button.plate:not(.add)").first(); // sv1 is authored first
    const target = (await videoPlate.count()) ? videoPlate : firstPlate;
    try { await target.waitFor({ state: "visible", timeout: 6000 }); } catch {}
    if (!(await target.count())) throw new Error("sampler video plate not found on overview");
    await target.click();
    await settle(page, 2000); // AvEditor mounts the <video> + frame overlay
  });
}

// Studio state from the LIBRARY view (no editor descent needed).
async function studioOne(browser, viewport, name, interact) {
  const ctx = await browser.newContext({ viewport: VIEWPORTS[viewport] });
  const page = await ctx.newPage();
  try {
    await interact(page);
    await shoot(page, name, viewport);
  } catch (e) {
    record(name, viewport, "skipped", String(e.message).slice(0, 120));
  }
  await ctx.close();
}

// Studio state that needs the object editor open first.
async function studioEditorOne(browser, viewport, name, interact) {
  let opened = null;
  try {
    opened = await openStudioEditor(browser, viewport);
    if (!opened) { record(name, viewport, "skipped", "could not open Voynich editor (exhibit/plate not found)"); return; }
    await interact(opened.page);
    await shoot(opened.page, name, viewport);
  } catch (e) {
    record(name, viewport, "skipped", String(e.message).slice(0, 120));
  } finally {
    if (opened) await opened.ctx.close();
  }
}

// ---- Embed: a real host page running <archie-viewer> over the LOCAL published tree ----
// recipes/example.html is the canonical contract doc but points at a CDN bundle + placeholder URLs,
// so it can't render real content offline. Instead we serve the LOCAL built element bundle
// (packages/archie-viewer/dist) and inject a tiny host page whose <archie-viewer src> targets the
// viewer dev server's published tree (VIEWER/published/). Same element, same contract, real data.
const VIEWER_TREE = process.env.VIEWER_TREE ?? `${VIEWER}/published/`;
const DIST = path.join(REPO, "packages", "archie-viewer", "dist");

const EMBED_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Archie embed — showroom host</title>
<style>
  html,body{margin:0;height:100%;font-family:system-ui,sans-serif;background:#f4efe6}
  header{padding:14px 22px;font:600 15px/1.3 system-ui;color:#3a3026;border-bottom:1px solid #e2d8c6;background:#fbf7ef}
  header small{display:block;font-weight:400;color:#7a6f5e;margin-top:3px}
  .frame{padding:22px;height:calc(100% - 84px);box-sizing:border-box}
  archie-viewer{display:block;width:100%;height:100%;border:1px solid #e2d8c6;border-radius:10px;overflow:hidden;background:#fff;box-shadow:0 8px 28px rgba(60,48,30,.12)}
</style>
<script type="module" src="./archie-viewer.js"></script></head>
<body>
  <header>A host page embedding &lt;archie-viewer&gt;<small>The read-only Archie viewer, dropped into any web page with one custom element.</small></header>
  <div class="frame">
    <archie-viewer src="${VIEWER_TREE}" target="#/voynich"></archie-viewer>
  </div>
</body></html>`;

// Static server for the dist dir + the injected host page at "/". Relative chunk imports
// (./chunk-*.js) resolve because they sit beside archie-viewer.js in DIST.
function serveEmbedHost() {
  const types = { ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".html": "text/html" };
  const server = createServer(async (req, res) => {
    try {
      const url = (req.url || "/").split("?")[0];
      if (url === "/" || url === "/index.html") {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(EMBED_HTML);
        return;
      }
      const file = path.join(DIST, path.normalize(url).replace(/^(\.\.[/\\])+/, ""));
      const body = await readFile(file);
      res.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream", "access-control-allow-origin": "*" });
      res.end(body);
    } catch {
      res.writeHead(404); res.end("not found");
    }
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port })));
}

async function captureEmbed(browser, viewport) {
  let host = null;
  try {
    host = await serveEmbedHost();
  } catch (e) {
    record("embed-host", viewport, "skipped", `embed host server failed: ${String(e.message).slice(0, 80)}`);
    return;
  }
  const url = `http://127.0.0.1:${host.port}/`;
  await onePage(browser, viewport, "embed-host", url, async (page) => {
    // The element fetches exhibits.json + manifest.json from the tree, then mounts OSD — give it time.
    await page.waitForTimeout(2500);
    try { await page.waitForFunction(() => !!document.querySelector("archie-viewer"), { timeout: 5000 }); } catch {}
    await settle(page, 1500);
  });
  host.server.close();
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
    await captureEmbed(browser, viewport);
  }
  await browser.close();
  await writeFile(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
  const ok = manifest.filter((m) => m.status === "captured").length;
  const skip = manifest.filter((m) => m.status === "skipped").length;
  console.log(`\nDONE: ${ok} captured, ${skip} skipped. Manifest: docs/screenshots/auto/manifest.json`);
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
