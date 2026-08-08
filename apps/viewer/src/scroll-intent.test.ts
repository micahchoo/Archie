// Phase 9 — the narrative spine↔canvas scroll guard, headless. The intent state machine
// (armed → deadline → arrival → re-entry) and its two tolerance constants are pinned against a manual
// clock + timer queue, so no real time or DOM is involved. The journey-level behavior stays pinned by
// the driven-browser e2e (e2e/narrative-coupling.spec.ts) — this suite owns the MACHINE, that one owns
// the ride.
import { describe, it, expect } from "vitest";
import { ARRIVE_PX, INTENT_MAX_MS, createScrollIntent } from "./scroll-intent.js";

/** A manual-clock harness over the injected scroll surface. `advance` moves the clock and fires due
 *  timers; `elapse` moves the clock WITHOUT firing timers, to isolate the lazy deadline in `active()`.
 *  `scrollTop`/`scrolled`/`observes` are plain fields tests read and write directly. */
function harness() {
  let t = 0;
  let timerId = 0;
  const timers = new Map<number, { fn: () => void; at: number }>();
  const h = {
    scrollTop: 0,
    scrolled: [] as { top: number; behavior: ScrollBehavior }[],
    observes: 0,
  };
  const intent = createScrollIntent({
    readScrollTop: () => h.scrollTop,
    scrollTo: (top, behavior) => { h.scrolled.push({ top, behavior }); h.scrollTop = top; },
    observe: () => { h.observes++; },
    now: () => t,
    schedule: (fn, ms) => { const id = ++timerId; timers.set(id, { fn, at: t + ms }); return id; },
    cancel: (id) => { timers.delete(id as number); },
  });
  // h is returned BY REFERENCE (not spread): the injected readScrollTop/scrollTo/observe closures
  // capture the inner h, so the tests' `h.scrollTop = …` writes MUST land on that same object — a
  // spread copy would leave the closures reading a stale inner state (the exact bug this comment
  // exists to prevent).
  return Object.assign(h, {
    intent,
    /** Move the clock; due backstop timers fire (and re-observe). */
    advance(ms: number) {
      t += ms;
      for (const [id, timer] of [...timers]) {
        if (timer.at <= t) { timers.delete(id); timer.fn(); }
      }
    },
    /** Move the clock WITHOUT firing timers — isolates the deadline check inside `active()`. */
    elapse(ms: number) { t += ms; },
  });
}

describe("the tolerance constants — pinned so drift reddens", () => {
  it("ARRIVE_PX is 2px: sub-pixel scrollTo rounding must not wedge an intent", () => {
    expect(ARRIVE_PX).toBe(2);
  });
  it("INTENT_MAX_MS is 1500ms: the backstop ceiling", () => {
    expect(INTENT_MAX_MS).toBe(1500);
  });
});

describe("arm — arming the intent", () => {
  it("arms for a real scroll: direction recorded, deadline armed, one backstop timer, scroll issued", () => {
    const h = harness();
    h.intent.arm(300, "smooth");
    expect(h.scrolled).toEqual([{ top: 300, behavior: "smooth" }]);
    expect(h.intent.active()).toBe(true);
  });

  it("zero-distance (within ARRIVE_PX) arms NO intent and issues no scroll", () => {
    const h = harness();
    h.scrollTop = 100;
    h.intent.arm(100, "smooth"); // exactly here
    expect(h.scrolled).toEqual([]);
    expect(h.intent.active()).toBe(false);
    h.intent.arm(101.5, "smooth"); // 1.5px — inside the band
    expect(h.scrolled).toEqual([]);
    expect(h.intent.active()).toBe(false);
    h.intent.arm(102.1, "smooth"); // 2.1px — outside the band, arms
    expect(h.scrolled).toEqual([{ top: 102.1, behavior: "smooth" }]);
    expect(h.intent.active()).toBe(true);
  });

  it("exactly ARRIVE_PX away is still 'nothing to do' — the band is inclusive", () => {
    const h = harness();
    h.scrollTop = 100;
    h.intent.arm(102, "smooth");
    expect(h.scrolled).toEqual([]);
    expect(h.intent.active()).toBe(false);
  });
});

describe("deadline — the INTENT_MAX_MS backstop", () => {
  it("an intent that never arrives is ended by its backstop timer, which re-observes the column", () => {
    const h = harness();
    h.scrollTop = 100;
    h.intent.arm(300, "smooth"); // the harness scrollTo lands instantly...
    h.scrollTop = 150; // ...so pull the column back: the target stays 150px away and never arrives
    h.advance(INTENT_MAX_MS);
    expect(h.intent.active()).toBe(false);
    expect(h.observes).toBe(1); // the backstop asked "so where are we actually?"
  });

  it("the deadline is consulted lazily too — a clock past INTENT_MAX_MS ends the intent even if no timer fired", () => {
    const h = harness();
    h.scrollTop = 100;
    h.intent.arm(300, "smooth");
    h.elapse(INTENT_MAX_MS + 1); // move the clock, run no timers
    expect(h.intent.active()).toBe(false); // active() saw the ceiling itself
  });

  it("an intent inside its deadline stays active; the timer fires exactly at the ceiling", () => {
    const h = harness();
    h.intent.arm(300, "smooth");
    h.elapse(INTENT_MAX_MS - 1);
    expect(h.intent.active()).toBe(true);
    h.advance(1);
    expect(h.intent.active()).toBe(false);
  });
});

describe("arrival — reached-or-passed ends the suppression", () => {
  it("a scroll that lands on the target arrives immediately and hands the column back", () => {
    const h = harness();
    h.intent.arm(300, "smooth"); // the harness scrollTo lands exactly on the target
    expect(h.intent.onScroll()).toBe(false);
    expect(h.intent.active()).toBe(false);
  });

  it("still travelling: onScroll returns true (consumed) until the column reaches the target", () => {
    const h = harness();
    h.intent.arm(300, "smooth");
    h.scrollTop = 150; // mid-sweep
    expect(h.intent.onScroll()).toBe(true);
    expect(h.intent.active()).toBe(true);
    h.scrollTop = 298; // inside the ARRIVE_PX band
    expect(h.intent.onScroll()).toBe(false);
    expect(h.intent.active()).toBe(false);
  });

  it("overshoot counts: a jump that straddles the target still ends the intent", () => {
    const h = harness();
    h.intent.arm(300, "smooth");
    h.scrollTop = 358; // one step PAST the target, no frame in between (a dragged scrollbar)
    expect(h.intent.onScroll()).toBe(false);
    expect(h.intent.active()).toBe(false);
  });

  it("the 2px tolerance from below: a sub-pixel shortfall still counts as arrival", () => {
    const h = harness();
    h.intent.arm(300, "smooth");
    h.scrollTop = 299.64; // Chromium rounds scrollTo to whole px — 0.36px short of the target
    expect(h.intent.onScroll()).toBe(false);
    expect(h.intent.active()).toBe(false);
  });

  it("direction is recorded: travelling UP arrives at or before the target + ARRIVE_PX", () => {
    const h = harness();
    h.scrollTop = 500;
    h.intent.arm(100, "smooth"); // up
    h.scrollTop = 110; // still outside the band (110 > 102)
    expect(h.intent.onScroll()).toBe(true);
    h.scrollTop = 102; // the far edge of the band
    expect(h.intent.onScroll()).toBe(false);
    h.scrollTop = 500; // back to a real distance before arming again
    h.intent.arm(100, "smooth"); // up again
    h.scrollTop = 90; // jumped PAST the target — overshoot counts upward too
    expect(h.intent.onScroll()).toBe(false);
    expect(h.intent.active()).toBe(false);
  });

  it("arrived() is the reached-or-passed predicate, pinned at the exact band edge", () => {
    const h = harness();
    h.intent.arm(300, "smooth");
    h.scrollTop = 297.99;
    expect(h.intent.arrived()).toBe(false);
    h.scrollTop = 298; // intentTop - ARRIVE_PX exactly
    expect(h.intent.arrived()).toBe(true);
    h.scrollTop = 350;
    expect(h.intent.arrived()).toBe(true);
  });

  it("with no intent live, onScroll returns false — the caller takes the column", () => {
    const h = harness();
    expect(h.intent.onScroll()).toBe(false);
    expect(h.intent.active()).toBe(false);
  });
});

describe("re-entry — a new intent replaces any old one, timer and all", () => {
  it("arming mid-sweep replaces the live intent: old timer cancelled, fresh deadline", () => {
    const h = harness();
    h.scrollTop = 100;
    h.intent.arm(300, "smooth");
    h.scrollTop = 150; // mid-sweep of the first intent
    h.intent.arm(600, "smooth");
    expect(h.scrolled.map((s) => s.top)).toEqual([300, 600]);
    expect(h.intent.active()).toBe(true);
    // the FIRST intent's deadline passing must not end the second
    h.elapse(INTENT_MAX_MS - 1);
    expect(h.intent.active()).toBe(true);
    h.advance(1); // the second intent's own backstop fires at ITS ceiling
    expect(h.intent.active()).toBe(false);
    expect(h.observes).toBe(1); // exactly one backstop fired — the old one was cancelled
  });

  it("a zero-distance arm while an intent is live ends the live intent and arms nothing", () => {
    const h = harness();
    h.intent.arm(300, "smooth");
    h.scrollTop = 300; // arrive
    h.intent.arm(301, "smooth"); // 1px from where we are — nothing to do
    expect(h.scrolled.map((s) => s.top)).toEqual([300]);
    expect(h.intent.active()).toBe(false);
  });
});

describe("input — the reader touching the column abandons the intent", () => {
  it("cancels the programmatic animation (scroll to the current position) and ends the intent, timer included", () => {
    const h = harness();
    h.intent.arm(300, "smooth");
    h.scrollTop = 200; // animation still running
    h.intent.input();
    expect(h.scrolled[h.scrolled.length - 1]).toEqual({ top: 200, behavior: "auto" });
    expect(h.intent.active()).toBe(false);
    h.advance(INTENT_MAX_MS); // and the backstop timer died with the intent
    expect(h.observes).toBe(0);
  });

  it("with no intent live, input does nothing", () => {
    const h = harness();
    h.intent.input();
    expect(h.scrolled).toEqual([]);
    expect(h.intent.active()).toBe(false);
  });
});

describe("dispose — the unmount hook", () => {
  it("ends a live intent and leaves no timer behind", () => {
    const h = harness();
    h.intent.arm(300, "smooth");
    expect(h.intent.active()).toBe(true);
    h.intent.dispose();
    expect(h.intent.active()).toBe(false);
    h.advance(INTENT_MAX_MS);
    expect(h.observes).toBe(0);
  });

  it("is safe when no intent is live", () => {
    const h = harness();
    expect(() => h.intent.dispose()).not.toThrow();
    expect(h.intent.active()).toBe(false);
  });
});
