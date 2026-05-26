# Decisions — scope: archie

Stable Q-N IDs for constrained decisions in this scope. Plans cite these IDs
in their §9 Q-Reference Summary. Records cohabit with mulch `mx-*` IDs in
`.mulch/expertise/decisions.jsonl` — same record, two IDs, two routes:
mulch ID for foxhound retrieval, Q-N for human citation.

See `docs/methodology-dual-use.md` §2 for design rationale.

<!-- DECISIONS_INDEX_START -->
| ID | Title | Recorded | Supersedes | Constraint summary |
|----|-------|----------|------------|--------------------|
| Q-1 | Objects are exhibit-nested, not a shared pool | 2026-05-25 | - | ADR-0001. Objects + their Notes are owned by the Exhibit (self-contained, independently-portable IIIF Manifest). No Library-level shared object pool, no cross-e |
| Q-2 | Rendering = 3-layer headless core + thin adapters; Svelte everywhere | 2026-05-25 | - | ADR-0002. @render/core (pure TS) -> @render/mount (vanilla mount fns: OSD+Annotorious+Wavesurfer) -> thin per-framework adapters (<500 LOC = leak detector). Stu |
| Q-3 | Annotation spine = append-only log -> version-DAG merge -> heads/history WADM | 2026-05-25 | - | ADR-0003 (keystone). Each Note: {logicalId,version,parent,modifiedAt,lastEditor}. Append-only log (edits bump version, keep parent; deletes=tombstones; ids neve |
| Q-4 | Deep-zoom tiling does NOT use wasm-vips | 2026-05-25 | - | ADR-0004. No dzsave binding exists; binary is ~13-20MB (blows budget 50-80x). v1 = single responsive JPEG via OSD type:image (~6000-8000px) + external IIIF info |
| Q-5 | Source-before-projection through-line (define authoritative source, project thin) | 2026-05-25 | - | CONTEXT.md through-line. Every boundary = authoritative source-of-truth + thin derived projection/adapter. Build source first, projection second, always: log be |
| Q-6 | Concurrent-head version-id collision: log tolerates, serialization disambiguates (scheme TBD P0-4/P0-6) | 2026-05-25 | - | ADR-0003 gap found at P0-3. Two clients editing v1->v2 concurrently both produce {logicalId}/v2 -> the resolvable-path grammar collides under concurrency. RENUM |
| Q-7 | Merge resolution needs multi-parent merge nodes (parent -> parents); defer with conflict-card UI | 2026-05-25 | - | P0-4 built conflict DETECTION (classifyMerge). RESOLUTION (collapsing plural heads to one) requires a merge node with >=2 parents (git-style merge commit): a si |
<!-- DECISIONS_INDEX_END -->
