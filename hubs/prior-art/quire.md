---
updated: 2026-07-27
---
# quire
> *Does quire solve the scroll two-directions problem, or demonstrate the hazard — and does it dock chrome?*

Source: `ledgers/PRIORART-chrome-placement-2026-07-26.md`, `.claude/rules/prior-art-citation-discipline.md`,
`ledgers/HANDOFF-viewer-ux-2026-07-26.md`.

## Verified claims (line-cited)
- Deep-zoom surface is a `<canvas-panel>` web component emitted as a flow sibling in a static page:
  image / caption / annotations-UI as sequential `html` template siblings
  (`_includes/components/figure/image/html.js:44-48`); the annotations UI is a plain
  `<fieldset>` of radio/checkbox inputs with no positioning or z-index anywhere
  (`_includes/components/figure/annotations-ui/index.js:27-34`).
- **`canvas-panel.js:259`** calls `goToFigureState` **and** `scrollToHash` directly from an
  IntersectionObserver callback **with no suppression at all** — verified independently twice.
- `intersection-observer-factory.js` — the observer shape Archie ported: root = the scrolling column,
  `rootMargin: '-50% 0% -50% 0%'`, `threshold: 0`, act on `isIntersecting`.

## Stated absences
- Quire's lightbox UI placement is **unverifiable from this checkout** — the deciding stylesheet
  (`content/_assets/styles/components/q-lightbox.scss`) does not exist anywhere in the corpus clone;
  `find . -name "*.scss"` across the whole quire tree returns nothing. Don't cite quire for lightbox
  chrome placement without opening a quire starter/theme repo first.

## What citations of it may NOT support
- **"quire solves the two-directions problem" is false — inverted.** `canvas-panel.js:259` is the
  hazard demonstrated, not the fix. Quire is a donor for the IntersectionObserver *shape* only, never
  for reentrancy/suppression.
- "canvas-panel paints no chrome over the image at all" is true but evidentially empty — it has ~one
  `<button>` total. It abstains from the docking question; it does not vote for docking.
