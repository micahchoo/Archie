import { test, expect, type Page, type Download } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Core-loop gate (Archie-c9ac). Drives the REAL Studio App through a real browser to prove the
// author's central path end-to-end: CREATE a note → it AUTOSAVES to OPFS (survives a reload) →
// PUBLISH locally → the published ARTIFACT carries the authored note. This is the one place we
// exercise the create→persist→publish seam against a mounted App + genuine OPFS + a genuine
// zip-download capture — legs the repo's pure-module vitest posture (no DOM, no OPFS, no download
// sink) structurally cannot reach.
//
// WHAT THIS SUITE PROVES, and what it deliberately cannot (studio-only config — the Astro Viewer is
// NOT booted here; see e2e/playwright.config.ts, "Scoped to apps/studio only"):
//   ✔ create   — a note is authored via the canvas new-note tool strip (the "Whole image" tool,
//                App.svelte:2271 → createWholeObjectNote). NOT a freehand PixiJS-canvas draw: the seed
//                objects all stream from REMOTE IIIF (seed-data.ts — no local/bundled image), so the
//                OSD/Annotorious/PixiJS canvas cannot mount deterministically headless-offline, and a
//                synthetic draw on a WebGL surface is inherently flaky. The whole-object tool is the
//                same createNote seam a box/outline draw lands on (App.svelte:1384-1440), minus the
//                non-deterministic gesture — determinism over breadth, per the ticket.
//   ✔ autosave — proven by RELOAD PERSISTENCE (the strongest proof): the note is read back from OPFS
//                after a full page reload, on a SAVED exhibit. Seed exhibits are templates that never
//                bind an OPFS annotation dir (exhibit-session.svelte.ts — save() early-returns on a
//                template), so the suite first forks one via "Keep a copy" (App.svelte:864 keepCopy)
//                into a user-owned exhibit that persists.
//   ✔ publish  — the in-browser LOCAL publish path (Publish.svelte "Locally" → onzip=localPublishZip,
//                publish-flows.svelte.ts:298). It flushes the exhibit and builds the site projection
//                into a .archie.zip via the SAME libraryToZipFs projection every sink uses (STATIC_PAGE_OPTS
//                — the rendered static pages). We capture that download and assert the authored note's
//                body text is present in the published output.
//   ✘ live Viewer render — mounting the published tree in the actual Astro Viewer and asserting the
//                note renders in that DOM is OUT OF SCOPE for this studio-only config (no viewer server /
//                front-door proxy here). We prove the projection CARRIES the note into the published
//                artifact; rendering that artifact in the Viewer is a viewer-suite concern.
//
// Fixtures (verified in apps/studio/src/seed-data.ts + voynich.ts): the bundled example "The Rosettes",
// slug `voynich-rosettes`, is a SINGLE-object template exhibit whose one object is `o9`. "Keep a copy"
// forks it to the deterministic slug `voynich-rosettes-copy` (App.svelte:869), carrying object ids.
const TEMPLATE_SLUG = "voynich-rosettes";
const OBJ = "o9";
const COPY_SLUG = "voynich-rosettes-copy";
const IDENTITY_KEY = "archie.displayName.v1"; // App.svelte:102 — pre-seed to skip the identity prompt.

const editorHash = (slug: string) => `#/${slug}/o/${OBJ}`;

// Remote-resource console noise: the seed objects stream folios from a remote IIIF service, so
// tile/CORS/4xx failures are EXPECTED in a headless run and are NOT app faults. Same filter posture as
// navigation.spec.ts. (This suite never depends on those loads succeeding — the whole-object note tool
// and the publish path are independent of whether the canvas image mounted.)
const RESOURCE_NOISE =
  /Failed to load resource|net::ERR|ERR_|status of 4|status of 5|IIIF|openseadragon|CORS|Content Security|favicon|preload|Couldn't load this media/i;

function trackErrors(page: Page) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !RESOURCE_NOISE.test(m.text())) consoleErrors.push(m.text());
  });
  return { pageErrors, consoleErrors };
}

// --- Screen markers (role/label, mirroring navigation.spec.ts) ---
const marker = (page: Page) => ({
  libraryCard: page.locator("button.card").filter({ hasText: "The Rosettes" }),
  editorNav: page.getByRole("navigation", { name: "Exhibit objects" }),
  keepCopy: page.getByRole("button", { name: "Keep a copy" }),
  playgroundKeep: page.locator("button.pg-keep"),
  wholeImageTool: page.getByRole("button", { name: /Whole image/ }),
  notesList: page.getByRole("list", { name: "Notes on this object" }),
  // The Comment textarea inside the in-place note editor. The expanded region is app-generated
  // (`.note-editor-region#note-editor-<logicalId>`); the Comment field is its FIRST textbox
  // (NoteEditor.svelte:92, before Tags/Reading) — role + structural scope, no brittle text match.
  commentBox: page.locator(".note-editor-region").getByRole("textbox").first(),
  // "← Overview" (App.svelte:1946 backToOverview) — leaving the editor runs an awaited save() that
  // flushes the current exhibit's edits to OPFS synchronously (exhibit-session.svelte.ts save()).
  overviewBack: page.getByRole("button", { name: "Overview", exact: true }),
  overviewGroup: page.getByRole("group", { name: "Overview mode" }),
});

const hashOf = (page: Page) => page.evaluate(() => location.hash);
const goHash = (page: Page, h: string) => page.evaluate((x) => { location.hash = x; }, h);

// Boot with a CLEAN slate: wipe OPFS + localStorage so the forked-copy slug is deterministic across
// repeats (`--repeat-each`), then reload so the app re-seeds fresh. The init script (set below, per
// test) re-applies the pre-seeded identity + picker removal on every navigation.
async function bootClean(page: Page) {
  await page.goto("/studio/");
  await expect(marker(page).libraryCard.first()).toBeVisible();
  await page.evaluate(async () => {
    try {
      const root = await navigator.storage.getDirectory();
      // @ts-expect-error keys() is present on the OPFS dir handle at runtime.
      for await (const name of root.keys()) await root.removeEntry(name, { recursive: true });
    } catch { /* no OPFS / already empty — fine */ }
    localStorage.clear();
  });
  await page.reload();
  await expect(marker(page).libraryCard.first()).toBeVisible();
}

// Every navigation: identity pre-seeded (skip the first-publish identity prompt), and the File System
// Access pickers removed so the app takes its deterministic, Playwright-capturable fallbacks —
// canFolder=false (binding-store.svelte.ts, folder-backend.ts) routes "Locally" to the zip DOWNLOAD,
// and supportsFileStreamSave()=false (binding.ts) makes saveZipToDisk emit an <a download> anchor
// (the only sink Playwright's download API can intercept).
async function installInit(page: Page) {
  await page.addInitScript((key) => {
    try { localStorage.setItem(key, "E2E Tester"); } catch { /* private mode */ }
    // @ts-expect-error non-optional in the lib types, but deletable at runtime.
    delete window.showSaveFilePicker;
    // @ts-expect-error idem.
    delete window.showDirectoryPicker;
  }, IDENTITY_KEY);
}

// Fork the template into a SAVED (persisting) exhibit and land in its editor. Returns nothing — the
// deterministic COPY_SLUG editor is the resting place.
async function forkToSavedEditor(page: Page) {
  const m = marker(page);
  await goHash(page, editorHash(TEMPLATE_SLUG));
  await expect(m.editorNav).toBeVisible();
  // The template shows the playground "Keep a copy" affordance; a saved exhibit does not.
  await expect(m.keepCopy).toBeVisible();
  await m.keepCopy.click();
  // keepCopy persists the library + opens the copy's overview. Wait for the slug to switch.
  await expect.poll(() => hashOf(page)).toContain(COPY_SLUG);
  await goHash(page, editorHash(COPY_SLUG));
  await expect(m.editorNav).toBeVisible();
  await expect(m.playgroundKeep).toHaveCount(0); // the copy is saved — no playground banner
}

// Author a whole-object note and type `body` into it (committed on blur). Leaves the note present in
// the live session + notes list; PERSISTENCE (the debounced OPFS write) is forced explicitly by each
// caller — via the "← Overview" flush (reload test) or the publish flush (publish test) — so nothing
// here depends on the 800ms debounce firing.
async function authorNote(page: Page, body: string) {
  const m = marker(page);
  await m.wholeImageTool.click();
  // Creating selects the note, which auto-opens its in-place editor (App.svelte:971 selected→editing).
  await expect(m.commentBox).toBeVisible();
  await m.commentBox.fill(body);
  await m.commentBox.blur(); // <textarea> commits on change/blur → applyForm → editNote
  await expect(m.notesList).toContainText(body);
}

test.describe("Studio core loop: create → autosave → publish (Archie-c9ac)", () => {
  test.beforeEach(async ({ page }) => {
    await installInit(page);
  });

  test("1. authored note autosaves to OPFS and survives a full reload", async ({ page }) => {
    const errs = trackErrors(page);
    const body = `E2E autosave note ${crypto.randomUUID()}`;

    await bootClean(page);
    await forkToSavedEditor(page);
    await authorNote(page, body);

    // Leave the editor: backToOverview runs an awaited save() that flushes the note to OPFS. Once the
    // overview screen is shown, the write has committed — a deterministic persist point, no sleep.
    await marker(page).overviewBack.click();
    await expect(marker(page).overviewGroup).toBeVisible();

    // The reload is the proof: the note comes back only if it was persisted to OPFS. NOTE: no storage
    // wipe here — only bootClean wipes; this reload preserves the just-saved copy exhibit + its notes.
    await page.reload();
    await goHash(page, editorHash(COPY_SLUG));
    await expect(marker(page).editorNav).toBeVisible();
    await expect(marker(page).notesList).toContainText(body);

    expect(errs.pageErrors, `uncaught errors: ${errs.pageErrors.join(" | ")}`).toEqual([]);
    expect(errs.consoleErrors, `console errors: ${errs.consoleErrors.join(" | ")}`).toEqual([]);
  });

  test("2. local publish carries the authored note into the published .archie.zip", async ({ page }) => {
    const errs = trackErrors(page);
    const body = `E2E publish note ${crypto.randomUUID()}`;

    await bootClean(page);
    await forkToSavedEditor(page);
    await authorNote(page, body);

    // Open the merged Publish & Share surface (identity pre-seeded → no prompt), choose "Locally".
    // With the folder picker removed (canFolder=false) that path offers the .archie.zip download.
    await page.getByRole("button", { name: /Publish & share/ }).click();
    const dialog = page.getByRole("dialog", { name: "Publish" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: /Locally/ }).click();

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      dialog.getByRole("button", { name: "Download .archie.zip" }).click(),
    ]);

    // Extract the captured zip and prove the authored note body is present in the published output.
    const { entriesWithBody, htmlEntriesWithBody } = await extractAndFind(download, body);
    expect(
      entriesWithBody,
      `authored note body was not found in ANY published-zip entry`,
    ).not.toHaveLength(0);
    // Documented leg: the projection renders static viewer pages (STATIC_PAGE_OPTS). Report whether the
    // body landed in a rendered .html page (the "renders" evidence) vs. only the annotation data — the
    // assertion above already guarantees the note was carried; this log makes the render-leg explicit.
    console.log(
      `[loop-publish] note body present in ${entriesWithBody.length} zip entr${entriesWithBody.length === 1 ? "y" : "ies"}: ${entriesWithBody.join(", ")}`,
    );
    console.log(
      `[loop-publish] rendered HTML page(s) containing the note body: ${htmlEntriesWithBody.length ? htmlEntriesWithBody.join(", ") : "(none — carried as annotation data only)"}`,
    );

    expect(errs.pageErrors, `uncaught errors: ${errs.pageErrors.join(" | ")}`).toEqual([]);
    expect(errs.consoleErrors, `console errors: ${errs.consoleErrors.join(" | ")}`).toEqual([]);
  });
});

/** Save the captured download, unzip it, and return which entries (and which .html entries) contain
 *  the authored note body. Uses the system `unzip` (present in this environment) — no bundler dep. */
async function extractAndFind(download: Download, body: string) {
  const dir = mkdtempSync(join(tmpdir(), "archie-loop-"));
  const zipPath = join(dir, "published.archie.zip");
  await download.saveAs(zipPath);
  const outDir = join(dir, "out");
  execFileSync("unzip", ["-o", "-qq", zipPath, "-d", outDir]);

  const entriesWithBody: string[] = [];
  const htmlEntriesWithBody: string[] = [];
  const walk = (root: string, rel = "") => {
    for (const name of readdirSync(root)) {
      const abs = join(root, name);
      const relPath = rel ? `${rel}/${name}` : name;
      if (statSync(abs).isDirectory()) { walk(abs, relPath); continue; }
      let text: string;
      try { text = readFileSync(abs, "utf8"); } catch { continue; } // skip unreadable binaries
      if (text.includes(body)) {
        entriesWithBody.push(relPath);
        if (relPath.endsWith(".html")) htmlEntriesWithBody.push(relPath);
      }
    }
  };
  walk(outDir);
  return { entriesWithBody, htmlEntriesWithBody };
}
