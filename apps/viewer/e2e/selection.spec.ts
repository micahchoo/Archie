import { test, expect } from "@playwright/test";
import { FRAME, HALO, aHaloNote, aWholeObjectNote, boxOf, goOffline, openPaintedNarrative, openPaintedNote } from "./offline.js";

// Archie-52a0 (V43/V46/V47) — what the canvas says about the note you opened.
//
// THIS FILE USED TO SAY THESE ASSERTIONS COULD NOT LIVE HERE. Its old header read: "every annotated
// seed exhibit is REMOTELY sourced ... The one locally-sourced exhibit (`screenshots`) paints fine
// but carries no listed notes. So the canvas-overlay assertions CANNOT live here without either
// making CI depend on a third party's uptime or shipping a fixture tile server." The second clause is
// no longer true: `screenshots` now publishes 87 notes across its 21 local canvases — 68 with region
// geometry, 19 whole-object. Measured, with the network cut, on a real note address: halo present,
// 3 rings, `aria-hidden="true"`, wrapper `pointer-events: none`, extent 291x24px, and the object
// frame `tabindex="0"` / `aria-label="View whole object"` still there after Hide-all.
//
// That is the whole hand-drive of 2026-07-25, and it is now this file. `canvas-offline.spec.ts`
// asserts the premise so it cannot rot back into a comment.
//
// The embed's OTHER renderer (the DOM-overlay `read-mount`, not the viewer's Annotorious/WebGL
// `createMount`) is still covered by `recipes/smoke.mjs` against the built bundle. Both are needed:
// they are different code paths that fail differently, which is the V45 finding.

test.describe("the selection ring means something (V43)", () => {
  test("no halo before anything is selected", async ({ page }) => {
    // The ring must be a signal, not chrome. If it were present on arrival it would say nothing.
    //
    // This ran on `voynich` until 2026-07-25, where OSD never opened and no overlay of any kind was
    // ever drawn — so it passed against a surface that COULD NOT have produced a halo, i.e. it
    // asserted nothing. On a painted canvas it is a real claim.
    await goOffline(page);
    await openPaintedNarrative(page);
    await expect(page.locator(HALO)).toHaveCount(0);
  });

  test("selecting a region note draws a ring around it", async ({ page, baseURL }) => {
    const note = await aHaloNote(baseURL!);
    await goOffline(page);
    await openPaintedNote(page, note.ulid);

    const halo = page.locator(HALO);
    await expect(halo).toHaveCount(1);

    // Real extent, not a degenerate node. A ring collapsed to 0x0 is present, invisible, and would
    // satisfy a presence-only assertion — the plausible-looking wrong answer for a geometry bug.
    const box = await boxOf(page, HALO);
    expect(box, "the halo has no box").not.toBeNull();
    expect(box!.width, `halo width ${box!.width}`).toBeGreaterThan(4);
    expect(box!.height, `halo height ${box!.height}`).toBeGreaterThan(4);

    // Three concentric strokes: the ring reads on both a light and a dark object, which is why it is
    // three and not one (selection-halo.ts's header). One stroke is a regression, not a restyle.
    expect(await halo.locator("rect, path, ellipse, polygon").count()).toBeGreaterThanOrEqual(3);
  });

  test("the ring is decoration, and it does not shield what it points at", async ({ page, baseURL }) => {
    // Both halves of .claude/rules/osd-overlay-wrapper.md, on the renderer that rule was NOT written
    // against. The halo is drawn ON TOP of the mark it circles, and OSD wraps every overlay element in
    // a plain div sized to the overlay's box which defaults to `pointer-events: auto` — so an
    // unneutralised wrapper turns the ring into an opaque lid over the very mark the reader just
    // selected, and the next click does nothing at all.
    const note = await aHaloNote(baseURL!);
    await goOffline(page);
    await openPaintedNote(page, note.ulid);

    // It must not be announced: the note it names is already open and read out as a card.
    await expect(page.locator(HALO)).toHaveAttribute("aria-hidden", "true");

    const wrapper = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      const w = el?.parentElement;
      return w ? { id: w.id, pointerEvents: getComputedStyle(w).pointerEvents } : null;
    }, HALO);
    expect(wrapper, "the halo has no OSD wrapper — did addOverlay stop being used?").not.toBeNull();
    // Named, not the bare literal `overlay-wrapper` OSD falls back to for an element with no id —
    // which N overlays would then share.
    expect(wrapper!.id).toBe("overlay-wrapper-archie-selection-halo");
    expect(wrapper!.pointerEvents, "the halo's wrapper is an opaque lid over the mark").toBe("none");

    // AND A CHEAP INVARIANT, NOT A GATE — say so rather than imply otherwise. The rule's diagnostic
    // signature is `elementFromPoint` over a mark returning a bare unnamed DIV. Measured here with
    // BOTH wrappers forced back to `pointer-events: auto`, it still returns `canvas.a9s-gl-canvas`:
    // on THIS renderer Annotorious paints to a WebGL canvas that stacks ABOVE OSD's overlay wrappers,
    // so no wrapper can shield a mark and this assertion cannot be made to fail. It is kept because
    // the stacking order is an assumption worth pinning, not because it catches the wrapper bug.
    // The renderer where that bug DOES bite is the embed's DOM overlay, gated by `recipes/smoke.mjs`.
    const box = (await boxOf(page, HALO))!;
    const hit = await page.evaluate(
      ([x, y]) => {
        const e = document.elementFromPoint(x as number, y as number);
        return { tag: e?.tagName ?? null, cls: typeof e?.className === "string" ? e.className : "" };
      },
      [box.x + box.width / 2, box.y + box.height / 2],
    );
    expect(`${hit.tag}.${hit.cls}`, "something is shielding the mark").not.toBe("DIV.");
  });

  test("a REAL mouse click on a mark opens its note", async ({ page, baseURL }) => {
    // The hit test, driven with a real pointer. Keyboard Enter and a synthetic
    // `el.dispatchEvent(new MouseEvent("click"))` BOTH succeed against code where a real mouse click
    // does nothing (.claude/rules/osd-overlay-wrapper.md's table) — so neither is written here.
    //
    // ALREADY INVESTIGATED, DON'T REDO IT: making the GL canvas `pointer-events: none` does NOT break
    // this test, and that is correct rather than a hole. Measured — with the canvas verifiably out of
    // the hit stack (`elementFromPoint` became `DIV.openseadragon-canvas`), a real click still opened
    // the right note, because Annotorious binds to an ANCESTOR and hit-tests in its own geometry
    // model, so that element's `pointer-events` is inert on this renderer. A change with no
    // user-visible effect failing to turn a test red is the test behaving. The click path IS gated:
    // cutting the canvas→app selection seam turns this red, and it is position-sensitive.
    //
    // Until this build there was nowhere in the viewer suite to drive one: hit-testing needs a painted
    // canvas at a known screen position, and offline there was none. The mark's position is taken from
    // the halo the address-open draws, then the note is dismissed and the same pixel clicked cold.
    const note = await aHaloNote(baseURL!);
    await goOffline(page);
    await openPaintedNote(page, note.ulid);

    const box = (await boxOf(page, HALO))!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    await page.keyboard.press("Escape"); // rung one: dismiss, leaving the image exactly where it is
    await expect(page.locator(HALO)).toHaveCount(0);
    await expect(page.locator(".note-pop")).toHaveCount(0);

    await page.mouse.click(cx, cy);

    // The note that was clicked, not merely "a note opened" — landing on the exhibit's first note is
    // the wrong answer a broken hit test is most likely to produce.
    await expect(page.locator(".note-pop")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".note-pop")).toContainText(note.text.slice(0, 40));
    await expect(page.locator(HALO)).toHaveCount(1);
  });
});

test.describe("the whole-object frame is a mark too (V46)", () => {
  test("a whole-object note is drawn as a named, focusable frame", async ({ page, baseURL }) => {
    // A note with no region selector has no geometry to circle. It used to be warn-and-dropped — it
    // simply vanished from the canvas. `partitionWholeObject` routes it to an object-spanning frame
    // instead, and that frame is the canvas's ONE named keyboard stop.
    const note = await aWholeObjectNote(baseURL!);
    await goOffline(page);
    await openPaintedNote(page, note.ulid);

    const frame = page.locator(FRAME);
    await expect(frame).toHaveCount(1);
    await expect(frame).toHaveAttribute("tabindex", "0");
    await expect(frame).toHaveAttribute("aria-label", /.+/);
  });

  test("the frame survives Hide all — it is the way back to the marks", async ({ page, baseURL }) => {
    // Archie-ed50: Hide-all clears the region marks, and the frame is deliberately exempt because it
    // is the only thing left holding the canvas in the tab order. Hiding it too would make Hide-all a
    // one-way door for a keyboard reader.
    const note = await aWholeObjectNote(baseURL!);
    await goOffline(page);
    await openPaintedNote(page, note.ulid);
    await expect(page.locator(FRAME)).toHaveCount(1);

    await page.locator(".hide-toggle").first().click();

    await expect(page.locator(FRAME)).toHaveCount(1);
    await expect(page.locator(FRAME)).toHaveAttribute("tabindex", "0");
    await expect(page.locator(FRAME)).toHaveAttribute("aria-label", /.+/);
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
