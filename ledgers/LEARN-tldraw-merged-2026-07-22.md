# tldraw → Archie: Architecture Lessons (Merged)

Analysis of tldraw v5.2.5 against Archie's render-core → render-mount → render-svelte stack. Static single-user only — no sync, workers, or multiplayer.

## The shared thesis

Both believe: **author in a rich editor, ship a self-contained file that renders without the authoring tool.** tldraw ships an SVG; Archie ships a `.archie.zip`. Same DNA, different output class.

## The stacks

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

tldraw is a canvas engine (renders everything). Archie is an annotation engine (delegates to OSD/Annotorious). The lessons are in tldraw's **software engineering patterns**, not its rendering choices.

---

## P1: Signals + Diff-Based Undo (do this next)

These two patterns solve the same root problem — moving state management from imperative to declarative. They compose: signals power derived state; diffs power undo on top of the immutable log.

### 1a. Framework-agnostic signals layer

**What tldraw does:** Built `@tldraw/state` — `atom`, `computed`, `react`, `transact` — with zero framework deps. `@tldraw/state-react` is a ~200-line bridge to React's `useSyncExternalStore`. The bridge is a separate package from the UI components.

**Archie's gap:** `AnnotationSession` manages state imperatively. `workingAnnotations()` rebuilds from scratch on every call — no caching, no dependency tracking, no batching. The spine projections (`projectHeads`, `headsByLogicalId`) are pure functions but must be manually called.

**What to build:**

```ts
// A minimal signals layer (<500 LOC) in @render/core:
const log = atom<AnnotationRecord[]>('log', [])
const heads = computed('heads', () => projectHeads(log.get()))
const byLogicalId = computed('byLogicalId', () => headsByLogicalId(heads.get()))

// Session wraps them:
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

Benefits:
- Derived state is declarative and auto-invalidated
- Batched edits (`transact`) — multiple appends → one recomputation
- Testable without Svelte — `heads.get()` in `vitest`
- The Svelte adapter becomes a thin subscriber, not a state manager

**When:** When `session.ts` exceeds ~500 LOC, or when batching/bulk operations become performance-relevant.

### 1b. Diff-based undo on top of the immutable log

**What tldraw does:** `HistoryManager` wraps the store, accumulates `RecordsDiff`s, and provides `undo()`/`redo()`/`mark()`/`bailToMark()`. `RecordsDiff` = `{ added: {}, updated: {}, removed: {} }` with `reverseRecordsDiff()` and `squashRecordDiffsMutable()`. Named marks let composite operations (e.g., "draw shape") count as one undo step.

**Archie's gap:** The append-only log IS the history — but there's no user-facing undo stack. Undoing would require replaying the log, which is expensive and doesn't map to "Ctrl+Z" semantics. No way to group multiple appends into one logical undo step.

**What to build:**

```ts
// A diff-based undo stack on top of the log:
class AnnotationUndoManager {
  #stack: RecordsDiff<AnnotationRecord>[] = []
  #marks: Map<string, number> = new Map()

  createNote(note: NewNote) {
    const record = session.appendNew(note) // log is still immutable
    this.#stack.push({ added: { [record.logicalId]: record }, updated: {}, removed: {} })
  }

  mark(id: string) { this.#marks.set(id, this.#stack.length) }
  
  undo() {
    const diff = this.#stack.pop()!
    // Apply reverse: re-add deleted, re-delete added, revert updated
    // This is a UI projection undo — the log retains the original
  }

  bailToMark(id: string) {
    // Undo everything since the mark — cancel an in-progress operation
  }
}
```

The key insight: **keep the log immutable (never lose data), but build a diff-based undo stack on top.** The log is the source of truth; the undo stack is a UI convenience at the projection layer.

**When:** When user-facing undo/redo is needed. The named-mark pattern makes it trivial to later add "cancel drawing" or "undo all changes since last save."

---

## P2: Manager Decomposition (do when session.ts grows)

**What tldraw does:** `Editor.ts` (11,805 lines) is a facade. The real work lives in ~15 managers — `SnapManager`, `HistoryManager`, `ClickManager`, `SpatialIndexManager`, `InputsManager`, `EdgeScrollManager`, `ScribbleManager`, `TickManager`, `TextManager`, `FontManager`, `ThemeManager`, `FocusManager`, `OverlayManager`. Each owns one concern, gets a reference to the Editor, and is independently testable.

**Archie's gap:** `AnnotationSession` (~300 LOC) handles create/edit/delete, working projection, persist, reload, merge, and conflict resolution. Still manageable, but the surface is growing (rich text bodies, audio annotation, map annotation, bulk operations).

**What to extract first:**

```ts
class AnnotationSession {
  readonly history = new AnnotationUndoManager(this)  // P1b
  readonly snap = new SnapManager(this)               // future: grid snapping
  readonly spatial = new SpatialManager(this)          // future: hit-testing
  // Session coordinates; managers own their domains
}
```

`HistoryManager` is the highest-value first extraction — it directly enables undo/redo (P1b) and is a clean seam to test against.

**When:** When `session.ts` exceeds ~800 LOC, or when a new concern (snapping, spatial queries) would otherwise bloat the class.

---

## P3: Embed Schema Version in Artifacts (before next schema change)

**What tldraw does:** Every `StoreSnapshot` includes `schema: SerializedSchema`. On load, `store.loadStoreSnapshot()` checks the schema version and runs migrations automatically. Old data loads in new code without the author re-exporting.

**Archie's gap:** The migration system (`migrate/`) works but doesn't embed a schema version in every `.archie.zip`. The `archie.json` marker identifies the archive as Archie's format but doesn't carry a version number.

**What to do:**

```json
// In archie.json, add:
{ "format": "archie", "version": 2 }
```

Then on load: `if (marker.version < currentVersion) runMigrations(marker.version)`.

**When:** Before the next schema-breaking change. This is a one-line addition to the marker + a loader check.

---

## P4: Geometry Objects with Behavior (future capability)

**What tldraw does:** Every shape's geometry is a `Geometry2d` subclass — a live computational object, not just data. `Rectangle2d`, `Circle2d`, `Polygon2d`, `Edge2d`, `Arc2d`, `CubicBezier2d`, `CubicSpline2d`, `Group2d`. Each supports `hitTestPoint`, `nearestPoint`, `distanceToPoint`, `intersectLineSegment`, `interpolateAlongEdge`. Hit-testing delegates to the cheapest algorithm for each shape.

**Archie's gap:** Archie delegates hit-testing and rendering to Annotorious. The geometry utilities are data-format-centric (parse WADM selectors, compute coverage). This is correct for rect+polygon but doesn't extend.

**When this matters:** If Archie adds custom annotation shapes beyond WADM selectors — map bounding boxes (`GeoAnchor` bbox/polygon), audio waveform regions, freehand drawing, ellipse annotations. Each new shape type should be a `Geometry2d` subclass with its own `hitTestPoint` and `nearestPoint`.

**Reference pattern:**

```ts
abstract class AnnotationGeometry {
  abstract hitTestPoint(x: number, y: number): boolean
  abstract nearestPoint(x: number, y: number): { x: number, y: number }
  abstract toSelector(): W3CSelector
  abstract bounds(): { x: number, y: number, w: number, h: number }
}

class RectGeometry extends AnnotationGeometry { /* bounding box check */ }
class PolygonGeometry extends AnnotationGeometry { /* winding number */ }
class GeoBBoxGeometry extends AnnotationGeometry { /* lat/lon in bbox */ }
```

**When:** When the 3rd annotation shape type is added. Two shapes (rect, polygon) don't justify the abstraction.

---

## P5: Self-Contained Artifact Export (future capability)

**What tldraw does:** The SVG/PNG export pipeline is brutally thorough about self-containment:

```ts
// exportToSvg pipeline:
// 1. Render to real DOM (for CSS cascade resolution)
// 2. StyleEmbedder — read every element's computed styles + pseudo-elements
// 3. FontEmbedder — find @font-face, download fonts, embed as base64
// 4. embedMedia — convert images to data URIs, videos to static frames
// 5. Inline everything into the SVG — zero external dependencies
```

**Archie's current approach:** `.archie.zip` with static HTML tree + IIIF manifests. Self-contained but multi-file. Already the right approach for interactive exhibits.

**When this matters:** If Archie ever needs a **single-file** export — an annotated image (canvas + annotations burned into one file) or a self-contained HTML page (all CSS/JS/fonts inlined). tldraw's StyleEmbedder is the reference for the "read computed styles from real DOM → inline" approach.

---

## What Archie already does better

1. **Custom element embed** — `<archie-viewer>` is framework-agnostic with Shadow DOM isolation. tldraw is React-only.
2. **Filesystem seam** — 6 backends behind one `FsDirectory` interface. tldraw is IndexedDB-only.
3. **Append-only log** — lossless edit history. tldraw's history stack can be truncated.
4. **WADM + IIIF compliance** — standard formats. tldraw uses proprietary schemas.
5. **Streaming zip writer** — bounded-memory export. tldraw snapshots the whole store in memory.
6. **Instance-context seam** — each `<archie-viewer>` owns its state; no module globals. tldraw relies on React lifecycle.

## Priority matrix

| When | What | Lines |
|------|------|-------|
| `session.ts` > 500 LOC | Signals layer — declarative derived state | ~500 |
| User-facing undo needed | Diff-based undo stack on top of log | ~400 |
| `session.ts` > 800 LOC | Manager decomposition (HistoryManager first) | refactor |
| Next schema change | Embed schema version in `archie.json` | ~20 |
| 3rd annotation shape type | Geometry objects with behavior | ~400 |
| Single-file export needed | Self-contained artifact pipeline (StyleEmbedder) | ~800 |

None are urgent. The annotation spine is already a solid foundation. Adopt incrementally.
