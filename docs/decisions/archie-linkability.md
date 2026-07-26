# Decisions — scope: archie-linkability

Stable Q-N IDs for constrained decisions in this scope. Plans cite these IDs
in their §9 Q-Reference Summary. Records cohabit with mulch `mx-*` IDs in
`.mulch/expertise/decisions.jsonl` — same record, two IDs, two routes:
mulch ID for foxhound retrieval, Q-N for human citation.

See `docs/methodology-dual-use.md` §2 for design rationale.

<!-- DECISIONS_INDEX_START -->
| ID | Title | Recorded | Supersedes | Constraint summary |
|----|-------|----------|------------|--------------------|
| Q-1 | Intra-Library link refs: archie: in body, resolved on heads projection, raw in history | 2026-05-25 | - | The in-body link ref is an archie: URI encoding a LinkTarget (one source of truth = the markdown body, per ADR-0003 log->projection). It is rewritten to a real  |
| Q-2 | Published artifact is self-describing: static per-exhibit HTML with per-note anchors (durable refs) | 2026-06-11 | - | P-1 grilled+user-gated 2026-06-11 (docs/decisions/PROPOSALS.md). publishLibrary emits index.html (library) + {slug}/index.html (full heads projection, all readi |
| Q-3 | A self-contained export ships `<archie-viewer>`, never the Astro viewer app | 2026-07-26 | - | **OPEN — user-gated 2026-07-26 to REVISIT, against the author's recommendation.** What ships today is the embed, because apps/viewer's `[slug].astro` bakes its routes at build time from `public/published/exhibits.json` and so cannot travel with an arbitrary library. The user's direction is to make the Astro viewer exportable rather than accept that; the blocker to remove is build-time route baking (a runtime route source), and the cost to weigh is a SECOND reader on the export path. Sized in **Archie-babe**; not scheduled. Until it lands, the embed remains the export vehicle and the deposit copy is unaffected. |
<!-- DECISIONS_INDEX_END -->
