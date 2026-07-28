---
updated: 2026-07-27
---
# prior-art index
> *Which corpus library was already checked for a given claim, and what did checking it actually find?*

Every page here transcribes citations already **verified** (or killed) elsewhere in this repo — no
library source was re-read to mine new claims. See [[prior-art-citation-discipline]] for the full
discipline; three habits from it, condensed:

1. **Open the file before you cite it, and cite to the line** — a citation with no line number is not
   falsifiable by the next reader.
2. **Grep where a thing is USED, not only where it's defined** — a default parameter that's always
   overridden (tropy `container.js:11`) reads backwards if you stop at the definition.
3. **A correction handed to you in your favour is the one you're least likely to check** — open the
   file anyway.

## Pages

| library | verdict headline |
| --- | --- |
| [[tropy]] | ships overlay toolbars ON by default — cited backwards in ADR-0019, corrected |
| [[clover-iiif]] | has a note-media analog (`Item.tsx`/`Image.tsx`); one ADR citation of its sibling structure was wrong |
| [[universalviewer]] | docks by CSS grid + JS remainder-math ≥768px; its test suite never touches the network |
| [[mirador]] | split verdict — structural panels dock, the canvas's own control bar overlays |
| [[annomea]] | no docked mode at all, full-bleed overlay chrome; proposes no mutation gate |
| [[quire]] | demonstrates the scroll two-directions hazard rather than solving it (inverted citation) |
| [[anvil]] | chrome-reservation math coheres with its floating sidebar; donor for Studio's editor shell |
| [[scrollama]] | supports the IntersectionObserver *choice* only — no reentrancy guard, no donor for the guard itself |

## Skipped (citations exist but too thin to promote to a page)

- **Juncture** — ADR-0002 corrects an earlier misread ("Juncture is Vue, not React, therefore neutral
  on the framework question") but carries no `file:line`. Worth a page once someone opens the file.
- **liiive** — ADR-0002 credits it as "the lone React donor, contributes only a PURE CSS one-liner" —
  no line cited. Same gap as Juncture.
- **canvas-panel (the standalone IIIF/canvas-panel project, distinct from quire's own component of the
  same name)** — only referenced in `docs/research/prior-art/` survey files (survey-grade, not
  repo-verified) and in `_GAP-ANSWERS.md` ("rect-only region API, partial"). Not promoted; the
  verified `<canvas-panel>` citations that exist all trace to quire's own wrapper — see [[quire]].
- Everything else named only in `docs/research/prior-art/*.md` (cozy-iiif, field-studio, tiny-iiif,
  papadam, exhibit.so, storiiies, canopy, …) — survey-grade only, never independently re-verified in
  this repo. Promote on the day a specific claim from one of them gets opened and confirmed.
