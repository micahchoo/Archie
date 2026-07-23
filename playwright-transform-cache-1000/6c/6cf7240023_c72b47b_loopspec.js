import { test, expect } from "@playwright/test";
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
const OBJ = "ex-voynich.o9";
const COPY_SLUG = "voynich-rosettes-copy";
const IDENTITY_KEY = "archie.displayName.v1"; // App.svelte:102 — pre-seed to skip the identity prompt.

const editorHash = slug => `#/${slug}/o/${OBJ}`;

// Remote-resource console noise: the seed objects stream folios from a remote IIIF service, so
// tile/CORS/4xx failures are EXPECTED in a headless run and are NOT app faults. Same filter posture as
// navigation.spec.ts. (This suite never depends on those loads succeeding — the whole-object note tool
// and the publish path are independent of whether the canvas image mounted.)
const RESOURCE_NOISE = /Failed to load resource|net::ERR|ERR_|status of 4|status of 5|IIIF|openseadragon|CORS|Content Security|favicon|preload|Couldn't load this media/i;
function trackErrors(page) {
  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", e => pageErrors.push(e.message));
  page.on("console", m => {
    if (m.type() === "error" && !RESOURCE_NOISE.test(m.text())) consoleErrors.push(m.text());
  });
  return {
    pageErrors,
    consoleErrors
  };
}

// --- Screen markers (role/label, mirroring navigation.spec.ts) ---
const marker = page => ({
  libraryCard: page.locator("button.card").filter({
    hasText: "The Rosettes"
  }),
  editorNav: page.getByRole("navigation", {
    name: "Exhibit objects"
  }),
  keepCopy: page.getByRole("button", {
    name: "Keep a copy"
  }),
  playgroundKeep: page.locator("button.pg-keep"),
  wholeImageTool: page.getByRole("button", {
    name: /Whole image/
  }),
  notesList: page.getByRole("list", {
    name: "Notes on this object"
  }),
  // The Comment textarea inside the in-place note editor. The expanded region is app-generated
  // (`.note-editor-region#note-editor-<logicalId>`); the Comment field is its FIRST textbox
  // (NoteEditor.svelte:92, before Tags/Reading) — role + structural scope, no brittle text match.
  commentBox: page.locator(".note-editor-region").getByRole("textbox").first(),
  // "← Overview" (App.svelte:1946 backToOverview) — leaving the editor runs an awaited save() that
  // flushes the current exhibit's edits to OPFS synchronously (exhibit-session.svelte.ts save()).
  overviewBack: page.getByRole("button", {
    name: "Overview",
    exact: true
  }),
  overviewGroup: page.getByRole("group", {
    name: "Overview mode"
  })
});
const hashOf = page => page.evaluate(() => location.hash);
const goHash = (page, h) => page.evaluate(x => {
  location.hash = x;
}, h);

// Boot with a CLEAN slate: wipe OPFS + localStorage so the forked-copy slug is deterministic across
// repeats (`--repeat-each`), then reload so the app re-seeds fresh. The init script (set below, per
// test) re-applies the pre-seeded identity + picker removal on every navigation.
async function bootClean(page) {
  await page.goto("/studio/");
  await expect(marker(page).libraryCard.first()).toBeVisible();
  await page.evaluate(async () => {
    try {
      const root = await navigator.storage.getDirectory();
      // @ts-expect-error keys() is present on the OPFS dir handle at runtime.
      for await (const name of root.keys()) await root.removeEntry(name, {
        recursive: true
      });
    } catch {/* no OPFS / already empty — fine */}
    localStorage.clear();
  });
  await page.reload();
  await expect(marker(page).libraryCard.first()).toBeVisible();
}

// Every navigation: identity pre-seeded (skip the first-publish identity prompt), and the File System
// Access pickers removed so the app takes its deterministic, Playwright-capturable fallbacks —
// canFolder=false (binding-store.svelte.ts, folder-backend.ts) routes "Locally" to the zip DOWNLOAD,
// and supportsFileStreamSave()=false (binding.ts) routes the zip save to the OPFS-STAGED streaming
// sink (openOpfsStagedZipSave — headless Chromium has OPFS createWritable), which still ends in an
// <a download> anchor click (the only sink Playwright's download API can intercept). So the captured
// + unzipped archive below is a REAL end-to-end check of the staged streaming path.
async function installInit(page) {
  await page.addInitScript(key => {
    try {
      localStorage.setItem(key, "E2E Tester");
    } catch {/* private mode */}
    // @ts-expect-error non-optional in the lib types, but deletable at runtime.
    delete window.showSaveFilePicker;
    // @ts-expect-error idem.
    delete window.showDirectoryPicker;
  }, IDENTITY_KEY);
}

// Fork the template into a SAVED (persisting) exhibit and land in its editor. Returns nothing — the
// deterministic COPY_SLUG editor is the resting place.
async function forkToSavedEditor(page) {
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
async function authorNote(page, body) {
  const m = marker(page);
  await m.wholeImageTool.click();
  // Creating selects the note, which auto-opens its in-place editor (App.svelte:971 selected→editing).
  await expect(m.commentBox).toBeVisible();
  await m.commentBox.fill(body);
  await m.commentBox.blur(); // <textarea> commits on change/blur → applyForm → editNote
  await expect(m.notesList).toContainText(body);
}
test.describe("Studio core loop: create → autosave → publish (Archie-c9ac)", () => {
  test.beforeEach(async ({
    page
  }) => {
    await installInit(page);
  });
  test("1. authored note autosaves to OPFS and survives a full reload", async ({
    page
  }) => {
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
  test("2. local publish carries the authored note into the published .archie.zip", async ({
    page
  }) => {
    const errs = trackErrors(page);
    const body = `E2E publish note ${crypto.randomUUID()}`;
    await bootClean(page);
    await forkToSavedEditor(page);
    await authorNote(page, body);

    // Open the merged Publish & Share surface (identity pre-seeded → no prompt), choose "Locally".
    // With the folder picker removed (canFolder=false) that path offers the .archie.zip download.
    await page.getByRole("button", {
      name: /Publish & share/
    }).click();
    const dialog = page.getByRole("dialog", {
      name: "Publish"
    });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", {
      name: /Locally/
    }).click();
    const [download] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", {
      name: "Download .archie.zip"
    }).click()]);

    // Extract the captured zip and prove the authored note body is present in the published output.
    const {
      entriesWithBody,
      htmlEntriesWithBody
    } = await extractAndFind(download, body);
    expect(entriesWithBody, `authored note body was not found in ANY published-zip entry`).not.toHaveLength(0);
    // Documented leg: the projection renders static viewer pages (STATIC_PAGE_OPTS). Report whether the
    // body landed in a rendered .html page (the "renders" evidence) vs. only the annotation data — the
    // assertion above already guarantees the note was carried; this log makes the render-leg explicit.
    console.log(`[loop-publish] note body present in ${entriesWithBody.length} zip entr${entriesWithBody.length === 1 ? "y" : "ies"}: ${entriesWithBody.join(", ")}`);
    console.log(`[loop-publish] rendered HTML page(s) containing the note body: ${htmlEntriesWithBody.length ? htmlEntriesWithBody.join(", ") : "(none — carried as annotation data only)"}`);
    expect(errs.pageErrors, `uncaught errors: ${errs.pageErrors.join(" | ")}`).toEqual([]);
    expect(errs.consoleErrors, `console errors: ${errs.consoleErrors.join(" | ")}`).toEqual([]);
  });
});

/** Save the captured download, unzip it, and return which entries (and which .html entries) contain
 *  the authored note body. Uses the system `unzip` (present in this environment) — no bundler dep. */
async function extractAndFind(download, body) {
  const dir = mkdtempSync(join(tmpdir(), "archie-loop-"));
  const zipPath = join(dir, "published.archie.zip");
  await download.saveAs(zipPath);
  const outDir = join(dir, "out");
  execFileSync("unzip", ["-o", "-qq", zipPath, "-d", outDir]);
  const entriesWithBody = [];
  const htmlEntriesWithBody = [];
  const walk = (root, rel = "") => {
    for (const name of readdirSync(root)) {
      const abs = join(root, name);
      const relPath = rel ? `${rel}/${name}` : name;
      if (statSync(abs).isDirectory()) {
        walk(abs, relPath);
        continue;
      }
      let text;
      try {
        text = readFileSync(abs, "utf8");
      } catch {
        continue;
      } // skip unreadable binaries
      if (text.includes(body)) {
        entriesWithBody.push(relPath);
        if (relPath.endsWith(".html")) htmlEntriesWithBody.push(relPath);
      }
    }
  };
  walk(outDir);
  return {
    entriesWithBody,
    htmlEntriesWithBody
  };
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJ0ZXN0IiwiZXhwZWN0IiwiZXhlY0ZpbGVTeW5jIiwibWtkdGVtcFN5bmMiLCJyZWFkZGlyU3luYyIsInJlYWRGaWxlU3luYyIsInN0YXRTeW5jIiwidG1wZGlyIiwiam9pbiIsIlRFTVBMQVRFX1NMVUciLCJPQkoiLCJDT1BZX1NMVUciLCJJREVOVElUWV9LRVkiLCJlZGl0b3JIYXNoIiwic2x1ZyIsIlJFU09VUkNFX05PSVNFIiwidHJhY2tFcnJvcnMiLCJwYWdlIiwicGFnZUVycm9ycyIsImNvbnNvbGVFcnJvcnMiLCJvbiIsImUiLCJwdXNoIiwibWVzc2FnZSIsIm0iLCJ0eXBlIiwidGV4dCIsIm1hcmtlciIsImxpYnJhcnlDYXJkIiwibG9jYXRvciIsImZpbHRlciIsImhhc1RleHQiLCJlZGl0b3JOYXYiLCJnZXRCeVJvbGUiLCJuYW1lIiwia2VlcENvcHkiLCJwbGF5Z3JvdW5kS2VlcCIsIndob2xlSW1hZ2VUb29sIiwibm90ZXNMaXN0IiwiY29tbWVudEJveCIsImZpcnN0Iiwib3ZlcnZpZXdCYWNrIiwiZXhhY3QiLCJvdmVydmlld0dyb3VwIiwiaGFzaE9mIiwiZXZhbHVhdGUiLCJsb2NhdGlvbiIsImhhc2giLCJnb0hhc2giLCJoIiwieCIsImJvb3RDbGVhbiIsImdvdG8iLCJ0b0JlVmlzaWJsZSIsInJvb3QiLCJuYXZpZ2F0b3IiLCJzdG9yYWdlIiwiZ2V0RGlyZWN0b3J5Iiwia2V5cyIsInJlbW92ZUVudHJ5IiwicmVjdXJzaXZlIiwibG9jYWxTdG9yYWdlIiwiY2xlYXIiLCJyZWxvYWQiLCJpbnN0YWxsSW5pdCIsImFkZEluaXRTY3JpcHQiLCJrZXkiLCJzZXRJdGVtIiwid2luZG93Iiwic2hvd1NhdmVGaWxlUGlja2VyIiwic2hvd0RpcmVjdG9yeVBpY2tlciIsImZvcmtUb1NhdmVkRWRpdG9yIiwiY2xpY2siLCJwb2xsIiwidG9Db250YWluIiwidG9IYXZlQ291bnQiLCJhdXRob3JOb3RlIiwiYm9keSIsImZpbGwiLCJibHVyIiwidG9Db250YWluVGV4dCIsImRlc2NyaWJlIiwiYmVmb3JlRWFjaCIsImVycnMiLCJjcnlwdG8iLCJyYW5kb21VVUlEIiwidG9FcXVhbCIsImRpYWxvZyIsImRvd25sb2FkIiwiUHJvbWlzZSIsImFsbCIsIndhaXRGb3JFdmVudCIsImVudHJpZXNXaXRoQm9keSIsImh0bWxFbnRyaWVzV2l0aEJvZHkiLCJleHRyYWN0QW5kRmluZCIsIm5vdCIsInRvSGF2ZUxlbmd0aCIsImNvbnNvbGUiLCJsb2ciLCJsZW5ndGgiLCJkaXIiLCJ6aXBQYXRoIiwic2F2ZUFzIiwib3V0RGlyIiwid2FsayIsInJlbCIsImFicyIsInJlbFBhdGgiLCJpc0RpcmVjdG9yeSIsImluY2x1ZGVzIiwiZW5kc1dpdGgiXSwic291cmNlcyI6WyJsb29wLnNwZWMudHMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgdGVzdCwgZXhwZWN0LCB0eXBlIFBhZ2UsIHR5cGUgRG93bmxvYWQgfSBmcm9tIFwiQHBsYXl3cmlnaHQvdGVzdFwiO1xuaW1wb3J0IHsgZXhlY0ZpbGVTeW5jIH0gZnJvbSBcIm5vZGU6Y2hpbGRfcHJvY2Vzc1wiO1xuaW1wb3J0IHsgbWtkdGVtcFN5bmMsIHJlYWRkaXJTeW5jLCByZWFkRmlsZVN5bmMsIHN0YXRTeW5jIH0gZnJvbSBcIm5vZGU6ZnNcIjtcbmltcG9ydCB7IHRtcGRpciB9IGZyb20gXCJub2RlOm9zXCI7XG5pbXBvcnQgeyBqb2luIH0gZnJvbSBcIm5vZGU6cGF0aFwiO1xuXG4vLyBDb3JlLWxvb3AgZ2F0ZSAoQXJjaGllLWM5YWMpLiBEcml2ZXMgdGhlIFJFQUwgU3R1ZGlvIEFwcCB0aHJvdWdoIGEgcmVhbCBicm93c2VyIHRvIHByb3ZlIHRoZVxuLy8gYXV0aG9yJ3MgY2VudHJhbCBwYXRoIGVuZC10by1lbmQ6IENSRUFURSBhIG5vdGUg4oaSIGl0IEFVVE9TQVZFUyB0byBPUEZTIChzdXJ2aXZlcyBhIHJlbG9hZCkg4oaSXG4vLyBQVUJMSVNIIGxvY2FsbHkg4oaSIHRoZSBwdWJsaXNoZWQgQVJUSUZBQ1QgY2FycmllcyB0aGUgYXV0aG9yZWQgbm90ZS4gVGhpcyBpcyB0aGUgb25lIHBsYWNlIHdlXG4vLyBleGVyY2lzZSB0aGUgY3JlYXRl4oaScGVyc2lzdOKGknB1Ymxpc2ggc2VhbSBhZ2FpbnN0IGEgbW91bnRlZCBBcHAgKyBnZW51aW5lIE9QRlMgKyBhIGdlbnVpbmVcbi8vIHppcC1kb3dubG9hZCBjYXB0dXJlIOKAlCBsZWdzIHRoZSByZXBvJ3MgcHVyZS1tb2R1bGUgdml0ZXN0IHBvc3R1cmUgKG5vIERPTSwgbm8gT1BGUywgbm8gZG93bmxvYWRcbi8vIHNpbmspIHN0cnVjdHVyYWxseSBjYW5ub3QgcmVhY2guXG4vL1xuLy8gV0hBVCBUSElTIFNVSVRFIFBST1ZFUywgYW5kIHdoYXQgaXQgZGVsaWJlcmF0ZWx5IGNhbm5vdCAoc3R1ZGlvLW9ubHkgY29uZmlnIOKAlCB0aGUgQXN0cm8gVmlld2VyIGlzXG4vLyBOT1QgYm9vdGVkIGhlcmU7IHNlZSBlMmUvcGxheXdyaWdodC5jb25maWcudHMsIFwiU2NvcGVkIHRvIGFwcHMvc3R1ZGlvIG9ubHlcIik6XG4vLyAgIOKclCBjcmVhdGUgICDigJQgYSBub3RlIGlzIGF1dGhvcmVkIHZpYSB0aGUgY2FudmFzIG5ldy1ub3RlIHRvb2wgc3RyaXAgKHRoZSBcIldob2xlIGltYWdlXCIgdG9vbCxcbi8vICAgICAgICAgICAgICAgIEFwcC5zdmVsdGU6MjI3MSDihpIgY3JlYXRlV2hvbGVPYmplY3ROb3RlKS4gTk9UIGEgZnJlZWhhbmQgUGl4aUpTLWNhbnZhcyBkcmF3OiB0aGUgc2VlZFxuLy8gICAgICAgICAgICAgICAgb2JqZWN0cyBhbGwgc3RyZWFtIGZyb20gUkVNT1RFIElJSUYgKHNlZWQtZGF0YS50cyDigJQgbm8gbG9jYWwvYnVuZGxlZCBpbWFnZSksIHNvIHRoZVxuLy8gICAgICAgICAgICAgICAgT1NEL0Fubm90b3Jpb3VzL1BpeGlKUyBjYW52YXMgY2Fubm90IG1vdW50IGRldGVybWluaXN0aWNhbGx5IGhlYWRsZXNzLW9mZmxpbmUsIGFuZCBhXG4vLyAgICAgICAgICAgICAgICBzeW50aGV0aWMgZHJhdyBvbiBhIFdlYkdMIHN1cmZhY2UgaXMgaW5oZXJlbnRseSBmbGFreS4gVGhlIHdob2xlLW9iamVjdCB0b29sIGlzIHRoZVxuLy8gICAgICAgICAgICAgICAgc2FtZSBjcmVhdGVOb3RlIHNlYW0gYSBib3gvb3V0bGluZSBkcmF3IGxhbmRzIG9uIChBcHAuc3ZlbHRlOjEzODQtMTQ0MCksIG1pbnVzIHRoZVxuLy8gICAgICAgICAgICAgICAgbm9uLWRldGVybWluaXN0aWMgZ2VzdHVyZSDigJQgZGV0ZXJtaW5pc20gb3ZlciBicmVhZHRoLCBwZXIgdGhlIHRpY2tldC5cbi8vICAg4pyUIGF1dG9zYXZlIOKAlCBwcm92ZW4gYnkgUkVMT0FEIFBFUlNJU1RFTkNFICh0aGUgc3Ryb25nZXN0IHByb29mKTogdGhlIG5vdGUgaXMgcmVhZCBiYWNrIGZyb20gT1BGU1xuLy8gICAgICAgICAgICAgICAgYWZ0ZXIgYSBmdWxsIHBhZ2UgcmVsb2FkLCBvbiBhIFNBVkVEIGV4aGliaXQuIFNlZWQgZXhoaWJpdHMgYXJlIHRlbXBsYXRlcyB0aGF0IG5ldmVyXG4vLyAgICAgICAgICAgICAgICBiaW5kIGFuIE9QRlMgYW5ub3RhdGlvbiBkaXIgKGV4aGliaXQtc2Vzc2lvbi5zdmVsdGUudHMg4oCUIHNhdmUoKSBlYXJseS1yZXR1cm5zIG9uIGFcbi8vICAgICAgICAgICAgICAgIHRlbXBsYXRlKSwgc28gdGhlIHN1aXRlIGZpcnN0IGZvcmtzIG9uZSB2aWEgXCJLZWVwIGEgY29weVwiIChBcHAuc3ZlbHRlOjg2NCBrZWVwQ29weSlcbi8vICAgICAgICAgICAgICAgIGludG8gYSB1c2VyLW93bmVkIGV4aGliaXQgdGhhdCBwZXJzaXN0cy5cbi8vICAg4pyUIHB1Ymxpc2ggIOKAlCB0aGUgaW4tYnJvd3NlciBMT0NBTCBwdWJsaXNoIHBhdGggKFB1Ymxpc2guc3ZlbHRlIFwiTG9jYWxseVwiIOKGkiBvbnppcD1sb2NhbFB1Ymxpc2haaXAsXG4vLyAgICAgICAgICAgICAgICBwdWJsaXNoLWZsb3dzLnN2ZWx0ZS50czoyOTgpLiBJdCBmbHVzaGVzIHRoZSBleGhpYml0IGFuZCBidWlsZHMgdGhlIHNpdGUgcHJvamVjdGlvblxuLy8gICAgICAgICAgICAgICAgaW50byBhIC5hcmNoaWUuemlwIHZpYSB0aGUgU0FNRSBsaWJyYXJ5VG9aaXBGcyBwcm9qZWN0aW9uIGV2ZXJ5IHNpbmsgdXNlcyAoU1RBVElDX1BBR0VfT1BUU1xuLy8gICAgICAgICAgICAgICAg4oCUIHRoZSByZW5kZXJlZCBzdGF0aWMgcGFnZXMpLiBXZSBjYXB0dXJlIHRoYXQgZG93bmxvYWQgYW5kIGFzc2VydCB0aGUgYXV0aG9yZWQgbm90ZSdzXG4vLyAgICAgICAgICAgICAgICBib2R5IHRleHQgaXMgcHJlc2VudCBpbiB0aGUgcHVibGlzaGVkIG91dHB1dC5cbi8vICAg4pyYIGxpdmUgVmlld2VyIHJlbmRlciDigJQgbW91bnRpbmcgdGhlIHB1Ymxpc2hlZCB0cmVlIGluIHRoZSBhY3R1YWwgQXN0cm8gVmlld2VyIGFuZCBhc3NlcnRpbmcgdGhlXG4vLyAgICAgICAgICAgICAgICBub3RlIHJlbmRlcnMgaW4gdGhhdCBET00gaXMgT1VUIE9GIFNDT1BFIGZvciB0aGlzIHN0dWRpby1vbmx5IGNvbmZpZyAobm8gdmlld2VyIHNlcnZlciAvXG4vLyAgICAgICAgICAgICAgICBmcm9udC1kb29yIHByb3h5IGhlcmUpLiBXZSBwcm92ZSB0aGUgcHJvamVjdGlvbiBDQVJSSUVTIHRoZSBub3RlIGludG8gdGhlIHB1Ymxpc2hlZFxuLy8gICAgICAgICAgICAgICAgYXJ0aWZhY3Q7IHJlbmRlcmluZyB0aGF0IGFydGlmYWN0IGluIHRoZSBWaWV3ZXIgaXMgYSB2aWV3ZXItc3VpdGUgY29uY2Vybi5cbi8vXG4vLyBGaXh0dXJlcyAodmVyaWZpZWQgaW4gYXBwcy9zdHVkaW8vc3JjL3NlZWQtZGF0YS50cyArIHZveW5pY2gudHMpOiB0aGUgYnVuZGxlZCBleGFtcGxlIFwiVGhlIFJvc2V0dGVzXCIsXG4vLyBzbHVnIGB2b3luaWNoLXJvc2V0dGVzYCwgaXMgYSBTSU5HTEUtb2JqZWN0IHRlbXBsYXRlIGV4aGliaXQgd2hvc2Ugb25lIG9iamVjdCBpcyBgbzlgLiBcIktlZXAgYSBjb3B5XCJcbi8vIGZvcmtzIGl0IHRvIHRoZSBkZXRlcm1pbmlzdGljIHNsdWcgYHZveW5pY2gtcm9zZXR0ZXMtY29weWAgKEFwcC5zdmVsdGU6ODY5KSwgY2Fycnlpbmcgb2JqZWN0IGlkcy5cbmNvbnN0IFRFTVBMQVRFX1NMVUcgPSBcInZveW5pY2gtcm9zZXR0ZXNcIjtcbmNvbnN0IE9CSiA9IFwiZXgtdm95bmljaC5vOVwiO1xuY29uc3QgQ09QWV9TTFVHID0gXCJ2b3luaWNoLXJvc2V0dGVzLWNvcHlcIjtcbmNvbnN0IElERU5USVRZX0tFWSA9IFwiYXJjaGllLmRpc3BsYXlOYW1lLnYxXCI7IC8vIEFwcC5zdmVsdGU6MTAyIOKAlCBwcmUtc2VlZCB0byBza2lwIHRoZSBpZGVudGl0eSBwcm9tcHQuXG5cbmNvbnN0IGVkaXRvckhhc2ggPSAoc2x1Zzogc3RyaW5nKSA9PiBgIy8ke3NsdWd9L28vJHtPQkp9YDtcblxuLy8gUmVtb3RlLXJlc291cmNlIGNvbnNvbGUgbm9pc2U6IHRoZSBzZWVkIG9iamVjdHMgc3RyZWFtIGZvbGlvcyBmcm9tIGEgcmVtb3RlIElJSUYgc2VydmljZSwgc29cbi8vIHRpbGUvQ09SUy80eHggZmFpbHVyZXMgYXJlIEVYUEVDVEVEIGluIGEgaGVhZGxlc3MgcnVuIGFuZCBhcmUgTk9UIGFwcCBmYXVsdHMuIFNhbWUgZmlsdGVyIHBvc3R1cmUgYXNcbi8vIG5hdmlnYXRpb24uc3BlYy50cy4gKFRoaXMgc3VpdGUgbmV2ZXIgZGVwZW5kcyBvbiB0aG9zZSBsb2FkcyBzdWNjZWVkaW5nIOKAlCB0aGUgd2hvbGUtb2JqZWN0IG5vdGUgdG9vbFxuLy8gYW5kIHRoZSBwdWJsaXNoIHBhdGggYXJlIGluZGVwZW5kZW50IG9mIHdoZXRoZXIgdGhlIGNhbnZhcyBpbWFnZSBtb3VudGVkLilcbmNvbnN0IFJFU09VUkNFX05PSVNFID1cbiAgL0ZhaWxlZCB0byBsb2FkIHJlc291cmNlfG5ldDo6RVJSfEVSUl98c3RhdHVzIG9mIDR8c3RhdHVzIG9mIDV8SUlJRnxvcGVuc2VhZHJhZ29ufENPUlN8Q29udGVudCBTZWN1cml0eXxmYXZpY29ufHByZWxvYWR8Q291bGRuJ3QgbG9hZCB0aGlzIG1lZGlhL2k7XG5cbmZ1bmN0aW9uIHRyYWNrRXJyb3JzKHBhZ2U6IFBhZ2UpIHtcbiAgY29uc3QgcGFnZUVycm9yczogc3RyaW5nW10gPSBbXTtcbiAgY29uc3QgY29uc29sZUVycm9yczogc3RyaW5nW10gPSBbXTtcbiAgcGFnZS5vbihcInBhZ2VlcnJvclwiLCAoZSkgPT4gcGFnZUVycm9ycy5wdXNoKGUubWVzc2FnZSkpO1xuICBwYWdlLm9uKFwiY29uc29sZVwiLCAobSkgPT4ge1xuICAgIGlmIChtLnR5cGUoKSA9PT0gXCJlcnJvclwiICYmICFSRVNPVVJDRV9OT0lTRS50ZXN0KG0udGV4dCgpKSkgY29uc29sZUVycm9ycy5wdXNoKG0udGV4dCgpKTtcbiAgfSk7XG4gIHJldHVybiB7IHBhZ2VFcnJvcnMsIGNvbnNvbGVFcnJvcnMgfTtcbn1cblxuLy8gLS0tIFNjcmVlbiBtYXJrZXJzIChyb2xlL2xhYmVsLCBtaXJyb3JpbmcgbmF2aWdhdGlvbi5zcGVjLnRzKSAtLS1cbmNvbnN0IG1hcmtlciA9IChwYWdlOiBQYWdlKSA9PiAoe1xuICBsaWJyYXJ5Q2FyZDogcGFnZS5sb2NhdG9yKFwiYnV0dG9uLmNhcmRcIikuZmlsdGVyKHsgaGFzVGV4dDogXCJUaGUgUm9zZXR0ZXNcIiB9KSxcbiAgZWRpdG9yTmF2OiBwYWdlLmdldEJ5Um9sZShcIm5hdmlnYXRpb25cIiwgeyBuYW1lOiBcIkV4aGliaXQgb2JqZWN0c1wiIH0pLFxuICBrZWVwQ29weTogcGFnZS5nZXRCeVJvbGUoXCJidXR0b25cIiwgeyBuYW1lOiBcIktlZXAgYSBjb3B5XCIgfSksXG4gIHBsYXlncm91bmRLZWVwOiBwYWdlLmxvY2F0b3IoXCJidXR0b24ucGcta2VlcFwiKSxcbiAgd2hvbGVJbWFnZVRvb2w6IHBhZ2UuZ2V0QnlSb2xlKFwiYnV0dG9uXCIsIHsgbmFtZTogL1dob2xlIGltYWdlLyB9KSxcbiAgbm90ZXNMaXN0OiBwYWdlLmdldEJ5Um9sZShcImxpc3RcIiwgeyBuYW1lOiBcIk5vdGVzIG9uIHRoaXMgb2JqZWN0XCIgfSksXG4gIC8vIFRoZSBDb21tZW50IHRleHRhcmVhIGluc2lkZSB0aGUgaW4tcGxhY2Ugbm90ZSBlZGl0b3IuIFRoZSBleHBhbmRlZCByZWdpb24gaXMgYXBwLWdlbmVyYXRlZFxuICAvLyAoYC5ub3RlLWVkaXRvci1yZWdpb24jbm90ZS1lZGl0b3ItPGxvZ2ljYWxJZD5gKTsgdGhlIENvbW1lbnQgZmllbGQgaXMgaXRzIEZJUlNUIHRleHRib3hcbiAgLy8gKE5vdGVFZGl0b3Iuc3ZlbHRlOjkyLCBiZWZvcmUgVGFncy9SZWFkaW5nKSDigJQgcm9sZSArIHN0cnVjdHVyYWwgc2NvcGUsIG5vIGJyaXR0bGUgdGV4dCBtYXRjaC5cbiAgY29tbWVudEJveDogcGFnZS5sb2NhdG9yKFwiLm5vdGUtZWRpdG9yLXJlZ2lvblwiKS5nZXRCeVJvbGUoXCJ0ZXh0Ym94XCIpLmZpcnN0KCksXG4gIC8vIFwi4oaQIE92ZXJ2aWV3XCIgKEFwcC5zdmVsdGU6MTk0NiBiYWNrVG9PdmVydmlldykg4oCUIGxlYXZpbmcgdGhlIGVkaXRvciBydW5zIGFuIGF3YWl0ZWQgc2F2ZSgpIHRoYXRcbiAgLy8gZmx1c2hlcyB0aGUgY3VycmVudCBleGhpYml0J3MgZWRpdHMgdG8gT1BGUyBzeW5jaHJvbm91c2x5IChleGhpYml0LXNlc3Npb24uc3ZlbHRlLnRzIHNhdmUoKSkuXG4gIG92ZXJ2aWV3QmFjazogcGFnZS5nZXRCeVJvbGUoXCJidXR0b25cIiwgeyBuYW1lOiBcIk92ZXJ2aWV3XCIsIGV4YWN0OiB0cnVlIH0pLFxuICBvdmVydmlld0dyb3VwOiBwYWdlLmdldEJ5Um9sZShcImdyb3VwXCIsIHsgbmFtZTogXCJPdmVydmlldyBtb2RlXCIgfSksXG59KTtcblxuY29uc3QgaGFzaE9mID0gKHBhZ2U6IFBhZ2UpID0+IHBhZ2UuZXZhbHVhdGUoKCkgPT4gbG9jYXRpb24uaGFzaCk7XG5jb25zdCBnb0hhc2ggPSAocGFnZTogUGFnZSwgaDogc3RyaW5nKSA9PiBwYWdlLmV2YWx1YXRlKCh4KSA9PiB7IGxvY2F0aW9uLmhhc2ggPSB4OyB9LCBoKTtcblxuLy8gQm9vdCB3aXRoIGEgQ0xFQU4gc2xhdGU6IHdpcGUgT1BGUyArIGxvY2FsU3RvcmFnZSBzbyB0aGUgZm9ya2VkLWNvcHkgc2x1ZyBpcyBkZXRlcm1pbmlzdGljIGFjcm9zc1xuLy8gcmVwZWF0cyAoYC0tcmVwZWF0LWVhY2hgKSwgdGhlbiByZWxvYWQgc28gdGhlIGFwcCByZS1zZWVkcyBmcmVzaC4gVGhlIGluaXQgc2NyaXB0IChzZXQgYmVsb3csIHBlclxuLy8gdGVzdCkgcmUtYXBwbGllcyB0aGUgcHJlLXNlZWRlZCBpZGVudGl0eSArIHBpY2tlciByZW1vdmFsIG9uIGV2ZXJ5IG5hdmlnYXRpb24uXG5hc3luYyBmdW5jdGlvbiBib290Q2xlYW4ocGFnZTogUGFnZSkge1xuICBhd2FpdCBwYWdlLmdvdG8oXCIvc3R1ZGlvL1wiKTtcbiAgYXdhaXQgZXhwZWN0KG1hcmtlcihwYWdlKS5saWJyYXJ5Q2FyZC5maXJzdCgpKS50b0JlVmlzaWJsZSgpO1xuICBhd2FpdCBwYWdlLmV2YWx1YXRlKGFzeW5jICgpID0+IHtcbiAgICB0cnkge1xuICAgICAgY29uc3Qgcm9vdCA9IGF3YWl0IG5hdmlnYXRvci5zdG9yYWdlLmdldERpcmVjdG9yeSgpO1xuICAgICAgLy8gQHRzLWV4cGVjdC1lcnJvciBrZXlzKCkgaXMgcHJlc2VudCBvbiB0aGUgT1BGUyBkaXIgaGFuZGxlIGF0IHJ1bnRpbWUuXG4gICAgICBmb3IgYXdhaXQgKGNvbnN0IG5hbWUgb2Ygcm9vdC5rZXlzKCkpIGF3YWl0IHJvb3QucmVtb3ZlRW50cnkobmFtZSwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG4gICAgfSBjYXRjaCB7IC8qIG5vIE9QRlMgLyBhbHJlYWR5IGVtcHR5IOKAlCBmaW5lICovIH1cbiAgICBsb2NhbFN0b3JhZ2UuY2xlYXIoKTtcbiAgfSk7XG4gIGF3YWl0IHBhZ2UucmVsb2FkKCk7XG4gIGF3YWl0IGV4cGVjdChtYXJrZXIocGFnZSkubGlicmFyeUNhcmQuZmlyc3QoKSkudG9CZVZpc2libGUoKTtcbn1cblxuLy8gRXZlcnkgbmF2aWdhdGlvbjogaWRlbnRpdHkgcHJlLXNlZWRlZCAoc2tpcCB0aGUgZmlyc3QtcHVibGlzaCBpZGVudGl0eSBwcm9tcHQpLCBhbmQgdGhlIEZpbGUgU3lzdGVtXG4vLyBBY2Nlc3MgcGlja2VycyByZW1vdmVkIHNvIHRoZSBhcHAgdGFrZXMgaXRzIGRldGVybWluaXN0aWMsIFBsYXl3cmlnaHQtY2FwdHVyYWJsZSBmYWxsYmFja3Mg4oCUXG4vLyBjYW5Gb2xkZXI9ZmFsc2UgKGJpbmRpbmctc3RvcmUuc3ZlbHRlLnRzLCBmb2xkZXItYmFja2VuZC50cykgcm91dGVzIFwiTG9jYWxseVwiIHRvIHRoZSB6aXAgRE9XTkxPQUQsXG4vLyBhbmQgc3VwcG9ydHNGaWxlU3RyZWFtU2F2ZSgpPWZhbHNlIChiaW5kaW5nLnRzKSByb3V0ZXMgdGhlIHppcCBzYXZlIHRvIHRoZSBPUEZTLVNUQUdFRCBzdHJlYW1pbmdcbi8vIHNpbmsgKG9wZW5PcGZzU3RhZ2VkWmlwU2F2ZSDigJQgaGVhZGxlc3MgQ2hyb21pdW0gaGFzIE9QRlMgY3JlYXRlV3JpdGFibGUpLCB3aGljaCBzdGlsbCBlbmRzIGluIGFuXG4vLyA8YSBkb3dubG9hZD4gYW5jaG9yIGNsaWNrICh0aGUgb25seSBzaW5rIFBsYXl3cmlnaHQncyBkb3dubG9hZCBBUEkgY2FuIGludGVyY2VwdCkuIFNvIHRoZSBjYXB0dXJlZFxuLy8gKyB1bnppcHBlZCBhcmNoaXZlIGJlbG93IGlzIGEgUkVBTCBlbmQtdG8tZW5kIGNoZWNrIG9mIHRoZSBzdGFnZWQgc3RyZWFtaW5nIHBhdGguXG5hc3luYyBmdW5jdGlvbiBpbnN0YWxsSW5pdChwYWdlOiBQYWdlKSB7XG4gIGF3YWl0IHBhZ2UuYWRkSW5pdFNjcmlwdCgoa2V5KSA9PiB7XG4gICAgdHJ5IHsgbG9jYWxTdG9yYWdlLnNldEl0ZW0oa2V5LCBcIkUyRSBUZXN0ZXJcIik7IH0gY2F0Y2ggeyAvKiBwcml2YXRlIG1vZGUgKi8gfVxuICAgIC8vIEB0cy1leHBlY3QtZXJyb3Igbm9uLW9wdGlvbmFsIGluIHRoZSBsaWIgdHlwZXMsIGJ1dCBkZWxldGFibGUgYXQgcnVudGltZS5cbiAgICBkZWxldGUgd2luZG93LnNob3dTYXZlRmlsZVBpY2tlcjtcbiAgICAvLyBAdHMtZXhwZWN0LWVycm9yIGlkZW0uXG4gICAgZGVsZXRlIHdpbmRvdy5zaG93RGlyZWN0b3J5UGlja2VyO1xuICB9LCBJREVOVElUWV9LRVkpO1xufVxuXG4vLyBGb3JrIHRoZSB0ZW1wbGF0ZSBpbnRvIGEgU0FWRUQgKHBlcnNpc3RpbmcpIGV4aGliaXQgYW5kIGxhbmQgaW4gaXRzIGVkaXRvci4gUmV0dXJucyBub3RoaW5nIOKAlCB0aGVcbi8vIGRldGVybWluaXN0aWMgQ09QWV9TTFVHIGVkaXRvciBpcyB0aGUgcmVzdGluZyBwbGFjZS5cbmFzeW5jIGZ1bmN0aW9uIGZvcmtUb1NhdmVkRWRpdG9yKHBhZ2U6IFBhZ2UpIHtcbiAgY29uc3QgbSA9IG1hcmtlcihwYWdlKTtcbiAgYXdhaXQgZ29IYXNoKHBhZ2UsIGVkaXRvckhhc2goVEVNUExBVEVfU0xVRykpO1xuICBhd2FpdCBleHBlY3QobS5lZGl0b3JOYXYpLnRvQmVWaXNpYmxlKCk7XG4gIC8vIFRoZSB0ZW1wbGF0ZSBzaG93cyB0aGUgcGxheWdyb3VuZCBcIktlZXAgYSBjb3B5XCIgYWZmb3JkYW5jZTsgYSBzYXZlZCBleGhpYml0IGRvZXMgbm90LlxuICBhd2FpdCBleHBlY3QobS5rZWVwQ29weSkudG9CZVZpc2libGUoKTtcbiAgYXdhaXQgbS5rZWVwQ29weS5jbGljaygpO1xuICAvLyBrZWVwQ29weSBwZXJzaXN0cyB0aGUgbGlicmFyeSArIG9wZW5zIHRoZSBjb3B5J3Mgb3ZlcnZpZXcuIFdhaXQgZm9yIHRoZSBzbHVnIHRvIHN3aXRjaC5cbiAgYXdhaXQgZXhwZWN0LnBvbGwoKCkgPT4gaGFzaE9mKHBhZ2UpKS50b0NvbnRhaW4oQ09QWV9TTFVHKTtcbiAgYXdhaXQgZ29IYXNoKHBhZ2UsIGVkaXRvckhhc2goQ09QWV9TTFVHKSk7XG4gIGF3YWl0IGV4cGVjdChtLmVkaXRvck5hdikudG9CZVZpc2libGUoKTtcbiAgYXdhaXQgZXhwZWN0KG0ucGxheWdyb3VuZEtlZXApLnRvSGF2ZUNvdW50KDApOyAvLyB0aGUgY29weSBpcyBzYXZlZCDigJQgbm8gcGxheWdyb3VuZCBiYW5uZXJcbn1cblxuLy8gQXV0aG9yIGEgd2hvbGUtb2JqZWN0IG5vdGUgYW5kIHR5cGUgYGJvZHlgIGludG8gaXQgKGNvbW1pdHRlZCBvbiBibHVyKS4gTGVhdmVzIHRoZSBub3RlIHByZXNlbnQgaW5cbi8vIHRoZSBsaXZlIHNlc3Npb24gKyBub3RlcyBsaXN0OyBQRVJTSVNURU5DRSAodGhlIGRlYm91bmNlZCBPUEZTIHdyaXRlKSBpcyBmb3JjZWQgZXhwbGljaXRseSBieSBlYWNoXG4vLyBjYWxsZXIg4oCUIHZpYSB0aGUgXCLihpAgT3ZlcnZpZXdcIiBmbHVzaCAocmVsb2FkIHRlc3QpIG9yIHRoZSBwdWJsaXNoIGZsdXNoIChwdWJsaXNoIHRlc3QpIOKAlCBzbyBub3RoaW5nXG4vLyBoZXJlIGRlcGVuZHMgb24gdGhlIDgwMG1zIGRlYm91bmNlIGZpcmluZy5cbmFzeW5jIGZ1bmN0aW9uIGF1dGhvck5vdGUocGFnZTogUGFnZSwgYm9keTogc3RyaW5nKSB7XG4gIGNvbnN0IG0gPSBtYXJrZXIocGFnZSk7XG4gIGF3YWl0IG0ud2hvbGVJbWFnZVRvb2wuY2xpY2soKTtcbiAgLy8gQ3JlYXRpbmcgc2VsZWN0cyB0aGUgbm90ZSwgd2hpY2ggYXV0by1vcGVucyBpdHMgaW4tcGxhY2UgZWRpdG9yIChBcHAuc3ZlbHRlOjk3MSBzZWxlY3RlZOKGkmVkaXRpbmcpLlxuICBhd2FpdCBleHBlY3QobS5jb21tZW50Qm94KS50b0JlVmlzaWJsZSgpO1xuICBhd2FpdCBtLmNvbW1lbnRCb3guZmlsbChib2R5KTtcbiAgYXdhaXQgbS5jb21tZW50Qm94LmJsdXIoKTsgLy8gPHRleHRhcmVhPiBjb21taXRzIG9uIGNoYW5nZS9ibHVyIOKGkiBhcHBseUZvcm0g4oaSIGVkaXROb3RlXG4gIGF3YWl0IGV4cGVjdChtLm5vdGVzTGlzdCkudG9Db250YWluVGV4dChib2R5KTtcbn1cblxudGVzdC5kZXNjcmliZShcIlN0dWRpbyBjb3JlIGxvb3A6IGNyZWF0ZSDihpIgYXV0b3NhdmUg4oaSIHB1Ymxpc2ggKEFyY2hpZS1jOWFjKVwiLCAoKSA9PiB7XG4gIHRlc3QuYmVmb3JlRWFjaChhc3luYyAoeyBwYWdlIH0pID0+IHtcbiAgICBhd2FpdCBpbnN0YWxsSW5pdChwYWdlKTtcbiAgfSk7XG5cbiAgdGVzdChcIjEuIGF1dGhvcmVkIG5vdGUgYXV0b3NhdmVzIHRvIE9QRlMgYW5kIHN1cnZpdmVzIGEgZnVsbCByZWxvYWRcIiwgYXN5bmMgKHsgcGFnZSB9KSA9PiB7XG4gICAgY29uc3QgZXJycyA9IHRyYWNrRXJyb3JzKHBhZ2UpO1xuICAgIGNvbnN0IGJvZHkgPSBgRTJFIGF1dG9zYXZlIG5vdGUgJHtjcnlwdG8ucmFuZG9tVVVJRCgpfWA7XG5cbiAgICBhd2FpdCBib290Q2xlYW4ocGFnZSk7XG4gICAgYXdhaXQgZm9ya1RvU2F2ZWRFZGl0b3IocGFnZSk7XG4gICAgYXdhaXQgYXV0aG9yTm90ZShwYWdlLCBib2R5KTtcblxuICAgIC8vIExlYXZlIHRoZSBlZGl0b3I6IGJhY2tUb092ZXJ2aWV3IHJ1bnMgYW4gYXdhaXRlZCBzYXZlKCkgdGhhdCBmbHVzaGVzIHRoZSBub3RlIHRvIE9QRlMuIE9uY2UgdGhlXG4gICAgLy8gb3ZlcnZpZXcgc2NyZWVuIGlzIHNob3duLCB0aGUgd3JpdGUgaGFzIGNvbW1pdHRlZCDigJQgYSBkZXRlcm1pbmlzdGljIHBlcnNpc3QgcG9pbnQsIG5vIHNsZWVwLlxuICAgIGF3YWl0IG1hcmtlcihwYWdlKS5vdmVydmlld0JhY2suY2xpY2soKTtcbiAgICBhd2FpdCBleHBlY3QobWFya2VyKHBhZ2UpLm92ZXJ2aWV3R3JvdXApLnRvQmVWaXNpYmxlKCk7XG5cbiAgICAvLyBUaGUgcmVsb2FkIGlzIHRoZSBwcm9vZjogdGhlIG5vdGUgY29tZXMgYmFjayBvbmx5IGlmIGl0IHdhcyBwZXJzaXN0ZWQgdG8gT1BGUy4gTk9URTogbm8gc3RvcmFnZVxuICAgIC8vIHdpcGUgaGVyZSDigJQgb25seSBib290Q2xlYW4gd2lwZXM7IHRoaXMgcmVsb2FkIHByZXNlcnZlcyB0aGUganVzdC1zYXZlZCBjb3B5IGV4aGliaXQgKyBpdHMgbm90ZXMuXG4gICAgYXdhaXQgcGFnZS5yZWxvYWQoKTtcbiAgICBhd2FpdCBnb0hhc2gocGFnZSwgZWRpdG9ySGFzaChDT1BZX1NMVUcpKTtcbiAgICBhd2FpdCBleHBlY3QobWFya2VyKHBhZ2UpLmVkaXRvck5hdikudG9CZVZpc2libGUoKTtcbiAgICBhd2FpdCBleHBlY3QobWFya2VyKHBhZ2UpLm5vdGVzTGlzdCkudG9Db250YWluVGV4dChib2R5KTtcblxuICAgIGV4cGVjdChlcnJzLnBhZ2VFcnJvcnMsIGB1bmNhdWdodCBlcnJvcnM6ICR7ZXJycy5wYWdlRXJyb3JzLmpvaW4oXCIgfCBcIil9YCkudG9FcXVhbChbXSk7XG4gICAgZXhwZWN0KGVycnMuY29uc29sZUVycm9ycywgYGNvbnNvbGUgZXJyb3JzOiAke2VycnMuY29uc29sZUVycm9ycy5qb2luKFwiIHwgXCIpfWApLnRvRXF1YWwoW10pO1xuICB9KTtcblxuICB0ZXN0KFwiMi4gbG9jYWwgcHVibGlzaCBjYXJyaWVzIHRoZSBhdXRob3JlZCBub3RlIGludG8gdGhlIHB1Ymxpc2hlZCAuYXJjaGllLnppcFwiLCBhc3luYyAoeyBwYWdlIH0pID0+IHtcbiAgICBjb25zdCBlcnJzID0gdHJhY2tFcnJvcnMocGFnZSk7XG4gICAgY29uc3QgYm9keSA9IGBFMkUgcHVibGlzaCBub3RlICR7Y3J5cHRvLnJhbmRvbVVVSUQoKX1gO1xuXG4gICAgYXdhaXQgYm9vdENsZWFuKHBhZ2UpO1xuICAgIGF3YWl0IGZvcmtUb1NhdmVkRWRpdG9yKHBhZ2UpO1xuICAgIGF3YWl0IGF1dGhvck5vdGUocGFnZSwgYm9keSk7XG5cbiAgICAvLyBPcGVuIHRoZSBtZXJnZWQgUHVibGlzaCAmIFNoYXJlIHN1cmZhY2UgKGlkZW50aXR5IHByZS1zZWVkZWQg4oaSIG5vIHByb21wdCksIGNob29zZSBcIkxvY2FsbHlcIi5cbiAgICAvLyBXaXRoIHRoZSBmb2xkZXIgcGlja2VyIHJlbW92ZWQgKGNhbkZvbGRlcj1mYWxzZSkgdGhhdCBwYXRoIG9mZmVycyB0aGUgLmFyY2hpZS56aXAgZG93bmxvYWQuXG4gICAgYXdhaXQgcGFnZS5nZXRCeVJvbGUoXCJidXR0b25cIiwgeyBuYW1lOiAvUHVibGlzaCAmIHNoYXJlLyB9KS5jbGljaygpO1xuICAgIGNvbnN0IGRpYWxvZyA9IHBhZ2UuZ2V0QnlSb2xlKFwiZGlhbG9nXCIsIHsgbmFtZTogXCJQdWJsaXNoXCIgfSk7XG4gICAgYXdhaXQgZXhwZWN0KGRpYWxvZykudG9CZVZpc2libGUoKTtcbiAgICBhd2FpdCBkaWFsb2cuZ2V0QnlSb2xlKFwiYnV0dG9uXCIsIHsgbmFtZTogL0xvY2FsbHkvIH0pLmNsaWNrKCk7XG5cbiAgICBjb25zdCBbZG93bmxvYWRdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuICAgICAgcGFnZS53YWl0Rm9yRXZlbnQoXCJkb3dubG9hZFwiKSxcbiAgICAgIGRpYWxvZy5nZXRCeVJvbGUoXCJidXR0b25cIiwgeyBuYW1lOiBcIkRvd25sb2FkIC5hcmNoaWUuemlwXCIgfSkuY2xpY2soKSxcbiAgICBdKTtcblxuICAgIC8vIEV4dHJhY3QgdGhlIGNhcHR1cmVkIHppcCBhbmQgcHJvdmUgdGhlIGF1dGhvcmVkIG5vdGUgYm9keSBpcyBwcmVzZW50IGluIHRoZSBwdWJsaXNoZWQgb3V0cHV0LlxuICAgIGNvbnN0IHsgZW50cmllc1dpdGhCb2R5LCBodG1sRW50cmllc1dpdGhCb2R5IH0gPSBhd2FpdCBleHRyYWN0QW5kRmluZChkb3dubG9hZCwgYm9keSk7XG4gICAgZXhwZWN0KFxuICAgICAgZW50cmllc1dpdGhCb2R5LFxuICAgICAgYGF1dGhvcmVkIG5vdGUgYm9keSB3YXMgbm90IGZvdW5kIGluIEFOWSBwdWJsaXNoZWQtemlwIGVudHJ5YCxcbiAgICApLm5vdC50b0hhdmVMZW5ndGgoMCk7XG4gICAgLy8gRG9jdW1lbnRlZCBsZWc6IHRoZSBwcm9qZWN0aW9uIHJlbmRlcnMgc3RhdGljIHZpZXdlciBwYWdlcyAoU1RBVElDX1BBR0VfT1BUUykuIFJlcG9ydCB3aGV0aGVyIHRoZVxuICAgIC8vIGJvZHkgbGFuZGVkIGluIGEgcmVuZGVyZWQgLmh0bWwgcGFnZSAodGhlIFwicmVuZGVyc1wiIGV2aWRlbmNlKSB2cy4gb25seSB0aGUgYW5ub3RhdGlvbiBkYXRhIOKAlCB0aGVcbiAgICAvLyBhc3NlcnRpb24gYWJvdmUgYWxyZWFkeSBndWFyYW50ZWVzIHRoZSBub3RlIHdhcyBjYXJyaWVkOyB0aGlzIGxvZyBtYWtlcyB0aGUgcmVuZGVyLWxlZyBleHBsaWNpdC5cbiAgICBjb25zb2xlLmxvZyhcbiAgICAgIGBbbG9vcC1wdWJsaXNoXSBub3RlIGJvZHkgcHJlc2VudCBpbiAke2VudHJpZXNXaXRoQm9keS5sZW5ndGh9IHppcCBlbnRyJHtlbnRyaWVzV2l0aEJvZHkubGVuZ3RoID09PSAxID8gXCJ5XCIgOiBcImllc1wifTogJHtlbnRyaWVzV2l0aEJvZHkuam9pbihcIiwgXCIpfWAsXG4gICAgKTtcbiAgICBjb25zb2xlLmxvZyhcbiAgICAgIGBbbG9vcC1wdWJsaXNoXSByZW5kZXJlZCBIVE1MIHBhZ2UocykgY29udGFpbmluZyB0aGUgbm90ZSBib2R5OiAke2h0bWxFbnRyaWVzV2l0aEJvZHkubGVuZ3RoID8gaHRtbEVudHJpZXNXaXRoQm9keS5qb2luKFwiLCBcIikgOiBcIihub25lIOKAlCBjYXJyaWVkIGFzIGFubm90YXRpb24gZGF0YSBvbmx5KVwifWAsXG4gICAgKTtcblxuICAgIGV4cGVjdChlcnJzLnBhZ2VFcnJvcnMsIGB1bmNhdWdodCBlcnJvcnM6ICR7ZXJycy5wYWdlRXJyb3JzLmpvaW4oXCIgfCBcIil9YCkudG9FcXVhbChbXSk7XG4gICAgZXhwZWN0KGVycnMuY29uc29sZUVycm9ycywgYGNvbnNvbGUgZXJyb3JzOiAke2VycnMuY29uc29sZUVycm9ycy5qb2luKFwiIHwgXCIpfWApLnRvRXF1YWwoW10pO1xuICB9KTtcbn0pO1xuXG4vKiogU2F2ZSB0aGUgY2FwdHVyZWQgZG93bmxvYWQsIHVuemlwIGl0LCBhbmQgcmV0dXJuIHdoaWNoIGVudHJpZXMgKGFuZCB3aGljaCAuaHRtbCBlbnRyaWVzKSBjb250YWluXG4gKiAgdGhlIGF1dGhvcmVkIG5vdGUgYm9keS4gVXNlcyB0aGUgc3lzdGVtIGB1bnppcGAgKHByZXNlbnQgaW4gdGhpcyBlbnZpcm9ubWVudCkg4oCUIG5vIGJ1bmRsZXIgZGVwLiAqL1xuYXN5bmMgZnVuY3Rpb24gZXh0cmFjdEFuZEZpbmQoZG93bmxvYWQ6IERvd25sb2FkLCBib2R5OiBzdHJpbmcpIHtcbiAgY29uc3QgZGlyID0gbWtkdGVtcFN5bmMoam9pbih0bXBkaXIoKSwgXCJhcmNoaWUtbG9vcC1cIikpO1xuICBjb25zdCB6aXBQYXRoID0gam9pbihkaXIsIFwicHVibGlzaGVkLmFyY2hpZS56aXBcIik7XG4gIGF3YWl0IGRvd25sb2FkLnNhdmVBcyh6aXBQYXRoKTtcbiAgY29uc3Qgb3V0RGlyID0gam9pbihkaXIsIFwib3V0XCIpO1xuICBleGVjRmlsZVN5bmMoXCJ1bnppcFwiLCBbXCItb1wiLCBcIi1xcVwiLCB6aXBQYXRoLCBcIi1kXCIsIG91dERpcl0pO1xuXG4gIGNvbnN0IGVudHJpZXNXaXRoQm9keTogc3RyaW5nW10gPSBbXTtcbiAgY29uc3QgaHRtbEVudHJpZXNXaXRoQm9keTogc3RyaW5nW10gPSBbXTtcbiAgY29uc3Qgd2FsayA9IChyb290OiBzdHJpbmcsIHJlbCA9IFwiXCIpID0+IHtcbiAgICBmb3IgKGNvbnN0IG5hbWUgb2YgcmVhZGRpclN5bmMocm9vdCkpIHtcbiAgICAgIGNvbnN0IGFicyA9IGpvaW4ocm9vdCwgbmFtZSk7XG4gICAgICBjb25zdCByZWxQYXRoID0gcmVsID8gYCR7cmVsfS8ke25hbWV9YCA6IG5hbWU7XG4gICAgICBpZiAoc3RhdFN5bmMoYWJzKS5pc0RpcmVjdG9yeSgpKSB7IHdhbGsoYWJzLCByZWxQYXRoKTsgY29udGludWU7IH1cbiAgICAgIGxldCB0ZXh0OiBzdHJpbmc7XG4gICAgICB0cnkgeyB0ZXh0ID0gcmVhZEZpbGVTeW5jKGFicywgXCJ1dGY4XCIpOyB9IGNhdGNoIHsgY29udGludWU7IH0gLy8gc2tpcCB1bnJlYWRhYmxlIGJpbmFyaWVzXG4gICAgICBpZiAodGV4dC5pbmNsdWRlcyhib2R5KSkge1xuICAgICAgICBlbnRyaWVzV2l0aEJvZHkucHVzaChyZWxQYXRoKTtcbiAgICAgICAgaWYgKHJlbFBhdGguZW5kc1dpdGgoXCIuaHRtbFwiKSkgaHRtbEVudHJpZXNXaXRoQm9keS5wdXNoKHJlbFBhdGgpO1xuICAgICAgfVxuICAgIH1cbiAgfTtcbiAgd2FsayhvdXREaXIpO1xuICByZXR1cm4geyBlbnRyaWVzV2l0aEJvZHksIGh0bWxFbnRyaWVzV2l0aEJvZHkgfTtcbn1cbiJdLCJtYXBwaW5ncyI6IkFBQUEsU0FBU0EsSUFBSSxFQUFFQyxNQUFNLFFBQWtDLGtCQUFrQjtBQUN6RSxTQUFTQyxZQUFZLFFBQVEsb0JBQW9CO0FBQ2pELFNBQVNDLFdBQVcsRUFBRUMsV0FBVyxFQUFFQyxZQUFZLEVBQUVDLFFBQVEsUUFBUSxTQUFTO0FBQzFFLFNBQVNDLE1BQU0sUUFBUSxTQUFTO0FBQ2hDLFNBQVNDLElBQUksUUFBUSxXQUFXOztBQUVoQztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFD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