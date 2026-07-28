---
updated: 2026-07-28
---
# prior-art index
> *Which corpus library was already checked for a given claim, and what did checking it actually find?*

Every page here transcribes citations already **verified** (or killed) elsewhere in this repo, or —
as of the 2026-07-28 promotion pass — verified fresh against on-disk source under
`/mnt/Ghar/2TA/DevStuff/Annotators/Image/`. See [[prior-art-citation-discipline]] for the full
discipline; three habits from it, condensed:

1. **Open the file before you cite it, and cite to the line** — a citation with no line number is not
   falsifiable by the next reader.
2. **Grep where a thing is USED, not only where it's defined** — a default parameter that's always
   overridden (tropy `container.js:11`) reads backwards if you stop at the definition.
3. **A correction handed to you in your favour is the one you're least likely to check** — open the
   file anyway. (Caught live during this pass: a same-day edit claimed clover-iiif/mirador/
   universalviewer had "no local clone" — false, all three are on disk with hundreds of files; see
   each page's corrected note. Run `ls`/`find` before writing an absence claim, always.)

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
| [[juncture]] | confirmed Vue, not React (ADR-0002 correction, now line-cited); scroll-spy and `zoomto` pan/zoom are real but never composed in one code path |
| [[annotorious]] | Ellipse/Line selectors round-trip to `NaN`; curved Path commands silently misattach to the prior command — verified from BOTH serialize and parse sides |
| [[cozy-iiif]] | real static/dynamic image classifier + recursive Collection→Manifest→TOC walk, confirmed PURE in the cited ranges |
| [[field-studio]] | genuine defensive OPFS wrapper (`OPFSStorage`); its EXIF-stub claim stays survey-grade |
| [[immarkus]] | real single-flight, last-write-wins debounced FSA writer |
| [[liiive]] | real origin-tagged echo-suppression bridging Annotorious ↔ Yjs |
| [[excalidraw]] | inverse-entry undo is real, but the survey cited the wrong lines — corrected to `history.ts`/`change.ts` |
| [[videojs-annotation]] | the corpus's only working Media-Fragment ↔ WADM-adjacent codec; fragment-string only, no transcript wiring |
| [[tiny-iiif]] | real dependency-free Presentation-3 manifest/canvas templates |

## Skipped (citations exist but too thin to promote to a page)

- **canvas-panel (the standalone IIIF/canvas-panel project, distinct from quire's own component of the
  same name)** — only referenced in `docs/research/prior-art/` survey files (survey-grade, not
  repo-verified) and in `_GAP-ANSWERS.md` ("rect-only region API, partial"). Not promoted; the
  verified `<canvas-panel>` citations that exist all trace to quire's own wrapper — see [[quire]].
- Everything else named only in `docs/research/prior-art/*.md` (papadam, exhibit.so, storiiies,
  canopy, wax, decap-cms, svgpath, points-on-path, iiif-builder, marchingsquares, exifr, …) —
  survey-grade only, never independently re-verified in this repo. Promote on the day a specific
  claim from one of them gets opened and confirmed.
