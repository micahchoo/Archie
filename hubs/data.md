---
paths:
  - "packages/render-core/src/spine/**"
  - "packages/render-core/src/fs/**"
  - "packages/render-core/src/publish/**"
  - "packages/render-core/src/model/**"
  - "packages/render-core/src/session/**"
  - "packages/render-core/src/state/**"
updated: 2026-09-05
---
# data
> *How is knowledge stored, merged, and kept safe?*

The shared core stores append-only annotation history behind the Filesystem interface.
The merge contract is `packages/render-core/src/spine/MERGE-CONTRACT.md`, with executable coverage in its neighboring tests.

## Current guidance

- Use the shared history codec and classified read helpers. Corrupt data, missing data, and failed reads require different recovery decisions.
- Save snapshots retain edits made during a write. Failed writes restore the pending dirty IDs for retry.
- Writable adapters append successive chunks consistently. Multi-file saves still need explicit ordering.
- Undo changes the session projection without rewriting history. It does not survive reopening as an undo stack.
- `packages/render-core/src/publish/open.ts` owns archive decoding and marker validation.
- Tree readers share the marker policy and migration registry. Older formats migrate on read without rewriting the source.
- MERGE-CONTRACT OQ-2, OQ-3, and OQ-5 document known edge cases. Read them before adding importers or alternate history writers.

## Binding rules

- [[render-core-data-integrity]] — preserve ordering, classified recovery, and compiler-checked field carry.
- [[untrusted-archive-open-seam]] — reuse the archive validation composition.
- [[tauri-fs-seam]] — preserve atomic replacement and safe names.
- [[bound-fetch-defaults]] — bind browser fetch defaults.
- [[perf-measure-the-flow]] — measure per-edit cost and full workflows separately.

## Verification and evidence

- `packages/render-core/src/fs/conformance.ts` checks backend behavior. Native atomic-write tests cover additional guarantees.
- Review 2026-09-05 → Save races, corrupt adoption, and mixed writable chunks pass regression checks. Evidence: `ledgers/IMPLEMENT-review-2026-09-05.md`.
- `ledgers/DESIGN-review-modules-2026-09-05.md` records codec, save, and undo contracts.

Earlier decisions and measurements: [archived hub](../ledgers/DOCS-hubs-before-2026-09-05.md#data).
