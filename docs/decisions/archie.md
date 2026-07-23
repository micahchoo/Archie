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
| Q-8 | Published pages emit og-tags/JSON-LD/sitemap.xml, extending self-describing artifact | 2026-06-20 | - | Phase A reach work: static-pages.ts pageShell() also injects OpenGraph + Twitter meta, schema.org JSON-LD (CreativeWork/ImageObject), canonical link, and upgrad |
| Q-9 | In-browser tiling is gated on a bundle-budget + OffscreenCanvas-DZI feasibility go/no-go spike | 2026-06-20 | - | BLOCKER 4 / axis 17. Before building the OffscreenCanvas DZI slicer, a [SPIKE] must (a) measure the real published viewer bundle vs the 240KB budget (axis 16, c |
| Q-10 | Tiling gate is about WEB in-browser generation only, not tiling-as-a-feature (reframes Q-9) | 2026-06-20 | - | Grilled 2026-06-20. Desktop Tauri target (digital.compost.archie) can generate tiles natively via Rust vips, and external IIIF already serves tiles — all fill |
| Q-11 | Tiling gate = GO: build web OffscreenCanvas DZI slicer, capped off the load-time island | 2026-06-21 | - | Task 6 gate (2026-06-20), from spike docs/spikes/2026-06-tiling-feasibility.md. Measured: ExhibitView island 282.4KB gz (OSD+Annotorious, already ~42KB over the |
| Q-12 | Desktop GitHub session token persists in the OS keyring (supersedes token-not-stored for desktop only) | 2026-07-05 | - | Ratified by user in PRFAQ.md interview 2026-07-05 (auth = device-flow + PAT fallback; FAQ 'Where does my token live?'). The original token-not-stored decision (Publish.svelte:5, ghpages.ts:61-62) targeted plaintext pasted PATs; an OS keyring (keyring crate via #[tauri::command]) is a categorically different posture, same as gh/VS Code. Web posture unchanged: nothing persisted. Plaintext-on-disk storage remains a kill (PRFAQ kill criteria). Flagged as THE decision to ratify by docs/plans/GHPAGES-PUBLISH-UX.md §Constraints. |
| Q-13 | Desktop deploy upload = single-pack git push (git2 in src-tauri); per-blob REST survives only as the legacy browser-PAT path | 2026-07-05 | - | Probe evidence ledgers/PROBE-publish-to-web.md: per-blob REST 403s on GitHub secondary rate limits (~500 blobs, 11s at 20-way; limit ~180 content-POSTs/min) — structurally wrong for DZI-tiled trees; single pack push took 554 files live in 0.6 min. ghpages.ts publishToGitHub (BLOB_CONCURRENCY=6) is NOT extended or hardened further (PRFAQ 'Decided against'); it remains solely for the browser Advanced-PAT form where git push is impossible, with honest size-limit copy. |
| Q-14 | Drive harness acts through the UI, observes through the seam | 2026-07-22 | - | Plan docs/superpowers/plans/2026-07-22-drive-harness.md. Agent drive harness (scripts/drive.mjs + scripts/lib/verbs.mjs + dev-only window.__archie): verbs ACT only via Playwright on real studio UI selectors; the seam is OBSERVE-ONLY, a thin JSON projection over authoritative runes state (extends Q-5). No eval escape-hatch verb — agents extend verbs.mjs in-repo. Harness is browser-based, not a Node CLI (bound-fetch-defaults: Node-green != browser-works). |
<!-- DECISIONS_INDEX_END -->
