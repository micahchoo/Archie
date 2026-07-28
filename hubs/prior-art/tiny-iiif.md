---
updated: 2026-07-28
---
# tiny-iiif
> *Does tiny-iiif ship a real, in-browser-portable Presentation-3 manifest builder?*

Verified 2026-07-28 against `IIIF/tiny-iiif/` on disk (survey:
`docs/research/prior-art/09-web-publishable-serverless.md`).

## Verified claims (line-cited)
- `tiny/src/pages/api/_ops/_templates.ts:5-14` `MANIFEST_TEMPLATE` — builds a Presentation-3
  `Manifest` object literal (`@context`, `id`, `type`, `label`, empty `items`) from plain args, no
  server framework in the function body itself.
- `:17-48` `IMAGE_ITEM_TEMPLATE` — builds a full `Canvas` → `AnnotationPage` → `Annotation`
  (motivation `painting`) → `Image` body with an `ImageService3` reference, entirely as object
  literals. Confirms the survey's "Presentation-3 builders (PURE)" claim.

## Stated absences
- None recorded — this pass did not check whether the surrounding file (outside the cited lines) has
  a Next.js/Node dependency that would block a straight in-browser lift; the two template functions
  themselves are dependency-free.

## What citations of it may NOT support
- These are **manifest-shape templates only** — no zip/publish/serverless-hosting logic is in this
  file. Don't cite `_templates.ts` for the "client-side folder→static-IIIF generation" gap (Spine A)
  — that gap is still open per the survey; these templates are one ingredient, not the pipeline.
