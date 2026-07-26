---
scope:
  - "apps/viewer/e2e/**"
  - "apps/studio/e2e/**"
  - "recipes/**"
tags: [testing, e2e, playwright, scroll, emulation]
priority: high
source: hand-written
---

# Two Playwright traps that make a test fail for a reason that is not the code

Both measured 2026-07-26 while gating the narrative scroll coupling. Each cost a wrong diagnosis
before it was caught, and each fails in the direction that looks like a real defect — so the wasted
time goes into investigating working code.

## 1. `test.use({ reducedMotion })` silently does not apply describe-scoped

Under this repo's config (Playwright 1.60), a `test.use({ reducedMotion: "reduce" })` inside a
`test.describe` block **does not take effect**: `matchMedia("(prefers-reduced-motion: reduce)").matches`
reads `false` in the page. The test then fails somewhere downstream, for a reason that has nothing to
do with what it was written to check.

**Assert the emulation took, in the test, before depending on it:**

```ts
expect(
  await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches),
  "reducedMotion emulation did not apply — this test is measuring animation, not behaviour",
).toBe(true);
```

The general form: **an emulation option is a request, not a guarantee.** Anything that changes the
browser's environment — reduced motion, colour scheme, timezone, locale, offline — is worth one cheap
assertion that it actually applied, because every failure downstream of a silently-ignored option
points at the wrong suspect.

## 2. Chromium swallows a synthetic wheel during a programmatic smooth scroll

`page.mouse.wheel()` dispatched while a `scrollTo({ behavior: "smooth" })` animation is running is
**discarded outright** — not queued, not merged. A test that scripts "start a smooth scroll, then the
reader intervenes with the wheel" measures Chromium's animation policy rather than the app's response.

Two ways out, and they answer different questions:

- **Run the test under reduced motion** (having asserted it applied, per trap 1) so there is no smooth
  animation to compete with — correct when the wheel is incidental and you are testing what the
  handler does.
- **Drive the scroll position directly** (`el.scrollTop = n` per frame) — correct when the *contention*
  between a programmatic scroll and a reader's own scrolling is the actual subject, which is exactly
  the case for a re-entrancy guard.

Related, and it bit in the same session: `page.mouse.down()` mid-animation is a genuine pointer press
at a screen coordinate, so if the column scrolls under the cursor it lands on **whatever is now under
that point**. A probe that appeared to prove a defect (reproducibly, 3/3) turned out to be a real click
on a different element; it survived until the suspected cause was removed and it *still* reproduced.
When a pointer probe needs to hit the container rather than its moving contents, dispatch to the
element, not to a coordinate.

## Why these are worth a rule

Neither is a bug in Playwright, and neither produces a message naming the real cause. They belong to
the same family as [[drive-must-not-recreate-the-thing-under-test]] and [[playwright-count-does-not-wait]]:
**the harness answered a question correctly, and it was not the question the test was asking.** The
counter-discipline is the same one — before believing a failure, check that the setup you think you
established is the setup the browser actually has.
