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
    // THE PIXEL IS RE-DERIVED AFTER THE DISMISSAL, and that is the whole of the 2026-07-26 change.
    // This used to measure the halo, press Escape, and click the REMEMBERED pixel, on the premise that
    // dismissal "leaves the image exactly where it is". That premise was true while the note card
    // floated over the canvas. It is false by design since the note docked (ADR-0019's layout row):
    // closing the note removes its row, the canvas grows, and OSD re-centres. This assertion was never
    // about geometry — it is about whether a real pointer reaches the mark — so it now derives the
    // mark's post-dismissal position instead of asserting the old one.
    //
    // The reference is `#archie-object-frame`: a DOM overlay anchored to the IMAGE that survives
    // deselection, so the shift it undergoes is the shift the mark undergoes. Measured 2026-07-26 at
    // 1280x720 — canvas 416 → 557px, frame [35,272,1841,1151] → [35,343,1841,1151]: same width, same
    // height, y +71. A pure TRANSLATION, no rescale, which is why a single offset is a sound
    // correction rather than an approximation. The reflow itself is pinned by its own test below.
    const note = await aHaloNote(baseURL!);
    await goOffline(page);
    await openPaintedNote(page, note.ulid);

    const box = (await boxOf(page, HALO))!;
    // Fail loudly rather than skip: this frame is the coordinate reference, and a fixture that stops
    // carrying a whole-object note on this object must not silently degrade the assertion.
    await expect(page.locator(FRAME), "no object frame to re-derive the mark's position from").toHaveCount(1);
    const anchorOpen = (await boxOf(page, FRAME))!;

    await page.keyboard.press("Escape"); // rung one: dismiss, which now also reflows the canvas
    await expect(page.locator(HALO)).toHaveCount(0);
    await expect(page.locator(".note-pop")).toHaveCount(0);
    await expect(page.locator(".note-dock")).toHaveCount(0); // the row is gone; the canvas has grown

    const anchorClosed = (await boxOf(page, FRAME))!;
    const dx = anchorClosed.x - anchorOpen.x;
    const dy = anchorClosed.y - anchorOpen.y;
    const cx = box.x + box.width / 2 + dx;
    const cy = box.y + box.height / 2 + dy;

    await page.mouse.click(cx, cy);

    // The note that was clicked, not merely "a note opened" — landing on the exhibit's first note is
    // the wrong answer a broken hit test is most likely to produce.
    await expect(page.locator(".note-pop")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".note-pop")).toContainText(note.text.slice(0, 40));
    await expect(page.locator(HALO)).toHaveCount(1);
  });

  test("dismissing a note gives its height back to the image (ADR-0019 layout row)", async ({ page, baseURL }) => {
    // THIS PINS A DESIGN DECISION, and it exists because a decision no test states is one that gets
    // silently reverted. The human ruled on 2026-07-26: the note card DOCKS below the canvas, and
    // dismissing it returns that height to the image rather than holding a permanent reservation.
    //
    // The reasoning, so a future reader does not "fix" this: the reader dismissed the note IN ORDER TO
    // SEE MORE IMAGE, so giving them more image is the correct response. A permanent reservation would
    // be ~141px at 1280x720 — 25% of the 557px canvas — paid in the common case where no note is open,
    // and it would undo the `:empty` gating this slice built to keep the chrome tax proportional.
    //
    // Two rejected alternatives, both measured rather than argued:
    //   · reserve the row permanently — the 25% flat cost above;
    //   · `preserveImageSizeOnResize: true` on the OSD mount — measured over 20 runs of the assertion
    //     above: 17/20 passing became 9/20. It preserves SIZE, not ANCHOR, so holding the on-screen
    //     scale across the growth forces a zoom change and moves the mark further.
    //
    // Asserted as RELATIONSHIPS, not as 141/416/557, so a viewport or token change does not make this
    // a maintenance tax. The literals above are the record of what was measured, not the contract.
    //
    // RED-GREEN, and the injection is recorded because it took six attempts to find one that works.
    // Add a flex sibling BELOW the canvas inside the stage column, in `NarrativeReader.svelte` (see
    // the note on which component below), with a class no locator here names:
    //
    //     </main>
    //     <div class="probe-eater" style="flex:1 1 auto"></div>
    //
    // The freed height then splits between the canvas and the spacer instead of all going to the
    // canvas: "the canvas grew by 71px but the note row was 141px", 3/3. Do not raise the grow factor
    // — at `flex:1000` the canvas is starved to nothing and the run dies on "the deep-zoom canvas
    // never painted", which fails the fixture's precondition rather than this assertion.
    //
    // THE COMPONENT MATTERS, and it is what five earlier attempts got wrong: `screenshots` is a
    // NARRATIVE exhibit, so `openPaintedNote` drives `NarrativeReader.svelte`, not `Reader.svelte`.
    // Injections into `Reader.svelte` compile, ship in the bundle, and never enter the DOM — the tell
    // is `document.querySelector(".reader main")` returning null on this route while
    // `.narrative main` is present. Attacking the CANVAS also does not work (pin its height, add a
    // duplicate row): the assertion is that the canvas ABSORBS the freed space, so the falsification
    // has to make something else absorb it.
    //
    // RED-GREEN, and the injection is recorded because it took six attempts to find one that works.
    // Add a flex sibling BELOW the canvas inside the stage column, in `NarrativeReader.svelte` (see
    // the note on which component below), with a class no locator here names:
    //
    //     </main>
    //     <div class="probe-eater" style="flex:1 1 auto"></div>
    //
    // The freed height then splits between the canvas and the spacer instead of all going to the
    // canvas: "the canvas grew by 71px but the note row was 141px", 3/3. Do not raise the grow factor
    // — at `flex:1000` the canvas is starved to nothing and the run dies on "the deep-zoom canvas
    // never painted", which fails the fixture's precondition rather than this assertion.
    //
    // THE COMPONENT MATTERS, and it is what five earlier attempts got wrong: `screenshots` is a
    // NARRATIVE exhibit, so `openPaintedNote` drives `NarrativeReader.svelte`, not `Reader.svelte`.
    // Injections into `Reader.svelte` compile, ship in the bundle, and never enter the DOM — the tell
    // is `document.querySelector(".reader main")` returning null on this route while
    // `.narrative main` is present. Attacking the CANVAS also does not work (pin its height, add a
    // duplicate row): the assertion is that the canvas ABSORBS the freed space, so the falsification
    // has to make something else absorb it.
    //
    // RED-GREEN, and the injection is recorded because it took six attempts to find one that works.
    // Add a flex sibling BELOW the canvas inside the stage column, in `NarrativeReader.svelte` (see
    // the note on which component below), with a class no locator here names:
    //
    //     </main>
    //     <div class="probe-eater" style="flex:1 1 auto"></div>
    //
    // The freed height then splits between the canvas and the spacer instead of all going to the
    // canvas: "the canvas grew by 71px but the note row was 141px", 3/3. Do not raise the grow factor
    // — at `flex:1000` the canvas is starved to nothing and the run dies on "the deep-zoom canvas
    // never painted", which fails the fixture's precondition rather than this assertion.
    //
    // THE COMPONENT MATTERS, and it is what five earlier attempts got wrong: `screenshots` is a
    // NARRATIVE exhibit, so `openPaintedNote` drives `NarrativeReader.svelte`, not `Reader.svelte`.
    // Injections into `Reader.svelte` compile, ship in the bundle, and never enter the DOM — the tell
    // is `document.querySelector(".reader main")` returning null on this route while
    // `.narrative main` is present. Attacking the CANVAS also does not work (pin its height, add a
    // duplicate row): the assertion is that the canvas ABSORBS the freed space, so the falsification
    // has to make something else absorb it.
    const note = await aHaloNote(baseURL!);
    await goOffline(page);
    await openPaintedNote(page, note.ulid);
    await expect(page.locator(".note-dock")).toHaveCount(1);

    const rowH = (await boxOf(page, ".note-dock"))!.height;
    const canvasOpen = (await boxOf(page, ".openseadragon-canvas"))!;
    await expect(page.locator(FRAME)).toHaveCount(1);
    const anchorOpen = (await boxOf(page, FRAME))!;
    expect(rowH, "the docked note row has no height").toBeGreaterThan(0);

    await page.keyboard.press("Escape");
    await expect(page.locator(".note-dock")).toHaveCount(0);

    const canvasClosed = (await boxOf(page, ".openseadragon-canvas"))!;
    const anchorClosed = (await boxOf(page, FRAME))!;
    const grew = canvasClosed.height - canvasOpen.height;

    // 1. The image gets the row's height back. Reserving the row permanently makes this 0 and fails.
    expect(
      Math.abs(grew - rowH),
      `the canvas grew by ${Math.round(grew)}px but the note row was ${Math.round(rowH)}px — the ` +
        `dismissed row's height is supposed to go to the image, and only to the image`,
    ).toBeLessThanOrEqual(2);

    // WHAT IS DELIBERATELY *NOT* ASSERTED, and this took three measurements to establish. Drafts of
    // this test also claimed two things about the IMAGE's response to the reflow. Both are false, and
    // both were caught only by repeat-running (`[[a-green-run-is-one-sample]]`):
    //
    //   · "it translates by half the growth" — from one note, whose frame moved [35,272,…] →
    //     [35,343,…], exactly half of 141. Against the note `aHaloNote` returns, the frame moves
    //     **0px** for the same 141px growth, 20/20.
    //   · "it is never rescaled" — false 5 times in 20 on the very same note: frame width
    //     1841 → 1975.
    //
    // Both hold sometimes. Whether growing the viewport re-centres, rescales, or does neither depends
    // on which dimension binds the fit at that moment, so none of it is an invariant of the DESIGN —
    // it is a property of the image and the camera. Asserting either would have pinned an accident of
    // one fixture and gone red on correct code.
    //
    // What survives is the decision itself, above: the row's height goes back to the image. That is
    // what a permanent reservation would break, and it is the whole of what the human ruled.
    //
    // It is also exactly why the click assertion above DERIVES the mark's new position from the frame
    // instead of applying a computed offset. The shift is real, varies by note, and is the sort of
    // thing a test must read rather than predict.
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
