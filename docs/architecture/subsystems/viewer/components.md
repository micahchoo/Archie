# Viewer — Components

**Zoom Level 5** | **Subsystem: viewer** | **Confidence: HIGH** | **Source: HANDOFF.md, apps/viewer/src/**

## Component Map

```
apps/viewer/src/
├── components/
│   ├── ExhibitView.svelte      — Orchestrator: layout resolver, object switching
│   ├── Reader.svelte            — Single-object OSD reader (popup/drawer)
│   ├── NarrativeReader.svelte   — Prose-spine + canvas (Narrative layout)
│   ├── ObjectGrid.svelte        — Thumbnail grid (Grid layout)
│   └── (markers.css)            — A2 + stroke-over-stroke markers
├── pages/
│   ├── index.astro              — Gallery landing (exhibit cards)
│   ├── voynich.astro            — /voynich route
│   └── bidar.astro              — /bidar route
├── published.ts                 — HTTP fetch consumer (reads published tree)
├── sample-data.ts               — Typed Library + getLog (dev/demo data)
└── scripts/
    └── gen-published.mts        — vite-node: publishLibrary → disk tree
```

## Key Components

### ExhibitView.svelte
- **Orchestrator:** `resolveLayout(exhibit)` → Single | Grid | Narrative
- **Single:** straight to Reader (no object picker)
- **Grid:** ObjectGrid ⇄ Reader (pick object → read → back)
- **Narrative:** NarrativeReader (prose-spine + canvas)
- Async load: `loadPublishedExhibit(slug)` → `{title, objects, annotationsByObject}`
- Loading + error states (system.md §Reader States)
- Deep-link: `parseNoteDeepLink(hash)` → `initialSelected`

### Reader.svelte
- Read-only OSD + annomea 3-state pane (list → popup → drawer)
- Props: `{object, annotations, onback?, initialSelected?}`
- `onSelect` → popup/drawer with note detail
- Markdown body rendering (`{@html}`, sanitized)
- `fitBounds` on select (Q8 nav contract)
- `onback` for multi-object return to grid

### NarrativeReader.svelte
- Prose-spine + canvas for Narrative layout
- Section i ↔ annotation i (order-bound)
- Click prose reflection → `fitBounds` to region
- Click marker → highlight its reflection
- Photos/audio render inline (renderMarkdown)
- Built for Bidar (25 field reflections)

### ObjectGrid.svelte
- Thumbnail grid on dark light-table (system.md)
- Objects glow on hover
- Empty state: "No objects in this exhibit yet" (dashed card)
- Click object → Reader

### published.ts
- **Pure HTTP fetch consumer** — reads published static tree
- `loadPublishedExhibit(slug)`: fetch manifest → objectsFromManifest → fetch per-canvas annotations
- `libraryCards`: collection.json → exhibit list for Gallery
- Swap base URL for live origin = deployed GH-Pages consumer
- Currently reads from `public/published/` (gen-published.mts output)

### index.astro (Gallery)
- Static Gallery landing: exhibit cards (cover, title, description)
- Links → `/{slug}` routes
- Empty state: "No exhibits published yet" (dashed card)
- `shouldRenderGallery` — collapse for single-exhibit (unless Library title set)

## Design System
- Same tokens as Studio: `tokens.css` — forest-green "scholar's ink"
- Deep-link arrival chrome: fading "wax-seal" note (`transition:fade`, auto-hide 6s)

## Quality Signals

| Metric | Value |
|--------|-------|
| Build | Clean (3 pages, 269KB gz island) |
| Dev server | Astro :4321 |
| Gen | `predev`/`prebuild` run gen-published.mts (62 files) |
| Layouts | Single + Grid + Narrative (v1 set complete) |
