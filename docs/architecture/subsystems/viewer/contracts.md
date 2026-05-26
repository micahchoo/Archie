# Viewer — Contracts

**Zoom Level 6** | **Subsystem: viewer** | **Confidence: HIGH** | **Source: ExhibitView.svelte, published.ts, HANDOFF.md**

## Internal Contracts

### Layout Resolution
```ts
resolveLayout(exhibit) → 'single' | 'grid' | 'narrative'
```
- `single`: 1 object → Reader directly
- `grid`: N objects → ObjectGrid + Reader (pick → read → back)
- `narrative`: sections present → NarrativeReader (prose-spine + canvas)
- Published IIIF form carries no layout hint → inference from object/section count

### Published Data Contract
```
GET /{slug}/manifest.json → { label, items: [{ id, source, label, ... }] }
GET /{slug}/canvas/{objId}/annotations.json → WADM AnnotationPage
GET /collection.json → IIIF Collection (all exhibits)
GET /exhibits.json → [{ slug, title, cover, description, ... }]
```
- `objectsFromManifest(manifest)` recovers `{id, source, label}`
- `canvasIdFor(slug, objId)` matches path structure
- Viewer fetches with pure `fetch()` — same contract on local dev and GH Pages

### Deep-Link Contract
```
#/a/{logicalId}         → note deep-link
?iiif-content={encoded}  → IIIF Content State
```
- `parseNoteDeepLink(hash)` → `{ logicalId } | null`
- `decodeContentState(encoded)` → target object/selector
- Cold-arrival trigger: `referrer` empty/external OR URL has fragment beyond exhibit root
- Chrome: breadcrumb, zoom-to-fit, one-liner, position indicator (Narrative)

### Reader Props Contract
```ts
interface ReaderProps {
  object: ExhibitObject;
  annotations: Annotation[];
  onback?: () => void;        // multi-object only
  initialSelected?: string;   // deep-link target
}
```

### NarrativeReader Contract
- `sections: Section[]` — ordered narrative units
- Section i ↔ annotation i (by order)
- Click section → `fitBounds` to annotation region
- Click marker → highlight corresponding section
- Markdown rendering for inline photos/audio

## Cross-Subsystem Contracts

### Viewer ← Publish
- Reads published static tree over HTTP fetch
- `loadPublishedExhibit(slug)` calls publish projection (manifest + annotations)
- `libraryCards` calls collection.json projection

### Viewer ← Rendering
- Canvas.svelte mounted read-only (no drawing tools)
- Reader/NarrativeReader wrap Canvas with layout-specific chrome
- `renderMarkdown` for note bodies in popup/drawer
- `stripMarkdown` for plain lead in list

### Viewer ← Annotation Spine
- Consumes WADM AnnotationPage (heads projection)
- `objectsFromManifest` + canvas IDs from IIIF
- Pure consumer — no spine dependency (intentional: Viewer is a WADM consumer)

## Static URL Grammar
```
/{exhibitSlug}/                      → Exhibit (resolves to default view)
/{exhibitSlug}/#/a/{logicalId}       → Deep-link to note
/{exhibitSlug}/?iiif-content={enc}   → IIIF Content State arrival
/                                    → Gallery (if multiple exhibits)
```
- Stable, repairable — cross-Library links use this grammar
- Pin this early; changing it breaks published links

## Known Gaps

- **Sections from manifest:** NarrativeReader sections currently from sample-data; `sectionsFromManifest` parser (Ranges) built but not wired
- **Progressive marker reveal:** Narrative layout spec (§122) — markers accumulate with active Section; current = show-all
- **Breadcrumb chrome:** Cold-arrival breadcrumb/zoom-to-fit not yet built (deep-link note fade = done)
