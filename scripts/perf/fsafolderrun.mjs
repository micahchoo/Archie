// Archie-b5c2 — run fsbench's AUTOSAVE flow against a REAL user folder, not OPFS.
//
// WHY THIS FILE EXISTS. `fsrun.mjs` runs headless, and headless can never answer this ticket's
// question: `showDirectoryPicker()` requires a user gesture AND a system folder dialog, so the only
// FSA target a headless run can reach is OPFS — which is exactly the case that does NOT pay the
// temp-create + atomic-swap cost on every write. This runner drives the real dialog.
//
// THE RECIPE, and every gotcha it cost to find (measured 2026-07-28 on a Wayland session). Each of
// the first three fails SILENTLY — the picker promise simply never settles and nothing is logged:
//
//   1. Chromium's ozone auto-detect prefers Wayland whenever WAYLAND_DISPLAY is set, so it ignores
//      the Xvfb DISPLAY entirely. The process is alive, `xwininfo` shows zero windows and
//      `import -window root` is uniformly black. Needs BOTH `delete env.WAYLAND_DISPLAY` and
//      `--ozone-platform=x11`.
//   2. With a session D-Bus reachable, Chromium routes the file dialog through
//      xdg-desktop-portal instead of its own GTK chooser. Under Xvfb that hangs forever, and the
//      portal would render on the USER'S REAL DESKTOP rather than the nested display. Setting
//      `DBUS_SESSION_BUS_ADDRESS=disabled:` makes Chromium use the in-process GTK chooser, which
//      lands on the Xvfb display where xdotool can reach it.
//   3. Bare Xvfb has no window manager, so `xdotool windowactivate` refuses outright
//      ("your windowmanager claims not to support _NET_ACTIVE_WINDOW"). `windowfocus`
//      (XSetInputFocus) needs no WM and works.
//   4. `xclip` stays RESIDENT to own the X selection, so `spawnSync("xclip", …)` never returns.
//      Spawn it detached.
//
// Plus the two already written down in `scripts/desktop-smoke.sh`'s header, both re-confirmed here:
// inline autocompletion corrupts `xdotool type` (paste via xclip instead), and Enter does NOT commit
// the location bar (measured: the chooser is pixel-identical after Return — you must click Open).
//
// And one more the header does not have, because it is FSA-specific and it is also this ticket's
// second recorded blocker: picking the folder is not the end. Chromium then raises its own
// readwrite permission bubble ("Allow this site to edit files?"), which is BROWSER UI, not page DOM
// — Playwright cannot see or click it. Only an xdotool click in the browser window reaches it.
//
// Run:  node scripts/perf/fsafolderrun.mjs
//       FSA_TARGET=/path/to/folder FSA_PORT=4372 FSA_DISPLAY=:91 node scripts/perf/fsafolderrun.mjs
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { execFileSync, spawnSync, spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { launchBrowser } from "../lib/driver.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");

const DISPLAY = process.env.FSA_DISPLAY ?? ":91";
const PORT = Number(process.env.FSA_PORT ?? 4372);
const TARGET = process.env.FSA_TARGET ?? mkdtempSync(path.join(tmpdir(), "archie-b5c2-"));
const NOTES = process.env.FSA_NOTES ?? "10,50,200";
const SAVES = process.env.FSA_SAVES ?? "25";

const env = { ...process.env, DISPLAY, DBUS_SESSION_BUS_ADDRESS: "disabled:" };
delete env.WAYLAND_DISPLAY; // gotcha 1

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sh = (cmd, args) => spawnSync(cmd, args, { env, encoding: "utf8" }).stdout ?? "";
const xdo = (...a) => execFileSync("xdotool", a, { env, encoding: "utf8" }).trim();
/** FSA_SHOTS=/dir captures the drive step by step — the only way to see why a click missed, since
 *  every failure in this dialog is silent. */
const SHOTS = process.env.FSA_SHOTS ?? null;
const shot = (name) => { if (SHOTS) try { execFileSync("import", ["-window", "root", path.join(SHOTS, `${name}.png`)], { env }); console.log(`  shot → ${name}.png`); } catch {} };

// ── the nested X server ───────────────────────────────────────────────────────────────────────────
let xvfb = null;
if (!sh("xdotool", ["getdisplaygeometry"]).trim()) {
  console.log(`• starting Xvfb on ${DISPLAY}`);
  xvfb = spawn("Xvfb", [DISPLAY, "-screen", "0", "1600x1000x24", "-nolisten", "tcp"], { stdio: "ignore", detached: true });
  xvfb.unref();
  for (let i = 0; i < 20 && !sh("xdotool", ["getdisplaygeometry"]).trim(); i++) await sleep(500);
}
if (!sh("xdotool", ["getdisplaygeometry"]).trim()) {
  console.error(`FAIL: no X display at ${DISPLAY} (Xvfb missing or refused). This measurement needs a headed browser — do NOT substitute an OPFS number for it.`);
  process.exit(1);
}
console.log(`• display ${DISPLAY} ${sh("xdotool", ["getdisplaygeometry"]).trim().replace("\n", "x")}`);
console.log(`• folder under test: ${TARGET}`);

// ── the bench page ────────────────────────────────────────────────────────────────────────────────
const req = createRequire(path.join(REPO, "apps/studio/package.json"));
const { createServer } = await import(pathToFileURL(req.resolve("vite")).href);
const server = await createServer({
  root: HERE, configFile: false, logLevel: "warn",
  server: { port: PORT, strictPort: true, fs: { allow: [REPO] } },
});
await server.listen();
const url = `http://localhost:${PORT}/fs.html?flow=autosave&folder=1&notes=${NOTES}&saves=${SAVES}`;
console.log(`• bench ${url}`);

// launchBrowser keeps the bundled→system chromium fallback ladder the other harnesses use; the
// opts spread lands after its `headless: true` default, so headless:false wins.
const browser = await launchBrowser({ headless: false, env, args: ["--no-sandbox", "--ozone-platform=x11"] });
const page = await browser.newPage();
page.on("console", (m) => console.log(`  [${m.type()}] ${m.text()}`));
let onPageError;
const failed = new Promise((_, reject) => { onPageError = reject; });
page.on("pageerror", (e) => { console.log(`  [pageerror] ${e.message}`); onPageError(e); });
await page.goto(url, { waitUntil: "load" });

// ── drive the pick ────────────────────────────────────────────────────────────────────────────────
/** xclip holds the selection and never exits — spawnSync on it hangs (gotcha 4). */
function setClipboard(text) {
  const p = spawn("xclip", ["-selection", "clipboard"], { env, detached: true, stdio: ["pipe", "ignore", "ignore"] });
  p.stdin.end(text);
  p.unref();
  return p;
}

async function pickFolder() {
  const clip = setClipboard(TARGET);
  try {
    await page.waitForSelector("#pickfolder", { timeout: 60_000 });
    page.click("#pickfolder").catch(() => {}); // NOT awaited — it blocks on the modal dialog
    let win = null;
    for (let i = 0; i < 60 && !win; i++) {
      await sleep(500);
      const found = sh("xdotool", ["search", "--onlyvisible", "--name", "Select where"]).trim();
      if (found) win = found.split("\n")[0];
    }
    if (!win) throw new Error("the GTK folder chooser never appeared — check gotchas 1 and 2 in this file's header");
    xdo("windowfocus", "--sync", win); // gotcha 3

    await sleep(400);
    xdo("key", "--clearmodifiers", "ctrl+l");   // location bar
    await sleep(500);
    xdo("key", "--clearmodifiers", "ctrl+v");   // paste, never `type` (autocompletion corrupts it)
    await sleep(700);
    xdo("key", "--clearmodifiers", "Return");   // navigates INTO the folder; does NOT commit
    await sleep(1200);

    shot("2-pasted-and-navigated");
    const [, W, H] = sh("xdotool", ["getwindowgeometry", win]).match(/Geometry: (\d+)x(\d+)/).map(Number);
    xdo("mousemove", "--window", win, String(W - 50), String(H - 23), "click", "1"); // Open
    await sleep(1500);
    shot("3-after-open");

    // Chromium's OWN readwrite permission bubble — browser UI, invisible to Playwright.
    const bwin = sh("xdotool", ["search", "--onlyvisible", "--name", "Archie publish-write bench"]).trim().split("\n")[0];
    if (!bwin) throw new Error("could not find the browser window to grant the FSA permission");
    const bgeo = sh("xdotool", ["getwindowgeometry", bwin]).replace(/\s+/g, " ").trim();
    console.log(`  browser window ${bwin} — ${bgeo}`);
    // Grant by KEYBOARD, not by coordinate. The bubble's buttons move vertically with its own text
    // (a long folder name wraps onto a second line and pushes them ~23 px down), so a hardcoded
    // offset silently clicks empty chrome. The bubble takes focus with "Don't Allow" ringed, so
    // Tab lands on "Allow".
    xdo("windowfocus", "--sync", bwin);
    await sleep(400);
    xdo("key", "--clearmodifiers", "Tab");
    await sleep(300);
    xdo("key", "--clearmodifiers", "Return");
    await sleep(1500);
    shot("4-after-allow");

    const ok = await page.evaluate(() => window.__FOLDER_OK__ === true);
    if (!ok) throw new Error("the folder handle never arrived — the permission bubble was probably not clicked (its position is chrome-version-dependent)");
    console.log("• real folder handle granted\n");
  } finally { clip.kill(); }
}

let results;
try {
  await Promise.race([pickFolder(), failed]);
  results = await Promise.race([
    page.waitForFunction(() => window.__BENCH__, null, { timeout: 900_000 }).then((h) => h.jsonValue()),
    failed,
  ]);
} finally {
  await browser.close().catch(() => {});
  await server.close().catch(() => {});
  if (xvfb) { try { process.kill(-xvfb.pid); } catch { try { xvfb.kill(); } catch {} } }
}

console.log("\n--- JSON ---");
console.log(JSON.stringify(results, null, 2));
process.exit(results?.error ? 1 : 0);
