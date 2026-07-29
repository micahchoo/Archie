---
scope:
  - "apps/viewer/src/**"
  - "apps/studio/src/**"
  - "packages/render-*/src/**"
tags: [state, cancellation, guards, animation]
priority: high
source: hand-written
---

# Clearing the flag is not cancelling the thing — and three paths can be right by luck

**Measured 2026-07-26, `Archie-0d6c`, in the commit fixing a related defect** (written post-review,
not red-greened — [[post-review-fixes-are-unreviewed]]). A guard muted an IntersectionObserver while
a programmatic scroll owned the column; the reader's own input was meant to abandon that ownership:

```ts
function onColumnInput() {
  scrollIntent = null;      // hands the column back to the observer
}
```

That clears the **token**. It does not stop the **animation**. The programmatic scroll kept running
with the observer un-muted: **ten spurious section changes in ~300 ms**, each closing the open note
and swapping the canvas object — precisely the defect the guard existed to prevent.

**The part worth internalising: three of the four cancel inputs were correct by accident.**
`wheel`/`touchstart`/`keydown` behaved perfectly for weeks only because **Chromium cancels a
programmatic smooth scroll when a real scroll GESTURE arrives** — an undocumented dependency nobody
had stated. `pointerdown` is not a scroll gesture, so the moment it was added (for good reason: a
scrollbar drag emits `scroll` with none of the other three), the latent dependency became the bug.

The fix stops the machine yourself, which also makes the other three honest rather than lucky:

```ts
function onColumnInput() {
  const el = asideEl;
  if (scrollIntent !== null && el) el.scrollTo({ top: el.scrollTop, behavior: "auto" });
  endIntent();
}
```

## How to apply

- **When you cancel a state token, ask what the token was describing.** If it describes an in-flight
  process — animation, transition, fetch, timer, worker — cancel the process too. A flag is a claim
  about the world, not a lever on it.
- **A guard that works because of undocumented browser behaviour breaks when the input set changes.**
  Either state the dependency in a comment or remove it by doing the work explicitly. Prefer the
  second.
- **`endIntent()`-style single exits**: any state with an associated timer/animation gets exactly one
  teardown, every path routed through it, so a backstop can never fire against a later incarnation.

## Testing it

The regression test dispatches a **synthetic `pointerdown` on the column** — deliberately not
`page.mouse.down()`, because a real press at a coordinate lands on whatever the scrolling column has
moved under the cursor ([[playwright-emulation-and-scroll-traps]]). And record what the test does
NOT cover, in the test: dropping `"pointerdown"` from the input list leaves it green — that removes
the trigger, not the bug. The test pins the scroll-stop; saying so stops a future reader treating it
as broader coverage. Sibling: [[wall-clock-quiet-is-a-load-sensitive-gate]] — the guard this lives
inside.
