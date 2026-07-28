---
updated: 2026-07-27
---
# annomea
> *Does annomea dock its canvas chrome, propose a mutation gate, and what does its Svelte convention look like?*

Adopted read-side donor (narrative pane + popup/drawer, `docs/adr/0002-rendering-and-framework.md:14`). Sources:
`ledgers/PRIORART-chrome-placement-2026-07-26.md`, `.claude/rules/prior-art-citation-discipline.md`,
`ledgers/MAP-READINESS-studio-ux-overhaul-2026-07-20.md`, `docs/adr/0021-archie-viewer-target-contract.md`.

## Verified claims (line-cited)
- **No docked mode exists at all** — every persistent chrome surface is `fixed`/`absolute` at
  z 400–600, mounted straight to `document.body`: `NarrativePane.svelte:254-265`,
  `Sidebar.svelte:103-115`, `IndexFlyout.svelte:76-82,118-131`.
- **Confirmed by absence, not just presence**: a grep for `margin-left`/`padding-left` across all of
  `src/` returns exactly **one** hit (a 4px label gap) — the canvas is full-bleed under the 420px pane.
- `defaultLayout()` (`layout.ts:20-23`) is **dead code** — called from nowhere; both real mount sites
  inline `?? 'half'` directly (`runtime.ts:221`, `main.ts:139`). Cite the mount sites, not the function.
- 22 `.svelte` files, 17 camelCase `onX` prop declarations vs 11 lowercase, on svelte ^5.55.5 (measured
  against Archie's 5.55.9) — donor-side evidence in the still-open prop-naming-convention question.
- `EMBED-AUDIT.md` — annomea shipped an inconsistent embed element name + attribute set once pasted
  into real pages (cited by ADR-0021 as the reason Archie's viewer target contract was frozen early).
- **WADM data-model spine, the survey's "gold" source** (verified 2026-07-27, source: local clone) —
  `src/data/wadm.ts:6-13` `createAnnotationPage(label?, creator?)` emits `@context:
  'http://www.w3.org/ns/anno.jsonld'`, `creator: { type: 'Person', name }` (`:12`), `created: new
  Date().toISOString()` (`:13`); `:19-23` `fragmentSelector(x,y,w,h)` builds `conformsTo:
  media-frags` + rounded `xywh=`; `:55-57` `annotationUrn(hash, index)` returns
  `` `urn:anvil:annotation:${hash}:${index}` ``. All PURE functions, no annomea-specific coupling —
  matches the survey's "LIFT verbatim" claim (`docs/research/prior-art/03-annotation-data-model.md:72`).
- **`makeSanitizer` closure pattern, no global DOMPurify state** (verified 2026-07-27, source: local
  clone) — `src/viewer/sanitize.ts:66-67` `makeSanitizer(config)` returns a closure that always pipes
  through `stripDangerousDataUris` (`:59-61`, a regex replace on `data:text/html`) after
  `DOMPurify.sanitize`. Confirmed PURE — the config is captured per call, never mutates a shared
  DOMPurify instance.
- **`modified` is declared, never written — a real provenance gap, not a stated feature** (verified
  2026-07-27, source: local clone) — `src/shared/types.ts:12` declares `modified?: string` on
  `WadmAnnotationPage`; `grep -rn "\.modified\b|modified:" src/` across the whole package returns
  **zero** call sites that set it. Load-bearing for the ADR-0026 framing that no corpus repo ships
  persisted per-annotation edit history.

## Stated absences
- "annomea proposes this gate" is **false** — it proposes no gate ([[prior-art-citation-discipline]]).

## What citations of it may NOT support
- Don't cite annomea for chrome-reservation math (`leftInsetW`-style insets) — it has none; its
  overlay panels never compensate the canvas at all, which is the opposite pattern from anvil's
  `fitForSidebar` (see [[anvil]]).
