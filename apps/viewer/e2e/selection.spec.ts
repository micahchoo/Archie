import { test, expect } from "@playwright/test";
import { goOffline } from "./offline.js";

// Archie-52a0 (V43/V46/V47) — what the canvas says about the note you opened.
//
// WHAT IS AND IS NOT HERE, and why. This suite runs with the network cut (see arrival.spec.ts), and
// every annotated seed exhibit is REMOTELY sourced — Yale IIIF, archive.org, OSM. Offline, OSD never
// opens an image, so no mark, no frame and no halo is ever drawn: measured, `.a9s-annotation` count
// 0 and `#archie-object-frame` absent on every exhibit. The one locally-sourced exhibit
// (`screenshots`) paints fine but carries no listed notes. So the canvas-overlay assertions CANNOT
// live here without either making CI depend on a third party's uptime or shipping a fixture tile
// server, and the ones below are deliberately the subset that survives with the network gone.
//
// The canvas half is covered where it can be: `recipes/smoke.mjs` drives the BUILT embed bundle
// against a local library in real Chromium and asserts the ring exists, has real extent, and does
// not shield the mark it points at — with a real `page.mouse.click`, which is the only thing that
// can catch this bug class at all (.claude/rules/osd-overlay-wrapper.md).
//
// The viewer's OTHER renderer (Annotorious/WebGL, `createMount`) was verified by driving it online
// by hand on 2026-07-25: halo 455×626px, 3 rings, `aria-hidden="true"`, wrapper `pointer-events:
// none`, and the whole-object frame still present with `tabindex="0"` after Hide-all. That drive is
// NOT automated — a real gap, recorded rather than papered over.

const HALO = "#archie-selection-halo";

test.describe("the selection ring means something (V43)", () => {
  test("no halo before anything is selected", async ({ page }) => {
    // The ring must be a signal, not chrome. If it were present on arrival it would say nothing.
    await goOffline(page);
    await page.goto("./#/voynich");
    await page.locator("button.object").first().click();
    await expect(page.locator(HALO)).toHaveCount(0);
  });
});

test.describe("the legend swatch shows what the canvas draws (V47)", () => {
  test("the swatch is a miniature mark, not a solid disc", async ({ page }) => {
    await goOffline(page);
    await page.goto("./#/screenshots");
    const legend = page.locator("aside.legend");
    await expect(legend).toBeVisible();

    // The swatch is now sourced from the same `readingMarkerStyle` call the canvas paints with, so
    // it carries the mark's real fill/stroke opacities as SVG attributes. The old swatch was a CSS
    // `background:` block, which has none of these — this assertion cannot pass against it.
    const rect = legend.locator("svg.sw rect").first();
    await expect(rect).toHaveAttribute("fill-opacity", /.+/);
    await expect(rect).toHaveAttribute("stroke-opacity", /.+/);

    // A mark is an OUTLINE with a light fill. A saturated block promises something the reader then
    // has to hunt for as a faint outline — which is exactly what V47 reported.
    expect(Number(await rect.getAttribute("fill-opacity"))).toBeLessThan(0.5);
    expect(Number(await rect.getAttribute("stroke-opacity"))).toBeGreaterThan(0.5);
  });

  test("every reading's swatch is drawn the same way", async ({ page }) => {
    // Including "General notes", which had its own hand-rolled `.sw.base` CSS rule. One code path,
    // or the base layer drifts from the readings again.
    await goOffline(page);
    await page.goto("./#/screenshots");
    await expect(page.locator("aside.legend")).toBeVisible(); // the island must hydrate before counting
    const swatches = page.locator("aside.legend svg.sw");
    const n = await swatches.count();
    expect(n).toBeGreaterThan(1);
    for (let i = 0; i < n; i++) {
      await expect(swatches.nth(i).locator("rect")).toHaveAttribute("fill-opacity", /.+/);
    }
  });
});
