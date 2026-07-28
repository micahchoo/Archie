---
updated: 2026-07-27
---
# juncture
> *Is Juncture actually Vue (correcting an ADR-0002 misread), and what does its scroll-sync / prose-link code establish?*

Juncture ("an easy-to-use framework for building interactive visual essays and websites") was
mis-remembered in an earlier pass as evidence favoring React-friendly islands. ADR-0002 records the
correction without a line citation (`docs/adr/0002-rendering-and-framework.md:14`); this page supplies
it. Promoted from the
`_INDEX.md` Skipped list 2026-07-27 — source: local clone.

## Verified claims (line-cited)

- **Juncture is Vue, not React — the ADR-0002 correction, now line-cited** (verified 2026-07-27,
  source: local clone). Every interactive component under `components/` is a `.vue` Single-File
  Component using Vue template syntax: `components/VisualEssay.vue:5` (`<div id="essay-component"
  ref="essay" v-html="processedHtml">`), `components/Image.vue` (same `<template>`/`<script>` SFC
  shape). A search for React equivalents across the whole clone —
  `find . -iname "*.jsx" -o -iname "*.tsx"` — returns **zero** files. This closes the gap ADR-0002
  left open: Juncture's logic is Vue-coupled where it touches the DOM, PURE where it doesn't, and
  supplies no argument either way for a React island.
- **`scrollTop` watcher drives an `active` segment, not the canvas** (verified 2026-07-27, source:
  local clone) — `components/VisualEssay.vue:232-245`: a Vue `watch` handler on a `scrollTop` prop
  walks `target.querySelectorAll('.segment')`, breaking at the first segment whose
  `offsetTop + clientHeight - 200` is at or past the scroll position (`:236-238`), then sets
  `this.active` to that segment's `data-id` (`:241`) if it changed. COUPLED(Vue). This is scroll-spy
  for **prose self-highlight only** — it never touches a canvas/viewer, confirming the survey's
  framing that Juncture supplies the scroll-spy *mechanism* but not the narrative→canvas half of the
  two-directions problem.
- **`zoomto` prose directive resolves annotation/page/region and pans the viewer** (verified
  2026-07-27, source: local clone) — `components/Image.vue:586,593-624` `handleEssayAction`'s `'zoomto'`
  case: if the referenced value resolves to a known annotation, calls `this.gotoAnnotation(anno)`
  (`:595`); otherwise it's treated as a region string and dispatches on shape — `next`/`previous` page
  nav (`:598-608`), a bare page ref (`:611-615`), or a `ref|region` pair that sets the page **and**
  stores `zoomtoRegion` for a deferred `gotoRegion` once the page loads (`:618-624`). COUPLED(Vue +
  OpenSeadragon/Annotorious — confirmed at `:61,68,71-73`: `OpenSeadragon`/`@recogito/annotorious-
  openseadragon` loaded from CDN). This is a real prose-link → pan/zoom implementation, the same job
  as Archie's `anvil://region/<hash>:<xywh>` resolution.

## Stated absences

- No CSS/lightbox chrome-placement claim is recorded here — the survey docs cite Juncture only for
  i18n build-step behavior, scroll-spy, and the `zoomto` directive; no chrome-docking claim was found
  to verify or correct.

## What citations of it may NOT support

- Don't cite Juncture's `scrollTop` watcher as a narrative→canvas scroll-spy — it only ever sets a
  Vue `active` state for prose self-highlighting; nothing in `VisualEssay.vue` calls into `Image.vue`
  or a viewer instance. Compose it with `zoomto`'s pan/zoom call if citing "Juncture solves scroll-spy
  + canvas pan," since no single Juncture code path does both.
- Don't cite Juncture as a Vue-vs-Svelte framework argument beyond the "it's Vue, not React" fact
  itself — its logic is COUPLED to Vue's reactivity (`watch`, `this.$emit`) at the DOM edges, same as
  any framework-donor in this corpus; see [[annomea]] and [[anvil]] for the Svelte-native donors that
  were actually adopted.
