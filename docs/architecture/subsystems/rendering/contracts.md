# Rendering — Contracts

**Zoom Level 6** | **Subsystem: rendering** | **Confidence: HIGH** | **Source: ADR-0002, mount.ts, controller.ts, HANDOFF.md**

## Internal Contracts (Layer Boundaries)

### core → mount
- `resolveTileSource(url)` → tile source descriptor consumed by mount to configure OSD
- `selectorBBox(selector)` → `Rect` consumed by mount's `fitBounds`
- `isDegenerateSelectorValue(value)` → boolean guard before Annotorious store injection
- `canvasIdFor(slug, objId)` → OSD canvas id string (consumed by mount as Annotorious `canvasId`)

### mount → svelte
- `MountSurface` interface (see components.md) — the imperative contract
- `createMount(container, options)` → `MountSurface` — factory called in `onMount`
- `CanvasController` wraps surface for Svelte reactivity

### svelte → consumers (Studio/Viewer)
- `Canvas.svelte` — props: `source`, `annotations`, `drawing`, `tool`, `selected`, `onSelect`, `onCreate`, `onUpdate`, `onDelete`
- `renderMarkdown(md)` → safe HTML string
- `stripMarkdown(md)` → plain text lead
- Controller test: `createCanvasController(mockSurface)` → exercised in `controller.test.ts`

## Cross-Subsystem Contracts

### Rendering → Annotation Spine
- Consumes: `projectHeads(log)` → annotations array (pass-through to mount)
- Consumes: `selectorBBox` for fitBounds
- Produces: `onCreate(annotation)` → Studio → `session.createNote`

### Rendering → Studio
- `Canvas.svelte` mounted in Studio with drawing tools enabled
- `onCreate` → `session.createNote` → log append → `setAnnotations(heads)`
- `onSelect` → sidebar WADM form population
- `onUpdate/onDelete` → `session.editNote/deleteNote`

### Rendering → Viewer
- `Canvas.svelte` mounted read-only (no drawing tools)
- `Reader.svelte` + `NarrativeReader.svelte` — layout-specific rendering
- `initialSelected` prop for deep-link arrival
- `onSelect` → popup/drawer (annomea 3-state pane pattern)

## Knot Classification

| Crossing | Classification | Notes |
|----------|---------------|-------|
| core → mount → svelte | **Prime** (irreducible) | The 3-layer stack IS the architectural pattern |
| mount ↔ Annotorious (createAnnotation event) | **Composite** | Event-based; could be a typed channel |
| svelte Canvas ↔ Studio App | **Composite** | Component boundary; Svelte props are the contract |
| fitBounds oracle (new vs anvil-stock) | **Prime** | Gate proven headless; visual equivalence owed (human) |

## Security Pins

- **Svelte 5 `$effect` rule** — must read reactive deps before short-circuiting guard. Violating this produces silent reactivity failures (draw bug root cause, 2026-05-25).
- **`{#key canvasId}` remount** — switching objects requires Canvas remount for OSD to load new image. No source `$effect` exists. Forgetting the key = stale image.
- **DOMPurify sanitization** — `renderMarkdown` runs snarkdown THEN DOMPurify. Link rewriting (`archie:` → display URL) must run BEFORE sanitize (DOMPurify strips unknown schemes).
