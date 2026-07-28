---
updated: 2026-07-28
---
# field-studio
> *Does field-studio have a real, lift-able OPFS storage layer?*

Verified 2026-07-28 against `field-studio/` on disk (survey: `docs/research/prior-art/06-authoring-cms.md`).
Note: this repo's own `node_modules/@annotorious/annotorious` vendored copy is a **separate**,
independently verified finding — see [[annotorious]].

## Verified claims (line-cited)
- `src/shared/services/opfsStorage.ts:18-101` `OPFSStorage` — a real class wrapping
  `navigator.storage.getDirectory()`: `isSupported()` (`:21-23`) feature-detects before touching the
  API; `initialize()` (`:25-35`) acquires the root + an `originals` subdirectory, catches and reports
  failure rather than throwing, and flips a `_ready` flag. Confirms the survey's "PURE OPFS store"
  claim as a genuine, defensively-written wrapper.

## Stated absences
- The survey also credits field-studio with an EXIF-ingest stub (axis 14) — not independently
  re-verified in this pass; treat that half as survey-grade only until someone opens the file.

## What citations of it may NOT support
- Only the storage-layer claim above was re-verified here. Don't extend "verified" to the rest of
  field-studio's authoring-CMS surface (Vault/manifest-editor comparisons) from this page alone.
