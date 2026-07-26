---
scope:
  - "apps/viewer/src/**"
  - "apps/studio/src/**"
  - "packages/render-*/src/**"
  - "apps/viewer/e2e/**"
tags: [timing, flake, guards, scroll, load-sensitivity]
priority: high
source: hand-written
---

# "Wait until it goes quiet" is a load-sensitive guess — end on ARRIVAL instead

**Measured 2026-07-26, `Archie-0d6c`.** A guard suppressed an IntersectionObserver while a
programmatic scroll was in flight, and ended the suppression when the column went **quiet** — the last
`scroll` event plus a 150 ms settle, re-armed by every scroll. The reasoning was sound on its face:
smooth-scroll duration is UA-defined, so a fixed timer would either cut the suppression short or hold
it long enough to eat a real gesture. Quiet-detection looked like the robust answer.

It failed in **both** directions, and each failure is a distinct lesson.

## Failure 1 — re-arming makes the window unbounded

Because every `scroll` event pushed the deadline out, a reader scrolling continuously kept re-arming
the suppression they were trying to escape. Measured: a zero-distance activation followed by scripted
per-frame scrolling froze the highlight for **1546 ms while the reader passed 2760 px and 15
sections**, released only by the outer ceiling.

The realistic path was a **scrollbar drag** — it emits `scroll` without the `wheel` / `touchstart` /
`keydown` that cancelled an intent. Adding `pointerdown` to the cancel list looked like the fix and
was not; see [[stop-the-machine-not-just-the-token]] for why it made things worse.

## Failure 2 — a frame stall is indistinguishable from arrival

A smooth scroll emits `scroll` continuously, so a 150 ms quiet timer "cannot" fire mid-animation.
Measured on an instrumented build: **a single natural 160 ms frame stall** left the column silent long
enough, the timer fired, the observer went live mid-sweep, and it reported whatever beat was under the
line at that instant.

**Under CPU contention, stalls get longer and more frequent — which is exactly why this appeared only
under load**, and why it read as an ordinary flake rather than a design fault. A test that reproduces
only when the machine is busy is not flaky infrastructure by default; check whether the code under
test is timing a guess.

## The fix, and the property that makes it different

Compute the destination as a **number** and end the suppression when the thing actually **arrives**:

```ts
const top = centreTopFor(el, li);           // exact scrollTop, clamped to what the column can reach
el.scrollTo({ top, behavior });
intentTop = top; intentDown = top > el.scrollTop;
```

- **Reached OR PASSED, never equals.** A scroll driven by something other than your own animation does
  not approach smoothly and stop: a dragged scrollbar moves in ~58 px jumps and straddles a 2 px
  window entirely. Record the direction of travel at issue time and ask whether you are at or beyond
  the target. Once the column is past where you asked it to go, your scroll is over however it got
  there.
- **A stalled frame moves nothing**, so it cannot release an arrival. That is the whole robustness
  claim, and it is structural rather than tuned.
- **Clamp the target at issue time** so a beat that CANNOT be centred (the last one) is as correct as
  one that can.
- **Zero distance arms nothing.** If you are already there, there is nothing to suppress.

## A wall-clock ceiling may remain, but it must be reachable from the path that needs it

`INTENT_MAX_MS` survived as a backstop against a scroll that never starts, or a target made
unreachable by a reflow mid-flight. Review found it was **not a backstop at all**: the deadline was
read only inside a function whose sole caller was the observer callback. So where crossings continued
it fired (1491 ms, measured), and where they stopped **nothing consulted it** — the highlight stayed
frozen for 3500 ms with no recovery.

**A deadline that only a callback can notice cannot bound a wedge whose definition is that the
callback stopped arriving.** Arm it as a timer alongside the state it bounds, give the state a single
exit so the timer can never fire against a later one, and have it *re-observe* rather than merely
clear — otherwise nothing re-delivers against the real position.

## How to apply

- Reach for "has it arrived?" before "has it been quiet?". Arrival is a comparison; quiet is a guess.
- If you cannot compute a destination, say what the fallback's failure mode is in a comment, and
  measure it under contention rather than on an idle machine.
- **Never re-arm a suppression from an event the suppressed thing itself emits.** `scroll` is emitted
  by the animation, so it cannot distinguish the animation from the reader.
- Any constant participating in a timing decision gets pinned by a test from BOTH directions, or is
  documented as unpinned with the reason. See [[post-review-fixes-are-unreviewed]] for how "the suite
  is green at 0, therefore the constant does nothing" was wrong here — the suite's probes overshot the
  target by hundreds of pixels, so the tolerance never had to do anything.
