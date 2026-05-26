# Domain — Archie

**Zoom Level 1** | **Confidence: HIGH** | **Source: CONTEXT.md (2026-05-24 grill), ADRs 0001–0004, HANDOFF.md**

## Business Problem

Archie is a **static-publishable, multi-media exhibit annotation platform**. Scholars, curators, and storytellers author annotated exhibits — combining deep-zoom images, audio, and video with structured notes — in a browser Studio, then publish them as static sites to GitHub Pages with zero server runtime.

## Core Concepts (Ubiquitous Language)

| Term | Definition | IIIF Analog |
|------|-----------|-------------|
| **Library** | Top-level container; one published site. Holds many Exhibits + project-level metadata. | `Collection` |
| **Exhibit** | One published narrative artifact. Self-contained: owns Objects, media, annotations, narrative pages. | `Manifest` |
| **Object** | One media item inside an Exhibit (image/audio/video/embed). | `Canvas` |
| **Note** | A single W3C WADM annotation targeting a Library, Exhibit, Object, region, or time range. | `Annotation` |
| **Layer** | A curated, named, toggleable grouping of Notes with editorial intent. | `AnnotationCollection` |
| **Tag** | A lightweight ad-hoc label on a Note; body with `purpose: tagging`. | — |
| **Section** | One ordered unit of an Exhibit's narrative; what the canvas shows when active. | `Range` |
| **Studio** | The authoring SPA. Writes working state, exports zips, runs the publish build. | — |
| **Viewer** | The published static site built by the Studio's publish step. Read-only. | — |
| **Gallery** | The Library-level published index of Exhibits — one data source (`exhibits.json`), two renders (Studio library-browse + published landing). | — |
| **Grid** | A within-Exhibit layout showing Objects as a browsable thumbnail grid. | — |

## Relationships

- Library 1→N Exhibits (containment)
- Exhibit 1→N Objects (exhibit-nested ownership; no cross-exhibit reuse — ADR-0001)
- Note targets exactly one of: Library, Exhibit, Object, region, or time range
- Layer groups many Notes across Objects within an Exhibit (cross-cutting)
- Tag belongs to one Note
- Studio writes what Viewer reads; both consume the same on-disk WADM/IIIF files

## Locked Frames (Non-Negotiable)

1. OSD + Annotorious for deep-zoom image annotation
2. Two surfaces: **Studio** (CMS + exhibit-making) and **Viewer** (published exhibit UI)
3. Multi-media: audio, video, image
4. Multi-object exhibits
5. Annotations at both Library level and Object level
6. Linkable + navigable annotations (intra-Library structured + cross-Library deep-link)
7. W3C WADM compliance
8. Web-publishable: GitHub Pages, standalone, no server

## Architectural Through-Line

**Define the authoritative source; project thin.** Every major decision resolves to a source-of-truth + thin derived projection:

| Boundary | Source of Truth | Thin Projection |
|----------|----------------|-----------------|
| Rendering | `@render/core` (pure TS) | Per-framework adapters (<500 LOC) |
| Storage | Filesystem seam | OPFS / FSA / Zip backends |
| Annotations | Append-only log | Projected head version(s) |
| Merge | Version-parent DAG | Conflict-card view (computed merge-base) |
| WADM export | The log | Heads page + history sidecar |
| Publish | The zip (architectural primitive) | Per-host adapters (~200 LOC) |
| Deep-zoom | Source image | Tile pyramid (build step, v1.1) |

## Layout Model

Two orthogonal axes: **Spatial arrangement** (how objects sit: one/many/side-by-side) and **Reading mode** (how visitor moves: click-driven vs scroll-driven, prose-led vs object-led).

v1 layout set: **Single** + **Grid** + **Narrative**. Slideshow is a Grid *mode*, not a template.
