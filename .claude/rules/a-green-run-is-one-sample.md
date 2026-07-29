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

**Measured 2026-07-26.** A test that failed **9 times in 20** against a correct tree reached `main`
through an unusually thorough process: author ran it green; an adversarial reviewer attacked it with
17 injections (15 red) and hunted vacuity patterns; the lead ran the merged suite twice, green; CI's
first run on it was red. Four people, four runs, **four single samples of a coin flip — nobody ran
it twice.**

| question | answered by | why that suffices |
| --- | --- | --- |
| *can this fail when something is wrong?* | one injection, **one red run** | one failure proves the capability |
| *does this pass when nothing is wrong?* | **N runs, unchanged tree** | one green is consistent with "always" *and* with "half the time" |

A red-green campaign is aimed entirely at the first question and structurally cannot notice a false
red — every run it cares about is *supposed* to fail. The second question needs only repetition, and
it is the one that never gets asked. The two failures also cost differently: a false green hides a
defect; a false red trains everyone to re-run until it passes, which is the habit that makes the
*next* real failure invisible. (This is the false-RED mirror of
[[post-review-fixes-are-unreviewed]] — there, no sample was taken; here, one was mistaken for many.)

## The tell: an expected value whose ORDER is derived rather than literal

The assertion was `toEqual` on a derived array — order-sensitive, and it became flaky at the exact
moment it got *better* (the fix put the two subjects on different objects; order is only a question
once there are two). The mechanism, read from source rather than guessed: `projectHeads`
(`spine/heads.ts:52-59`) sorts by `logicalId`; Studio's `createNote` mints ULIDs with **no seeded
rng**, while the viewer's bake deliberately threads `seededRng` for ADR-0014 durable anchors. Two
notes in the same millisecond share a time prefix, so the random suffix decides — 50/50 per run.
**The deciding fact was not "ids are random" — it was that one code path skips the seeding every
other path applies.** A rule of thumb naming the symptom would not have found that.

**Positional selection is the same bug, latent.** The twin test selected its subject with
`.find(s => shapeLabel(s) === "Polygon")` — *whichever is first* — and the first fix was still
positional one level down (`fixtureArray[0]`). It was caught by a probe that tested the *claim*:
reverse the array, entries intact — a suite hardened on identity must stay green. (The probe's first
version swapped `objectId`s — a real data change whose red proved nothing; check the injection did
what you think, per [[post-review-fixes-are-unreviewed]].)

## How to apply

- **Any assertion whose expected value depends on order: run it 20 times before believing it.** The
  suspects: order-sensitive `toEqual` over a derived array, `.find`/`[0]`/"first matching", anything
  sorted by a generated id, Map/object key order, geometry after a layout settle.
- **Key on identity, never on position** — look the expected entry up by what identifies it
  (`objectId`, slug, name), on **both** sides. Zero index references is a checkable property.
- **Sorting both sides by content is a fix, not a weakening** — every byte is still compared.
  Reducing to a count or set-membership WOULD be a weakening, and is the tempting wrong move.
- **A reviewer's brief should ask both questions** — "inject a defect per new assertion" and "run
  each new assertion N times unchanged" are two lines.
- **Report the denominator.** `30/30` is evidence; "passes" is not.
