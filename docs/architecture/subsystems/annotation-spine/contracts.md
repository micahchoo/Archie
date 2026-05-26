# Annotation Spine — Contracts

**Zoom Level 6** | **Subsystem: annotation-spine** | **Confidence: HIGH** | **Source: ADR-0003, spine source files, HANDOFF.md**

## Internal Contracts

### Log Record Shape
```ts
interface AnnotationRecord {
  logicalId: LogicalId;    // stable identity
  rev: RevId;              // per-version DAG node
  parent: RevId | null;    // DAG edge (null = first version)
  modifiedAt: number;      // wall-clock (tiebreaker only)
  lastEditor: ClientId;    // author
  body: Annotation;        // WADM Annotation
}
```

### Merge Contract
- `classifyMerge(log, otherLog, logicalId)` → `'fast-forward' | 'conflict' | 'no-change'`
- `resolveConflict(log, logicalId, resolution)` → new record with `mergeParents: [revA, revB]`
- Multi-parent merge nodes (Q-7) — DEFERRED to Phase 3 conflict-card UI

### Serialization Contract
- `toHeadsPage(log, canvasId)` → WADM `AnnotationPage` (current state, one head per logicalId normally)
- `toHistory(log, logicalId)` → WADM `AnnotationPage` (full version chain)
- `recordToAnnotation(record, opts?)` → WADM `Annotation` (withContext: false by default)
- **Three-tier interop:** pure WADM consumer sees exactly one head per logicalId; PROV-aware consumer sees `prov:wasRevisionOf` + `archie:hasHistory`; Archie viewer sees full DAG

### Persistence Contract
```ts
interface Filesystem {
  openDir(path: string): Promise<FsDirectory>;
}
interface FsDirectory {
  openFile(name: string): Promise<FsFile>;
  createFile(name: string): Promise<FsWritable>;
  removeEntry(name: string): Promise<void>;
  list(): Promise<string[]>;
}
```
- `writeAnnotations(fs, dir, log)` → writes `annotations/heads/{canvasId}.json` + `annotations/history/{logicalId}.json` + `annotations/history/index.json`
- `readAnnotations(fs, dir)` → reconstructs DAG from history sidecar, NOT heads

## Cross-Subsystem Contracts

### Spine → Rendering
- `projectHeads(log)` → `Annotation[]` consumed by mount layer as `setAnnotations(annotations)`
- `selectorBBox(selector)` → `Rect` consumed by mount for `fitBounds`
- `isDegenerateSelectorValue(value)` → boolean guard before Annotorious store injection

### Spine → Storage
- `writeAnnotations(fs, dir, log)` — spine calls storage seam
- `readAnnotations(fs, dir)` — storage provides filesystem, spine reconstructs

### Spine → Publish
- `publishLibrary(library, getLog)` — reads log through spine, projects to WADM/IIIF
- `rewriteArchieLinks` — link resolution runs on heads projection at publish time

### Spine → Studio
- `AnnotationSession` — live editor state wrapping the log
- `session.createNote(target, body)` → appendNew
- `session.editNote(logicalId, body)` → appendEdit
- `session.deleteNote(logicalId)` → appendDelete
- `session.importChanges(otherLog)` → mergeLogs + classifyMerge
- `session.conflicts()` → unresolved merge cards
- `session.resolveConflict(logicalId, resolution)` → resolve

## Knot Classification

| Crossing | Classification | Notes |
|----------|---------------|-------|
| log → serialize → heads | **Prime** (irreducible) | Core data flow; the source/projection pattern |
| merge ← serialize (citation IDs) | **Prime** | Q-6 collision disambiguation is load-bearing |
| serialize → persist (DAG metadata) | **Composite** (separable) | History sidecar is a serialization concern; could be separate format |

## Security Pins

- **Branded types** — `LogicalId`, `RevId`, `VersionId` are opaque branded types, not strings. Prevents ID confusion at the type level.
- **Citation immutability** — once a `VersionId` is minted, renumbering is REJECTED (breaks citation integrity). Q-6 `~{rev}` suffix disambiguates concurrent heads without renumbering.
- **History as source of truth** — `readAnnotations` reconstructs from history sidecar, not heads. Heads are a pure projection; the log is canonical.
