# Publish — Components

**Zoom Level 5** | **Subsystem: publish** | **Confidence: HIGH** | **Source: publish/*.ts, HANDOFF.md, CONTEXT.md §87**

## Component Map

```
packages/render-core/src/publish/
├── library.ts    — publishLibrary: log → IIIF/WADM static tree
├── site.ts       — Heads-page projection with link rewriting
├── toZip.ts      — libraryToZip: the architectural zip primitive
├── ghpages.ts    — GitHub Pages adapter (Contents API)
└── iiif/
    ├── manifest.ts   — toManifest, objectsFromManifest
    ├── collection.ts — toCollection
    ├── iiif.ts       — toExhibitsJson, shouldRenderGallery
    └── model.ts      — IIIF structural types
```

## Key Components

### publishLibrary (`publish/library.ts`)
- `publishLibrary(library, getLog)` → `{ files, brokenLinks }`
- Projects the append-only log into static IIIF/WADM files
- Per-exhibit: `manifest.json` + per-canvas `annotations.json` (heads page)
- `collection.json` at root (IIIF Collection of all exhibits)
- `exhibits.json` — the multi-exhibit index projection (Gallery data source)
- `brokenLinks` — intra-Library refs that couldn't resolve

### site.ts
- `headsPageFromRecords` — applies link rewriting BEFORE WADM serialization
- Link rewrite: `archie:` URI → resolved display URL on heads page projection
- History sidecar is NOT rewritten (it's canonical source)

### libraryToZip (`publish/toZip.ts`)
- `libraryToZip(library, getLog, getAsset?)` → `{ zip, brokenLinks }`
- The architectural primitive — every publish path goes through a zip
- Includes asset files (imported media) rewritten to `{slug}/assets/{name}`

### ghpages.ts
- `collectFiles(library, getLog, getAsset?)` → `FileContent[]`
- `buildGitTree(files)` → git tree SHA (pure, tested)
- `publishToGitHub(files, target)` → commit SHA + Pages URL (browser, fetch-based)
- Binary-aware: base64-encodes image/av/pdf; JSON as text
- Target: `{owner}/{repo}`, branch (default `gh-pages`), fine-grained PAT

## Publish Flow
```
library + getLog
  → publishLibrary → {files: Map<path, content>, brokenLinks}
  → libraryToZip → {zip: Uint8Array, brokenLinks}    [Download]
  → collectFiles → FileContent[] → buildGitTree → publishToGitHub  [GH Pages]
```

## Quality Signals

| Metric | Value |
|--------|-------|
| Core publish tests | 6 (site) + 3 (ghpages) |
| Zip round-trip | Proven via loadLibrary |
| GH Pages | Logic tested; actual push = browser-verify (needs real repo + PAT) |
