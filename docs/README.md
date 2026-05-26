# Archie documentation

Index to the design and architecture docs. Start with [`../CONTEXT.md`](../CONTEXT.md) for the domain language, then the ADRs for the load-bearing decisions.

## Start here

| Doc | What it is |
|-----|------------|
| [`../CONTEXT.md`](../CONTEXT.md) | Domain language, locked frames, full glossary (Library / Exhibit / Object / Note / Layer / Section / …) |
| [`IMPLEMENTATION-STRATEGY.md`](IMPLEMENTATION-STRATEGY.md) | How the build is sequenced — phases 0–3, ordering principles, validation gates |
| [`../HANDOFF.md`](../HANDOFF.md) | The current-state through-line (what's done / in-progress / next) |

## Architecture Decision Records

Read these before reversing a decision — each records the rationale and the alternatives rejected.

| ADR | Decision |
|-----|----------|
| [0001](adr/0001-objects-are-exhibit-nested.md) | Objects are nested under exhibits, not global |
| [0002](adr/0002-rendering-and-framework.md) | Three-layer render (`@render/{core,mount,svelte}`) + Svelte/Astro |
| [0003](adr/0003-annotation-spine-append-only-version-dag.md) | Annotation spine: append-only log + version-parent DAG |
| [0004](adr/0004-no-wasm-vips-tiling.md) | No WASM-vips tiling — OSD handles deep-zoom |

## Decision records (Q-N)

Citable decisions referenced from plans and commits.

| Doc | Scope |
|-----|-------|
| [`decisions/archie.md`](decisions/archie.md) | Core decisions |
| [`decisions/archie-av.md`](decisions/archie-av.md) | Audio / video |
| [`decisions/archie-linkability.md`](decisions/archie-linkability.md) | Note linking & navigation |
| [`decisions/archie-persistence.md`](decisions/archie-persistence.md) | Storage / persistence |

## Architecture maps

Subsystem-level component and contract docs (generated; treat as a map, verify against code).

- [`architecture/overview.md`](architecture/overview.md) · [`domain.md`](architecture/domain.md) · [`subsystems.md`](architecture/subsystems.md) · [`infrastructure.md`](architecture/infrastructure.md) · [`evolution.md`](architecture/evolution.md) · [`ecosystem.md`](architecture/ecosystem.md) · [`risk-map.md`](architecture/risk-map.md)
- Per-subsystem `components.md` + `contracts.md` under [`architecture/subsystems/`](architecture/subsystems/): `annotation-spine`, `publish`, `rendering`, `storage`, `studio`, `viewer`
- Cross-cutting: [`architecture/cross-cutting/patterns.md`](architecture/cross-cutting/patterns.md)

## Plans & spikes

| Doc | What it is |
|-----|------------|
| [`plans/PHASE-0.md`](plans/PHASE-0.md) · [`PHASE-1.md`](plans/PHASE-1.md) · [`PHASE-2.md`](plans/PHASE-2.md) | Per-phase task breakdowns |
| [`spikes/0001-anvil-render-core-extraction.md`](spikes/0001-anvil-render-core-extraction.md) | De-risking spike: lifting anvil's logic into `@render/core` |
| [`PRE-P3-UX-AUDIT.md`](PRE-P3-UX-AUDIT.md) | Audit of the six Phase-3 UX gaps |
| [`bundle-size.json`](bundle-size.json) | Bundle measurements (renderer floor ~223 KB gz; `@render/core` ~8 KB gz) |
