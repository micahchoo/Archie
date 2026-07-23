# tldraw → Archie: Architecture Lessons (static, single-user)

Analysis of tldraw v5.2.5 (`packages/editor`, `packages/store`, `packages/state`, `packages/tlschema`) against Archie's render-core → render-mount → render-svelte stack. Focus: static single-user architecture only — sync, workers, multiplayer excluded.

## The Two Stacks Side by Side

```
tldraw (static)                    Archie
─────────────────────────          ──────────────────────
@tldraw/state     (signals)        ── (Svelte 5 runes, no custom signals)
@tldraw/store     (records+diffs)  ── (AnnotationSession, ad-hoc state)
@tldraw/tlschema  (type system)    @render/core/wadm   (WADM types)
@tldraw/editor    (engine)         @render/core/spine   (log→DAG→heads)
@tldraw/tldraw    (React SDK)      @render/mount        (OSD+Annotorious)
                                   @render/svelte       (thin Svelte adapter)
                                   @render/archie-viewer (custom element)
```

Key difference: tldraw is a **canvas engine** (renders everything itself), Archie is an **annotation engine** (delegates rendering to OSD/Annotorious). This means Archie doesn't need tldraw's rendering lessons — it needs tldraw's *software engineering* lessons.

---

## Lesson 1: Framework-Agnostic Signals Layer

### What tldraw does

tldraw built its own reactivity system (`@tldraw/state`) with zero framework dependencies:

```ts
// @tldraw/state — no React, no DOM
import { atom, computed, react, transact } from '@tldraw/state'

const count = atom('count', 0)
const doubled = computed('doubled', () => count.get() * 2)

// Framework-agnostic: test without React
react('log', () => console.log(doubled.get()))
count.set(5) // triggers reaction
```

Key properties:
- `atom` — mutable signal with `.get()`/`.set()`/`.update()`, dependency tracking, optional diff history
- `computed` — lazy, memoized derivation; only recomputes when dependencies change
- `react`/`reactor` — side-effect that runs when dependencies change
- `transact` — batched updates (multiple `.set()` calls → one recomputation)
- `unsafe__withoutCapture` — read without subscribing (for fire-and-forget access)
- Global epoch for change detection, `HistoryBuffer` for diff tracking

### Why it matters for Archie

Archie's render-core is already framework-agnostic (ADR-0002), but Session.ts manages state imperatively:

```ts
// Archie: AnnotationSession.workingAnnotations() — recomputed on every call
// No caching, no dependency tracking, no batching
```

Adding a signals layer would:
- **Make spine projections testable without Svelte** — `projectHeads()` returns a `computed`, tests read `.get()`
- **Enable batched edits** — multiple `appendEdit()` calls in one `transact()` → one recomputation
- **Decouple rendering from computation** — the Svelte adapter subscribes to signals; the core never imports Svelte

### Concrete Archie application

```ts
// A hypothetical @render/signals that render-core could use:
const log = atom('log', [] as AnnotationRecord[])
const heads = computed('heads', () => projectHeads(log.get()))
const byLogicalId = computed('byLogicalId', () => headsByLogicalId(heads.get()))

// Session wraps these:
class AnnotationSession {
  #log = atom<AnnotationRecord[]>('log', [])
  #heads = computed('heads', () => projectHeads(this.#log.get()))

  createNote(note: NewNote) {
    transact(() => {
      this.#log.update(log => [...log, appendNew(log, note)])
    })
  }
}
```

**Cost/benefit**: ~500 lines of signals code, but replaces ad-hoc caching and enables testability. Worth it if Archie's session grows beyond current complexity.

---

## Lesson 2: Record Store with Diffs

### What tldraw does

`@tldraw/store` provides a typed record store with:

```ts
// Records are typed, validated, and diffed
const bookType = createRecordType<Book>('book', { /* schema */ })
const store = new Store({ schema: new StoreSchema({ book: bookType }) })

// Every mutation produces a RecordsDiff:
store.put([book]) // → { added: { 'book:1': book }, updated: {}, removed: {} }
store.remove(['book:1']) // → { added: {}, updated: {}, removed: { 'book:1': book } }

// Undo/redo built on RecordsDiff:
store.listen((entry: HistoryEntry) => {
  // entry.changes = RecordsDiff — can reverse it
  undoStack.push(entry.changes)
})

// Computed indexes over the store:
const booksByAuthor = store.query.index('author', (book) => [book.author])
```

Key properties:
- `RecordType` — typed record definition with validation
- `RecordsDiff` — `{ added, updated, removed }` with `squashRecordDiffs()` and `reverseRecordsDiff()`
- `StoreSideEffects` — lifecycle hooks (beforeCreate, afterCreate, beforeChange, etc.)
- `StoreQueries` — indexed queries with incremental diff-based updates
- `ComputedCache` — memoized per-record computations, auto-invalidated on change
- `StoreSchema` — validates records on write, supports migrations

### Why it matters for Archie

Archie's annotation log is already an append-only log — a good foundation. But the "store" around it is ad-hoc:

- `Session.workingAnnotations()` rebuilds the working surface from scratch on every call — no fine-grained invalidation
- No formal undo/redo — the log IS the undo history, but there's no user-facing undo stack
- No record validation at write time — validation happens at serialization boundaries
- No typed indexes — filtering by reading/section requires full scans

### Concrete Archie application

```ts
// A Store-like layer over the annotation log:
const annotationType = createRecordType<AnnotationRecord>('annotation', {
  validate: (r) => { /* verify logicalId, rev, client, etc. */ }
})

class AnnotationStore {
  #store = new Store({ schema: new StoreSchema({ annotation: annotationType }) })

  // Index by logicalId for O(1) lookup:
  #byLogicalId = this.#store.query.index('logicalId', (r) => [r.logicalId])

  // React to changes for persistence:
  #sideEffects = new StoreSideEffects({
    afterChange: (prev, next) => this.#markDirty(next.logicalId)
  })

  append(note: NewNote): AnnotationRecord {
    return this.#store.put([record])
  }
}
```

**Cost/benefit**: Higher — a full store is ~1000 lines. But incremental adoption is possible: start with `RecordsDiff` as the undo primitive, add `StoreQueries` for indexes later.

---

## Lesson 3: ShapeUtil Plugin Architecture

### What tldraw does

Every shape in tldraw is defined by a `ShapeUtil` subclass:

```ts
abstract class ShapeUtil<Shape extends TLShape> {
  static type: string                    // 'rectangle', 'arrow', 'embed', ...
  static props?: RecordProps<TLUnknownShape>  // validated prop schema

  abstract getDefaultProps(): Shape['props']
  abstract getGeometry(shape: Shape): Geometry2d    // for hit-testing, snapping, export
  abstract component(shape: Shape): JSX.Element     // React render
  abstract getIndicatorPath(shape: Shape): Path2D   // selection indicator
  onResize?(shape: Shape, info: TLResizeInfo): Shape
  onDoubleClick?(shape: Shape): void
  canBind?(opts: TLShapeUtilCanBindOpts): boolean
  // ...15 more optional hooks
}
```

Shapes are registered via constructor array:

```ts
new Editor({
  shapeUtils: [RectangleShapeUtil, ArrowShapeUtil, EmbedShapeUtil, ...],
  tools: [SelectTool, DrawTool, EraserTool, ...],
})
```

Base classes provide shared behavior: `BaseBoxShapeUtil` adds `w`/`h` props, resize logic, and geometry for any box-shaped primitive.

### Why it matters for Archie

Archie's annotation shapes are currently hardcoded to WADM `FragmentSelector` (rect) and `SvgSelector` (polygon) — the v1 shape vocab:

```ts
// From wadm/types.ts:
// "FragmentSelector (rect) + SvgSelector (polygon) only —
//  the two that round-trip losslessly through stock W3CImageFormat"
```

If Archie ever wants to support ellipse, path, freehand drawing, audio region markers, or map polygons, a `ShapeUtil`-like pattern would make each shape a self-contained module:

```ts
abstract class AnnotationShapeUtil {
  static type: string
  abstract toSelector(shape: Props): W3CSelector
  abstract fromSelector(sel: W3CSelector): Props
  abstract getGeometry(props: Props): Geometry
  abstract renderIndicator(props: Props): Path2D  // for the annotation overlay
}
```

### Concrete Archie application

Not urgent — Archie's two shapes (rect + polygon) are simple enough that a plugin system would be over-engineering today. But the pattern is worth knowing if the shape vocabulary expands.

---

## Lesson 4: Manager Decomposition

### What tldraw does

`Editor.ts` is 342KB / 11,805 lines — but only because it's a facade. The real work is in ~15 managers:

```
Editor delegates to:
├── SnapManager          (snapping behavior)
├── HistoryManager       (undo/redo over RecordsDiff)
├── ClickManager         (click vs double-click disambiguation)
├── SpatialIndexManager  (rbush R-tree for hit-testing)
├── InputsManager        (pointer/keyboard event routing)
├── EdgeScrollManager    (auto-scroll on drag near edges)
├── ScribbleManager      (freehand drawing preview)
├── TickManager          (animation frame loop)
├── TextManager          (rich text editing via TipTap)
├── FontManager          (font loading)
├── ThemeManager         (color/theming)
├── FocusManager         (focus/blur)
├── CollaboratorsManager (presence — not relevant for static)
├── OverlayManager       (selection handles, resize corners)
└── PerformanceManager   (performance tracking)
```

Each manager owns ONE concern, gets a reference to the Editor, and is independently testable.

### Why it matters for Archie

Archie's `AnnotationSession` (session.ts, ~300 lines) currently handles: create/edit/delete, working projection, persist, reload, merge, conflict resolution. It's still manageable, but as features are added (rich text bodies, audio annotation, map annotation, bulk operations), it will grow.

The manager pattern keeps the main class as a thin dispatcher:

```ts
class AnnotationSession {
  readonly snap = new SnapManager(this)       // future: grid snapping
  readonly history = new HistoryManager(this)  // undo/redo
  readonly spatial = new SpatialManager(this)  // hit-testing (future)
  // ...only the coordination lives in Session
}
```

### Concrete Archie application

Start with extracting `HistoryManager` from the existing append-only log — it's the highest-value decomposition. Then add managers as needed rather than pre-building them.

---

## Lesson 5: StoreQueries + ComputedCache

### What tldraw does

`StoreQueries` provides index-based queries that update incrementally on store changes:

```ts
const shapesByType = store.query.index('type', (shape) => [shape.type])
// Returns { rectangle: Set<Shape>, arrow: Set<Shape>, ... }
// Only updates when shapes are added/removed/changed type
```

`ComputedCache` memoizes per-record computations:

```ts
const geometryCache = store.createComputedCache('geometry', (shape) => {
  return shapeUtil.getGeometry(shape) // expensive!
})
geometryCache.get('shape:123') // cached until shape changes
```

### Why it matters for Archie

Archie's current filtering (by reading, by section, by tag) requires full scans. An index system would make these O(1):

```ts
const byReading = store.query.index('reading', (record) => [record.reading ?? 'base'])
const bySection = store.query.index('section', (record) => [record.section ?? 'none'])

// Incremental: only recomputes when records change
const readingNotes = byReading.get('primary-reading')
```

### Concrete Archie application

This is a layer on top of the store (Lesson 2). Not a standalone lesson — it's the motivation for adopting the store pattern.

---

## Lesson 6: Migration Sequences

### What tldraw does

`@tldraw/store` has a formal migration system:

```ts
const migrations = createMigrationSequence({
  sequenceId: 'book-schema',
  retroactive: false,
  sequence: [
    { id: 'add-pages', scope: 'record', up: (record) => ({ ...record, pages: record.pages ?? 0 }) },
    { id: 'rename-author', scope: 'record', up: (record) => {
      const { author, ...rest } = record
      return { ...rest, writtenBy: author }
    }},
  ]
})
```

Each migration has: an ID, a scope (record/store), an `up` function, and optional `dependsOn`. Migrations run in sequence, and the store tracks which migrations have been applied.

### Why it matters for Archie

Archie has `migrate/migrate.ts` and `migrate/object-ids.ts` for object-ID rewriting, but it's ad-hoc. A formal migration system would:

- Track which schema version each log entry was written with
- Apply migrations on load, not on write
- Enable forward compatibility (old data loads in new code)

### Concrete Archie application

The annotation spine already has a version field (`archie:version`). A migration sequence would formalize what happens when the schema changes:

```ts
const annotationMigrations = createMigrationSequence({
  sequence: [
    migrateLayersToTags(),    // ADR-0007
    migrateObjectIds(),       // Archie-8c10
    migrateEmphasisDefault(), // future: if emphasis gains a new value
  ]
})
```

---

## What NOT to Learn

Equally important: what tldraw does that Archie should NOT adopt.

### Don't: Custom Canvas Rendering

tldraw renders shapes as DOM elements (React components) because it needs full control over infinite canvas interactions. Archie gets deep-zoom (DZI tiling) and annotation drawing from OpenSeadragon + Annotorious — swapping to custom rendering would be thousands of lines for no gain.

### Don't: Custom Rich Text

tldraw integrates ProseMirror/TipTap for in-shape rich text editing. Archie uses `snarkdown` and `isomorphic-dompurify` for Markdown → safe HTML — sufficient for annotation bodies.

### Don't: IndexedDB (for Archie's use case)

tldraw uses `idb` for local persistence. Archie's filesystem seam (memory/zip/fsa/tauri/http) is more flexible and already tested.

### Don't: React/JSX

tldraw is deeply coupled to React. Archie's Svelte 5 + custom element approach is more appropriate for an embeddable viewer.

---

## Summary: Priority-Ordered Recommendations

| Priority | Lesson | Cost | Impact | When |
|----------|--------|------|--------|------|
| **P1** | Signals layer (framework-agnostic reactivity) | ~500 LOC | Testability, batching, decoupling | When session.ts exceeds ~500 lines or batching becomes needed |
| **P2** | Record store + diffs (undo/redo foundation) | ~1000 LOC | Typed state, undo stack, validation | When user-facing undo/redo is needed |
| **P3** | Manager decomposition | Refactor | Maintainability | When session.ts exceeds ~800 lines |
| **P4** | Migration sequences | ~300 LOC | Data safety | Before next schema-breaking change |
| **P5** | ShapeUtil plugin | ~400 LOC | Extensibility | When 3+ annotation shapes exist |
| **P6** | StoreQueries + indexes | ~500 LOC | Query performance | When filtering by reading/section becomes a bottleneck |

None of these are urgent for Archie as it stands today. The annotation spine (append-only log → version DAG → heads) is already a solid foundation. These lessons are architectural patterns to adopt **incrementally** as the codebase grows — not a rewrite agenda.
