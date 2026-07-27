// BROKEN PROBE — preserved as evidence for post-review-fixes-are-unreviewed.md habit 1a.
// NEVER RUN. Not a test. No build wiring points here.
//
// IT PRINTED:            "=> the image does NOT move; the test's premise holds"
// IT HAD EXAMINED:       nothing. It diffed `.openseadragon-canvas`, which is null on the offline
//                        `voynich` route, so `(null ?? 0) - (null ?? 0) === 0` selected the
//                        reassuring branch. The numbers proving the opposite (`main` 345 -> 488,
//                        +143px) were in the SAME line of output, one field over.
// THE TRUTH:             the canvas grows by the docked note row's height on dismissal. Confirmed
//                        on a painted canvas at 1280x720: 416 -> 557, a 141px growth.
//
// The broken conclusion, verbatim, is the block marked BROKEN below. The rest of the file is the
// repaired version — the original body was overwritten in place while chasing the bug, which is
// itself worth noticing: the artifact that misled me no longer existed by the time I wanted to
// study it. Preserve first, then repair.
import { createRequire } from "node:module";
const ROOT = "/mnt/Ghar/2TA/DevStuff/Annotators/Image/Archie/.claude/worktrees/dock-chrome-solo/";
const { chromium } = createRequire(ROOT + "package.json")("playwright");
const B = "http://localhost:4491/viewer/";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.route("**/*", (r) => (new URL(r.request().url()).hostname === "localhost" ? r.continue() : r.abort()));

const snap = () =>
  page.evaluate(() => {
    const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return [b.x, b.y, b.width, b.height].map(Math.round); };
    return {
      main: r(document.querySelector(".reader main")),
      canvas: r(document.querySelector(".openseadragon-canvas")),
      halo: r(document.querySelector("#archie-selection-halo")),
      noteDock: r(document.querySelector(".note-dock")),
    };
  });

await page.goto(B + "#/voynich", { waitUntil: "load" });
await page.locator("button.object").first().click();
await page.locator(".reader main").waitFor();
await page.waitForTimeout(3500);
await page.locator("aside li button").first().click();
await page.waitForTimeout(2000);
const before = await snap();
await page.keyboard.press("Escape");
await page.waitForTimeout(1500);
const after = await snap();

// ---- BROKEN, verbatim. `after.canvas` and `before.canvas` were both null on this route. ----
// const dh = (after.canvas?.[3] ?? 0) - (before.canvas?.[3] ?? 0);
// console.log(`\ncanvas height change on dismiss: ${dh}px  (note row was ${before.noteDock?.[3] ?? 0}px)`);
// console.log(dh === 0 ? "=> the image does NOT move; the test's premise holds"
//                      : "=> the canvas RESIZES on dismiss; a pixel measured before Escape is not the same image point after");

// ---- REPAIRED: diff every box explicitly, and refuse to conclude from a null. ----
for (const k of ["main", "canvas", "halo"]) {
  const b = before[k], a = after[k];
  if (!b || !a) { console.log(`  ${k}: before=${JSON.stringify(b)} after=${JSON.stringify(a)}  (NOT COMPARABLE — refusing to conclude)`); continue; }
  console.log(`  ${k}: h ${b[3]} -> ${a[3]} (Δ ${a[3] - b[3]})   y ${b[1]} -> ${a[1]} (Δ ${a[1] - b[1]})`);
}
console.log(`  note row was ${before.noteDock?.[3] ?? 0}px`);
await browser.close();
