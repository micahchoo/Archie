---
updated: 2026-07-27
---
# annomea
> *Does annomea dock its canvas chrome, propose a mutation gate, and what does its Svelte convention look like?*

Adopted read-side donor (narrative pane + popup/drawer, `docs/adr/0002:14`). Sources:
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

## Stated absences
- "annomea proposes this gate" is **false** — it proposes no gate ([[prior-art-citation-discipline]]).

## What citations of it may NOT support
- Don't cite annomea for chrome-reservation math (`leftInsetW`-style insets) — it has none; its
  overlay panels never compensate the canvas at all, which is the opposite pattern from anvil's
  `fitForSidebar` (see [[anvil]]).
