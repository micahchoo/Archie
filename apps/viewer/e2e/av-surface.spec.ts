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
 * (`test/unit/`), `hyperaudio-lite`'s suite is jsdom too, and `clover-iiif` neuters canvas
 * in `src/setupTests.ts`. The transferable idea is `offline.ts`'s own — serve the real bytes from the
 * same origin as the app — applied to a media element instead of a tile pyramid.
 *
 * CORRECTED 2026-07-26. This sentence used to say `hyperaudio-lite` "ships no test directory at all".
 * It ships `__TEST__/hyperaudio-lite.test.js`, 311 lines of jest. The CONCLUSION survives and is if
 * anything better supported: the file's first line is `@jest-environment jsdom` (`:2`), so it cannot
 * decode media — it asserts the `data-media-src` STRING (`:183`) against an HTML fixture (`:65`) that
 * jsdom never loads. It even commits a 289 KB `__TEST__/test.mp3` that nothing in the suite decodes,
 * which is its own argument against committing a seed media binary here (see the V49 block below).
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
 * ANSWERING RANGE REQUESTS IS NOT OPTIONAL HERE, and finding that out cost a wrong conclusion. A plain
 * `fulfill` of the whole body gets `loadedmetadata`, a correct `duration`, and playback from zero —
 * everything looks healthy — but Chromium will not SEEK a resource whose server ignores `Range`:
 * setting `currentTime = 120` silently left the playhead running up from 0 (measured 14.87s;
 * independently reproduced at 14.88s). A "seek" test against that server reports the APP broken when
 * the fixture is.
 *
 * The load-bearing property is answering the `Range` header AT ALL, not the `206` status specifically —
 * measured, a `200` carrying the correct slice seeks just as well. The `206` below is kept because it
 * is correct HTTP, not because the seek depends on it; don't "simplify" this by dropping the header
 * parse and keeping the status.
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
    // asserting something the click below does not depend on.
    //
    // Measured at 1280x720 on this tree: the aside header ends at 354px, cue row 0 runs 354-460, and the
    // sticky nav runs 488-576 — **0px overlap**, `elementFromPoint` at row 0's centre returns
    // `SPAN.line`. An earlier draft of this comment reported 77% coverage and called it pre-existing.
    // That figure was real but came from an INTERMEDIATE state of this branch: the `<p>` → `<button>`
    // conversion pushed the header to 464px, and the `.wt-note` 3-line clamp added afterwards pulled it
    // back to 354. Corrected rather than deleted — "a stale measurement reported as current" is exactly
    // the failure mode this file exists under.
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

    // EVERY chrome surface that renders cue text, not just the one the fix started at. The `.tl-mark`
    // `title` and `aria-label` interpolated the raw body, so the temporal map went on ANNOUNCING
    // `](archie:voynich-reading/)` to a screen reader while the spine beside it read cleanly — and the
    // assertion above, scoped to `.line`, could not see it. This is why `Cue.preview` is computed once
    // in the derived rather than at each render site: the next surface to show a cue inherits it.
    await withRecording(page); // the map needs a real duration to render at all
    await page.reload();
    const mark = page.locator(".tl-mark").first();
    await expect(mark).toBeVisible();
    for (const attr of ["aria-label", "title"]) {
      const v = (await mark.getAttribute(attr)) ?? "";
      expect(v, `raw markdown is leaking into the temporal map's ${attr}`).not.toContain("](");
      expect(v).not.toContain("archie:voynich-reading");
    }

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

test.describe("V53 · a note's picture, on a TIME-RANGED note", () => {
  test("the tile renders on the card and a real click opens the lightbox", async ({ page }) => {
    // The sampler's audio object carries an AV cue whose prose embeds an image (added with this slice —
    // before it, EVERY AV note in EVERY fixture was comment-only, so `NoteMedia`/`NoteLightbox` on a
    // temporal note was wired and unprovable).
    //
    // ON PRIOR ART — corrected 2026-07-26 by re-reading the files, not by argument. An earlier draft of
    // this comment claimed nobody in the corpus ships note media on a time range, citing clover-iiif as a
    // case where the feature exists but is "structurally unreachable" for a temporal selector. That
    // conflated two independent things and overstated the claim. What the files actually say:
    //   · `videojs-annotation` (`src/js/components/comment.js:29` — `format: 'text/plain'`) and
    //     `osd-audio-video` (`audio-canvas.html:562` — escaped body) are genuinely absent. Those hold.
    //   · clover-iiif is NOT a counter-example — it is the DONOR. `Item.tsx:181-191` renders an `image/*`
    //     BODY through `AnnotationItemImage`, and `imageUri` (`:182-184`) is the BODY's own `id` — real
    //     note-authored media, not a target crop. That branch is blocked only for a `PointSelector`
    //     (`:76` forces those to the VTT renderer); a `t=` FragmentSelector annotation carrying an image
    //     body reaches it. And the control is the SAME SHAPE as the one this test drives —
    //     `Image.tsx:16-19` is `<ButtonStyled onClick={handleClick}><img src={imageUri} …/><span>{caption}
    //     </span></ButtonStyled>`, i.e. a clickable image tile with a caption, which is structurally
    //     `NoteMedia.svelte:26-42`'s `<button class="tile">` + `<img>` + label.
    //   · The `!NaN,NaN` bug is real but lives elsewhere, and is wider than described: `thumbnail`
    //     (`:52`) is a decorative region crop painted as a `backgroundImage` on the `<span>` that wraps
    //     EVERY item (`:207-215`), in every format branch. `:41-42`'s `xywh.split(",").slice(2)` yields
    //     `[]` for `t=240,270`, so w/h are `undefined` and every row of a temporal panel requests
    //     `…/240,270/!NaN,NaN/0/default.jpg`. Borrow the intent; never the geometry math.
    // So Archie's version is NOT an original at the tile level at all — clover already ships that
    // control. What is original here is only the reach: a note carrying media, on a TIME-RANGED target,
    // opening the same renderer the image reader uses. Claim that and no more.
    //
    // The remote image is BLOCKED by `goOffline` and that is fine: the tile is a `<button>` that renders
    // and stays clickable either way (`NoteMedia.svelte:26-42`, with `.tile-failed` inside it), so the
    // affordance is what is under test, not the third party's uptime.
    await goOffline(page);
    await page.goto("./#/sampler");
    await page.reload();
    const audio = page.locator("button.object", { hasText: "listen with a transcript" });
    await expect(audio).toHaveCount(1);
    await audio.click();

    const rows = page.locator(".cues li button");
    await expect(rows).toHaveCount(5);
    await rows.last().click(); // the media-bearing cue, t=240,270 — last by start time
    await expect(card(page)).toBeVisible();

    const tile = card(page).locator("button.tile");
    await expect(tile).toHaveCount(1);
    await tile.click();
    await expect(page.locator("div.lb[role='dialog']")).toBeVisible();
  });
});

test.describe("V53 · an AV note's tags are a real door into the finder", () => {
  test("a tag chip on a time-ranged note opens the finder ALREADY SCOPED to that tag", async ({ page }) => {
    // The last piece of the AV note surface, landed separately and deliberately. `MediaPlayer` gates its
    // tag chips on `onopenfinder` being wired (`:365`, `:480`) rather than rendering chips that do
    // nothing — `NotePopup.svelte:127` makes every tag a `<button>` calling `onopenfinder?.(t)`, so
    // handing it tags with no handler ships precisely the dead door this whole file exists to close.
    // Until `ExhibitView` threaded the prop, the fixture's tagged note rendered NO chips and an
    // assertion here would have been vacuous, so the fixture shipped with a comment saying the wire and
    // its test land together. This is that test.
    //
    // WHY THIS ASSERTS THE FACET AND NOT JUST THE OVERLAY. `onopenfinder={() => openFinder()}` — the
    // tag dropped on the floor — would open the finder perfectly well, and a test that only checked
    // `[role=dialog]` would pass against it. What makes the door WORTH opening is arriving pre-scoped,
    // so the assertion is on the facet chip's `aria-pressed`, which is bound to `activeTags`
    // (`SearchOverlay.svelte:89-90`) and is the only observable that distinguishes the two.
    //
    // `.claude/rules/svelte-no-typecheck-net.md` is the reason this is driven at all: a prop can be
    // typed and not bound and NOTHING static complains — that rule was written after `oncancel` was
    // added to a `$props()` type annotation but left out of the destructuring beside it, and
    // svelte-check reported 1464 files 0/0 while the control silently never rendered.
    await goOffline(page);
    await page.goto("./#/sampler");
    await page.reload();
    const audio = page.locator("button.object", { hasText: "listen with a transcript" });
    await expect(audio).toHaveCount(1);
    await audio.click();

    const rows = page.locator(".cues li button");
    await expect(rows).toHaveCount(5);
    // The tagged cue is `t=180,220` — 4th of five by start time (0,30 · 45,80 · 120,160 · 180,220 ·
    // 240,270). Indexed rather than matched on prose so this does not silently retarget if a fixture
    // comment is reworded; the count assertion above is what catches a fixture actually changing shape.
    await rows.nth(3).click();
    await expect(card(page)).toBeVisible();

    const chips = card(page).locator("button.tag-btn");
    await expect(chips).toHaveText(["#cadence", "#transcript"]);

    // DRIVING THE SECOND CHIP, AND NOT THE FIRST — this is a routed-around DEFECT, not a style choice,
    // so it is written down rather than quietly accommodated. `Archie-d37d`: the cite trigger sits on
    // top of the first chip. Measured here at 1280x720 the moment this test first ran —
    //   `.cite-trigger`  x 20-100,  y 556-588
    //   `#cadence`       x 38-122,  y 560-572  → elementFromPoint at its centre = SPAN.lbl  ← OCCLUDED
    //   `#transcript`    x 134-245, y 560-572  → elementFromPoint at its centre = BUTTON.tag
    // 62px of overlap. `#transcript` clears the trigger only because it happens to start at x=134, so
    // which tags are reachable depends on the length of the tag text before them — a layering fault,
    // not one unlucky fixture. WHEN d37d IS FIXED: drive `chips.first()` and assert BOTH are hittable;
    // do not simply delete this comment. The subject of THIS test is the `onopenfinder` wire, which the
    // second chip proves exactly as well as the first.
    await chips.nth(1).click();
    const finder = page.locator(".finder[role='dialog']");
    await expect(finder).toBeVisible();

    // The load-bearing assertion: `transcript` arrived and is ACTIVE, and its neighbour is not.
    // `onopenfinder={() => openFinder()}` — the tag dropped on the floor — would open the finder just
    // as well and satisfy a `[role=dialog]` check; only the facet state can tell the two apart. The
    // second half also proves the facet was SEEDED from the chip rather than every facet defaulting on.
    await expect(finder.locator("button.facet", { hasText: "transcript" })).toHaveAttribute("aria-pressed", "true");
    await expect(finder.locator("button.facet", { hasText: "cadence" })).toHaveAttribute("aria-pressed", "false");
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

test.describe("V49 · the temporal map clears the item strip (Archie-b135)", () => {
  // WHAT THIS TICKET ASSUMED, AND WHAT WAS ACTUALLY TRUE. `Archie-b135` was filed as "the seed has no
  // local audio/video, so the AV surface has no offline gate", and proposed committing a small media
  // asset into the seed to get one. The first half is false: this whole file is `goOffline` plus
  // `withRecording`'s locally-synthesised PCM WAV, so the AV surface has had a hermetic browser gate
  // since V53 — including `.timeline`, which needs a real decoded duration and gets one here. What was
  // genuinely missing is only this: nobody had written V49's assertion. So this is it, and no binary
  // was added to the repository.
  //
  // WHY NO COMMITTED ASSET, stated rather than assumed, because "a synthesised one may not exercise
  // what a real file would" is a fair objection. It would buy one thing this cannot — proof that the
  // seed's own media URL still resolves — and that is a third-party-uptime check, which `offline.ts`'s
  // header is explicit about refusing. Against it: every published tree carries the bytes, forever.
  // Prior art on that cost, opened rather than recalled: `hyperaudio-lite/__TEST__/test.mp3` is a
  // 289 KB committed audio file whose own suite is `@jest-environment jsdom`
  // (`__TEST__/hyperaudio-lite.test.js:2`) and therefore never decodes it — it only asserts the
  // `data-media-src` STRING (`:183`). A binary paying no rent is the outcome to avoid.
  //
  // (That same file falsified a "ships no test directory at all" claim, now CORRECTED in this file's
  // header. An earlier version of this comment said the claim appeared in TWO places, naming
  // `offline.ts` as the second. It does not — `grep -rn -i hyperaudio apps/viewer/e2e/` returns hits in
  // this file only, and `offline.ts` never mentioned the library. That miscount was written here, and
  // an independent reviewer then repeated it back as a should-fix without grepping, which is
  // `.claude/rules/prior-art-citation-discipline.md`'s own lesson landing on the file that cites it:
  // a plausible claim, in a comment about citation discipline, that two people passed over.)
  //
  // WHY THE GEOMETRY AND NOT A SCREENSHOT: `.claude/rules/` records Archie-40fe's reasoning — a
  // restyle that moves the strip 4px is not a regression, a restyle that puts it back over the map is.
  // `occlusion.spec.ts` is the sibling file for the image reader; this is the AV column's version, and
  // it lives here because only this file owns the machinery that gives the map a duration to lay out
  // with.
  const overlaps = (a: { x: number; y: number; width: number; height: number }, b: typeof a): boolean =>
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

  test("the transcript's temporal map is not covered by the filmstrip", async ({ page }) => {
    await openAudioObject(page, { media: true });
    await expect(page.locator(".timeline")).toBeVisible(); // needs a real duration — hence `media: true`
    const strip = page.locator(".filmstrip");
    await expect(strip).toBeVisible(); // the voynich grid is 12 objects, so the strip is shown

    // Against the STRIP and against every FRAME in it. The band's own box is what `--strip-h` measures,
    // but a frame that overflows its band would still be the thing sitting on the map.
    const map = await rectOf(page.locator(".tl-track"));
    const band = await rectOf(strip);
    expect(
      overlaps(map, band),
      `map [${Math.round(map.x)},${Math.round(map.y)} ${Math.round(map.width)}x${Math.round(map.height)}] ` +
        `vs strip [${Math.round(band.x)},${Math.round(band.y)} ${Math.round(band.width)}x${Math.round(band.height)}]`,
    ).toBe(false);

    const frames = page.locator(".filmstrip button.frame");
    const n = await frames.count();
    expect(n, "no filmstrip frames — this assertion would be vacuous").toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      const f = await rectOf(frames.nth(i));
      expect(overlaps(map, f), `frame ${i} sits on the temporal map`).toBe(false);
    }
  });

  // ⚠ THIS TEST IS KNOWINGLY RED ON `dca4215` AND MUST NOT BE LOOSENED TO MAKE IT GREEN.
  //
  // It passes on `49327c0` (V49's original fix in place) and fails on `dca4215` (the docking work).
  // Measured by applying ONLY the fixture/spec changes to a clean worktree at `49327c0`: 85/85 pass,
  // this test among them. On `dca4215`, `.tl-track` reports `toBeInViewport` **ratio 0** — geometry
  // below. So the assertion distinguishes the two states, which is exactly what a gate has to do; the
  // red is a defect in the docked layout, filed to that slice, not a defect in this test.
  //
  // The temptation to re-scope this to "reachable by scrolling" is the thing to refuse. `Archie-40fe`'s
  // whole premise is that floating chrome kept covering the controls; a design answering that by
  // pushing a control 153px below the fold has not satisfied it. An overlapped control is at least
  // visibly there. `.claude/rules/post-review-fixes-are-unreviewed.md` names the general form — a gate
  // that goes green by lowering its own bar has stopped constraining anything.
  test("the map is on screen ON ARRIVAL, not pushed off the bottom INSTEAD of being covered", async ({ page }) => {
    // THE HALF THAT MAKES THIS ITS OWN TEST, and it is written against the OUTCOME rather than the
    // mechanism — deliberately, because the mechanism changed under this test while it was being
    // written, which is the best possible argument for not asserting one.
    //
    // V49's original fix was `padding-bottom: var(--strip-h)` + `box-sizing: border-box` on a 100vh
    // `.player`, and `Archie-b135` asks for the `box-sizing` removal as the red-green.
    //
    // THAT RED-GREEN IS NOT AVAILABLE, and that is a stronger reason to write an outcome assertion than
    // "the mechanism was superseded". Deleting `box-sizing: border-box` from `.player` is a **no-op**:
    // `packages/render-core/src/tokens.css:201-203` is a global `* { box-sizing: border-box; }`, so the
    // computed style does not change. Measured by a reviewer who checked the injection did what it
    // claimed — with the declaration deleted, `.player` still reports `border-box`, `.tl-track` still
    // sits at y 556→580, and the suite is green *because nothing changed*. The ticket's proposed
    // red-green would have proved nothing. (Forcing `content-box` explicitly is what reproduces it, and
    // that injection does go red against the overlap assertion above.)
    //
    // The mechanism is also gone on top of that: the docking work retired the reservation entirely and
    // moved the strip into `ExhibitView`'s chrome bar BELOW the column (`MediaPlayer.svelte:485-488`).
    // So an assertion on `.player`'s computed style would be both unfalsifiable AND aimed at code that
    // no longer exists.
    //
    // What is invariant across both designs is the reader's side of it: **the temporal map has to be
    // ON SCREEN, on arrival, without scrolling.** That last clause is the claim, and it is why nothing
    // here scrolls into view first: the temporal map is a persistent position signal — the AV analogue
    // of the image reader's marks — and a position signal you must go looking for is not one. (It is
    // also what `hyperaudio-lite` is designing around at `hyperaudio-lite.js:648-664`, where the spoken
    // word is re-homed to `document.title` precisely so the signal survives its surface being hidden.)
    //
    // "Not overlapping the strip" (the test above) is satisfied just as well by a map shoved below the
    // fold — a different defect wearing the fix's clothes, and the one thing neither design gets for
    // free. Asserting arrival visibility is what separates them.
    //
    // Measured on `dca4215` at 1280x720, offline, with a decoded duration:
    //   viewport   720          .player    y 53  → bottom 917  (h 864, i.e. 197px past the fold)
    //   .timeline  y 837 → 917  .tl-track  y 873 → bottom 897  ← starts 153px BELOW the fold
    //   .filmstrip y 926 → 1037 ← also entirely below the fold
    //   document   scrollHeight 1045 vs clientHeight 720; every ancestor `overflow-y: visible`
    await openAudioObject(page, { media: true });
    await expect(page.locator(".timeline")).toBeVisible();

    const vh = page.viewportSize()!.height;
    // `toBeInViewport` WITHOUT a preceding `scrollIntoViewIfNeeded` — the omission is the assertion.
    await expect(page.locator(".tl-track")).toBeInViewport();
    const map = await rectOf(page.locator(".tl-track"));
    // BOTH edges. `toBeInViewport()` defaults to `ratio: 0` — any intersection at all — so a map whose
    // top had gone above the fold with its bottom still on screen would satisfy it and the bottom-edge
    // check together. It cannot happen while nothing scrolls, but "on screen" is a claim about the whole
    // element and asserting half of it invites the other half to drift.
    expect(Math.round(map.y), "the temporal map's top edge is above the fold").toBeGreaterThanOrEqual(0);
    expect(Math.round(map.y + map.height), `the temporal map's bottom edge is off-screen (viewport ${vh}px)`).toBeLessThanOrEqual(vh);
  });
});
