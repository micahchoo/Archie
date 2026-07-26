---
scope:
  - recipes/**
  - apps/viewer/e2e/**
  - apps/studio/e2e/**
tags: [testing, e2e, drive, vacuous-tests]
priority: high
source: hand-written
---

# If your drive re-creates the thing under test, the assertion is vacuous — and green

A drive helper that navigates (`page.goto`, a full reload, a fresh `open(slug)`) **destroys and
rebuilds the custom element**, so every field on it starts at its initial value. Any assertion about
*state that should persist or reset across a transition* is then measuring a brand-new object, not
the behaviour. It passes whether the code is right or wrong.

## What it did here (measured 2026-07-26)

`recipes/smoke.mjs` grew an assertion that a Reading does not follow the reader into another exhibit.
It used the drive's `open(slug)` helper — which does a full `page.goto`. With the reset **deleted**,
smoke still reported **41/41 PASS**.

The fix was not a better assertion, it was a different route: the drive now walks the reader's own way
out (grid → gallery → sibling exhibit) with **no reload**, so the element survives the transition and
its field is the thing being read. Re-proven red-green: reset deleted → `FAIL "rosettes opens with
cipher checked"`; restored → `PASS "(base) checked"`.

## The rule

**Element state can only be tested across the navigations the ELEMENT performs.** If the test needs a
transition, drive it the way a reader would — click the control. Reserve `goto` for arriving at a
starting point, never for crossing the boundary whose effect you are asserting.

The tell: an assertion about "X survives / X resets when Y happens", where the setup for Y is a URL
change rather than a click. If deleting the implementation leaves it green, you found it the hard way.

## The sibling hazards on the same gate, each of which shipped

Four of this one file's assertions looked like enforcement and asserted nothing. All four were found
only by deliberately breaking the thing they claimed to protect:

| the assertion | why it could not fail |
| --- | --- |
| the lazy-boundary check | matched a **filename**, so a `chunk-*.js` hoist sailed past |
| the whole capability suite | a fixture rename took it from 33 assertions to **6**, `RESULT: PASS`, exit 0 |
| the Reading-lifetime check | the drive **reloaded the page**, re-creating the field under test |
| a timed-row seek check | asserted `playhead > 0` against a fixture cue starting at **0:00** — it failed against *correct* code |

Note the last one is the mirror image: a **false failure**. Same root cause — an assertion whose
premise about the fixture was never checked.

## The counter-discipline

- **Inject the defect and watch it fail, before trusting the assertion.** Nothing else in this repo
  has reliably caught this class.
- **Check the injection did what you think.** Writing `if (false)` on a branch whose `else` holds the
  records forces the *normal* path — it comes back green and looks like a broken gate. Read the
  output for evidence the injected state was actually reached.
- **A MUST row with no assertion label is invisible to a completeness check.** Keep the contracted
  label list a hand-maintained literal, and keep every capability in it — see
  `CONTRACTED_LABELS` in `recipes/smoke.mjs`. A label list derived from the same structure that emits
  the labels is a tautology and cannot catch anything.

## And the process half

**A fix made after the review is unreviewed.** The splice that removed five labels from
`CONTRACTED_LABELS` — silently dropping the completeness check from 40 rows to 35, including every AV
row — landed in the commit written *in response to the review's findings*. The reviewed SHA was
clean. The natural moment to relax is exactly when the hard part has been signed off; re-run the gate
and re-read the diff after the last fix, not before it.

Parent principle in `[[svelte-no-typecheck-net]]`: a gate answers the question it was asked, and
*"did this actually exercise anything?"* is a question no gate asks itself.
