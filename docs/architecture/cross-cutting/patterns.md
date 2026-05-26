# Cross-Cutting Patterns — Archie

**Synthesis** | **Confidence: HIGH** | **Source: all subsystem docs, CONTEXT.md, ADRs, HANDOFF.md**

## 1. Source-of-Truth / Thin Projection

**The architectural spine.** Every major boundary resolves to one authoritative source + thin derived projection.

| Boundary | Source | Projection | LOC Budget |
|----------|--------|------------|------------|
| Rendering | `@render/core` (pure TS) | Per-framework adapters | <500 |
| Storage | Filesystem seam interface | OPFS / FSA / Zip backends | ~50 each |
| Annotations | Append-only log | Heads page + history sidecar | Pure function |
| Merge | Version-parent DAG | Conflict-card view | Computed merge-base |
| Publish | The zip | Per-host adapters | ~200 |
| Links | `archie:` URI in body | Resolved display URL at publish | Pure function |
| Deep-zoom | Source image | Tile pyramid | Build step (v1.1) |

This pattern recurs at every boundary. A change that violates it — adding a second source of truth, or fattening a projection — is an architectural regression.

## 2. Three-Tier Interop Degradation

Every Archie-specific feature degrades gracefully for pure W3C/PROV consumers:

| Feature | Archie Viewer | PROV-aware Consumer | Pure WADM Consumer |
|---------|---------------|---------------------|--------------------|
| Version history | Full DAG | `prov:wasRevisionOf` chain | Current state only |
| Plural heads | Both overlays | Both visible | Honest degradation |
| Layers | Filtered view | `archie:layers` extension | All notes shown |
| Intra-Library links | Resolved URLs | `archie:` URI (stripped href) | Plain text |
| Exhibit index | Gallery UI | `exhibits.json` (nonstandard) | IIIF Collection |

No tier is broken by the existence of a richer tier above it.

## 3. Log → Heads → History: The Annotation Spine

One pattern at three boundaries:

```
Append-only log (canonical)
  ├→ Heads projection (what viewers load)
  └→ History sidecar (citation + merge source)
```

- **Log:** append-only, version-DAG edges (`parent` → `rev`)
- **Heads:** pure idempotent projection, one head per logicalId (normally), plural after unresolved merge
- **History:** full version chain, `archie:` DAG metadata — the source `readAnnotations` reconstructs from
- **Compile step:** "compile heads page" is a pure idempotent function of the log

## 4. Browser Capability Hiding

The user sees "Playground" vs "Project." Never OPFS, FSA, or zip-as-canonical-file.

| User Model | Chromium | Non-Chromium |
|-----------|----------|--------------|
| **Playground** | Ephemeral OPFS | Ephemeral OPFS |
| **Project** | FSA folder (autosave) | DownloadFilesystem (zip-as-file) |

The seam handles capability detection internally. The UI only exposes the two mental models.

## 5. Svelte 5 Runes Discipline

- `$state` for reactive local state
- `$effect` for side effects — MUST read reactive deps BEFORE short-circuiting guard
- `$derived` for computed values
- `{#key}` for forced remount (object switching, OSD reload)
- `bind:value` over `value` + `oninput` with `as` cast (Svelte template parser limitation)

**Anti-pattern:** `surface?.setDrawingEnabled(drawing)` — optional-chain short-circuits BEFORE subscribing to `drawing`. Fix: `const d = drawing; if (surface) surface.setDrawingEnabled(d)`.

## 6. TDD with Headless Gates

- Logic tested headless (pure TS) — 209 core tests
- DOM-dependent layers tested with happy-dom — 18 mount + 18 svelte tests
- Browser-only verification for visual/perceptual features (OSD render, marker styling)
- Conformance suite for backend implementations (Memory + Zip verified; FSA = browser)

## 7. Shape Vocabulary Discipline

v1 shapes: **rect + polygon only.** The two that round-trip losslessly through stock `W3CImageFormat`. Ellipse/freehand deferred to v1.1 behind a custom svgpath module. This is a security boundary (sanitize unknown selector types), not just a feature gate.

## 8. Identity Model

- **LogicalId:** stable across versions (ULID)
- **RevId:** per-version DAG node (ULID)
- **VersionId:** `{logicalId}/v{n}` citation IRI
- **Branded types:** opaque, not strings — prevents ID confusion at type level
- **Key rule:** never key UI by `logicalId` (plural heads share it). Key by `rev` (unique per version).
