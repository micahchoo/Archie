
## Phase-2 design decision (Micah, 2026-07-21)

**EXTEND THE FILESYSTEM SEAM** (declined the isTauri-branch-in-asset-store alternative). Binding
scope per review: exactly THREE capabilities — (1) a LAZY getFile() that never pre-materializes
(TauriFilesystem's must be reworked; FsaFilesystem's already is), (2) stat/size, (3) an OPTIONAL
`resolveUrl?()` capability for convertFileSrc that only the Tauri backend implements (others return
undefined) — no general path accessor forced onto memory/zip/http. Every new seam method gets a
conformance case across all 5 backends plus a lazy-getFile no-materialize proof test. Phase 1
already shipped the write half; the remaining seam work is the read side.
