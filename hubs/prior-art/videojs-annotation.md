---
updated: 2026-07-28
---
# videojs-annotation (`BIIIF/videojs-annotation`)
> *Is there a real, reusable Media-Fragment ↔ WADM codec anywhere in the corpus?*

Verified 2026-07-28 against `BIIIF/videojs-annotation/` on disk (survey:
`docs/research/prior-art/04-multimedia-av.md`). The `_FRAMING.md`/00-INDEX "Top gold" list calls this
"the only working AV↔WADM round-trip in the corpus" — confirmed, and it is the strongest single
donor found anywhere for Archie's AV-annotation gap.

## Verified claims (line-cited)
- `src/js/lib/w3c.js:15-33` `parseMediaFragment` — parses a Media Fragments URI
  (`t=10,15&xywh=percent:23.47,9.88,37.36,34.32`) into `{start,end,x,y,w,h}`, handling the `t=`
  time-range and `xywh=percent:` spatial forms independently.
- `:36-49` `buildMediaFragment` — the inverse: builds the same URI form from an internal
  `{start,end}` range + `{x1,y1,x2,y2}` shape, computing `xywh=percent:` from corner coordinates.
- Both functions are dependency-free (plain string/number ops) — genuinely PURE, confirming the
  survey's extractability claim.

## Stated absences
- No WADM `TextualBody`/`supplementing` wiring in this file — it round-trips the **fragment string**
  only; converting that into a WADM annotation body is still Archie's own work (matches the survey's
  Gap D framing).

## What citations of it may NOT support
- This is a fragment-string codec, not a transcript/caption pipeline. Don't cite it for ASR, WebVTT,
  or `<track>` support — the survey's own gap analysis already names `papadam/transcribe/worker.py`
  as the one real transcript pipeline in the corpus, and that is unverified here (survey-grade only).
