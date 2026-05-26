# Storage — Components

**Zoom Level 5** | **Subsystem: storage** | **Confidence: HIGH** | **Source: fs/seam.ts, fs/*.ts, HANDOFF.md**

## Component Map

```
packages/render-core/src/fs/
├── seam.ts         — Filesystem interface (FsDirectory, FsFile, FsWritable)
├── memory.ts       — MemoryFilesystem (tests + publish in-memory projection)
├── zip.ts          — ZipFilesystem (fflate-based, import/export)
├── fsa.ts          — FsaFilesystem (Chromium File System Access API, DOM-typed)
└── conformance.ts  — Conformance suite run against Memory + Zip
```

## Key Components

### Filesystem Seam (`fs/seam.ts`)
- `Filesystem` — top-level: `openDir(path) → FsDirectory`
- `FsDirectory` — `openFile`, `createFile`, `removeEntry`, `list`
- `FsFile` — `read()` → Uint8Array
- `FsWritable` — `write(data: Uint8Array)`, `close()`
- Pure interface — no backends in this file

### MemoryFilesystem (`fs/memory.ts`)
- In-memory implementation for tests and publish projections
- `MemDir`, `MemFile` classes

### ZipFilesystem (`fs/zip.ts`)
- fflate-based zip read/write
- `ZipFilesystem.fromZip(zipBytes)` — load a published zip
- `libraryToZip(library)` + `loadLibrary(zip)` — round-trip symmetry
- `ZipFile`, `ZipDir` — read-only zip entries; writable for export
- **Empty-dir divergence** caught + fixed by conformance suite

### FsaFilesystem (`fs/fsa.ts`)
- Chromium File System Access API (DOM-typed)
- `FsaDir`, `FsaFile`, `FsaFilesystem` classes
- Folder-autosave: power users "link to a folder" for git-native, visible copy
- Typechecked against DOM FSA types

### Conformance Suite (`fs/conformance.ts`)
- `runConformance(fs)` — identical test battery against any backend
- Run against Memory + Zip (caught empty-dir bug)
- FSA conformance = browser-only (DOM API)

## Quality Signals

| Metric | Value |
|--------|-------|
| Backends | 3 (Memory, Zip, FSA) |
| Conformance | Memory + Zip verified; FSA = browser |
| Key bug caught | Empty-dir divergence (Memory vs Zip) |
