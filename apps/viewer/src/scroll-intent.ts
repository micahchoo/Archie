// The narrative spine↔canvas coupling guard (Archie-0d6c) — the INTENT TOKEN that keeps the
// IntersectionObserver in NarrativeReader.svelte from reporting the beats a PROGRAMMATIC scroll sweeps
// past. Extracted from the component so the state machine (armed → deadline → arrival → re-entry) and
// its two tolerance constants are headless-tested (scroll-intent.test.ts); the component keeps what is
// genuinely DOM — the observer effect, the listeners, the live-rect centre-line math — and hands this
// factory an injected scroll surface (readScrollTop/scrollTo/observe), the same tested-I/O-contract
// shape aside-persistence.ts gives the three reading hosts. Behavior is identical to the inline logic
// it replaces; the design history is recorded below where it is load-bearing.

/** Arrival tolerance — and it is LOAD-BEARING, which took two wrong readings to establish.
 *
 *  - FROM ABOVE it is pinned. At 100000 every `arm` takes the nothing-to-do branch and the
 *    prose stops following at all; `activate → camera AND prose … stepping the canvas nav` reddens.
 *  - FROM BELOW it is pinned too, and an earlier version of this note said the opposite. The suite IS
 *    green at 0 — but that is a coverage gap, not redundancy: every probe in it jumps to `max` or `0`,
 *    hundreds of pixels past the target, so every intent is released by overshoot and the tolerance
 *    never has to do anything. Two independent mechanisms make 0 a real defect.
 *      (a) CHROMIUM ROUNDS `scrollTo` TO WHOLE PIXELS, while this target comes from
 *          `getBoundingClientRect()` and is fractional — 20 of 21 beats are non-exact, landing up to
 *          0.48px short, stable across DPR 1 → 2.4. Landing 0.36px short satisfies
 *          `scrollTop >= intentTop - 2` and fails at 0, so the intent never ends and the column can
 *          then move somewhere SHORT of the target, where reached-or-passed cannot rescue it either.
 *      (b) the same constant gates the nothing-to-do branch in `arm`, so at 0 a sub-pixel
 *          target arms an intent whose `scrollTo` may not move the column at all — and therefore may
 *          emit no scroll event, so nothing is ever there to notice the arrival.
 *    Pinned by "a sub-pixel arrival still ends the intent" below: at 2 the highlight follows the
 *    column to the truth, at 0 it stays stuck on the activated beat. */
export const ARRIVE_PX = 2;
/** The backstop for an intent that never arrives — a target made unreachable by a reflow mid-flight
 *  (prose images landing, the pane toggle) is the realistic path. See the deadline history in `arm`. */
export const INTENT_MAX_MS = 1500;

/** The scroll surface the machine drives — the component's live DOM column, injected so the state
 *  machine itself is pure. `now`/`schedule`/`cancel` default to the platform's `performance.now` and
 *  `setTimeout`/`clearTimeout`; tests inject a manual clock and timer queue. */
export interface ScrollIntentSurface {
  /** The column's current scrollTop — the one input every arrival decision is made from. */
  readScrollTop: () => number;
  /** Perform a programmatic scroll. The armed intent covers this scroll until arrival.
   *  `scrollTo` on the column rather than `scrollIntoView` on the beat: the destination must be a
   *  NUMBER to test arrival against, and it scrolls exactly one box — no ancestor walk to reason about. */
  scrollTo: (top: number, behavior: ScrollBehavior) => void;
  /** Re-deliver the column's current state — the backstop's way of asking "so where are we actually?". */
  observe: () => void;
  /** Injectable clock (ms) for the deadline. */
  now?: () => number;
  /** Injectable timer — the backstop. */
  schedule?: (fn: () => void, ms: number) => unknown;
  /** Injectable timer cancellation. */
  cancel?: (id: unknown) => void;
}

/** The scroll-intent state machine. States, in order: armed → (arrival | deadline | reader input) →
 *  ended. A new `arm` while live is RE-ENTRY: it replaces the old intent, timer and all. */
export interface ScrollIntent {
  /** True while a programmatic scroll owns the column — the observer must stay out of the way.
   *  Consults the deadline lazily: a live intent past it is ended here, so the ceiling holds even
   *  where no timer ever fires. */
  active(): boolean;
  /** Has the column reached — or passed — the live intent's target? Meaningful only while `active()`. */
  arrived(): boolean;
  /** A scroll of the column asks one question of a live intent — are we there yet? Returns true while
   *  the intent is live and still travelling (the scroll belongs to the intent; the caller stays out
   *  of the way) and false otherwise — on arrival the intent ends and the caller takes the column back. */
  onScroll(): boolean;
  /** Scroll to `top` under a fresh intent. A scroll with nowhere to go (within ARRIVE_PX) arms no
   *  intent — there is nothing to suppress. */
  arm(top: number, behavior: ScrollBehavior): void;
  /** A direct scroll INPUT from the reader abandons the intent — see `input`'s rationale below. */
  input(): void;
  /** The ONE exit from a live intent, so the backstop timer can never outlive the intent that armed
   *  it and fire against a later one. */
  end(): void;
  /** The unmount hook — the same single exit, named for the effect cleanup that calls it. */
  dispose(): void;
}

export function createScrollIntent(surface: ScrollIntentSurface): ScrollIntent {
  const now = surface.now ?? (() => performance.now()); // arrow: `performance.now` is brand-checked (this-bound) in some engines
  const schedule = surface.schedule ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  // The concrete platform timer handle — needed only in the default wiring, where `schedule` hands
  // an id to `cancel` untouched; the interface keeps ids opaque (`unknown`) so tests may use any.
  type TimerId = ReturnType<typeof setTimeout>;
  const cancel = surface.cancel ?? ((id: unknown) => clearTimeout(id as TimerId));

  // A live intent: the exact scrollTop it is travelling to, which way, and when it gives up. `armed`
  // is the token — in the component it was the beat index, but its value was never read, only its
  // null-ness, so a flag is the honest shape.
  let armed = false;
  let intentTop = 0;
  let intentDown = true;
  let intentDeadline = 0;
  let timer: unknown = undefined;

  function end(): void {
    armed = false;
    cancel(timer);
    timer = undefined;
  }

  function active(): boolean {
    if (!armed) return false;
    if (now() > intentDeadline) { end(); return false; }
    return true;
  }

  /**
   * Has the column reached — or passed — the live intent's target?
   *
   * REACHED OR PASSED, not equals, and that distinction is the whole robustness of this design. An
   * equality test (even with a tolerance) assumes the column approaches the target smoothly and stops
   * on it. A scroll driven by something OTHER than our own animation does not: a dragged scrollbar
   * moves in jumps, and one 58px step can straddle a 2px window and miss it entirely. The intent would
   * then survive to the backstop — reintroducing, through the back door, exactly the wedge that ending
   * on arrival was meant to remove. Recording the direction of travel at issue time and asking whether
   * we are at or beyond the target makes overshoot terminate the intent, which is the honest reading:
   * once the column is past where we asked it to go, our scroll is over however it got there.
   *
   * Clamping the target at issue time is what makes this correct for a beat that CANNOT be centred
   * (the last one) as well as one that can.
   */
  function arrived(): boolean {
    const scrollTop = surface.readScrollTop();
    return intentDown ? scrollTop >= intentTop - ARRIVE_PX : scrollTop <= intentTop + ARRIVE_PX;
  }

  function onScroll(): boolean {
    if (!active()) return false;
    if (!arrived()) return true; // still travelling — the caller stays out of the way
    end();
    return false;
  }

  /**
   * Scroll to `top` under a fresh intent.
   *
   * The zero-distance case falls out for free and is worth naming: if the column is already at the
   * target, no intent is armed at all. That is the exact shape review used to wedge the old design.
   *
   * `INTENT_MAX_MS` is the backstop for an intent that never arrives — a target made unreachable by a
   * reflow mid-flight (prose images landing, the pane toggle) is the realistic path. An earlier
   * version of this comment claimed nothing in normal operation reaches it and that therefore no test
   * could pin it. Review disproved that in BOTH directions and it is worth recording how, because the
   * error was structural rather than a wrong number: the deadline was read only inside
   * `active()`, whose only caller is the observer callback. So where observer crossings kept
   * coming the ceiling did fire (measured at 1491ms), and where they did not — the column left at rest
   * short of its target — NOTHING consulted it at all, and the highlight stayed frozen for 3500ms with
   * no recovery. A deadline that only a callback can notice is not a backstop, because the wedge it is
   * meant to bound is exactly the state in which that callback stops arriving.
   * So it is now enforced by a timer armed with the intent, which ends the intent AND re-observes the
   * beats so the observer re-delivers against the column's real position. `end()` is the single
   * exit, so arrival and reader input cancel that timer rather than leaving it to fire on a later
   * intent. It only ever ENDS suppression, never extends it — which is what separates it from the
   * quiet-timer design it replaced.
   *
   * When an intent ends we deliberately do NOT resync the active section from wherever the line ended
   * up — the column cannot always put the requested beat on the line, and resyncing would undo the
   * very activation that asked for it. The reader's next real scroll takes ownership back.
   */
  function arm(top: number, behavior: ScrollBehavior): void {
    const scrollTop = surface.readScrollTop();
    if (Math.abs(scrollTop - top) <= ARRIVE_PX) { end(); return; }
    end(); // a new intent replaces any old one, timer and all (re-entry)
    armed = true;
    intentTop = top;
    intentDown = top > scrollTop;
    intentDeadline = now() + INTENT_MAX_MS;
    // The backstop, armed WITH the intent rather than left for a callback to notice. An intent that
    // never arrives — a reflow moving the target mid-flight is the realistic way — otherwise wedges the
    // highlight for as long as nothing else touches the column, because the observer that would have
    // spotted the expiry is exactly the thing the intent has muted. Re-observing forces a fresh delivery
    // against wherever the column really is.
    timer = schedule(() => { end(); surface.observe(); }, INTENT_MAX_MS);
    surface.scrollTo(top, behavior);
  }

  /**
   * A direct scroll INPUT from the reader abandons the intent — a human who reaches for the column
   * mid-animation wins immediately, whether or not the programmatic scroll ever arrived.
   *
   * IT MUST STOP THE MACHINE, NOT JUST DROP THE TOKEN, and that distinction shipped a real bounce
   * before review caught it. Dropping the token un-mutes the observer; if the programmatic
   * animation is still running, the observer then reports every beat the animation sweeps past —
   * measured at TEN spurious section changes in ~300ms on a beat-0-to-18 activation, each one clearing
   * the open note and swapping the canvas object. Precisely the defect this whole guard exists to
   * prevent, reintroduced by the thing meant to make it polite.
   *
   * Why `wheel`/`touchstart` looked fine and hid it: Chromium cancels a programmatic smooth scroll when
   * a real scroll GESTURE arrives, so for those the column had genuinely stopped and the un-muted
   * observer saw a still column. `pointerdown` is not a scroll gesture — nothing stops the animation —
   * so it exposed a dependence on browser behaviour this code never stated. Scrolling to the current
   * position cancels the animation ourselves, which makes all four paths honest rather than three of
   * them lucky.
   *
   * `pointerdown` earns its place in the list: a scrollbar drag, a press-and-hold on a beat, starting a
   * text selection in the prose and a right-click all scroll or intend to scroll without ever emitting
   * wheel/touch/key.
   */
  function input(): void {
    if (!armed) return;
    surface.scrollTo(surface.readScrollTop(), "auto"); // cancel the programmatic animation
    end();
  }

  function dispose(): void { end(); }

  return { active, arrived, onScroll, arm, input, end, dispose };
}
