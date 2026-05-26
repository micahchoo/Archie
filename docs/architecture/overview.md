# Architecture Overview — Archie

**Last analyzed:** 2026-05-25 | **Confidence: HIGH** | **Source: codebase-diagnostics sweep (all 8 zoom levels)**

## Elevator Pitch

Archie is a **static-publishable, multi-media exhibit annotation platform** — a browser Studio for authoring annotated exhibits (deep-zoom images, audio, video with W3C WADM notes) and a static-site Viewer for publishing them to GitHub Pages with zero server runtime.

## Architecture at a Glance

```
┌─────────────────────────────────────────────────┐
│                  Studio (SPA)                    │
│  Svelte 5 + Vite  |  Authoring + Publish UI     │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────┐
│              @render/svelte (<500 LOC)           │
│  CanvasController  |  Canvas.svelte  |  Markdown│
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────┐
│              @render/mount (vanilla)             │
│  OSD + Annotorious wiring  |  MountSurface      │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────┐
│              @render/core (pure TS)              │
│  ┌──────────┐  ┌────────┐  ┌──────────────────┐ │
│  │ Spine    │  │ IIIF   │  │ Storage (seam)   │ │
│  │ log·merge│  │ resolv │  │ Memory·Zip·FSA   │ │
│  │ heads·ser│  │ manifs │  │ conformance      │ │
│  └──────────┘  └────────┘  └──────────────────┘ │
│  ┌──────────┐  ┌────────┐  ┌──────────────────┐ │
│  │ Geometry │  │ Publish│  │ Links            │ │
│  │ selectrs │  │ lib·zip│  │ encode·rewrite   │ │
│  └──────────┘  └────────┘  └──────────────────┘ │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────┐
│                  Viewer (static)                 │
│  Astro + Svelte islands  |  Gallery + Reader    │
│  Single · Grid · Narrative layouts              │
└─────────────────────────────────────────────────┘
```

## Subsystems

| # | Subsystem | Role | Tests |
|---|-----------|------|-------|
| 1 | **Annotation Spine** | Append-only log, version-DAG merge, WADM serialization | 209 |
| 2 | **Rendering** | 3-layer stack: core (pure TS) → mount (OSD+Annotorious) → svelte (<500 LOC) | 36 |
| 3 | **Storage** | Filesystem seam + OPFS/FSA/Zip backends | Conformance |
| 4 | **Publish** | zip primitive + GitHub Pages adapter | 9 |
| 5 | **Studio** | Authoring SPA (Svelte 5, Vite) | Browser |
| 6 | **Viewer** | Published static site (Astro + Svelte) | Build |

## The Through-Line

**Define the authoritative source; project thin.** Every boundary resolves to one source of truth + thin derived projection:

- **Annotations:** append-only log → heads projection + history sidecar
- **Rendering:** pure TS core → per-framework adapters (<500 LOC)
- **Storage:** Filesystem seam → OPFS/FSA/Zip backends
- **Publish:** the zip → per-host adapters (~200 LOC)
- **Links:** `archie:` URI in body → resolved display URL at publish

## Key Decisions

| ADR | Decision |
|-----|----------|
| 0001 | Objects are exhibit-nested (no cross-exhibit reuse) |
| 0002 | 3-layer render stack + Svelte everywhere |
| 0003 | Annotation spine: append-only log + version-DAG + heads projection |
| 0004 | No wasm-vips tiling (OffscreenCanvas v1.1 instead) |

Full decisions: `docs/decisions/archie.md` (Q-1..Q-7), `docs/adr/`.

## Current State

- **Phase:** Late Phase 2 (adopted-tier tool works end-to-end)
- **Tests:** 245 green (core 209 / mount 18 / svelte 18)
- **Layouts:** Single + Grid + Narrative (v1 set complete)
- **Remaining v1:** 5 gated inventions, EXIF bake, AV playback, body sanitization gate

## Risk Concentration

- **Highest:** Studio (5 of 6 inventions) — each prototype-gated
- **Lowest:** Annotation Spine (pure logic, 209 tests, well-gated)
- **Watch:** Merge UI comprehension, bundle size (unvalidated 240KB budget)

Full risk map: `docs/architecture/risk-map.md`.
Full subsystem details: `docs/architecture/subsystems/`.

## See Also

- `CONTEXT.md` — domain language, locked frames, UX specifications
- `HANDOFF.md` — implementation history and current state
- `docs/IMPLEMENTATION-STRATEGY.md` — phase-by-phase build plan
- `docs/adr/` — Architecture Decision Records (0001–0004)
- `.understand-anything/` — Knowledge graph (237 nodes, 188 files analyzed)
