// Shared Playwright drive helpers for the scripts/ harnesses (Archie-9140).
//
// One home for the pieces every studio/viewer-driving script used to copy-paste: the
// bundled-then-system chromium launch ladder, the settle idiom, dev-server discovery
// (probe candidates, boot `pnpm dev` only if nothing answers), and the overview-plate
// selector. Consumers: capture-screenshots.mjs, seed-fixture.mjs, scale-check.mjs.
// A change to any of these belongs HERE, not in a per-script copy.

import { chromium } from "playwright";
import { open, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Overview objects are `<button class="plate">`; exclude the trailing ".plate.add"
// ("Add object") tile. The one literal every studio-driving script needs.
export const PLATE_SELECTOR = "button.plate:not(.add)";

/** Bounded network-idle, then a beat for canvas mounts (OSD/Annotorious/WaveSurfer) to paint —
 *  screenshots and geometry probes are meaningless mid-mount. */
export async function settle(page, ms = 1000) {
  try { await page.waitForLoadState("networkidle", { timeout: 8000 }); } catch {}
  await page.waitForTimeout(ms);
}

const SYSTEM_CHROMIUM = "/usr/bin/chromium-browser";
const SYSTEM_ARGS = ["--no-sandbox", "--disable-dev-shm-usage"];

/** Prefer the bundled chromium; fall back to the system chromium (snap) with --no-sandbox. */
export async function launchBrowser(opts = {}) {
  try {
    return await chromium.launch({ headless: true, ...opts });
  } catch (e) {
    console.log(`  bundled chromium failed (${String(e.message).slice(0, 80)}); trying system chromium`);
    return await chromium.launch({ headless: true, ...opts, executablePath: SYSTEM_CHROMIUM, args: SYSTEM_ARGS });
  }
}

/** Persistent-profile variant (OPFS survives across runs) — same fallback ladder. */
export async function launchPersistentProfile(profileDir, opts = {}) {
  const merged = { headless: true, ...opts };
  try {
    return await chromium.launchPersistentContext(profileDir, merged);
  } catch (e) {
    console.log(`  bundled chromium failed (${String(e.message).slice(0, 70)}); trying system chromium`);
    return await chromium.launchPersistentContext(profileDir, { ...merged, executablePath: SYSTEM_CHROMIUM, args: SYSTEM_ARGS });
  }
}

/** HTTP status for a URL (0 = unreachable). A served SPA route answers 200; a wrong base path 404s. */
export function probe(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => { res.resume(); resolve(res.statusCode ?? 0); });
    req.on("error", () => resolve(0));
    req.setTimeout(2000, () => { req.destroy(); resolve(0); });
  });
}

export const live = (u) => probe(u).then((s) => s > 0 && s < 400);

export async function firstLive(urls) {
  for (const u of urls) if (await live(u)) return u;
  return null;
}

/** Resolve a reachable Studio URL; boot the dev server if none of the candidates answer. Returns
 *  { url, stop } — `stop` is a no-op when we reused an already-running server (never kill what we
 *  didn't start). The URL is DISCOVERED (probe, or parse Vite's "Local:" line from the boot log) to
 *  survive the `/studio/` base + Vite's port auto-increment. */
export async function ensureStudioServer({ repo, candidates, log = console.log, bootLog }) {
  const found = await firstLive(candidates);
  if (found) { log(`• Studio dev server already up at ${found}`); return { url: found, stop: () => {} }; }
  log("• Studio dev server not running — booting `pnpm --filter @archie/studio dev`…");
  const logPath = bootLog ?? path.join(repo, ".scratch", "seed-dev.log");
  const fh = await open(logPath, "w");
  const child = spawn("pnpm", ["--filter", "@archie/studio", "dev"], { cwd: repo, stdio: ["ignore", fh.fd, fh.fd], detached: true });
  let url = null;
  for (let i = 0; i < 120 && !url; i++) {
    await sleep(1000);
    const m = (await readFile(logPath, "utf8").catch(() => "")).match(/(https?:\/\/localhost:\d+\/studio\/)/);
    if (m && (await live(m[1]))) url = m[1];
  }
  await fh.close();
  if (!url) { try { process.kill(-child.pid); } catch {} throw new Error(`Studio dev server didn't serve a /studio/ URL within 120s (see ${logPath})`); }
  log(`• Studio dev server up at ${url}`);
  return { url, stop: () => { try { process.kill(-child.pid); } catch {} } };
}
