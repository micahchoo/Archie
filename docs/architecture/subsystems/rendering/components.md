# Rendering — Components

**Zoom Level 5** | **Subsystem: rendering** | **Confidence: HIGH** | **Source: ADR-0002, package structure, HANDOFF.md**

## 3-Layer Stack

```
@render/core  (pure TS)        — geometry, IIIF resolution, URL serialization
    ↓
@render/mount (vanilla JS)     — OSD + Annotorious wiring, imperative surface
    ↓
@render/svelte (<500 LOC)      — Svelte 5 adapter, CanvasController, Canvas.svelte
```

## @render/core (rendering logic)

### IIIF Resolution (`iiif/resolve.ts`)
- `resolveTileSource(url)` → `{kind: 'image', url} | {kind: 'iiif', infoJson}`
- `isIiifImageInfo(obj)` — type guard
- Blob/data URLs classified as `kind:'image'` up front (bugfix: OSD tried to load `blob:.../info.json`)

### Geometry (`geometry/selector.ts`)
- Shared with annotation-spine subsystem
- `parseFragmentXYWH`, `parsePolygonPoints`, `polygonBBox`, `selectorBBox`
- `isDegenerateSelectorValue`, `shapeLabel`, `isV1Shape`

### URL / Deep Link (`url/deeplink.ts`)
- IIIF Content State `encodeContentState` / `decodeContentState`
- `#/a/<id>` note deep-link parse/resolve

### Layout (`layout/layout.ts`)
- `resolveLayout(exhibit)` → `'single' | 'grid' | 'narrative'`
- Inference from object count when no explicit layout

### IIIF Projections
- `iiif/manifest.ts` — `toManifest(exhibit)` → IIIF Manifest
- `iiif/collection.ts` — `toCollection(library)` → IIIF Collection
- `iiif/iiif.ts` — `objectsFromManifest`, `toExhibitsJson`, `shouldRenderGallery`
- `iiif/model.ts` — structural types

### EXIF (`exif/orientation.ts`)
- `orientationTransform(exif)` → rotation/flip transform (all 8 orientations)
- `normalizeDimensions` — display-master dimensions
- Mapping built; pixel-push (canvas) = browser, deferred

## @render/mount (OSD + Annotorious wiring)

### `mount.ts`
- `createMount(container, options)` → `MountSurface`
- Wires real OSD viewer + Annotorious plugin
- Degenerate-guard monkey-patch carried verbatim from anvil
- Selection INVERTED: `onSelect(annotation)` callback + `setSelected(id)` imperative control
- `fitBounds(selector)` → OSD viewport `fitBounds` (polygon→bbox for rect-only `goToTarget`)
- Drawing: `setDrawingEnabled(bool)`, `setDrawingTool('rectangle'|'polygon')`
- `setAnnotations(annotations)` — bulk load
- `canvasId` — OSD canvas identity for Annotorious

### MountSurface Contract
```ts
interface MountSurface {
  fitBounds(selector): void;
  setSelected(id: string | null): void;
  setDrawingEnabled(on: boolean): void;
  setDrawingTool(tool: 'rectangle' | 'polygon'): void;
  setAnnotations(annotations: Annotation[]): void;
  destroy(): void;
  onSelect: (annotation: Annotation | null) => void;
  onCreate: (annotation: Annotation) => void;
  onUpdate: (annotation: Annotation) => void;
  onDelete: (id: string) => void;
  readonly canvasId: string;
}
```

## @render/svelte (Svelte adapter)

### CanvasController (`controller.ts`)
- `createCanvasController(mountSurface)` → `CanvasController`
- Plain-TS binding logic — the selection inversion
- `fitBounds` oracle gate: new path's fitBounds rect == anvil-stock characterization oracle

### Canvas.svelte
- Thin Svelte 5 shell (~117 LOC total, well under <500 budget)
- `{#key canvasId}` remount pattern for object switching
- **Critical rule** (Svelte 5): `$effect` must read reactive deps BEFORE short-circuiting guard. `const d = drawing; if (surface) surface.setDrawingEnabled(d)` — NOT `surface?.setDrawingEnabled(drawing)` (optional-chain short-circuits before subscribing to `drawing`)

### Markdown Rendering
- `renderMarkdown(md)` — snarkdown → DOMPurify sanitize
- `stripMarkdown(md)` — plain text lead for list/popup (line-clamped)
- Used by both Studio (card lead) and Viewer (detail drawer `{@html}`)

### Link Scrubbing (`scrub.ts`)
- `scrubAnnotations` — post-sanitization link/attribute scrubbing

## Quality Signals

| Metric | Value |
|--------|-------|
| @render/core tests | 209 |
| @render/mount tests | 18 |
| @render/svelte tests | 18 |
| Svelte adapter LOC | ~117 (budget: <500) |
| Svelte 5 runes | `$state`, `$effect`, `$derived` throughout |
| Gate | fitBounds rect equivalence proven headless (happy-dom) |
