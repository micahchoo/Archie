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

**Measured 2026-07-26, `Archie-0d6c`, in the commit that was fixing a related defect.** A guard muted
an IntersectionObserver while a programmatic scroll owned the column. A reader's own input was meant
to abandon that ownership immediately, so the handler did the obvious thing:

```ts
function onColumnInput() {
  scrollIntent = null;      // hands the column back to the observer
}
```

That clears the **token**. It does not stop the **animation**. So the programmatic scroll kept running
with the observer un-muted, and the observer dutifully reported every beat the animation swept past:
**ten spurious section changes in ~300 ms**, each closing the open note and swapping the canvas object.
Precisely the defect the guard existed to prevent, reintroduced by the code meant to make it polite.

## The part worth internalising: three of the four inputs were correct by accident

`wheel`, `touchstart` and `keydown` had been in the cancel list for weeks and behaved perfectly.
**Chromium cancels a programmatic smooth scroll when a real scroll GESTURE arrives**, so for those
three the column had genuinely stopped by the time the observer went live. The code was relying on
browser behaviour it never stated and its author did not know about.

`pointerdown` is not a scroll gesture. Nothing cancelled the animation, and the latent dependency
became a visible bug the moment a fourth input was added — for a good reason (a scrollbar drag emits
`scroll` without wheel/touch/key, so it was the realistic path to the wedge being fixed).

The fix is to stop the machine yourself, which also makes the other three honest rather than lucky:

```ts
function onColumnInput() {
  const el = asideEl;
  if (scrollIntent !== null && el) el.scrollTo({ top: el.scrollTop, behavior: "auto" });
  endIntent();
}
```

## How to apply

- **When you cancel a state token, ask what the token was describing.** If it describes an in-flight
  process — an animation, a transition, a fetch, a timer, a worker — cancel the process too. A flag is
  a claim about the world, not a lever on it.
- **A guard that works because of undocumented browser behaviour is a guard that will break when the
  input set changes.** If you find one, either state the dependency in a comment or remove it by doing
  the work explicitly. Prefer the second.
- **`endIntent()`-style single exits.** Give any state with an associated timer/animation exactly one
  teardown function and route every path through it, so a backstop can never fire against a later
  incarnation of the state.

## Testing it

The existing "does not bounce the reader through the beats in between" test could not see this,
because it never pressed the pointer. The regression test that can dispatches a **synthetic
`pointerdown` on the column** — deliberately not `page.mouse.down()`, because a real press at a
coordinate lands on whatever the scrolling column has moved under the cursor (see
[[playwright-emulation-and-scroll-traps]]).

Record what the test does NOT cover, in the test. Dropping `"pointerdown"` from the input list leaves
it **green** — that removes the trigger rather than the bug. The test pins the scroll-stop, and saying
so is what stops a future reader treating it as broader coverage than it is.

Sibling rules: [[wall-clock-quiet-is-a-load-sensitive-gate]] for the guard this lives inside, and
[[post-review-fixes-are-unreviewed]] for why this shipped at all — it was written after sign-off, in
the commit addressing the review, and was not red-greened because "it's just the fix they asked for."
