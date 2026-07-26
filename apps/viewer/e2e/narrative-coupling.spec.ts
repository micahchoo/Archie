import { test, expect, type Page } from "@playwright/test";
import { goOffline } from "./offline.js";
import { boxOf } from "./offline.js";

// Archie-0d6c + Archie-c5cb — the narrative's scroll coupling, and the spine's collapse.
//
// Offline throughout: the spine, its beats, their prose and every control asserted here render from
// the LOCAL manifest, so none of this needs a tile to arrive (see selection.spec.ts's header for the
// distinction). `voynich-reading` has 6 sections over one object; `screenshots` has 21 over 21.
//
// The assertions are geometric wherever they can be, because the thing under test is a relationship
// between a scroll position and a highlighted card — and "the highlight moved" is exactly the kind of
// claim that passes for the wrong reason. Every load-bearing one below was watched failing against a
// deliberately broken build before being trusted; which defect breaks which is recorded on each.

const SPINE = "aside.spine";
const BEATS = ".sections li";
const ACTIVE_POS = ".sections button.active .beat-pos";

/** The beat index that actually crosses the column's centre line — the observer's own definition of
 *  "active", read from live geometry rather than restated from the source. */
async function beatOnCentreLine(page: Page): Promise<number> {
  return page.evaluate(
    ({ spine, beats }) => {
      const col = document.querySelector(spine);
      if (!col) return -1;
      const r = col.getBoundingClientRect();
      const mid = r.top + r.height / 2;
      return Array.from(document.querySelectorAll(beats)).findIndex((li) => {
        const b = li.getBoundingClientRect();
        return b.top <= mid && b.bottom >= mid;
      });
    },
    { spine: SPINE, beats: BEATS },
  );
}

/**
 * Wait for the column to stop moving, then hand back its resting scrollTop.
 *
 * Every geometric assertion below needs this and none of them can skip it: Chromium ANIMATES wheel
 * scrolling, and `goToSection` scrolls `behavior: "smooth"`, so `mouse.wheel()` and `click()` both
 * return with the column still in flight. Reading geometry at that instant samples a frame mid-glide —
 * which lands in the GAP between two beat cards as often as on one, and reports -1. The first draft of
 * this file did exactly that and produced three failures against a build that was working correctly.
 */
async function columnSettled(page: Page): Promise<number> {
  const recent: number[] = [];
  await expect
    .poll(
      async () => {
        const now = await page.evaluate((s) => document.querySelector(s)?.scrollTop ?? -1, SPINE);
        recent.push(now);
        if (recent.length > 3) recent.shift();
        // THREE consecutive equal samples, not two. Two flaked once in a full-suite run (the
        // multi-beat sweep read the line on beat 2 of a transition heading for beat 3) — a smooth
        // scroll under load can hold a value across one 120ms window without being finished.
        return recent.length === 3 && recent[0] === recent[1] && recent[1] === recent[2];
      },
      { intervals: Array<number>(12).fill(120), message: "the spine never stopped scrolling" },
    )
    .toBe(true);
  return recent[2] ?? -1;
}

/** Wait until the beat crossing the centre line IS `i`. Prefer this to `columnSettled` + a bare read
 *  whenever the claim is "it arrived": settling is a proxy, arriving is the assertion. */
async function beatReachedLine(page: Page, i: number, why: string): Promise<void> {
  await expect.poll(async () => beatOnCentreLine(page), { message: why }).toBe(i);
}

/** Is the active beat's card inside the column's visible box? The activate→scroll direction's whole claim. */
async function activeBeatInView(page: Page): Promise<boolean> {
  return page.evaluate(
    ({ spine }) => {
      const col = document.querySelector(spine);
      const li = document.querySelector(".sections button.active")?.closest("li");
      if (!col || !li) return false;
      const c = col.getBoundingClientRect();
      const b = li.getBoundingClientRect();
      return b.bottom > c.top && b.top < c.bottom;
    },
    { spine: SPINE },
  );
}

/** Land on a narrative and wait for its beats — `toHaveCount`, never a bare `count()` after a goto
 *  (`[[playwright-count-does-not-wait]]`: an unhydrated island reads 0 and a branch on it goes green). */
async function openNarrative(page: Page, slug: string, beats: number, sub = ""): Promise<void> {
  await goOffline(page);
  await page.goto(`./#/${slug}${sub}`);
  await expect(page.locator(BEATS)).toHaveCount(beats);
}

test.describe("scroll → camera: the spine drives the read (V81)", () => {
  test("scrolling the spine moves the active beat to whatever crosses the centre line", async ({ page }) => {
    await openNarrative(page, "voynich-reading", 6);
    await expect(page.locator(ACTIVE_POS)).toHaveText("Section 1 of 6");

    // A real wheel over the column, not a scripted scrollTop — the observer has to survive the same
    // event stream a reader produces (and, per the guard, a wheel cancels any live intent outright).
    const box = await page.locator(SPINE).boundingBox();
    if (!box) throw new Error("the spine has no box — the column is not rendered");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 1000);
    await columnSettled(page);

    // Assert against the LIVE geometry, so this cannot pass by agreeing with a hard-coded number that
    // drifts when the seed prose changes. Injected defect that reddens it: delete the
    // `new IntersectionObserver(...)` block — the highlight stays on "Section 1 of 6" while the
    // centre line sits on a later beat.
    const onLine = await beatOnCentreLine(page);
    expect(onLine, "no beat crosses the column centre line after scrolling").toBeGreaterThan(0);
    await expect(page.locator(ACTIVE_POS)).toHaveText(`Section ${onLine + 1} of 6`);
  });

  test("the camera follows the spine — the section that scrolled under the line is the one on canvas", async ({ page }) => {
    // The coupling's POINT, not just its mechanism: the active section drives `focus`/`objectId`, so
    // on a many-object narrative the canvas has to change object as the spine scrolls. `screenshots`
    // is one object per section, so the note-count readout in the pane toggle is a proxy for "the
    // canvas is looking at a different item" that needs no painted tile.
    await openNarrative(page, "screenshots", 21);
    const eyebrowBefore = await page.locator("aside.spine .eyebrow").first().innerText();

    const box = await page.locator(SPINE).boundingBox();
    if (!box) throw new Error("the spine has no box");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 1600);
    await columnSettled(page);

    const onLine = await beatOnCentreLine(page);
    expect(onLine).toBeGreaterThan(0);
    await expect(page.locator(ACTIVE_POS)).toHaveText(`Section ${onLine + 1} of 21`);
    // The spine's own position readout in the eyebrow moved with it — one address, both channels.
    await expect(page.locator("aside.spine .eyebrow").first()).not.toHaveText(eyebrowBefore);
  });
});

test.describe("activate → camera AND prose: the same coupling backwards (V82)", () => {
  test("stepping the canvas nav brings the prose with it", async ({ page }) => {
    await openNarrative(page, "voynich-reading", 6);
    const next = page.locator("nav.canvas-nav .cn-step").last();
    for (let k = 0; k < 4; k++) await next.click();

    await expect(page.locator(ACTIVE_POS)).toHaveText("Section 5 of 6");
    await columnSettled(page);
    // Injected defect that reddens it: change `goToSection`'s tail to never call `scrollToBeat`. The
    // highlight still moves to Section 5 (activation always worked) and the card is off-screen —
    // which is V82 exactly: the camera arrived and the prose stayed behind.
    expect(await activeBeatInView(page), "the activated beat is not in the column's visible box").toBe(true);
  });

  test("clicking a beat centres it", async ({ page }) => {
    await openNarrative(page, "voynich-reading", 6);
    // The second beat is reachable by click from the top; after activation it must be ON the centre
    // line, not merely somewhere on screen — "in view" would already be true before the click.
    await page.locator(".sections li").nth(1).locator("button").click();
    await expect(page.locator(ACTIVE_POS)).toHaveText("Section 2 of 6");
    await beatReachedLine(page, 1, "the clicked beat never reached the centre line");
  });
});

test.describe("the two directions do not fight (the reentrancy guard)", () => {
  test("a section cite settles on the CITED beat and stays there", async ({ page }) => {
    // The cite's LANDING — the half of the hazard that is about where the reader ends up. The spine
    // mounts scrolled to the top with `activeIndex` already at the cited beat, and for a beat the
    // column cannot centre (the last, where the scroll clamps) the line settles over the NEIGHBOUR.
    //
    // What this gates, third time of asking, and the two wrong answers are worth more than the right
    // one because they were the same mistake twice:
    //
    //  - It does NOT redden on removing the reentrancy guard. The arrival scroll is instant, so the
    //    observer's first delivery already sees the settled column. (Holds; re-verified.)
    //  - It DOES redden on removing `beatAtColumnEnd`. An earlier revision of this comment claimed the
    //    opposite and said "corrected after review re-ran the injections", which made a false statement
    //    sound measured. The injection behind it disabled only the HEAD branch (`scrollTop <= 1`) — and
    //    this test cites the LAST section, which the FOOT branch resolves. It never touched the
    //    mechanism under test. Disabling the whole function reddens this test deterministically.
    //
    // The lesson is not about this test: an injection that does not reach the code you are attributing
    // to is a green that means nothing, and it reads exactly like a real result. The same incomplete-
    // injection error produced a false green on the per-exhibit collapse key earlier in this branch.
    // `beatAtColumnEnd`'s dedicated gate is still the two-ends test below; this one pins it as well.
    await openNarrative(page, "voynich-reading", 6, "/s/5");
    await expect(page.locator(ACTIVE_POS)).toHaveText("Section 6 of 6");

    // "Stays there" is the second half and it needs real time to pass: a bounce arrives on the next
    // observer delivery, one frame later, long after the first assertion would have gone green.
    await page.waitForTimeout(1200);
    await expect(page.locator(ACTIVE_POS)).toHaveText("Section 6 of 6");
  });

  test("stepping to the last beat lands on the last beat, not its neighbour", async ({ page }) => {
    // The same fight through the other door, and the smooth-scroll case: the animation sweeps the
    // whole column, so every intermediate beat crosses the line on its way past.
    await openNarrative(page, "voynich-reading", 6);
    const next = page.locator("nav.canvas-nav .cn-step").last();
    for (let k = 0; k < 5; k++) await next.click();
    await expect(page.locator(ACTIVE_POS)).toHaveText("Section 6 of 6");
    await page.waitForTimeout(1200);
    await expect(page.locator(ACTIVE_POS)).toHaveText("Section 6 of 6");
    await expect(next).toBeDisabled(); // the nav agrees it is the end — one state, not two
  });

  test("a multi-beat activation does not bounce the reader through the beats in between", async ({ page }) => {
    // THIS is the assertion that actually holds the reentrancy guard up, and finding that out cost an
    // injection that came back GREEN.
    //
    // The first draft gated the guard on "a section cite settles on the cited beat". Deleting
    // `if (intentActive()) return;` did not redden it: the arrival scroll is instant, so the observer's
    // first delivery already sees the settled column, and for the cited beat used (the last) the
    // column-end rule answers correctly with or without the guard. The RESTING PLACE is not where the
    // two directions fight — the JOURNEY is. Without the guard a programmatic sweep reports every beat
    // whose box the centre line crosses on the way, and each report is a full section change: the
    // highlight jumps, the note closes, and on a multi-object narrative the canvas swaps to that
    // section's object and back. That is "bounced to a neighbouring beat", exactly as the ticket words
    // it, and it is invisible to any assertion taken after the dust settles.
    //
    // `screenshots` rests with three beats on screen, so clicking the third is a genuine multi-beat
    // sweep whose line must cross beat 2's box (the beats are stacked contiguously, so a line moving
    // from beat 1's box to beat 3's box cannot skip it — which is what makes this non-vacuous, and the
    // before/after centre-line readings below assert the premise rather than assuming it).
    await openNarrative(page, "screenshots", 21);
    await beatReachedLine(page, 0, "the spine did not rest on its first beat");

    await page.evaluate(() => {
      const w = window as unknown as { __visited: string[] };
      w.__visited = [];
      const read = () =>
        document.querySelector('.sections button[aria-current="true"] .beat-pos')?.textContent ?? "";
      const rec = () => {
        const t = read();
        if (t && w.__visited[w.__visited.length - 1] !== t) w.__visited.push(t);
      };
      rec();
      const ol = document.querySelector(".sections");
      if (ol) new MutationObserver(rec).observe(ol, { subtree: true, attributes: true, attributeFilter: ["aria-current"] });
    });

    // Worth knowing about the two lines below: Playwright's `click()` runs its own
    // `scrollRectIntoViewIfNeeded` first, and beat 3 hangs below the fold here, so the column moves
    // whether or not OUR code scrolls it. This test is therefore a gate on the JOURNEY's side effects
    // (the `visited` list) and not evidence that `scrollToBeat` fired — measured: neutering
    // `scrollToBeat` leaves this green, and is caught by the V82 tests instead.
    await page.locator(".sections li").nth(2).locator("button").click();
    await beatReachedLine(page, 2, "the clicked beat never reached the centre line");
    await columnSettled(page); // and nothing arrives late

    const visited = await page.evaluate(() => (window as unknown as { __visited: string[] }).__visited);
    expect(visited, "the reader was bounced through a beat they did not ask for").toEqual([
      "Section 1 of 21",
      "Section 3 of 21",
    ]);
  });

  test("the suppression lasts exactly as long as the scroll it covers, not a wall-clock window", async ({ page }) => {
    // THE WEDGE, from review. The first design ended an intent when the column went QUIET — a 150ms
    // settle re-armed by every `scroll` event. Because the reader's own scrolling emits `scroll`, it
    // re-armed the suppression it was trying to escape: measured, a zero-distance activation followed
    // by continuous scrolling froze the highlight for 1546ms across 2760px and 15 sections, released
    // only by the outer ceiling. A SCROLLBAR DRAG is the realistic path — it emits `scroll` and none of
    // the wheel/touch/key events that cancel an intent — which is why this drives the column by script
    // rather than with the mouse. Adding `pointerdown` to the cancel list treats the symptom; ending
    // the intent on ARRIVAL removes the failure mode.
    //
    // Injected defect that reddens it: restore the quiet-timer design (replace the `intentArrived()`
    // check in `onColumnScroll` with a re-armed 150ms timer). `ARRIVE_PX` at 0 does NOT redden it —
    // measured, and correctly so: see that constant's note.
    //
    // The activation below is a REAL-distance one, deliberately, and finding out why cost an injection
    // that came back green. Review's own repro was a ZERO-distance click, and `scrollToBeat` now
    // returns early without arming anything when the column is already at the target — so the
    // zero-distance case alone could not redden the restored quiet timer. It is the weaker probe.
    // Driving a genuine journey and then scrolling away from it is the general form, and it exposed a
    // second hole in the first arrival draft: a scripted scroll steps ~58px per frame, so it can
    // straddle an exact-target window and never "arrive" — which is why `intentArrived` asks whether
    // the column has reached OR PASSED the target rather than testing equality.
    // ACTIVATION AND SCROLL IN ONE `evaluate`, with no CDP round-trip between them. Driving the click
    // from the test side made the RED direction a race: the injected quiet timer releases 150ms after
    // the column falls silent, and the hop back to the test process to issue the next command is
    // sometimes longer than that. Measured — the injection reddened run-to-run individually and came
    // back GREEN inside the full battery, which is a flaky gate, not a passing one. In-page there is no
    // gap to lose. (A synthetic `.click()` is the right tool here and not the trap
    // `[[osd-overlay-wrapper]]` warns about: nothing in this test is a hit-test, and the real-mouse
    // path over these same buttons is covered by "clicking a beat centres it".)
    await openNarrative(page, "screenshots", 21);
    await beatReachedLine(page, 0, "the spine did not rest on its first beat");

    // WHAT IS MEASURED: the worst STALENESS during the sweep — how many beats behind the column the
    // highlight ever falls. Not where it ends up, and getting that wrong cost two false results.
    //
    // The first version counted distinct sections over a 60-frame (~1s) sweep. That races
    // `INTENT_MAX_MS`: under load the wedge simply expires mid-loop and the count recovers. The second
    // asserted the FINAL section after 12 frames, and instrumenting the injected build showed why that
    // is no better — the wedge is real (frames 0-4 pinned at "Section 3 of 21" while the column crossed
    // 36% of its range) but a single natural 160ms frame stall let the 150ms quiet timer fire, and by
    // the last frame the highlight had caught up to "Section 21 of 21". A defect that visibly freezes
    // the reader for a third of a page, measured directly, was reported as green by both.
    //
    // Staleness has no such escape: the freeze happened, so the peak is recorded whether or not the
    // highlight recovers afterwards. It is also the property a reader actually experiences.
    const worstLag = await page.evaluate(async () => {
      const col = document.querySelector("aside.spine");
      const lis = Array.from(document.querySelectorAll<HTMLElement>(".sections li"));
      const zero = lis.at(0)?.querySelector("button");
      const away = lis.at(2)?.querySelector("button");
      if (!(col instanceof HTMLElement) || !(zero instanceof HTMLElement) || !(away instanceof HTMLElement)) return -1;

      // The component's own rule, restated from live geometry: an end of the column outranks the line.
      const shouldBe = (): number => {
        if (col.scrollTop <= 1) return 0;
        if (col.scrollTop + col.clientHeight >= col.scrollHeight - 1) return lis.length - 1;
        const r = col.getBoundingClientRect();
        const mid = r.top + r.height / 2;
        return lis.findIndex((li) => {
          const b = li.getBoundingClientRect();
          return b.top <= mid && b.bottom >= mid;
        });
      };
      const showing = (): number => {
        const t = document.querySelector('.sections button[aria-current="true"] .beat-pos')?.textContent ?? "";
        const m = /Section (\d+) of/.exec(t);
        return m?.[1] ? Number(m[1]) - 1 : -1;
      };

      zero.click(); // zero-distance — review's exact repro; must arm nothing at all
      away.click(); // a real journey, and then the reader immediately goes elsewhere

      // FAR JUMPS, and the first one immediately. A gradual 12-frame ramp measured the wedge as small
      // and let it pass: the frames that were frozen were the EARLY ones, where the column had moved
      // 0-18% and the honest answer was only a beat or two from the stale one, so the peak lag never
      // cleared the bar. The wedge's size is proportional to how far the column travels while the
      // highlight is pinned, so the probe has to travel far, at once, right after the activation —
      // before any frame stall can let a quiet timer off the hook. Two rAFs per sample is ample for a
      // healthy build (the observer delivers at the end of a frame) and far inside a 150ms window.
      const max = col.scrollHeight - col.clientHeight;
      let worst = 0;
      for (const top of [max, 0, max, 0]) {
        col.scrollTop = top;
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        const want = shouldBe();
        const got = showing();
        if (want >= 0 && got >= 0) worst = Math.max(worst, Math.abs(want - got));
      }
      return worst;
    });

    // Measured on this build: the healthy design passes at or under the bar on every run; the restored
    // quiet timer reports a lag of **18** beats of 21. Three consecutive injections, each against a
    // verified-fresh build, and a full battery run — red every time. The bar sits well clear of both.
    expect(worstLag, "the highlight fell behind the column — an intent outlived the scroll it covered")
      .toBeLessThanOrEqual(2);
  });

  test("a pointer press mid-sweep does not bounce the reader through the beats in between", async ({ page }) => {
    // Review found this in the previous delta, and it is the guard's own defect class reintroduced by
    // the thing meant to make the guard polite. `onColumnInput` cleared the intent TOKEN but left the
    // programmatic scroll RUNNING, so the un-muted observer reported every beat the animation swept
    // past: ten spurious section changes in ~300ms, each clearing the open note and swapping the canvas
    // object. `wheel`/`touchstart` hid it because Chromium cancels a programmatic smooth scroll when a
    // real scroll gesture arrives — so those paths were correct by luck, not by construction.
    // `pointerdown` is not a scroll gesture, so nothing stopped the animation.
    //
    // Injected defect that reddens it: delete the `el.scrollTo({ top: el.scrollTop })` line from
    // `onColumnInput`, leaving it to clear the token alone.
    //
    // A SYNTHETIC `pointerdown` on the column, not a real `page.mouse.down()`, and review's own false
    // positive is the reason: a real press lands on whatever beat has scrolled under the cursor, so it
    // registers as a genuine click on that beat and looks like a bounce that reproduces even with the
    // fix in place. Dispatching on the column hits the listener under test and nothing else.
    await openNarrative(page, "screenshots", 21);
    await beatReachedLine(page, 0, "the spine did not rest on its first beat");

    const visited = await page.evaluate(async () => {
      const col = document.querySelector("aside.spine");
      const lis = Array.from(document.querySelectorAll<HTMLElement>(".sections li"));
      const far = lis.at(18)?.querySelector("button");
      const ol = document.querySelector(".sections");
      if (!(col instanceof HTMLElement) || !(far instanceof HTMLElement) || !ol) return ["no column"];

      const seen: string[] = [];
      const rec = () => {
        const t = document.querySelector('.sections button[aria-current="true"] .beat-pos')?.textContent;
        if (t && seen[seen.length - 1] !== t) seen.push(t);
      };
      new MutationObserver(rec).observe(ol, { subtree: true, attributes: true, attributeFilter: ["aria-current"] });

      far.click(); // a long smooth sweep, beat 0 → beat 18
      await new Promise((r) => requestAnimationFrame(() => r(null))); // one frame in, animation running
      col.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      for (let f = 0; f < 40; f++) await new Promise((r) => requestAnimationFrame(() => r(null)));
      return seen;
    });

    // One transition — the activation itself. Measured: 1 with the animation stopped, 10 without
    // (9 spurious, e.g. Sections 5, 7, 9, 13, 14, 15, 16, 17, 19 on one run).
    //
    // What this does NOT gate, stated so nobody reads it as more than it is: dropping `"pointerdown"`
    // from `INPUTS` leaves it green, because that removes the trigger rather than the bug. This pins
    // the scroll-stop in `onColumnInput`, which is the part that makes all four input paths correct by
    // construction instead of three of them correct by Chromium's gesture-cancellation behaviour.
    expect(visited, "the pointer press un-muted the observer over a still-running scroll").toEqual([
      "Section 19 of 21",
    ]);
  });

  test("a sub-pixel arrival still ends the intent", async ({ page }) => {
    // The pin for `ARRIVE_PX`, which the previous delta wrongly called unpinned from below. Chromium
    // rounds `scrollTo` to whole pixels while the target comes from `getBoundingClientRect()` and is
    // fractional — 20 of 21 beats land up to ~0.48px SHORT. A short landing satisfies
    // `scrollTop >= intentTop - 2` and fails at 0, so at 0 the intent never ends; moving the column to a
    // position still short of the target then cannot rescue it via reached-or-passed either, and the
    // highlight stays stuck on the activated beat while the reader looks at a different one.
    //
    // The rest of the suite is green at 0 purely because every other probe jumps to `max` or `0`,
    // hundreds of pixels past the target, where overshoot releases every intent. That is a coverage
    // gap, and this test is the thing that closes it.
    //
    // Injected defect that reddens it: `ARRIVE_PX = 0`.
    await openNarrative(page, "screenshots", 21);
    await beatReachedLine(page, 0, "the spine did not rest on its first beat");

    const probe = await page.evaluate(async () => {
      const col = document.querySelector("aside.spine");
      const lis = Array.from(document.querySelectorAll<HTMLElement>(".sections li"));
      const near = lis.at(2)?.querySelector("button");
      if (!(col instanceof HTMLElement) || !(near instanceof HTMLElement)) return { showing: -1, truth: -2, short: 0 };

      const centreTarget = (li: HTMLElement): number => {
        const c = col.getBoundingClientRect();
        const b = li.getBoundingClientRect();
        return col.scrollTop + (b.top + b.height / 2 - (c.top + c.height / 2));
      };
      const asked = centreTarget(lis[2] as HTMLElement);
      near.click();
      for (let f = 0; f < 30; f++) await new Promise((r) => requestAnimationFrame(() => r(null)));
      const landedShort = asked - col.scrollTop; // > 0 when Chromium rounded us short of the target

      // Now move SHORT of that target, where only a properly-ended intent lets the observer speak.
      col.scrollTop = 300;
      for (let f = 0; f < 6; f++) await new Promise((r) => requestAnimationFrame(() => r(null)));

      const r = col.getBoundingClientRect();
      const mid = r.top + r.height / 2;
      const truth = lis.findIndex((li) => {
        const b = li.getBoundingClientRect();
        return b.top <= mid && b.bottom >= mid;
      });
      const t = document.querySelector('.sections button[aria-current="true"] .beat-pos')?.textContent ?? "";
      const m = /Section (\d+) of/.exec(t);
      return { showing: m?.[1] ? Number(m[1]) - 1 : -1, truth, short: landedShort };
    });

    // Non-vacuity: this only tests anything if the landing really was fractional-short of the target.
    expect(probe.short, "the scroll landed exactly on target — no sub-pixel shortfall to test")
      .toBeGreaterThan(0);
    expect(probe.truth, "no beat crosses the line at scrollTop 300 — the probe proves nothing")
      .toBeGreaterThanOrEqual(0);
    expect(probe.showing, "the highlight is stuck on the activated beat — the intent never ended")
      .toBe(probe.truth);
  });

  test("an intent that never arrives releases on its own", async ({ page }) => {
    // `INTENT_MAX_MS` as a real backstop. The previous delta claimed nothing in normal operation reached
    // it and that it therefore could not be pinned; review disproved that in both directions. The half
    // that mattered: the deadline was only ever read inside the observer callback, so when the column
    // came to rest short of its target — no crossings, no scroll events — NOTHING consulted it, and the
    // highlight stayed frozen for 3500ms with no recovery. A deadline only a callback can notice cannot
    // bound a wedge whose definition is that the callback stopped arriving.
    //
    // It is now a timer armed with the intent that ends it and re-observes. This drives the
    // non-arriving case directly: activate far away, then park the column somewhere short of the target
    // without any input event, and wait past the ceiling.
    //
    // Injected defect that reddens it: delete the `intentTimer = setTimeout(...)` line.
    await openNarrative(page, "screenshots", 21);
    await beatReachedLine(page, 0, "the spine did not rest on its first beat");

    const parked = await page.evaluate(async () => {
      const col = document.querySelector("aside.spine");
      const lis = Array.from(document.querySelectorAll<HTMLElement>(".sections li"));
      const far = lis.at(18)?.querySelector("button");
      if (!(col instanceof HTMLElement) || !(far instanceof HTMLElement)) return { showing: -1, truth: -2 };
      far.click();
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      // Park short of the target by assignment — no wheel/touch/key/pointer, so nothing cancels the
      // intent the way a reader would. This is the reflow-moved-the-target shape.
      col.scrollTop = 300;
      await new Promise((r) => setTimeout(r, 2200)); // past INTENT_MAX_MS (1500)
      const r = col.getBoundingClientRect();
      const mid = r.top + r.height / 2;
      const truth = lis.findIndex((li) => {
        const b = li.getBoundingClientRect();
        return b.top <= mid && b.bottom >= mid;
      });
      const t = document.querySelector('.sections button[aria-current="true"] .beat-pos')?.textContent ?? "";
      const m = /Section (\d+) of/.exec(t);
      return { showing: m?.[1] ? Number(m[1]) - 1 : -1, truth };
    });

    expect(parked.truth, "no beat crosses the line where the column was parked — the probe proves nothing")
      .toBeGreaterThanOrEqual(0);
    expect(parked.showing, "the highlight never recovered — the intent outlived its own deadline")
      .toBe(parked.truth);
  });

  test("the column's two ends resolve to the first and last beat", async ({ page }) => {
    // The MEASURED hole in a pure centre-line rule (see `beatAtColumnEnd`). Two different failures,
    // one at each end, and the vacuity guards below assert the hole is really there rather than
    // trusting the description:
    //   foot — the line lands on beat 4 of 6 while the reader is plainly at the last beat. The precise
    //          arithmetic, because "the reservation is taller than half the column" would be wrong: at
    //          maximum scroll the last beat's own height above the floor (230px) plus the V87 finder-pill
    //          reservation below it (98px) is 328px, which is less than the 360px half-column the line
    //          sits at — so the line falls short of the last beat's top by 32px.
    //   head — at scrollTop 0, NO beat crosses the line at all: the spine's header does exceed half the
    //          column (the first beat's box starts at 400px against a line at 360px), so the observer is
    //          simply silent there.
    // Injected defect that reddens it: `return null` from `beatAtColumnEnd` — the last beat becomes
    // unreachable by scrolling, and the head keeps whatever beat last crossed.
    await openNarrative(page, "voynich-reading", 6);
    const box = await page.locator(SPINE).boundingBox();
    if (!box) throw new Error("the spine has no box");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

    await page.mouse.wheel(0, 5000); // hard against the bottom
    await columnSettled(page);
    expect(await beatOnCentreLine(page), "the LAST beat crosses the line at the foot — this test is vacuous")
      .not.toBe(5);
    await expect(page.locator(ACTIVE_POS)).toHaveText("Section 6 of 6");

    await page.mouse.wheel(0, -5000); // hard against the top
    await columnSettled(page);
    expect(await beatOnCentreLine(page), "a beat DOES cross the line at the head — this test is vacuous").toBe(-1);
    await expect(page.locator(ACTIVE_POS)).toHaveText("Section 1 of 6");
  });
});

test.describe("reduced motion, and the reader's scroll is never swallowed", () => {
  test("a reader scrolling BACK out of a live programmatic scroll wins immediately", async ({ page }) => {
    // What `onColumnInput` is for, and it took the arrival rewrite to state it correctly. Ending an
    // intent on arrival handles a reader who scrolls PAST the target — passing it counts as arriving.
    // It does nothing for a reader who scrolls BACKWARDS, away from the target: the column then never
    // reaches it, so without an input cancel the observer stays muted until the 1500ms backstop and the
    // reader's own scrolling is ignored. That is the residual swallow, and this is its gate.
    //
    // Two things this test learned the hard way:
    //  1. It must run with SMOOTH scrolling, so an intent is still in flight when the gesture lands.
    //     An earlier version used reduced motion; the activation then completed instantly, the intent
    //     was already gone, and the test pinned nothing — injecting the removal of the input listeners
    //     left it GREEN.
    //  2. It must drive in-page. `page.mouse.wheel` is swallowed outright by Chromium's own smooth-scroll
    //     animation (measured: the column continued to its programmatic target as if the wheel never
    //     happened), so a real wheel cannot express "the reader scrolled during the animation" at all.
    //     Dispatching the `wheel` and moving `scrollTop` together is what a scrollbar drag or a wheel
    //     actually does to the element, and it is the only way to put both halves inside the window.
    //
    // Injected defect that reddens it: remove the `INPUTS` listener registration — the highlight stays
    // on Section 2 while the column sits at the very top.
    await openNarrative(page, "voynich-reading", 6);
    await beatReachedLine(page, 0, "the spine did not rest on its first beat");

    const active = await page.evaluate(async () => {
      const col = document.querySelector("aside.spine") as HTMLElement | null;
      const next = document.querySelectorAll("nav.canvas-nav .cn-step")[1] as HTMLElement | undefined;
      if (!col || !next) return "no column";
      next.click(); // smooth-scrolls down to beat 1; the intent is live from here
      col.dispatchEvent(new WheelEvent("wheel", { deltaY: -1500, bubbles: true }));
      col.scrollTop = 0; // ...and the reader ends up back at the top, short of the target
      for (let f = 0; f < 8; f++) await new Promise((r) => requestAnimationFrame(() => r(null)));
      return document.querySelector('.sections button[aria-current="true"] .beat-pos')?.textContent ?? "none";
    });
    expect(active, "the reader's own scroll was swallowed by a live intent").toBe("Section 1 of 6");
  });

  test("reduced motion is honoured, and an activation still lands", async ({ page }) => {
    // `emulateMedia`, NOT `test.use({ reducedMotion: "reduce" })`. Measured 2026-07-26 on Playwright
    // 1.60 against this config: the describe-scoped `test.use` did not take — `matchMedia(...).matches`
    // read FALSE inside the test and the component took the smooth branch, so a test that believed it
    // was exercising the reduced-motion path was not. An option that silently fails to apply is the
    // same false-measurement class the rules file catalogues, so the emulation is asserted, not assumed.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openNarrative(page, "voynich-reading", 6);
    expect(
      await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches),
      "reduced-motion emulation did not apply",
    ).toBe(true);

    await page.locator("nav.canvas-nav .cn-step").last().click();
    await expect(page.locator(ACTIVE_POS)).toHaveText("Section 2 of 6");
    await beatReachedLine(page, 1, "the beat never reached the centre line under reduced motion");
  });
});

test.describe("the beats are numbered (V85)", () => {
  test("every beat states its own position, in the nav's noun-and-position idiom", async ({ page }) => {
    await openNarrative(page, "voynich-reading", 6);
    await expect(page.locator(".sections .beat-pos")).toHaveText([
      "Section 1 of 6", "Section 2 of 6", "Section 3 of 6",
      "Section 4 of 6", "Section 5 of 6", "Section 6 of 6",
    ]);
  });

  test("the active beat is marked to assistive tech, not only by colour", async ({ page }) => {
    await openNarrative(page, "voynich-reading", 6);
    await expect(page.locator('.sections button[aria-current="true"]')).toHaveCount(1);
    await expect(page.locator('.sections button[aria-current="true"] .beat-pos')).toHaveText("Section 1 of 6");
  });
});

test.describe("hiding the spine is per-exhibit and plainly reversible (Archie-c5cb, V83)", () => {
  test("collapsing one narrative's spine leaves the next narrative's spine alone", async ({ page }) => {
    await openNarrative(page, "voynich-reading", 6);
    await page.locator('button[aria-label="Hide narrative"]').click();
    await expect(page.locator(SPINE)).toHaveClass(/collapsed/);

    // Injected defect that reddens it: put the collapsed flag back on the unscoped global key
    // (`loadSessionCollapsed(ASIDE_COLLAPSED_KEY)`) — screenshots then opens already collapsed.
    await page.goto("./#/screenshots");
    await expect(page.locator(BEATS)).toHaveCount(21);
    await expect(page.locator(SPINE)).not.toHaveClass(/collapsed/);
    await expect(page.locator(BEATS).first()).toBeVisible();
  });

  test("the choice does hold for the exhibit it was made on", async ({ page }) => {
    // Per-exhibit means BOTH halves: not carried to a narrative the reader never touched, and not
    // silently discarded on the one they did. Otherwise "per-exhibit" is just "forgotten".
    await openNarrative(page, "voynich-reading", 6);
    await page.locator('button[aria-label="Hide narrative"]').click();
    await expect(page.locator(SPINE)).toHaveClass(/collapsed/);

    await page.goto("./#/screenshots");
    await expect(page.locator(BEATS)).toHaveCount(21);
    await page.goto("./#/voynich-reading");
    await expect(page.locator(BEATS)).toHaveCount(6);
    await expect(page.locator(SPINE)).toHaveClass(/collapsed/);
  });

  test("the collapsed state carries a visible, NAMED way back", async ({ page }) => {
    await openNarrative(page, "voynich-reading", 6);
    await page.locator('button[aria-label="Hide narrative"]').click();
    await expect(page.locator(SPINE)).toHaveClass(/collapsed/);

    // Visible and named: the divider's 20px chevron is reachable but its only words are in an
    // aria-label. Injected defect that reddens it: delete the `.show-spine` button.
    const back = page.locator("button.show-spine");
    await expect(back).toBeVisible();
    expect((await back.innerText()).toLowerCase()).toContain("sections");

    await back.click();
    await expect(page.locator(SPINE)).not.toHaveClass(/collapsed/);
    await expect(page.locator(BEATS).first()).toBeVisible();
    // And the coupling comes back with it — the restored spine is the input device again, not decor.
    await expect(page.locator(ACTIVE_POS)).toHaveText("Section 1 of 6");
  });

  test("a fresh session gets its driving surface back", async ({ page, context }) => {
    // The deliberate limit on persistence: after Archie-0d6c the spine IS the interaction, so a
    // reader returning later must never find it silently gone. sessionStorage, not localStorage.
    await openNarrative(page, "voynich-reading", 6);
    await page.locator('button[aria-label="Hide narrative"]').click();
    await expect(page.locator(SPINE)).toHaveClass(/collapsed/);

    const fresh = await context.newPage(); // a new tab = a new sessionStorage
    await goOffline(fresh);
    await fresh.goto("./#/voynich-reading");
    await expect(fresh.locator(BEATS)).toHaveCount(6);
    await expect(fresh.locator(SPINE)).not.toHaveClass(/collapsed/);
    await fresh.close();
  });
});

test.describe("V80 re-measure: canvas chrome still clears the spine (Archie-40fe)", () => {
  test("the top-right chrome group does not reach into the prose column", async ({ page }) => {
    // RE-MEASURED, not re-fixed: the group lives inside `main` now, so it anchors to the canvas.
    // Asserted here because this slice adds a control to that row, and a wider row is exactly how the
    // reservation would be eaten back.
    //
    // The two measurements, at 1280x720, kept apart on purpose — an earlier summary of this quoted the
    // COLLAPSED chrome's right edge against the EXPANDED spine's left, which compares two states that
    // never coexist and flatters the clearance:
    //   expanded  — chrome right 840, spine left 870  (30px)
    //   collapsed — chrome right 1250, viewport 1280  (30px)
    await openNarrative(page, "voynich-reading", 6);
    const chrome = await boxOf(page, ".canvas-chrome-right");
    const spine = await boxOf(page, SPINE);
    if (!chrome || !spine) throw new Error("chrome or spine missing");
    expect(chrome.x + chrome.width, `chrome right ${chrome.x + chrome.width} vs spine left ${spine.x}`)
      .toBeLessThanOrEqual(spine.x);
  });

  test("and still clears it with the extra control the collapsed state adds", async ({ page }) => {
    await openNarrative(page, "voynich-reading", 6);
    await page.locator('button[aria-label="Hide narrative"]').click();
    await expect(page.locator("button.show-spine")).toBeVisible();
    const chrome = await boxOf(page, ".canvas-chrome-right");
    if (!chrome) throw new Error("chrome missing");
    // The spine is 0-wide now, so the bar to clear is the viewport edge.
    const vw = page.viewportSize()?.width ?? 0;
    expect(chrome.x + chrome.width, `chrome right ${chrome.x + chrome.width} vs viewport ${vw}`)
      .toBeLessThanOrEqual(vw);
    expect(chrome.x).toBeGreaterThan(0);
  });
});
