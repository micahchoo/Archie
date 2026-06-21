# Decisions — scope: archie-ux

Stable Q-N IDs for constrained decisions in this scope. Plans cite these IDs
in their §9 Q-Reference Summary. Records cohabit with mulch `mx-*` IDs in
`.mulch/expertise/decisions.jsonl` — same record, two IDs, two routes:
mulch ID for qmd retrieval, Q-N for human citation.

See `docs/methodology-dual-use.md` §2 for design rationale.

<!-- DECISIONS_INDEX_START -->
| ID | Title | Recorded | Supersedes | Constraint summary |
|----|-------|----------|------------|--------------------|
| Q-1 | Exhibit overview-as-canvas (invention #1) | 2026-05-26 | - | Opening a multi-object or narrative exhibit lands on an OVERVIEW scale: its Objects as plates on a pannable/zoomable dark tableau in reading order — the 1a 's |
| Q-2 | Readings: membership exclusivity (Q5) split from display exclusivity — Studio rail composes, Viewer stays exclusive in v1 | 2026-06-11 | - | P-2 grilled+user-gated 2026-06-11 (docs/decisions/PROPOSALS.md). Q5 membership untouched (one Note -> one Reading, IIIF AnnotationPage model). Display is surfac |
| Q-3 | Within-exhibit search is a client-side static minisearch index, no server | 2026-06-20 | - | Axis 11. Search + tag-filter over note bodies/tags is built into the published Viewer as a client-side minisearch index (consistent with backend-less architectu |
| Q-4 | Within-exhibit discovery is a mode-independent finder overlay, not a list filter | 2026-06-20 | - | Grilled 2026-06-20. Search+tags = one overlay at ExhibitView level (works in grid AND narrative; narrative has no note list). Scope: ALL readings — selecting  |
| Q-5 | Keyboard surface for regions is the linear index, not the canvas markers | 2026-06-20 | - | Grilled 2026-06-20. Each note exists twice (SVG marker + index entry). The INDEX is the focusable/keyboard-operable surface: note cards (grid) or section spine  |
<!-- DECISIONS_INDEX_END -->
