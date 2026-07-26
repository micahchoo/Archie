import { expect, test, type Page, type Locator } from "@playwright/test";
import { goOffline } from "./offline.js";

/**
 * The AV reading surface (Archie-7b86 / V53) — driven, because nothing cheaper can see this.
 *
 * The precedent this file exists under: the AV note-list row was a DEAD DOOR. It rendered, it looked
 * exactly like the image reader's, and clicking it did nothing, because `#mountAside` was called
 * without `liveAnnotations`. A unit test on the handler could not have caught that, and neither could
 * `svelte-check` — `.claude/rules/svelte-no-typecheck-net.md` records the general form: a prop can be
 * typed and not bound and nothing static complains. So every affordance restored here is asserted by
 * (a) the control being VISIBLE and (b) a REAL driven click producing the effect. Never
 * `dispatchEvent(new MouseEvent("click"))` — that skips hit-testing, which is exactly what
 * `.claude/rules/osd-overlay-wrapper.md` documents as passing against broken code.
 *
 * HERMETIC, and the media is real. `goOffline` aborts every non-localhost request, which for this
 * surface means the recording itself never arrives and `mediaError` flips — the transcript still
 * renders (the aside does not depend on the media), but there is no duration, no `.timeline`, and a
 * seek is a no-op. That would leave this surface's own core loop untested, so `withRecording` fulfils
 * the one media URL with a locally-synthesised silent WAV of the published length. PCM/WAV needs no
 * proprietary codec, so Playwright's bundled Chromium decodes it; nothing leaves localhost.
 *
 * Prior art, checked before writing (repo CLAUDE.md). NOTHING in the corpus drives an AV annotation
 * surface in a browser: `videojs-annotation`'s suite is jsdom unit tests over its own components
 * (`test/unit/`), `hyperaudio-lite` ships no test directory at all, and `clover-iiif` neuters canvas
 * in `src/setupTests.ts`. The transferable idea is `offline.ts`'s own — serve the real bytes from the
 * same origin as the app — applied to a media element instead of a tile pyramid.
 */

/** A silent 8-bit mono 8 kHz PCM WAV of `seconds` length — the smallest thing a browser will report a
 *  real `duration` for without a licensed codec. 8-bit PCM silence is 0x80, not 0x00. */
function silentWav(seconds: number): Buffer {
  const rate = 8000;
  const samples = rate * seconds;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + samples, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // PCM chunk size
  header.writeUInt16LE(1, 20); // format = PCM
  header.writeUInt16LE(1, 22); // channels
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate, 28); // byte rate
  header.writeUInt16LE(1, 32); // block align
  header.writeUInt16LE(8, 34); // bits per sample
  header.write("data", 36);
  header.writeUInt32LE(samples, 40);
  return Buffer.concat([header, Buffer.alloc(samples, 0x80)]);
}

/**
 * Serve the seed recording locally. Registered AFTER `goOffline` so it wins (later routes take
 * precedence in Playwright), and matched on the fixture's own URL.
 *
 * RANGE REQUESTS ARE NOT OPTIONAL HERE, and finding that out cost a wrong conclusion. A plain
 * `fulfill` with the whole body gets `loadedmetadata`, a correct `duration`, and playback from zero —
 * everything looks healthy — but Chromium will not SEEK a resource the server did not advertise as
 * range-capable: setting `currentTime = 120` silently left the playhead running up from 0 (measured
 * 14.87s). A "seek" test against that server would have reported the app broken when the fixture was.
 */
async function withRecording(page: Page, seconds = 296): Promise<void> {
  const body = silentWav(seconds);
  await page.route("https://archive.org/download/kryptogramm/**", (route) => {
    const range = /bytes=(\d+)-(\d*)/.exec(route.request().headers()["range"] ?? "");
    if (!range) {
      return route.fulfill({
        status: 200,
        body,
        headers: { "content-type": "audio/wav", "accept-ranges": "bytes", "content-length": String(body.length) },
      });
    }
    const start = Number(range[1]);
    const end = range[2] ? Number(range[2]) : body.length - 1;
    const slice = body.subarray(start, end + 1);
    return route.fulfill({
      status: 206,
      body: slice,
      headers: {
        "content-type": "audio/wav",
        "accept-ranges": "bytes",
        "content-range": `bytes ${start}-${end}/${body.length}`,
        "content-length": String(slice.length),
      },
    });
  });
}

/**
 * Open the seed's one audio object — the AV note that carries a markdown cite, which is the case V53's
 * "dead cite in an AV note" half turns on.
 *
 * Every wait here is an auto-waiting assertion, never a bare `Locator.count()`. Counting straight after
 * a `goto` reads 0 against an unhydrated island and the test passes without testing anything
 * (`.claude/rules/playwright-count-does-not-wait.md`). And a missing fixture object must FAIL rather
 * than skip: the whole point of this file is that the object is there.
 */
async function openAudioObject(page: Page, opts: { media?: boolean } = {}): Promise<void> {
  await goOffline(page);
  if (opts.media) await withRecording(page);
  // `goto` to a hash the page is ALREADY on does nothing at all — no navigation, no `hashchange`, no
  // re-mount — so calling this helper a second time in one test would silently keep driving whatever
  // surface the first call left open. The explicit `reload()` makes each call a real fresh mount
  // regardless of where the previous one ended up.
  await page.goto("./#/voynich");
  await page.reload();
  const card = page.locator("button.object", { hasText: "Kryptogramm" });
  await expect(card).toHaveCount(1);
  await card.click();
  await expect(page.locator(".cues li")).toHaveCount(4); // AV-1…4 (fixtures/voynich.ts §E)
}

const cueRow = (page: Page, i: number): Locator => page.locator(".cues li button").nth(i);
const card = (page: Page): Locator => page.locator(".note-pop");

async function rectOf(loc: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await loc.boundingBox();
  expect(box, "element has no box — it is not laid out").not.toBeNull();
  return box!;
}

test.describe("V53 · the note surface the AV reader had no way to reach", () => {
  test("a real click on a transcript line opens THE NOTE, and the line is genuinely hittable", async ({ page }) => {
    await openAudioObject(page);
    await expect(card(page)).toHaveCount(0); // nothing open on arrival

    // Hit-test FIRST: `elementFromPoint` at the row's centre must land inside the row itself. This is
    // the dead-door signature from `.claude/rules/osd-overlay-wrapper.md` — an overlay covering the
    // control returns a bare wrapper here while every synthetic event still "works".
    // Measured in the browser, so the coordinates are CLIENT space by construction —
    // `boundingBox()` is page space, and handing those to `elementFromPoint` reports "covered" on any
    // scrolled page, which is a false positive for exactly the defect this asserts.
    //
    // Scrolled to CENTRE first, and that is not a workaround — it is what separates this assertion from
    // a scroll-position one. `SidebarObjectNav` is `position: sticky; bottom: 0` BY DESIGN ("content
    // scrolls UNDER it"), so at rest it legitimately covers whatever sits in the last ~88px of the
    // aside. Asserting from an un-scrolled aside would measure the sticky footer, not an overlay
    // swallowing the control — and `Locator.click()` scrolls into view anyway, so it would also be
    // asserting something the click below does not depend on. (Recorded rather than swallowed: at rest
    // and 1280x720 this aside's header runs 464px, so the sticky nav covers 77% of the FIRST cue row.
    // Pre-existing, not V53's list, and reported up rather than fixed here.)
    const row = cueRow(page, 0);
    const hit = await row.evaluate((el) => {
      el.scrollIntoView({ block: "center" });
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { ok: !!top?.closest(".cues li button"), at: `${top?.tagName ?? "none"}.${top?.className ?? ""}` };
    });
    expect(hit.ok, `the transcript line is covered by ${hit.at} — a click cannot reach it`).toBe(true);

    await row.click();
    await expect(card(page)).toBeVisible();
    await expect(card(page).locator(".note-body")).toBeVisible();
    // The card carries the OBJECT's identity, same as the image reader's (V64's contract).
    await expect(card(page).locator(".np-eyebrow")).toContainText("Kryptogramm");
  });

  test("the cue's cite is LIVE in the card and LITERAL nowhere", async ({ page }) => {
    // The seed's first AV note ends in a markdown cite. Before V53 the spine printed it raw — brackets,
    // parentheses and `archie:` URL and all — and there was no surface that could render it as a link.
    // Prior art on which side of the split this note is on: clover-iiif deliberately renders cue text as
    // markup over an allowlist (`src/hooks/use-webvtt.ts:97-112` → `Cue.tsx:129-142`) and
    // hyperaudio-lite styles links inside a transcript first-class
    // (`css/hyperaudio-lite-player.css:30-32`), while the annotation-authoring tools escape it
    // (`videojs-annotation/src/js/lib/template_helpers.js:25`). Archie's AV notes are authored notes,
    // not timecode comments — the former case.
    await openAudioObject(page);

    // `textContent`, not `innerText`: the line is `-webkit-line-clamp`ed, and the assertion is about
    // what the renderer PRODUCED, not about how much of it is currently on screen.
    const line = cueRow(page, 0).locator(".line");
    const spineText = (await line.textContent()) ?? "";
    expect(spineText, "raw markdown is leaking into the transcript spine").not.toContain("](");
    expect(spineText).not.toContain("archie:voynich-reading");
    expect(spineText).toContain("Read the manuscript through, page by page.");

    await cueRow(page, 0).click();
    const link = card(page).locator(".note-body a", { hasText: "Read the manuscript through" });
    await expect(link).toHaveCount(1);
    await expect(link).toHaveAttribute("href", /.+/); // a real destination, not a bare anchor
  });

  test("the card clears the temporal map instead of sitting on it", async ({ page }) => {
    // `.note-pop` anchors to its nearest POSITIONED ancestor. `.player` is positioned and `.timeline`
    // is `main`'s last child, so mounting the card under `.player` would park it exactly on the map —
    // V49's defect (the map shipped fully covered) re-created by the fix for V53. The card is mounted
    // inside `.media-region`, which is positioned and sits above the map in the flex column.
    await openAudioObject(page, { media: true });
    await expect(page.locator(".timeline")).toBeVisible(); // the map needs a real duration to lay out
    await cueRow(page, 1).click();
    await expect(card(page)).toBeVisible();

    const c = await rectOf(card(page));
    const map = await rectOf(page.locator(".tl-track"));
    const overlaps =
      c.x < map.x + map.width && map.x < c.x + c.width && c.y < map.y + map.height && map.y < c.y + c.height;
    expect(
      overlaps,
      `card [${Math.round(c.x)},${Math.round(c.y)} ${Math.round(c.width)}x${Math.round(c.height)}] ` +
        `vs map [${Math.round(map.x)},${Math.round(map.y)} ${Math.round(map.width)}x${Math.round(map.height)}]`,
    ).toBe(false);
  });

  test("one click both TRAVELS the recording and opens the note", async ({ page }) => {
    // The parity claim this design rests on: `Reader.svelte:473` gives a list entry one click that both
    // moves the camera (`zoomOnSelect` off `bind:selected`) and opens the note. Seek is the temporal
    // analogue of the camera move, so the row does both. This is the half no structural test can see —
    // it needs a decodable recording with a real duration.
    await openAudioObject(page, { media: true });
    const at = () => page.locator("audio").evaluate((el: HTMLMediaElement) => el.currentTime);
    expect(await at()).toBe(0);

    await cueRow(page, 2).click(); // AV-3, t=120,160
    await expect(card(page)).toBeVisible();
    await expect.poll(at, { message: "the click never moved the playhead" }).toBeGreaterThan(100);
  });

  test("⤢ expands to the reading sheet, and the note is on screen exactly once", async ({ page }) => {
    await openAudioObject(page);
    await cueRow(page, 1).click();
    await card(page).locator("button.expand").click();

    const sheet = page.locator(".sheet[role='dialog']");
    await expect(sheet).toBeVisible();
    await expect(sheet).toHaveAttribute("aria-label", /Kryptogramm/);
    // V60's measurable form: the card is `display:none` behind the sheet, so exactly ONE note body is
    // visible. Counting VISIBLE bodies (not bodies) is the assertion that can fail on the defect.
    await expect(page.locator(".note-body:visible")).toHaveCount(1);
  });

  test("the whole-track note opens too — the one note with no cue row to reach it by", async ({ page }) => {
    await openAudioObject(page);
    const band = page.locator(".whole-track .wt-note");
    await expect(band).toHaveCount(1);
    await band.click();
    await expect(card(page)).toBeVisible();
    await expect(card(page).locator(".note-body")).toContainText("about the whole recording");
  });
});

test.describe("V53 · the Escape ladder this surface did not have", () => {
  test("Escape walks out one rung at a time: sheet → card → the exhibit", async ({ page }) => {
    await openAudioObject(page);
    await cueRow(page, 0).click();
    await card(page).locator("button.expand").click();
    await expect(page.locator(".sheet[role='dialog']")).toBeVisible();

    // 1. the sheet closes, and it is "read less" — the card is still open behind it
    await page.keyboard.press("Escape");
    await expect(page.locator(".sheet[role='dialog']")).toHaveCount(0);
    await expect(card(page)).toBeVisible();

    // 2. the note closes
    await page.keyboard.press("Escape");
    await expect(card(page)).toHaveCount(0);

    // 3. up a level — the player is gone and the object grid is back
    await expect(page.locator(".cues")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("button.object").first()).toBeVisible();
    await expect(page.locator(".cues")).toHaveCount(0);
  });
});

test.describe("V53 · the transcript aside resizes (and deliberately does not collapse)", () => {
  test("dragging the divider narrows the transcript, and it survives a reload", async ({ page }) => {
    await openAudioObject(page);
    const aside = page.locator(".player aside");
    const divider = page.locator(".resize-divider[aria-label='Resize transcript']");
    await expect(divider).toBeVisible();

    const before = (await rectOf(aside)).width;
    const d = await rectOf(divider);
    // A real pointer drag, not a keyboard nudge: the divider takes pointer capture on `pointerdown`,
    // and capture behaviour is precisely what a synthetic event would not exercise.
    await page.mouse.move(d.x + d.width / 2, d.y + d.height / 2);
    await page.mouse.down();
    await page.mouse.move(d.x + d.width / 2 + 90, d.y + d.height / 2, { steps: 8 });
    await page.mouse.up();

    await expect.poll(async () => (await rectOf(aside)).width, { message: "the drag did not resize the transcript" })
      .toBeLessThan(before - 40);
    const after = (await rectOf(aside)).width;

    // Persisted (the `archie.*.v1` metadata idiom) — a resize that forgets itself is chrome the reader
    // has to re-do on every object. Re-opened by a FRESH navigation rather than `page.reload()`,
    // deliberately: reload would also be asserting that the address carries the object, which is a
    // different contract (V101's) and would make this test fail for a reason it isn't about.
    await openAudioObject(page);
    expect(Math.abs((await rectOf(aside)).width - after)).toBeLessThan(2);
  });

  test("there is no collapse toggle — collapsing this aside would take the object nav with it", async ({ page }) => {
    // Not an oversight and not laziness: `SidebarObjectNav` lives INSIDE this aside because an AV object
    // has no canvas chrome to host it, so a collapse would re-create V65 (the nav reachable only from a
    // state most visitors never enter). `ResizeDivider`'s own `collapsible={false}` is the mechanism
    // (Archie-b671, "resizable but NOT minimizable"). If someone later flips it on, this fails.
    await openAudioObject(page);
    await expect(page.locator(".resize-divider[aria-label='Resize transcript'] button.collapse")).toHaveCount(0);
  });
});
