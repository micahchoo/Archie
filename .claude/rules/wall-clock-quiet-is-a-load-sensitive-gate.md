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
programmatic scroll was in flight and ended the suppression when the column went **quiet** (last
`scroll` event + 150 ms settle, re-armed by every scroll). The reasoning looked robust —
smooth-scroll duration is UA-defined, so a fixed timer must be either too short or too long. It
failed in **both** directions:

1. **Re-arming makes the window unbounded.** Every `scroll` event pushed the deadline out, so a
   reader scrolling continuously kept re-arming the suppression they were trying to escape.
   Measured: highlight frozen **1546 ms while the reader passed 2760 px and 15 sections**, released
   only by the outer ceiling. The realistic trigger is a **scrollbar drag** — it emits `scroll`
   without the `wheel`/`touchstart`/`keydown` that cancelled an intent (and adding `pointerdown` to
   the cancel list made things worse — [[stop-the-machine-not-just-the-token]]).
2. **A frame stall is indistinguishable from arrival.** A smooth scroll emits `scroll` continuously,
   so a 150 ms quiet timer "cannot" fire mid-animation — yet a single natural **160 ms frame stall**
   fired it mid-sweep, and the observer reported whatever beat was under the line at that instant.
   Under CPU contention stalls get longer and more frequent, which is why this surfaced only under
   load and read as an ordinary flake. **A test that reproduces only when the machine is busy is not
   flaky infrastructure by default — check whether the code under test is timing a guess.**

## The fix, and the property that makes it different

Compute the destination as a **number** and end the suppression when the column actually arrives:

```ts
const top = centreTopFor(el, li);           // exact scrollTop, clamped to what the column can reach
el.scrollTo({ top, behavior });
intentTop = top; intentDown = top > el.scrollTop;
```

- **Reached OR PASSED, never equals.** A dragged scrollbar moves in ~58 px jumps and straddles a
  2 px window entirely; record direction at issue time and ask "at or beyond?". Past the target,
  your scroll is over however it got there.
- **A stalled frame moves nothing, so it cannot release an arrival** — the robustness is structural,
  not tuned.
- **Clamp the target at issue time**, so a beat that cannot be centred (the last one) works too.
- **Zero distance arms nothing** — already there means nothing to suppress.

## A backstop ceiling must be reachable from the path that needs it

`INTENT_MAX_MS` survived as a backstop against a scroll that never starts or a target lost to a
mid-flight reflow — and review found it wasn't one: the deadline was read only inside the observer
callback, so where crossings continued it fired (1491 ms, measured), and where they stopped
**nothing consulted it** — frozen 3500 ms with no recovery. **A deadline only a callback can notice
cannot bound a wedge whose definition is that the callback stopped arriving.** Arm it as a timer
beside the state it bounds, give the state a single exit so the timer can never fire against a later
incarnation, and have it *re-observe* rather than merely clear.

## How to apply

- Reach for "has it arrived?" before "has it been quiet?" — arrival is a comparison; quiet is a
  guess. If you cannot compute a destination, comment the fallback's failure mode and measure it
  under contention, not on an idle machine.
- **Never re-arm a suppression from an event the suppressed thing itself emits** — `scroll` comes
  from the animation, so it cannot distinguish the animation from the reader.
- Any constant in a timing decision gets pinned by a test from BOTH directions, or is documented as
  unpinned with the reason — the suite was green at 0 here only because its probes overshot the
  target by hundreds of pixels ([[post-review-fixes-are-unreviewed]]).
