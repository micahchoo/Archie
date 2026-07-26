---
scope:
  - apps/viewer/e2e/**
  - apps/studio/e2e/**
  - recipes/**
tags: [testing, e2e, playwright, vacuous-tests]
priority: high
source: hand-written
---

# `Locator.count()` after a NAVIGATION reads 0 against an unhydrated island — and the test passes

Playwright's assertions auto-wait. **`Locator.count()` does not.** It returns whatever the DOM holds
at that instant. Against an Astro island that has not hydrated yet — the state immediately after
`page.goto()` — that is **0**, every time.

On its own that is a flaky read. Combined with a conditional skip or an early return, it is worse:
the test **passes without testing anything**, and reports success.

## The hazard is narrower than "count() doesn't wait" — scope it or the sweep becomes noise

**`count()` after a navigation, before the island exists** is the dangerous form. **`count()` after an
action on an already-hydrated page is safe** — the action itself guarantees hydration.

Measured 2026-07-26, and this is why the distinction is in the rule rather than a blanket ban: two
sites that superficially match the shape (`object-nav.spec.ts:180`, `occlusion.spec.ts:60` — both
`test.skip` driven by a raw `count()`) were attacked directly. Six trials each at 1x, 6x and **20x CPU
throttling**: `count()` read zero in **0 of 18 trials**, because a preceding `click()` had already
forced hydration.

A rule that flags every `count()` gets ignored. Flag the ones that follow a `goto` with nothing
awaited in between.

## What it did here (measured 2026-07-26)

Two new e2e tests in the note-surface slice were silently vacuous:

- one skipped itself on `n < 2`
- one reported `"no AV object in the sampler"`

**Both while the sampler fixture was perfectly fine.** The suite was green, the count was zero, and
the reason was hydration timing rather than data. It was caught only because an unrelated assertion
failed alongside and forced a second look.

## How to apply

- **Never branch on a bare `count()`.** If a test needs N elements, assert it and let the assertion
  wait: `await expect(loc).toHaveCount(n)`. That fails loudly on a fixture that stopped carrying the
  thing, which is the outcome you want.
- **A conditional skip must be impossible to reach by accident.** `test.skip(cond)` and
  `if (n < 2) return` are the shapes to distrust. If a fixture stops carrying an AV object, that is a
  **failure**, not a skip — the whole point of the test is that the object is there.
- **Wait for something real before counting**, if you must count: `await expect(someAnchor).toBeVisible()`
  on an element the island renders, then count.
- **Watch the skipped total.** A suite's skipped count is a number worth reading in CI output. This
  slice's went from 1 to **0**, and the 1 was a bug rather than an intentional exclusion.

## The general form

This is the same failure class as `[[viewer-e2e-shared-port]]` (a run reusing a sibling's server),
the vacuous `no halo before anything is selected` test (which ran on an exhibit where no overlay
could ever draw), and the V48 sweep that passed against an injected defect because it happened to
pick the one clearing note. Every one is **a measurement that looks valid and isn't** — and the
false-green direction never prompts anyone to investigate.

`[[svelte-no-typecheck-net]]` states the parent principle: a gate answers the question it was asked,
and *"did this actually exercise anything?"* is a question no gate asks itself. The counter-discipline
is the one this repo already uses everywhere else — **inject the defect and watch the test fail**
before trusting it. A test that cannot be made to fail is not a gate, and a test that skips itself
into green is worse than absent, because the suite total says it ran.
