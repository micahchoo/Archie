# Publish — Contracts

**Zoom Level 6** | **Subsystem: publish** | **Confidence: HIGH** | **Source: publish/*.ts, CONTEXT.md §87**

## Internal Contracts

### publishLibrary Output
```ts
interface PublishedLibrary {
  files: Map<string, string | Uint8Array>;
  brokenLinks: BrokenLink[];
}
```
- String values = JSON (manifests, annotation pages, collection)
- Uint8Array values = binary assets (images, audio, video)
- `brokenLinks` — `archie:` refs that failed resolution; surface in publish UI

### Zip Contract
- `libraryToZip(library, getLog, getAsset?)` → `{ zip: Uint8Array, brokenLinks }`
- `loadLibrary(zip: Uint8Array)` → `Library` — the symmetric inverse
- Round-trip: `loadLibrary(libraryToZip(library))` ≡ `library`

### GitHub Pages Contract
```ts
interface GitHubTarget {
  owner: string;
  repo: string;
  branch?: string;  // default: 'gh-pages'
  token: string;    // fine-grained PAT — Contents: write (push) + Pages: write (auto-enable)
}
```
- `publishToGitHub(files, target)` → `GitHubPublishResult` = `{ commitUrl, pagesUrl, pagesEnabled }`
  - **Error mapping:** every network step ok-checks; any non-2xx throws `GitHubPublishError` with an actionable cause (bad token / missing scope / repo not found), never a silent `undefined.sha`.
  - **Bounded uploads:** binary blobs upload with at most `BLOB_CONCURRENCY` (6) in flight — unbounded `Promise.all` trips GitHub's secondary rate limit on media-heavy libraries.
  - **Best-effort Pages enable:** after the push, attempts deploy-from-branch Pages. The commit has already landed, so a Pages failure (no Pages scope, org policy, private-repo entitlement) does NOT fail the publish — it returns `pagesEnabled: false` and the UI tells the author to enable Pages manually.
  - **`pagesUrl`** is project- vs user-site aware (`pagesUrlFor`): `{owner}.github.io` repo → root, else `/{repo}/`.
- Token NEVER persisted (paste-each-publish)
- FileContent: `{ text } | { base64 }` (binary assets = base64)

## Cross-Subsystem Contracts

### Publish ← Annotation Spine
- `getLog(exhibitId)` → `AnnotationRecord[]` — publish reads the log
- `recordToAnnotation(record)` → WADM Annotation — heads page projection
- `rewriteArchieLinks(md, {resolve,validate})` → `{ md, broken }` — link projection

### Publish ← Storage
- `getAsset(slug, name)` → `Uint8Array` — for asset inclusion in zip/GH Pages
- Canvas image URL rewritten: `source: "/assets/{name}"` → embedded in zip or base64 in GH Pages

### Publish → Viewer
- Published file tree over HTTP `fetch`:
  - `/{slug}/manifest.json` → exhibit metadata + objects
  - `/{slug}/canvas/{objId}/annotations.json` → per-object notes
  - `/collection.json` → IIIF Collection
  - `/exhibits.json` → Gallery data
- `objectsFromManifest(manifest)` recovers `{id, source, label}` from IIIF
- `canvasIdFor(slug, objId)` matches the published path structure

### Publish → Studio (Download)
- `libraryToZip` → Download `.archie.zip`
- `loadLibrary(zip)` → reconstruct Library from zip (Open .archie.zip)

## Link Projection (the source/projection split)
- **Canonical source:** `archie:` URI in markdown body (history sidecar)
- **Projection:** resolved display URL on heads page (at publish time)
- **Degradation:** pure WADM consumer sees plain text (DOMPurify strips unknown scheme `archie:`)
- **Repair:** cross-Library links store `{libraryId, logicalId}` → repairable via stored identity

## Knot Classification

| Crossing | Classification | Notes |
|----------|---------------|-------|
| publishLibrary → libraryToZip → ghpages | **Composite** | Sequential pipeline; each stage is independently testable |
| Link rewriting (site.ts) timing | **Prime** | Must run before sanitize, after heads projection |
| manifest canvasId ↔ published path | **Prime** | `canvasIdFor` must match the directory structure |
