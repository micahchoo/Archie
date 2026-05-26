# Evolution — Archie

**Synthesis** | **Confidence: MEDIUM** | **Source: codebase-analytics.sh, HANDOFF.md history, ADR timeline**

## Current State

- **Phase:** Late Phase 2 (adopted-tier tool works end-to-end, dogfooded on real fixtures)
- **Test count:** 245 green (core 209 / mount 18 / svelte 18)
- **VCS:** Pre-initial-commit (278 untracked files)
- **Era:** Modern throughout — no legacy stratum detected

## Stratigraphy

### Single Era (Modern, 2024–2025)

All code is contemporary. No faults, no partial migrations, no diagenetic code.

| Marker | Evidence |
|--------|----------|
| Svelte 5 runes | `$state`, `$effect`, `$derived` (not Svelte 4 stores) |
| ES modules | `import`/`export` throughout (no `require()`) |
| const/let | No `var` detected |
| TypeScript 5.6 | Strict mode, branded types |
| async/await | No callback-era patterns |
| Vitest 2.1 | Modern test framework |

### Why Single-Era

The project started from a rigorous design phase (CONTEXT.md 2026-05-24 grill session) with explicit architectural decisions (4 ADRs) before any code was written. The implementation followed the IMPLEMENTATION-STRATEGY.md phase-by-phase. No legacy code was inherited — donor code from anvil/annomea was adopted and laundered, not cargo-culted.

## Decision Timeline

| Date | Decision | Artifact |
|------|----------|----------|
| 2026-05-24 | Object ownership = exhibit-nested | ADR-0001 |
| 2026-05-24 | 3-layer render + Svelte everywhere | ADR-0002 |
| 2026-05-24 | Annotation spine (append-only log + version DAG) | ADR-0003 |
| 2026-05-24 | No wasm-vips tiling | ADR-0004 |
| 2026-05-24 | Full UX grill (Q1–Q7, Gallery, deep-link, layout) | CONTEXT.md |
| 2026-05-25 | ADR-0003 amendment: `rev` distinct from citation IRI | ADR-0003 |
| 2026-05-25 | Phase 0 complete (data model spine, 96 tests) | HANDOFF.md |
| 2026-05-25 | Phase 1 complete (extraction, 117 tests) | HANDOFF.md |
| 2026-05-25 | Phase 2 in progress (adopted-tier tool, 245 tests) | HANDOFF.md |
| 2026-05-25 | ⌘K intra-Library linking shipped | HANDOFF.md |
| 2026-05-25 | Narrative layout shipped (v1 layout set complete) | HANDOFF.md |

## Architectural Drift

**None detected.** The implementation has followed the architectural through-line (source/projection pattern) with high fidelity. No decision has been reversed. The only amendment (ADR-0003 `rev`) was additive, not corrective.

## Churn Hotspots

**None** — no commits yet. This section will become meaningful after the initial commit and subsequent development.

## Growth Trajectory

| Phase | Status | Risk |
|-------|--------|------|
| Phase 2 (adopted) | ~90% complete | Low — adopted patterns from anvil/annomea |
| Phase 3 (inventions) | Not started | Medium — 6 gated inventions, each needs user validation |
| Post-v1 (AV, search, embed) | Deferred | Low — explicitly cut from v1 |

## Deadwood

- **Temp console.debug logs:** mount.ts has diagnostic logs from draw bug investigation — remove once draw confirmed working (user confirmed, logs removable)
- **Sample data:** `sample-data.ts` in both apps — dev fixtures, not dead code (used in dev mode)
- **Legacy annotation path:** `{PROJECT}/annotations/` for slug "sample" — migration backward-compat, remove after confirming no OPFS state depends on it

## Era Compatibility

All code is the same era (Modern). No fault lines exist. The first era boundary will be:
- **v1.1:** svgpath module (ellipse/freehand shapes) — new security boundary
- **v1.1:** OffscreenCanvas DZI slicer — new rendering path
- **v1.2:** AI-authoring, embedding/oEmbed — new subsystem
