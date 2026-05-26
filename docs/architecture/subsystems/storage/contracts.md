# Storage — Contracts

**Zoom Level 6** | **Subsystem: storage** | **Confidence: HIGH** | **Source: fs/seam.ts, CONTEXT.md §78-79**

## Internal Contracts

### Filesystem Interface
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
interface FsFile {
  read(): Promise<Uint8Array>;
}
interface FsWritable {
  write(data: Uint8Array): Promise<void>;
  close(): Promise<void>;
}
```

### Storage Layout (OPFS)
```
{PROJECT}/
├── library.json                    — LibraryMeta (authored structure)
├── exhibits/
│   └── {slug}/
│       ├── annotations/
│       │   ├── heads/
│       │   │   └── {canvasId}.json  — per-canvas heads page
│       │   └── history/
│       │       ├── {logicalId}.json — per-note version chain
│       │       └── index.json       — logicalId→URL index
│       └── assets/
│           └── {name}              — imported media files (raw bytes)
```

### Three Persistence Configurations

| Config | Browser | Backend | User Model |
|--------|---------|---------|------------|
| **Chromium Project** | Chrome/Edge | `FsaFilesystem` (folder autosave) | "Project" (pick folder once) |
| **Non-Chromium Project** | Firefox/Safari | `DownloadFilesystem` (zip-as-canonical) | "Project" (Save/Open .archie.zip) |
| **Playground** | Any | Ephemeral OPFS | "Playground" (nothing saved) |

User sees ONLY "Playground" vs "Project" — browser capability never exposed (CONTEXT §116).

## Cross-Subsystem Contracts

### Storage ← Annotation Spine
- Spine calls `writeAnnotations(fs, exhibitDir, log)` — storage provides the fs
- Spine calls `readAnnotations(fs, exhibitDir)` — storage provides the fs
- Storage is a PASS-THROUGH seam; spine owns the serialization format

### Storage ← Studio
- `store.ts` uses raw OPFS for working state (NOT through the Filesystem interface)
- `saveAssetFile(slug, name, file)` — raw OPFS handles for binary blobs
- `readAssetUrl(slug, name)` — blob: URLs for display
- `readAssetBytes(slug, name)` — Uint8Array for publish
- `loadLibraryMeta()` / `saveLibraryMeta()` — library.json management

### Storage ← Publish
- `publishLibrary` takes a `getLog` function, not a filesystem
- `libraryToZip` produces zip bytes (ZipFilesystem internally)
- `loadLibrary(zip)` — ZipFilesystem.fromZip → reconstruct library

## Knot Classification

| Crossing | Classification | Notes |
|----------|---------------|-------|
| Seam interface vs backends | **Prime** | The interface IS the architectural pattern |
| Studio raw OPFS vs Filesystem interface | **Composite** | Studio bypasses the seam for binary blobs; could unify |
| ZipFilesystem read/write symmetry | **Prime** | `libraryToZip` ↔ `loadLibrary` round-trip is the publish primitive |

## Security Pins

- **Zip as canonical file** — non-Chromium projects: the zip IS the source of truth. OPFS is a working copy.
- **Binary bypass** — asset files use raw OPFS handles, not the JSON seam. Prevents base64 bloat in library.json.
