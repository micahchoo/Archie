# Studio — Components

**Zoom Level 5** | **Subsystem: studio** | **Confidence: HIGH** | **Source: HANDOFF.md, apps/studio/src/**

## Component Map

```
apps/studio/src/
├── App.svelte           — Root: router (library|editor), session, persistence
├── LibraryHome.svelte   — Multi-exhibit library browse (exhibit cards + "New exhibit")
├── Canvas.svelte        — OSD deep-zoom annotation surface (@render/svelte)
├── Publish.svelte       — Publish dialog (Download zip + GitHub Pages)
├── MergeReview.svelte   — Import changes → summary panel → conflict cards
├── CmdK.svelte          — ⌘K "Cite" palette (intra-Library linking)
├── store.ts             — OPFS persistence, library metadata, asset management
└── markers.css          — A2 + stroke-over-stroke annotation markers
```

## Key Components

### App.svelte
- **Router:** `view` state (`'library' | 'editor'`)
- **State:** `libraryMeta`, `currentSlug`, `currentExhibit`, `mode` (select|draw), `tool` (rect|polygon), `selected`, `editing`
- **Session:** `AnnotationSession` — one per exhibit (live editor state)
- **Persistence:** Autosave to OPFS via `store.ts`; dirty indicator
- **Lifecycle:** `openExhibit(slug)` — load session, resolve assets, seed if empty
- **Import:** `importChanges(zip)` — merge logs, surface conflicts
- **Publish:** `buildLibrary()` → Download (zip) or Publish (GH Pages)
- **Key fix:** `editing` id follows `selected` only on non-null — prevents form unmount on edit (P2-5 bug)

### LibraryHome.svelte
- Exhibit cards on dark table (system.md "curator's study")
- "New exhibit" dashed tile
- "Open .archie.zip…" — `loadLibrary` → replace OPFS project
- Per-exhibit: title, object count, note count

### store.ts
- **OPFS root:** `{PROJECT}/`
- `loadLibraryMeta()` / `saveLibraryMeta()` — `library.json`
- `openExhibitAnnotationsDir(slug)` — per-exhibit annotation dir
- `saveAssetFile(slug, name, file)` — raw OPFS binary handles
- `readAssetUrl(slug, name)` → blob: URL
- `readAssetBytes(slug, name)` → Uint8Array
- `clearExhibitAnnotations(slug)` — recursive OPFS removeEntry
- **Self-healing reconcile:** on mount, stale defaults (source/count mismatch) → replace + reseed

### Publish.svelte
- Warm-paper dialog (system.md dialog elevation)
- Two paths: Download `.archie.zip` | Publish to GitHub Pages
- GitHub: owner/repo/branch/token form; state machine idle→publishing→done→error
- Token = password input, dropped on done/error/close (NEVER persisted)

### MergeReview.svelte
- "Import changes" button (disabled while conflicts unresolved)
- Summary panel: "Synced N notes from Alice · M need your decision"
- Conflict cards: ancestor + per-side diff → resolveConflict
- Inline resolution in normal workspace (zero new editing surfaces)

### CmdK.svelte
- ⌘K or "Cite" link opens warm-paper "catalog drawer"
- Entries: every exhibit + note (latest non-deleted per logicalId)
- Pick → `insertCite(archie:ref)` at textarea cursor
- ↑↓/↵/esc; type-to-filter

## Design System
- **Tokens:** `tokens.css` — forest-green "scholar's ink" (`--accent #3a6b4c`), vermillion = error-only
- **System:** `.interface-design/system.md` — "curator's study at night"
- **Fonts:** Cormorant (titles), Crimson (body), Work Sans (UI), JetBrains (code)

## Quality Signals

| Metric | Value |
|--------|-------|
| Build | Clean (170+ modules) |
| Dev server | Vite :5173 |
| Browser-verify | Draw/create/edit/publish loop confirmed |
