// BROKEN PROBE — preserved as evidence for post-review-fixes-are-unreviewed.md habit 1a.
// NEVER RUN. Not a test. No build wiring points here.
//
// IT PRINTED:      "re-click hits the same mark : 0/20" — on BOTH the baseline tree and the
//                  experimental one, i.e. it reported the experiment as neither better nor worse
//                  than doing nothing.
// IT HAD EXAMINED: a note picked by `ls … | head -1`, whose halo BOUNDING BOX centre is not on its
//                  geometry (a polygon's bbox centre can sit outside the shape). Every click missed
//                  for a reason that had nothing to do with what was being measured.
// THE TRUTH:       the real suite (`selection.spec.ts`, which picks its note via `aHaloNote`) scored
//                  17/20 on the baseline tree and 9/20 on the experimental one — a decisive result,
//                  in the opposite direction from "no difference".
//
// THE TELL, and the reason this file exists: a NEW instrument disagreeing with the EXISTING one by
// that margin is the broken one. The fix was not to debug this probe; it was to stop building a
// second instrument when the suite already answered the question.
import { createRequire } from "node:module";
const ROOT = "/mnt/Ghar/2TA/DevStuff/Annotators/Image/Archie/.claude/worktrees/dock-chrome-solo/";
const { chromium } = createRequire(ROOT + "package.json")("playwright");
const B = "http://localhost:4479/viewer/";
const ULID = process.argv[2];          // <-- picked by `ls | head -1`; THIS is the defect
const N = Number(process.argv[3] || 20);

const browser = await chromium.launch();
const settled = async (page, sel) => {
  let prev = null;
  for (let i = 0; i < 15; i++) {
    const now = await page.evaluate((s) => {
      const e = document.querySelector(s);
      if (!e) return null;
      const b = e.getBoundingClientRect();
      return [b.x, b.y, b.width, b.height].map((n) => Math.round(n * 10) / 10);
    }, sel);
    const k = JSON.stringify(now);
    if (k === prev) return now;
    prev = k;
    await page.waitForTimeout(140);
  }
  return null;
};

let hit = 0, miss = 0, unusable = 0;
for (let i = 0; i < N; i++) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.route("**/*", (r) => (new URL(r.request().url()).hostname === "localhost" ? r.continue() : r.abort()));
  try {
    await page.goto(B + `#/screenshots/a/${ULID}`, { waitUntil: "load" });
    await page.locator(".openseadragon-canvas").first().waitFor({ timeout: 30000 });
    await page.locator("#archie-selection-halo").waitFor({ timeout: 30000 });
    await page.waitForTimeout(1000);
    const halo = await settled(page, "#archie-selection-halo");
    if (!halo) { unusable++; await page.close(); continue; }
    // The unexamined assumption: that the bbox centre is ON the mark.
    const cx = halo[0] + halo[2] / 2;
    const cy = halo[1] + halo[3] / 2;
    await page.keyboard.press("Escape");
    await page.waitForTimeout(1200);
    await page.mouse.click(cx, cy);
    const opened = await page.locator(".note-pop").waitFor({ state: "visible", timeout: 6000 }).then(() => true).catch(() => false);
    opened ? hit++ : miss++;
  } catch { unusable++; }
  await page.close();
}
await browser.close();
console.log(`  re-click hits the same mark : ${hit}/${hit + miss}   (misses ${miss}, unusable ${unusable}, N=${N})`);
