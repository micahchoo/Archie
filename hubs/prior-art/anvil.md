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

## Stated absences
- None recorded beyond the corrected claim below.

## What citations of it may NOT support
- "anvil ships no embed smoke" is **false** — it does ([[prior-art-citation-discipline]]; no further
  line-level detail was recorded when this was corrected — re-verify before citing specifics).
