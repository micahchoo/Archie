---
updated: 2026-07-27
---
# anvil
> *Does anvil's chrome-reservation math cohere with its layout, and what does it establish as donor?*

Adopted donor of Studio's editor shell + AnnotationForm (`apps/studio/package.json:6`). Sources:
`ledgers/REVIEW-canvas-chrome-dock-2026-07-26.md`, `ledgers/HANDOFF-viewer-ux-2026-07-26.md`,
`ledgers/MAP-READINESS-studio-ux-overhaul-2026-07-20.md`, `docs/adr/0011-gesture-initiated-creation.md`,
`.claude/rules/prior-art-citation-discipline.md`.

## Verified claims (line-cited)
- `EmbeddedReader.svelte:314-337` `fitForSidebar` — the 0.85 `Math.min` (`:332`) and `w/(1-f)` (`:335`)
  chrome-reservation math — **coheres with** `Sidebar.svelte:168` being `position: fixed`: anvil
  reserves canvas space *because* its chrome floats, not despite it.
- 28 `.svelte` files, 26 camelCase `onX` props vs 1 lowercase (measured). Ancestor
  `editor/AnnotationForm.svelte` is 632 lines, ~35 flat props, no snippet/slot API at all.
- `read/Sidebar.svelte` + `editor/Sidebar.svelte` persist **width only**, one flat global key,
  **no collapse at all** — the corpus is silent on persisting a *hidden* panel.
- ADR-0011: anvil's sticky modal toolbar (pick a tool, canvas stays in that mode until reselected) is
  the adopted pattern behind Archie's `mode`/`tool` rune pair — cited with its standing cost named
  (mode amnesia), not as a free lift.
- **`immediateRender: true`** (verified 2026-07-27, source: local clone) — `app/src/lib/viewer.ts:91`,
  one flag in the OSD constructor options object alongside `showNavigator: false` (`:90`) and
  `maxZoomPixelRatio: 16` (`:93`). PURE OSD config, no anvil-specific wrapping — the cheapest
  perceived-load win the survey found in the corpus (`docs/research/prior-art/16-performance-ux.md:23`).
- **`fitBounds`-on-select wrapped in try/catch** (verified 2026-07-27, source: local clone) —
  `app/src/App.svelte:1113-1119` `selectFromList(id)`: `viewer.annotator.setSelected(id)` then
  `viewer.annotator.fitBounds(id)` inside a `try`; the `catch` at `:1116-1118` swallows a throw with
  `console.debug` and the comment "fitBounds can throw if the annotation has no resolvable geometry;
  ignore — selection still works." This is the exact root-cause fix annomea's read-side audit found
  missing (selection-without-pan) — see [[annomea]].
- **IIIF Content State encode/decode, base64url** (verified 2026-07-27, source: local clone) —
  `app/src/lib/share-url.ts:35-56` `encodeContentState(annotationUrn, canvasId, selector)` builds a
  `motivation: 'highlighting'` Annotation object, `JSON.stringify`s it, then base64url-encodes
  (`btoa` + `/+//g→'-'`, `/\//g→'_'`, trailing `=` stripped); `:62-81` `decodeContentState` reverses it
  and returns `null` (not a throw) on any malformed input. Zero framework coupling — `btoa`/`atob`
  only. Confirmed as the only cross-tool-standards addressing scheme in this donor.

## Stated absences
- None recorded beyond the corrected claim below.

## What citations of it may NOT support
- "anvil ships no embed smoke" is **false** — it does ([[prior-art-citation-discipline]]; no further
  line-level detail was recorded when this was corrected — re-verify before citing specifics).
