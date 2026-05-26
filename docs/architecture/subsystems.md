# Subsystems — Archie

**Zoom Level 4** | **Confidence: HIGH** | **Source: package structure, CONTEXT.md through-line, ADR-0002, HANDOFF.md**

## Subsystem Map

Six subsystems identified. Boundaries align with package structure and the architectural through-line's source/projection split.

| # | Subsystem | Root Path | Packages | Boundary Type |
|---|-----------|-----------|----------|---------------|
| 1 | **Annotation Spine** | `packages/render-core/src/spine/` | `@render/core` (partial) | Core logic — the keystone data model |
| 2 | **Rendering** | `packages/render-{core,mount,svelte}/` | All 3 render packages | 3-layer adapter stack |
| 3 | **Storage** | `packages/render-core/src/fs/` | `@render/core` (partial) | Filesystem seam + backends |
| 4 | **Publish** | `packages/render-core/src/publish/` | `@render/core` (partial) | Build-time projection |
| 5 | **Studio** | `apps/studio/` | `@archie/studio` | Authoring SPA |
| 6 | **Viewer** | `apps/viewer/` | `@archie/viewer` | Published static site |

## Dependency Flow

```
Annotation Spine (data model)
    ↓
Rendering (core → mount → svelte)
    ↓
┌──────────┬──────────┐
│  Studio  │  Viewer  │
│ (author) │ (reader) │
└──────────┴──────────┘
    ↓
  Publish (zip → GH Pages)
    ↑
  Storage (OPFS/FSA/Zip)
```

## Subsystem Details

### 1. Annotation Spine
**What it does:** Append-only annotation log, version-DAG merge, heads projection, WADM serialization/deserialization. The keystone — every other subsystem depends on this data model.
**Key modules:** `spine/log.ts`, `spine/merge.ts`, `spine/heads.ts`, `spine/serialize.ts`, `spine/persist.ts`, `wadm/brand.ts`, `wadm/types.ts`, `geometry/selector.ts`, `link/link.ts`
**Drainage density:** HIGH — all data flows through the spine
**Tests:** 209 (core)

### 2. Rendering
**What it does:** Three-layer stack: pure TS geometry/IIIF resolution (`core`) → imperative OSD+Annotorious mount wiring (`mount`) → thin Svelte adapter (`svelte`). The mount layer inverts Annotorious selection into a controlled `onSelect`/`setSelected` contract.
**Key modules:** `iiif/resolve.ts`, `geometry/selector.ts` (core); `mount.ts` (mount); `controller.ts`, `Canvas.svelte` (svelte)
**Constraint:** Svelte adapter <500 LOC budget (doubles as logic-leak detector)
**Tests:** 18 (mount) + 18 (svelte)

### 3. Storage
**What it does:** Filesystem seam interface + three backends: `MemoryFilesystem` (tests), `ZipFilesystem` (export/import via fflate), `FsaFilesystem` (Chromium folder-autosave). OPFS used for working storage in Studio.
**Key modules:** `fs/seam.ts`, `fs/memory.ts`, `fs/zip.ts`, `fs/fsa.ts` (DOM-typed)
**Tests:** Conformance suite run against Memory + Zip backends

### 4. Publish
**What it does:** `publishLibrary` projects the append-only log into static IIIF/WADM files. Emits a zip (architectural primitive) or pushes to GitHub Pages via Contents API. `exhibits.json` is the multi-exhibit index projection.
**Key modules:** `publish/library.ts`, `publish/toZip.ts`, `publish/ghpages.ts`, `publish/site.ts`
**Tests:** 6 (site) + 3 (ghpages)

### 5. Studio
**What it does:** Browser SPA for authoring. Multi-exhibit Library home → per-exhibit canvas workspace. Drawing tools (rect + polygon), WADM annotation form, layer/tag filtering, merge review, import/export, publish dialog.
**Key files:** `App.svelte`, `LibraryHome.svelte`, `Canvas.svelte`, `Publish.svelte`, `MergeReview.svelte`, `CmdK.svelte`, `store.ts`
**Framework:** Svelte 5 + Vite
**Dev server:** :5173

### 6. Viewer
**What it does:** Published static site. Gallery landing → per-exhibit reader. Three layouts (Single, Grid, Narrative). Deep-link arrival. Reads published JSON over HTTP fetch.
**Key files:** `ExhibitView.svelte`, `Reader.svelte`, `NarrativeReader.svelte`, `ObjectGrid.svelte`, `index.astro`, `published.ts`
**Framework:** Astro + Svelte 5 islands
**Dev server:** :4321

## Cross-Subsystem Flows

### Primary: Annotate → Publish → Read
```
Studio (draw → create note → spine.append)
  → Storage (writeAnnotations to OPFS)
  → Publish (publishLibrary → zip/GH Pages)
  → Viewer (fetch manifest → render markers)
```

### Secondary: Import Changes (Merge)
```
Studio (import zip)
  → Storage (ZipFilesystem.fromZip)
  → Spine (mergeLogs → classifyMerge → headsOf)
  → Studio (MergeReview → resolveConflict)
  → Storage (writeAnnotations)
```

## Drainage Density

| Subsystem | Density | Notes |
|-----------|---------|-------|
| Annotation Spine | HIGH | All annotation data flows through here |
| Rendering | MEDIUM | Display pipeline, OSD/Annotorious bridge |
| Storage | LOW | Pass-through seam; backends are thin |
| Publish | LOW | Build-time projection; one-directional |
| Studio | HIGH | Authoring entry point; highest churn |
| Viewer | MEDIUM | Read-side rendering; 3 layout variants |
