# Mission: Authoring & publishing an Archie exhibit (interactive docs spine)

## Why
A future Archie user arrives with a pile of images and an intent to annotate them, and
must reach a *published, navigable, annotated exhibit* without reading source code. These
lessons are the project's documentation spine: they teach Archie's actions, affordances,
interfaces, motivations, and workflows in a skim-first way, so a newcomer understands what
the tool does and how to drive it — fast.

## Success looks like
- A newcomer can skim one lesson (~one screen) and correctly perform one real Studio action.
- A reader can trace the full zero→published author journey across the lesson sequence.
- Every claim about an affordance is grounded in the actual codebase, not invented.
- Lessons cross-link (anchors) and share one consistent visual style.
- Each lesson states the *motivation* (why this feature exists) before the *mechanics*.

## Constraints
- **Skimmable.** Each lesson is short, completable quickly, one tangible win. Tufte-clean.
- **Grounded.** Source of truth is the Archie codebase + ADRs/CONTEXT/Prior Art. No guessing.
- **Two readers, one tutorial.** A **Simple ↔ Advanced** toggle per lesson: Simple serves a
  general app user with media to annotate (plain language, minimal jargon); Advanced adds the
  GLAM-scholar depth (IIIF/WADM mapping, citation, source refs). Advanced is purely additive.
- **Show, don't tell ("text judo").** Prefer one interactive model or infographic over prose —
  reach for a paragraph only when a visual can't carry the meaning.
- **Primary learner:** the *author* using Studio, zero→published. Reader/Viewer comes later.
- **Publish leads with the no-account path** — teach the portable `.archie.zip` first; GitHub
  Pages is the optional advanced route.
- **Output location:** lessons + shared assets ship to the repo `docs/learn/` (the spine).
  Mission, learning records, resources, glossary, notes stay in the teach workspace.

## Out of scope (for now)
- Reader/Viewer-only deep dives (covered after the author journey is complete).
- Developer/contributor docs (build setup, architecture) — this spine is for *tool users*.
- Per-API reference for the codebase internals.
