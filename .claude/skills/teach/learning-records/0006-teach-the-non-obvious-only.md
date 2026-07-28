# Onboarding teaches the non-obvious, not the discoverable

User feedback 2026-06-20 on Step 1's "Two ways an exhibit can open": "this is not something a
user needs to know — distinguish what is easily discoverable vs what would take multiple steps
to learn."

The filter for every piece of onboarding content:
- **Easily discoverable** (self-evident in the UI, found by clicking around, or learned the
  moment you do the obvious thing) → DON'T spend onboarding on it. Let the app teach it.
- **Non-obvious / multi-step to learn** (you'd never find it, or it takes experimentation, or
  getting it wrong costs you) → THIS is what onboarding is for.

Applied: removed the grid⇄narrative section from Step 1 — a user discovers it the moment they
add a Section, and at Step 1 they have none. The flip model + screenshots are preserved in
`assets/` for the Sections step, where the *emergent layout* point is earned (and even there it's
a footnote, since it's semi-discoverable).

Implication — this re-scopes the whole spine (see [[NOTES.md]]). The old plan was feature-by-
feature (overview canvas, draw-a-note, reorder…), much of which is discoverable. The re-scoped
spine leads with the genuinely non-obvious: the mental model, the four import onramps, where your
work lives / how not to lose it, Readings-vs-Tags, and publishing. "How to drag a box on an
image" is discoverable — cut. Pairs with [[0005-two-readers-and-text-judo]] (Advanced still
carries the scholar-depth that's non-obvious to that reader).
