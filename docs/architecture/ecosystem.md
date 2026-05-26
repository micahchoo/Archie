# Ecosystem — Archie

**Zoom Level 2** | **Confidence: HIGH** | **Source: package.json manifests, pnpm-workspace.yaml, Prior Art survey, HANDOFF.md**

## Package Ecosystem

### Runtime Dependencies

| Package | Role | Vintage |
|---------|------|---------|
| **OpenSeadragon** | Deep-zoom image viewer (canvas surface) | Mature (2011–present) |
| **@annotorious/openseadragon** | OSD annotation plugin (drawing tools, selection) | Active |
| **@annotorious/plugin-tools** | Annotorious toolbar plugin | Active |
| **Svelte 5** | UI framework (Studio SPA + Viewer islands) | Current major (2024) |
| **Astro** | Static site generator (Viewer) | Current major |
| **Vite** | Build toolchain (Studio) | Current major |
| **fflate** | Zip compression (publish/export primitive) | Stable |
| **snarkdown** | Markdown→HTML (note body rendering) | Stable |
| **DOMPurify** | HTML sanitization (XSS gate) | Stable |
| **happy-dom** | DOM environment for headless tests | Active |
| **ulidx** | ULID generation (annotation identity) | Stable |

### Dev Dependencies

| Package | Role |
|---------|------|
| **TypeScript 5.6** | Type system across all packages |
| **Vitest 2.1** | Test runner (245 tests) |
| **vite-node** | Run TS core in Node (publish gen script) |

### Framework Decision

**Svelte everywhere** (ADR-0002). Studio = Svelte SPA. Viewer = Astro + Svelte islands. One adapter (`@render/svelte`), zero React. Rationale: all read-UI donors are Svelte; Annotorious plugins are framework-agnostic; avoids paying a two-adapter + hiring tax.

## External Interfaces

### Standards Compliance

| Standard | Scope | Implementation |
|----------|-------|----------------|
| **W3C WADM** (Web Annotation Data Model) | Annotation serialization, identity, provenance | Full: `Annotation`, `AnnotationPage`, `Collection`, `Manifest`, `Range`, `TextualBody`, `SpecificResource`, `FragmentSelector`, `PointSelector` |
| **IIIF Presentation 3** | Exhibit/object manifest, canvas structure, collections | `toManifest`, `toCollection`, `objectsFromManifest` round-trip |
| **IIIF Content State** | Deep-link encoding | `encodeContentState` / `decodeContentState` |
| **WebVTT / SRT** | AV transcript import | `parseVtt` / `parseSrt` → WADM `supplementing` bodies |

### Deployment Targets

- **GitHub Pages** — primary publish target via Contents API (fine-grained PAT, contents:write + pages:write)
- **Static zip** — universal zero-auth default; the architectural primitive
- **OPFS** (Origin Private File System) — browser working storage
- **File System Access API** — Chromium folder-autosave (power-user path)

### External Data Sources

- External IIIF `info.json` URLs (giant images, museum collections)
- Cross-origin images (OSD `type:'image'`, subject to CORS)
- User-supplied WebVTT/SRT transcript files

## Prior Art Survey

A 20-axis survey of existing tools (`Prior Art/`) informed every architectural decision. Key gaps the survey identified as greenfield:

- **Multi-exhibit index** (`exhibits.json`) — no existing tool emits a browseable published index of multiple exhibits
- **WADM + IIIF round-trip** — existing tools consume one or emit the other, not both
- **Static-publish annotation** — annotation tools assume a server; static-site generators don't do annotation

## Era Vintages

- **Modern stratum** (2024–2025): Svelte 5, Astro, Vite, Vitest, TypeScript 5.6 — the toolchain is current
- **Mature stratum** (2011–2020): OpenSeadragon, W3C WADM (2017), IIIF Presentation 3 (2020) — the standards base is stable
- **No legacy stratum**: no `require()`, no `var`, no callback-era patterns detected in codebase-analytics
