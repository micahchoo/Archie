# Archie → tldraw: Reverse-Mirror Architecture Analysis

Starting from Archie's subsystems, examining how tldraw solves the same problems — and what Archie can learn from tldraw's approach.

## 1. Embeddable Component Contract

### Archie: `<archie-viewer>` custom element
```html
<archie-viewer src="exhibit.archie.zip" target="/my-exhibit/object/3" offline></archie-viewer>
```
- Custom element with Shadow DOM, framework-agnostic
- Attributes: `src`, `target`, `iiif-content`, `offline`, `show-unlisted`
- Instance-context seam — no module globals (two elements = two independent viewers)
- Plain DOM rendering (no Svelte runtime in the bundle)
- Load path: gallery → object grid → deep-zoom reader (lazy OSD import)

### tldraw: `<Tldraw>` + `<TldrawImage>`
```tsx
// Interactive editor:
<Tldraw snapshot={snapshot} shapeUtils={[MyShape]} />

// Read-only static render:
<TldrawImage snapshot={snapshot} format="svg" bounds={box} />
```
- React component only (not framework-agnostic)
- **Read-only is a separate component** — `TldrawImage` creates a hidden Editor, renders to SVG/PNG via `editor.toImage()`, and displays the result as an `<img>`. No interactivity, no event handlers.
- Snapshot-based: accepts `TLStoreSnapshot` or `TLEditorSnapshot`, creates an in-memory store

### What Archie does better
- Custom element = framework-agnostic embed. tldraw requires React.
- Instance-context seam is explicit and tested. tldraw relies on React's lifecycle.

### What tldraw does better
- **Complete separation of "editor" and "render-only" paths.** `TldrawImage` is not a mode of `Tldraw` — it's an entirely different component that *creates and immediately disposes* an Editor instance purely for rendering. This means:
  - No accidental interactivity in read-only mode
  - Read-only path can't bloat the editor path (different bundles)
  - The render-only path is tested independently
- Archie's `<archie-viewer>` architecture is solid; the lesson is the *contract design pattern* not the implementation.

### Concrete takeaway for Archie
If Archie ever needs a "static image" export of an annotated object (like an IIIF canvas with annotations burned in), tldraw's pattern of creating a headless renderer → producing a self-contained artifact → disposing is the way. The `.archie.zip` export is already this, but for images specifically, tldraw's SVG pipeline is the reference.

---

## 2. History / Versioning as Store Concern

### Archie: Append-only log → version DAG
```
AnnotationRecord[] (append-only source)
  → merge()       (CRDT-like conflict resolution)
  → projectHeads() (version DAG → current state)
  → headsByLogicalId() (O(1) lookup by logical ID)
```
- Every edit is an `appendNew`/`appendEdit`/`appendDelete` — never mutates
- Version DAG with branching/merge (logical ID + revision ID + parent pointers)
- `resolveConflict` for merge resolution
- Working projection is derived from heads (not stored separately)
- Serialization to/from WADM annotations

### tldraw: Snapshot-based history in HistoryManager
```ts
// HistoryManager wraps the Store:
class HistoryManager<R> {
  private stacks = atom('stacks', { undos: stack(), redos: stack() })
  // Accumulates RecordsDiff from store mutations
  private readonly pendingDiff = new PendingDiff<R>()

  // Collects diffs between marks, squashes them atomically:
  undo()   // reverseRecordsDiff → store.applyDiff
  redo()   // replay diffs → store.applyDiff
  mark(id) // named checkpoint in undo stack
  bailToMark(id)   // undo to mark without pushing to redo
  squashToMark(id) // collapse all changes since mark into one diff

  batch(fn)  // wrap multiple mutations → one undo entry
}
```
Key design decisions:
- **RecordsDiff** is the universal undo primitive: `{ added: {}, updated: {}, removed: {} }`
- `reverseRecordsDiff()` — invert a diff for undo
- `squashRecordDiffsMutable()` — merge multiple diffs
- History lives at the **store** layer, not the UI layer
- `mark()` / `bailToMark()` — named checkpoints for complex operations (e.g., "start drawing" → "finish drawing" = one undo step)
- `batch()` wraps `transact()` — multiple store mutations count as one undo step

### Comparison

| Axis | Archie | tldraw |
|------|--------|--------|
| Data model | Append-only log | Mutable store + diff stack |
| Undo | Full log replay (expensive) | RecordsDiff reversal (O(1)) |
| Merge | DAG merge with `resolveConflict` | Snapshot-based (no merge in static mode) |
| Granularity | Per-record version | Per-transaction mark |
| Safety | Never loses data | Can truncate undo stack |

### What tldraw does better
- **Named marks for composite operations.** `mark('draw-start')` ... `bailToMark('draw-start')` makes "cancel drawing" trivial — undo all intermediate steps atomically.
- **Batch wrapping.** `editor.batch(() => { createShape(); moveShape(); resizeShape(); })` — one undo step for what's logically one user action.
- **RecordsDiff as the universal diff type** — same structure used for undo, redo, sync, and history display.

### Concrete takeaway for Archie
Archie's append-only log is the *right foundation* — keep it. But add a **user-facing undo layer** on top using the RecordsDiff pattern:

```ts
// A future Archie undo manager:
class AnnotationUndoManager {
  #stack: RecordsDiff<AnnotationRecord>[] = []

  createNote(note: NewNote) {
    const record = session.appendNew(note) // still append-only
    this.#stack.push({ added: { [record.logicalId]: record }, updated: {}, removed: {} })
  }

  undo() {
    const diff = this.#stack.pop()
    // Apply reverse diff: re-add deleted records, remove added ones
    // The append-only log still has the original — this is a UI projection undo
  }
}
```

The key insight: **keep the log immutable, but build a diff-based undo stack on top of it.** The log is the source of truth; the undo stack is a UI convenience.

---

## 3. Headless Core → Thin UI

### Archie: render-core → render-mount → render-svelte
```
@render/core      (pure TS, no DOM, no framework — ADR-0002)
  → @render/mount  (imperative: OSD + Annotorious + Wavesurfer — 3 media renderers)
  → @render/svelte  (thin Svelte adapter, <500 LOC budget — logic-leak detector)
  → @render/archie-viewer (custom element, plain DOM — no Svelte runtime)
```

The `@render/svelte` adapter's <500 LOC budget is a *structural constraint* — if it exceeds 500 LOC, logic has leaked from the core.

### tldraw: state → store → editor → tldraw
```
@tldraw/state       (signals — zero deps, no React)
@tldraw/store       (record store — depends on @tldraw/state)
@tldraw/tlschema    (type system — depends on store + state)
@tldraw/editor      (engine — depends on all above + eventemitter3 + rbush + idb)
  → @tldraw/state-react (React bindings for signals — the bridge layer)
  → @tldraw/tldraw      (React SDK + UI components — depends on editor + state-react)
```

The bridge is `@tldraw/state-react` — it's ~200 lines that wire tldraw's signals into React's `useSyncExternalStore`. This is the equivalent of Archie's `@render/svelte`.

### The shared pattern

Both systems follow the same architecture:
1. **Pure data layer** — no framework, no DOM. Testable with `vitest` alone.
2. **Framework bridge** — the thinnest possible adapter. In tldraw: `useValue(signal)` and `useQuickReactor(effect)`. In Archie: Svelte component props + event callbacks.
3. **UI layer** — the thickest package. Consumes the bridge, never imports the core directly.

### What tldraw does better
- **The bridge is a separate package** (`@tldraw/state-react`). Archie's `@render/svelte` *is* the bridge + the UI in one package (Canvas.svelte, MarginColumn.svelte, etc.). The LOC budget (<500) enforces thinness, but a separate `@render/svelte-bridge` would make the contract explicit.
- **Signals decouple computation from rendering.** A `computed` in `@tldraw/state` doesn't know about React. Archie's `AnnotationSession` is imperative — state changes must be manually propagated to the Svelte adapter.

### Concrete takeaway for Archie
The architecture is already correct. Two refinements:
1. If session.ts grows, extract a signals layer so derived state (heads, byLogicalId, filter results) is declarative and testable without Svelte.
2. Consider splitting `@render/svelte` into a bridge package (<200 LOC, just `$state` ↔ core bindings) and a component package (Canvas, MarginColumn, ResizeDivider).

---

## 4. Static Artifact Export

### Archie: .archie.zip + static HTML tree
- `@render/core/publish/site.ts` — assembles the full site data tree
- `@render/core/publish/zip-stream.ts` — streaming zip writer for bounded memory
- Output: a `.archie.zip` containing IIIF manifests, annotations, static HTML pages, and media
- Zero-server rendering — open the HTML files directly

### tldraw: SVG/PNG export pipeline
```ts
// exportToSvg.tsx — the pipeline:
async function exportToSvg(editor, shapeIds, opts) {
  // 1. Create a JSX representation of the SVG (getSvgJsx)
  const result = getSvgJsx(editor, shapeIds, opts)
  
  // 2. Render it into a real DOM element (for CSS resolution)
  const root = createRoot(renderTarget)
  root.render(result.jsx)
  await result.exportDelay.resolve() // wait for async shapes
  
  // 3. Extract the SVG, embed external resources
  await applyChangesToForeignObjects(svg)
  //    - StyleEmbedder: reads computed styles, inlines them, embeds fonts
  //    - embedMedia: converts images to data URIs, videos to static images
  //    - FontEmbedder: finds @font-face declarations, embeds font files
  
  // 4. Optionally rasterize to PNG (getSvgAsImage)
  return { svg, width, height }
}
```

The pipeline is thorough:
- **Renders to real DOM** (not virtual) to resolve CSS cascade, layout, and font metrics
- **StyleEmbedder** — traverses the DOM, reads every element's computed styles + pseudo-elements, inlines them as `style` attributes
- **FontEmbedder** — finds `@font-face` rules, downloads font files, embeds as base64 data URIs in the SVG
- **embedMedia** — converts `<img>` sources to data URIs, replaces `<video>` with a poster frame
- **ExportDelay** — shape authors can hold the snapshot until async resources load
- **Font embedding** — critical for text fidelity when the SVG is viewed offline

### What tldraw does better
- **Self-contained SVG** — the output SVG has no external dependencies. All fonts, images, styles are inlined. Archie's `.archie.zip` is a different artifact class, but if Archie ever wants a single-file export (e.g., a self-contained HTML page with annotations burned into an image), this pipeline is the gold standard.
- **Real DOM rendering** — using `createRoot` + `flushSync` to get real layout before snapshotting. This solves the "CSS doesn't apply until mounted" problem that virtual DOM approaches can't handle.
- **StyleEmbedder** — the most sophisticated part. Rather than guessing which styles apply, it reads the browser's *computed* styles and writes them as inline attributes. This is the only way to correctly export shadow DOM styles, pseudo-elements, and cascade-dependent rules.

### Concrete takeaway for Archie
Two potential applications:
1. **Annotated image export** — if Archie ever needs to export a single exhibit page as a self-contained artifact (image + annotations rendered into it), tldraw's SVG pipeline is the reference.
2. **Self-contained HTML export** — currently Archie exports a tree of HTML files. A single-file export (all CSS, JS, fonts inlined) would benefit from the same StyleEmbedder approach.

---

## 5. Storage Backend Seam

### Archie: Filesystem abstraction
```ts
interface FsDirectory {
  readFile(path: string): Promise<Uint8Array>
  writeFile(path: string, data: Uint8Array): Promise<void>
  // ...list, delete, etc.
}

// Backends:
// - MemoryFilesystem    (tests, playground)
// - ZipFilesystem       (read .archie.zip)
// - ZipStreamFilesystem (write .archie.zip, streaming)
// - FileSystemAccess    (browser folder via showDirectoryPicker)
// - TauriFilesystem     (desktop folder via Tauri plugin)
// - HttpFilesystem      (read published tree over HTTP)
```

Six backends behind one seam. The `FsDirectory` interface is minimal — read/write/list/delete. Each backend is independently tested.

### tldraw: Store snapshots + IndexedDB
```ts
// Persistence is store → serialized snapshot → IndexedDB
const snapshot = store.getStoreSnapshot() // { store: SerializedStore, schema: SerializedSchema }
await idb.put('tldraw', snapshot)
// Load:
const snapshot = await idb.get('tldraw')
store.loadStoreSnapshot(snapshot) // applies migrations automatically
```

- Single persistence path: IndexedDB via `idb` package
- Store snapshots include schema version — automatic migration on load
- No filesystem abstraction — just the store serialization layer

### Comparison

| Axis | Archie | tldraw |
|------|--------|--------|
| Backends | 6 (memory, zip, zip-stream, FSA, Tauri, HTTP) | 1 (IndexedDB) |
| Interface | `FsDirectory` — byte-level | `StoreSnapshot` — record-level |
| Migration | Ad-hoc in `migrate/` | Schema version in snapshot, automatic |
| Streaming | `ZipStreamFilesystem` — bounded memory | N/A (snapshot is in-memory) |

### What Archie does better
- The filesystem seam is more flexible and general. tldraw's IndexedDB-only approach is simpler but can't handle the "open a .zip from disk" or "publish to a folder" use cases that Archie needs.

### What tldraw does better
- **Schema versioning in snapshots.** Every `StoreSnapshot` includes `schema: SerializedSchema` — so old data loads cleanly after migrations. Archie's migration system (`migrate/`) works but doesn't embed the schema version in every artifact.

### Concrete takeaway for Archie
Archie already has the superior storage architecture. One refinement from tldraw: embed a schema version in the `.archie.zip` marker (`archie.json`) so the loader can run migrations automatically rather than requiring the author to re-publish.

---

## 6. Shape Geometry + Spatial Annotations

### Archie: WADM selectors + Annotorious
```ts
// Selectors are WADM spec types:
type W3CSelector = W3CFragmentSelector | W3CSvgSelector
// FragmentSelector: "xywh=pixel:x,y,w,h"  (rect)
// SvgSelector: "<svg><polygon points='...' /></svg>"  (polygon)

// Geometry utilities in @render/core/geometry/:
// - selector.ts: parse/validate selectors
// - geo.ts: coordinate math
// - coverage.ts: area/overlap calculations
// - marginalia.ts: margin placement for notes
```

Archie's geometry is *data-format-centric* — it parses WADM selectors and converts them to Annotorious shapes. Hit-testing and rendering are delegated to Annotorious/OSD.

### tldraw: Geometry2d class hierarchy
```ts
// Every shape's geometry is a Geometry2d subclass:
abstract class Geometry2d {
  abstract getVertices(): Vec[]
  abstract nearestPoint(point: VecLike): Vec

  hitTestPoint(point, margin, hitInside): boolean
  distanceToPoint(point, hitInside): number
  distanceToLineSegment(A, B): number
  hitTestLineSegment(A, B, distance): boolean
  intersectLineSegment(A, B): VecLike[]
  intersectCircle(center, radius): VecLike[]
  intersectPolygon(polygon): VecLike[]
  interpolateAlongEdge(t: number): Vec   // t=0..1 → point along perimeter
  uninterpolateAlongEdge(point): number  // inverse: point → fractional distance

  get bounds(): Box
  get center(): Vec
  get length(): number  // perimeter length
}

// Concrete geometries:
Rectangle2d( width, height )
Circle2d( center, radius )
Ellipse2d( center, rx, ry )
Polygon2d( points )
Edge2d( start, end )
Arc2d( center, radius, startAngle, endAngle )
CubicBezier2d( p0, p1, p2, p3 )
CubicSpline2d( points )  // smooth curve through points
Group2d( children[] )    // composite geometry
```

### The critical difference

tldraw's geometry objects are **live computational objects**, not just data descriptors. Every geometry can:
- Tell you if a point is inside it (`hitTestPoint`)
- Find the nearest point on its edge (`nearestPoint`)
- Compute intersection points with a line segment
- Interpolate along its perimeter (for arrow attachment points)
- Compute distance to a point or line

Archie's geometry utilities (`@render/core/geometry/`) already handle some of this, but they're functions over selector data, not objects with encapsulated behavior.

### What tldraw does better
- **Geometry as behavior, not data.** A `Rectangle2d` doesn't just store `{x, y, w, h}` — it *is* the rectangle's computational interface. `hitTestPoint` on a rectangle is a few comparisons; on a polygon it's a winding number test; on a group it delegates to children. Each subclass implements the cheapest algorithm for its shape.
- **Group2d for composite shapes.** A label + a box = a `Group2d(box, label)`. Hit-testing automatically checks both children.
- **Interpolation along edges.** Essential for arrow attachment points ("snap arrow to 30% along this edge") and for animations.

### Concrete takeaway for Archie
Archie doesn't need this today — Annotorious handles hit-testing and rendering. But if Archie ever builds custom annotation rendering (e.g., for map annotations with GeoAnchor bbox/polygon, or for audio waveform regions), tldraw's `Geometry2d` hierarchy is the reference architecture.

A minimal adoption for Archie's future map annotations:

```ts
// A GeoAnchor as a Geometry2d-like object:
class GeoBBox extends Geometry2d {
  constructor(west, south, east, north) { ... }
  hitTestPoint(lng, lat) { /* lat/lon in bbox check */ }
  nearestPoint(lng, lat) { /* clamp to bbox edge */ }
}

class GeoPolygon extends Geometry2d {
  constructor(coordinates) { ... }
  hitTestPoint(lng, lat) { /* winding number */ }
  nearestPoint(lng, lat) { /* nearest edge point */ }
}
```

---

## Summary: What Archie Can Learn from Each Mirror

| Archie Subsystem | tldraw Mirror | Key Insight | Priority |
|---|---|---|---|
| `<archie-viewer>` | `<TldrawImage>` | Separate read-only from editor; read-only creates + disposes a headless editor just for rendering | Low (Archie's approach is already correct) |
| Append-only log | RecordsDiff + HistoryManager | Add a diff-based undo stack *on top* of the log — O(1) undo without replaying the log | **P2** — when user-facing undo is needed |
| Three-layer core | state-react bridge | Extract a signals layer for testable derived state; split bridge from UI components | **P1** — when session.ts exceeds ~500 LOC |
| `.archie.zip` export | StyleEmbedder + SVG pipeline | Self-contained artifact pattern: real-DOM render → read computed styles → inline everything | P3 — for single-file HTML export |
| Filesystem seam | Schema version in snapshot | Embed schema version in `archie.json` marker for automatic migration on load | P3 — before next schema change |
| WADM selectors | Geometry2d hierarchy | Encapsulate geometry as objects with behaviors (hitTest, nearestPoint, interpolate), not just data | P4 — for custom annotation shapes (maps, audio) |

### What Archie already does better

1. **Custom element embed** — framework-agnostic, Shadow DOM isolation, instance-context seam. tldraw is React-only.
2. **Filesystem seam** — 6 backends behind one interface. tldraw is IndexedDB-only.
3. **Append-only log** — lossless edit history. tldraw's history stack can be truncated.
4. **WADM + IIIF compliance** — standard formats. tldraw uses its own format.
5. **Streaming zip writer** — bounded-memory export. tldraw snapshots the whole store in memory.

### The architectural thesis both share

> **Author in a rich editor, ship a self-contained artifact that renders without the authoring tool.**

tldraw: author shapes on a canvas → export SVG/PNG/JSON.
Archie: author annotations on media → export `.archie.zip` + static HTML.

Both are "local-first, zero-account, produce-a-file" tools. The difference is tldraw's output is visual (a single image) while Archie's is narrative (a structured exhibit). That's the right difference — they solve different problems with the same architectural principles.
