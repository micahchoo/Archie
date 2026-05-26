# Annotation Spine — Components

**Zoom Level 5** | **Subsystem: annotation-spine** | **Confidence: HIGH** | **Source: HANDOFF.md, ADR-0003, understand-anything knowledge graph**

## Component Map

```
packages/render-core/src/
├── wadm/
│   ├── brand.ts          — Branded IDs (LogicalId, RevId, VersionId, ClientId, ExhibitId)
│   └── types.ts          — WADM structural types (local, NOT from Annotorious)
├── spine/
│   ├── log.ts            — Append-only annotation log
│   ├── merge.ts          — Version-DAG merge (lineage, ancestors, commonAncestor, headsOf)
│   ├── heads.ts          — Heads projection (pure, idempotent)
│   ├── serialize.ts      — WADM serialization (toHeadsPage, toHistory, recordToAnnotation)
│   ├── persist.ts        — writeAnnotations / readAnnotations over Filesystem seam
│   └── session.ts        — AnnotationSession (live editor state)
├── geometry/
│   └── selector.ts       — Fragment selector parsing, polygon bbox, shape labels
├── link/
│   └── link.ts           — Intra-Library structured link refs (encodeLinkRef, rewriteArchieLinks)
└── av/
    └── transcript.ts     — WebVTT/SRT → WADM supplementing notes
```

## Key Components

### Branded IDs (`wadm/brand.ts`)
- **LogicalId** — stable identity across versions (ULID)
- **RevId** — per-version DAG node id (ULID, distinct from LogicalId — ADR-0003 amendment)
- **VersionId** — `{logicalId}/v{n}` citation IRI (static-host-friendly path)
- **ClientId** — author identity for merge
- **ExhibitId** — exhibit-scoped identity
- Functions: `mintLogicalId`, `mintRevId`, `versionId`, `parseVersionId`

### Append-Only Log (`spine/log.ts`)
- `append(log, record)` — add to log
- `appendNew` / `appendEdit` / `appendDelete` — typed helpers
- Single-writer invariants enforced in helpers; log type tolerates plural-head collisions
- Each record carries `{logicalId, rev, parent, modifiedAt, lastEditor}`

### Version-DAG Merge (`spine/merge.ts`)
- `lineage(log, rev)` — walk parent chain
- `ancestors(log, rev)` — full ancestor set
- `commonAncestor(log, a, b)` — merge base
- `headsOf(log)` — current heads per logicalId
- `mergeLogs(a, b)` — combine two logs
- `classifyMerge` — fast-forward vs. conflict per logicalId
- `conflictTiebreak` — wall-clock `modifiedAt` as in-card tiebreaker ONLY (clock skew → not LWW)

### Heads Projection (`spine/heads.ts`)
- `projectHeads(log)` — pure, idempotent; plural heads for unresolved merges; tombstone exclusion
- Three-tier interop: pure WADM consumer → current state; PROV-aware → history; Archie → full DAG

### WADM Serialization (`spine/serialize.ts`)
- `toHeadsPage` — per-canvas AnnotationPage with head version(s)
- `toHistory` — full version chain per logicalId
- `recordToAnnotation` — WADM Annotation from log record
- `citationIds` — Q-6 collision disambiguation (`~{rev}` suffix)
- `@context` is page-level only, never on per-item annotations

### Persistence (`spine/persist.ts`)
- `writeAnnotations(fs, dir, log)` — serialize heads + history to filesystem
- `readAnnotations(fs, dir)` — deserialize, reconstruct DAG from history sidecar (NOT heads — heads are projection)
- History carries `archie:` DAG metadata for reload/merge

### Geometry (`geometry/selector.ts`)
- `parseFragmentXYWH` / `parsePolygonPoints` — WADM FragmentSelector parsing
- `polygonBBox` / `selectorBBox` — bounding box computation
- `isDegenerateSelectorValue` — degenerate guard (lifted from anvil)
- `shapeLabel` / `isV1Shape` — rect + polygon only in v1 (ADR shape vocabulary)

### Linkability (`link/link.ts`)
- `encodeLinkRef(target)` → `archie:` URI in note body (canonical source)
- `parseLinkRef(uri)` → structured target
- `rewriteArchieLinks(md, {resolve,validate})` → resolved display URLs + broken refs
- Rewrite runs on heads-page PROJECTION at publish, NOT on history sidecar

### Transcript Import (`av/transcript.ts`)
- `parseVtt` / `parseSrt` → cue arrays
- `importTranscript` → WADM notes with `motivation: supplementing`, `FragmentSelector t=start,end`

## Quality Signals

| Metric | Value |
|--------|-------|
| Tests | 209 (core) |
| TypeScript | Strict, branded types throughout |
| Pure functions | All spine logic is pure TS (no DOM, no I/O) |
| Tech debt | Zero markers |
