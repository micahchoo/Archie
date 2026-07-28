---
updated: 2026-07-28
---
# cozy-iiif
> *Does cozy-iiif give a real, lift-able static/dynamic image classifier and Collection/Manifest/TOC walk?*

Verified 2026-07-28 against `IIIF/cozy-iiif/` on disk (survey: `docs/research/prior-art/01-deep-zoom-viewer.md`,
`05-multi-object-collections.md`).

## Verified claims (line-cited)
- `src/core/canvas.ts:54` `toCozyImageResource` — reads `service` off the resource, classifies via
  `parseImageService`/`isImageService` before deciding static vs dynamic vs level-0. Confirms the
  survey's "single-image-vs-tiled switch" claim exactly at the cited line.
- `src/Cozy.ts:155-260` `parseCollectionResource` — builds a `Traverse` model over a Presentation-3
  `Collection`, pushing every reachable manifest into a flat `items` array
  (`modelBuilder.traverseCollection`); converts P2→P3 first when `majorVersion === 2`.
- `src/core/manifest.ts:3-121` `getTableOfContents` — a genuinely recursive tree builder
  (`buildTree`) that distinguishes `Range` children (recurse) from `Canvas` children (leaf TOC node).

## Stated absences
- None recorded from this pass — every cited claim confirmed as written.

## What citations of it may NOT support
- The survey rates cozy-iiif's collection/manifest logic "PURE" — that held for the ranges shown
  here (no DOM, no framework import in the read ranges), but this pass did not audit the whole file
  for a stray framework dependency; re-check before treating the entire module as lift-verbatim.
