# Studio — Contracts

**Zoom Level 6** | **Subsystem: studio** | **Confidence: HIGH** | **Source: App.svelte, store.ts, HANDOFF.md**

## Internal Contracts

### View Router
```
'library' → LibraryHome.svelte
'editor'  → Canvas.svelte + sidebar (WADM form, object rail, layers)
```
- `currentSlug` — active exhibit
- `currentObjectId` — active object within exhibit
- `{#key canvasId}` remount on object switch

### Session Lifecycle
```
openExhibit(slug)
  → store.load annotations
  → new AnnotationSession(log)
  → resolveAssets (blob: URLs for imported files)
  → seed if empty (DEFAULT_EXHIBITS)
  → set session, currentSlug, currentObjectId

edit → session.editNote → setAnnotations(heads)
draw → session.createNote → setAnnotations(heads)
import → session.importChanges → conflicts state
resolve → session.resolveConflict → setAnnotations(heads)

close/switch
  → store.save annotations (heads + history)
  → revoke blob: URLs
```

### Drawing Tools Contract
- `mode: 'select' | 'draw'`
- `tool: 'rectangle' | 'polygon'`
- Canvas.svelte props: `drawing={mode==='draw'}`, `tool`
- Annotorious `createAnnotation` event → `onCreate` → `session.createNote`

### Annotation Form Contract
- `selected` — Annotorious selection (canvas click)
- `editing` — derived from `selected` (follows on non-null, holds on null → form stays open during edit)
- WADM form fields: body (markdown textarea), tags, layer membership
- `applyForm` → `session.editNote` → persist

### Persistence Contract
- `library.json`: `{ name, exhibits: [{ slug, title, objects, seedVersion?, ... }] }`
- Per-exhibit: `exhibits/{slug}/annotations/heads/` + `history/`
- Assets: `exhibits/{slug}/assets/{name}` (raw bytes)
- Self-healing: on mount, compare persisted defaults vs code defaults → replace stale

## Cross-Subsystem Contracts

### Studio → Annotation Spine
- `new AnnotationSession(log)` — live editor state
- `session.createNote(target, body)` — append to log
- `session.editNote(logicalId, body)` — appendEdit
- `session.deleteNote(logicalId)` — appendDelete
- `session.importChanges(otherLog)` — merge
- `session.conflicts()` — unresolved list
- `session.resolveConflict(logicalId, resolution)` — resolve

### Studio → Rendering
- Canvas.svelte props: `source`, `annotations`, `drawing`, `tool`, `selected`, `onSelect`, `onCreate`, `onUpdate`, `onDelete`
- `renderMarkdown(md)` — note body → safe HTML (card lead)
- `stripMarkdown(md)` — plain text lead

### Studio → Storage
- `store.ts` uses raw OPFS (not Filesystem interface — bypass for binary assets)
- `saveAssetFile`, `readAssetUrl`, `readAssetBytes`, `clearExhibitAnnotations`

### Studio → Publish
- `buildLibrary()` — one source for both Download and Publish
- `publishLibrary(library, getLog)` — projection
- `libraryToZip(library, getLog, getAsset)` — download
- `publishToGitHub(files, target)` — GH Pages

## Known Issues

- **P2-5 (partial):** Marker highlight drops per edit (Annotorious deselect on setAnnotations). Form stays open (editing fix); marker re-highlight on re-select still missing.
- **Cross-origin images:** `addObject` with cross-origin URL may fail OSD tile-fetch without CORS.
