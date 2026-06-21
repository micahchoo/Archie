# Demos must be grounded in the real UI, not abstractions

User feedback 2026-06-20: "the narrative demo is bad, keep the demos grounded in actual ui ux."
The grid⇄narrative flipper had been a generic mock (boxes labelled "Object 1", "Section 1") —
it taught the rule but looked nothing like Archie, which reads as fake.

Resolution (see [[NOTES.md]] "Ground demos in the real UI"):
- Replaced the mock with **real screenshots** of the running Viewer (`voynich` grid-led,
  `voynich-reading` narrative-led), captured via Playwright against the prebuilt static
  `apps/viewer/dist/`. The flipper now swaps actual front-door images.
- Retheme the whole spine to Archie's **real tokens** (`apps/viewer/src/tokens.css` "Verdant
  Clearing" greens/parchment) so docs read as part of the product.
- Grounded the drill model's data in the **real demo library** (actual exhibit + folio names).

Caught a fidelity error this forced surface: the real NarrativeReader puts the **canvas left,
prose spine right** — my hand-mock had them flipped. Lesson: when a demo imitates UI, build it
from the real artifact (screenshot or verified component), never from memory. This is the
project's own "check prior art / cite it" rule applied to teaching. Supersedes the abstract-mock
approach in [[0002-interactive-models-not-quizzes]] — interactivity stays, abstraction goes.
