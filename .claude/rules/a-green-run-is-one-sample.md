---
scope:
  - "**/*.test.ts"
  - "**/*.spec.ts"
  - "apps/*/e2e/**"
  - "recipes/**"
tags: [testing, flake, determinism, review]
priority: high
source: hand-written
---

# A red-green proves an assertion CAN fail; it says nothing about whether it passes reliably

**Measured 2026-07-26.** A test reached `main` that failed **9 times in 20** against a completely
correct tree. It got there through an unusually thorough process:

- the author wrote it, ran it, green;
- an adversarial reviewer attacked it with **17 injections**, 15 of which went red, and specifically
  hunted vacuity patterns — `test.skip`, bare `count()`, derived expected-counts — and found a
  genuine blocker elsewhere in the same file;
- the lead ran the full suite twice on the merged tree, green both times;
- it was merged, and CI's first completed run on it was red.

Four people, four runs, four single samples of a coin flip. **Nobody ran it twice.**

## The two questions, and why passing one is not passing the other

> The reviewer's injections and the author's green run answer different questions, and neither
> answers the other's.

| question | answered by | cost |
| --- | --- | --- |
| *can this fail when something is wrong?* | one injection, one red run | seconds |
| *does this pass when nothing is wrong?* | **N runs, unchanged tree** | seconds |

A red-green campaign is aimed entirely at the first. It is the right campaign — it is what caught the
blocker — and it is structurally incapable of noticing a false red, because every run it cares about
is *supposed* to fail. The second question needs nothing clever, only repetition, and it is the one
that was never asked.

Note the direction: this is a **false red**, the mirror of the failure class most of these rules are
about. It fails against correct code. Same family as the timed-row seek check that asserted
`playhead > 0` against a fixture cue starting at 0:00 (`[[drive-must-not-recreate-the-thing-under-test]]`).

## The tell: an expected value whose ORDER is derived rather than literal

The assertion was `expect(values(slug)).toEqual(fixtureArray.map(…))` — `toEqual` on an array is
order-sensitive. It became flaky at the exact moment it got *better*: closing the reviewer's blocker
meant putting the two subjects on **different objects**, and the order of two things is only ever a
question once there are two.

The mechanism, read from source rather than guessed (the guess was "ULIDs are random", which would
have sent the next reader to the wrong file):

- `AnnotationSession.createNote` mints through `newRecord` with **no seeded rng**, so the ULID's
  random suffix is `Math.random` per run. **The viewer's bake is deliberately different** —
  `buildVoynichLog` threads `seededRng(slugSeed(slug))` into `appendNew` for ADR-0014 durable
  anchors. The nondeterminism is specific to the Studio seed path.
- `notes()` → `heads()` → `projectHeads` (`spine/heads.ts:52-59`) ends in
  `.sort((x, y) => cmp(x.logicalId, y.logicalId) || cmp(x.rev, y.rev))`.

Two notes created in the same millisecond share a ULID *time* prefix, so the random suffix decides
their order. 50/50, every run.

**So the deciding fact was not "ids are random" — it was that one code path skips the seeding every
other path applies.** A rule of thumb that names the symptom would not have found that.

## Positional selection is the same bug, latent

The twin test was not flaky, because it reads a seeded, append-ordered log. But it selected its
subject with `.find(s => shapeLabel(s) === "Polygon")` — which means *whichever is first*. Reordering
the fixture would have silently retargeted a twelve-vertex assertion at the ten-vertex polygon: a
false red waiting for an unrelated edit.

And the first fix for it was **still positional, one level down** — `fixtureArray[0]` instead of
"first in the log". It was caught only by a probe that tested the claim rather than the code:
*reverse the array, entries intact, pairing unchanged; a suite hardened on identity must stay green.*

The first version of **that probe** was also wrong: it swapped the two entries' `objectId`s, which
changes the object→points pairing — a real data change, so its red was correct and proved nothing
about ordering. `[[post-review-fixes-are-unreviewed]]` already says *check the injection did what you
think*; this is the third instance in one day where that step was the load-bearing one.

## How to apply

- **For any assertion whose expected value depends on order, run it 20 times before believing it.**
  Not once. It costs seconds. The suspects: order-sensitive `toEqual` over a derived array, `.find`
  / `[0]` / "the first matching", anything sorted by a generated id, anything reading a Map or object
  key order, geometry after a layout settle.
- **Key on identity, never on position.** Look the expected entry up by the thing that identifies it
  (`objectId`, slug, name), on **both** sides. Zero index references is a checkable property.
- **Sorting both sides is a fix, not a weakening — if you sort by content.** Every byte is still
  compared, so it still answers *which*, not merely *how many*. Reducing to a count or a
  set-membership check WOULD be a weakening, and is the tempting wrong move.
- **A reviewer's brief should ask for both questions.** "Inject a defect per new assertion" and "run
  each new assertion N times unchanged" are two lines, and only one of them was in the brief that
  found the blocker.
- **When you report a tally, report the denominator.** `30/30` is evidence; "passes" is not.
