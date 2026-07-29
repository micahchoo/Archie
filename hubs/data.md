---
scope:
  - "packages/render-core/src/spine/**"
  - "packages/render-core/src/fs/**"
  - "packages/render-core/src/publish/**"
  - "packages/render-core/src/model/**"
  - "packages/render-core/src/session/**"
  - "packages/render-core/src/state/**"
updated: 2026-07-28
---
# data
> *How is knowledge stored, merged, and kept safe?*

`render-core` is the engine: an append-only per-note version DAG (`spine/`, ADR-0003) read/written
through one `Filesystem` seam with four backends — Memory/Zip/FSA/OPFS (`fs/`) plus Tauri
(path-based, `fs/tauri.ts`) — and published/opened through `publish/`. The one spec that matters is
`spine/MERGE-CONTRACT.md` (C1-C18, each pinned by a named test in `merge-contract.test.ts`); the one
gate that matters is that suite plus `fs/conformance.ts` run against every backend.

## Binding rules
- [[render-core-data-integrity]] — multi-file writes: content before index/marker; reads are
  per-item tolerant (corrupt ≠ empty, absent ≠ failed); every hand-mapped model field carries a
  compiler-guarded `carry.ts` sentinel — an unguarded new mapper is how a field silently stops
  copying.
- [[untrusted-archive-open-seam]] — `publish/open.ts` is the ONLY place `ZipFilesystem.fromZip` +
  `validateArchieMarker` compose; a second hand-rolled copy is how studio's `ingest-flows.ts` once
  shipped with marker validation skipped entirely.
- [[tauri-fs-seam]] — the Tauri backend must re-earn what browser handle APIs give free: atomic
  replace (temp-then-rename in `close()`) and name containment (`assertSafeName`, blocks `..`
  traversal) — both are desktop-only write-escape / torn-write risks a naive path-join port drops.
- [[bound-fetch-defaults]] — `fs/http.ts`'s ctor-defaulted `fetch` must be
  `globalThis.fetch.bind(globalThis)`; unbound, it throws `Illegal invocation` in every real browser
  and passes every Node vitest suite silently.
- [[perf-measure-the-flow]] — §3: the spine's hot path is per-EDIT; a whole-log op added to
  `createNote`/`editNote`/`notes()` is quadratic at scale and every gate here is a RATIO, never a
  ms threshold.

## Decisions
- Archie-69f9 — an OLDER published tree now MIGRATES on read (`migrate/tree.ts` + `migratingJsonSource`
  over the `JsonSource` seam), never rewritten in place; the marker gates accept `version <
  SCHEMA_VERSION` ONLY where the registry covers every step, so a gap is still a clean refusal /
  e0416f4. The remainder landed same-day: Archie-5c8d wired the hosted-tree reader
  (`apps/viewer/src/published.ts`) to the same seam / 857e1fa — every reader now migrates.
- Archie-01c9 — minimal signals layer (`state/`: atom/computed/transact, 322 code lines, tldraw-cited)
  ADOPTED per grill 2026-07-28; `workingAnnotations` is a computed over a revision atom, Δ 0.0KB in the
  embed's eager chunk, perf ratchet live 13/13; the learn-ledger's "transact batches recomputation"
  claim was wrong — laziness does that, transact batches the SUBSCRIBER tick (both pinned separately)
  / 90fa87a
- Archie-69a6 — RecordsDiff undo proven over the PROJECTION, never the log (`session/undo.ts`,
  `session.entries` byte-identical across undo/redo/bailToMark, O(1) per mutation); freecut's
  whole-projection snapshot disqualified by the merge model (resurrects an undone note, measured);
  known limit: undo does not survive save+reload — build ruled session-scoped per grill 2026-07-28
  / 1ce65c5, `docs/research/undo-feasibility.md`
- Archie-6b8e — note→section attribution is a 7th content field, dropped on tombstone (non-revivable
  by section un-delete, deliberate) / facb09c
- Archie-494c — spine stays append-only-DAG, not promoted to an op-log (decision gate, closed)
- Archie-d71c — collaboration signals: wire or remove (closed) — feeds MERGE-CONTRACT OQ-6
  (`projectHeads` hides delete-vs-edit conflicts; MergeReview must read `headsOf`)
- Archie-5a9b — Dublin Core metadata pipeline: model field + carry sentinels + lossless
  `archieMetadata` round-trip at Collection/Manifest/Canvas / 30c1356
- Archie-1cf0 — Zip64 writer: streaming zip's 4 GiB and 65,535-entry caps removed (bytes: c27aa95,
  entries: 56cf7c5)

## Evidence
- `ledgers/PERF-annotation-spine-2026-07-24.md` — per-edit cost was O(log): 20k records = 17.75ms
  (past the 16ms bar) for ONE edit; `HeadIndex` (incremental projection) makes it O(versions-of-note),
  23-314x measured (23x at small logs, 130x+ at 2k-20k). Save's `toZip` was the real freeze (5.7s at 272MB, not Open, which cost 155ms) —
  per-entry STORE-for-media fixed it to 0.6s (9x, end-to-end validated, not just micro-benched).
- `docs/state/CANON.md` — the untrusted-archive seam's canonicalization: zero remaining call sites of
  `ZipFilesystem.fromZip` outside `open.ts`; caps rescaled 2026-07-19 (`SRC_MAX_BYTES` 256MB→1GiB,
  `maxEntries` 50k→500k) after a legit 100-object library blew past the old ones.
- `packages/render-core/src/spine/MERGE-CONTRACT.md` — OQ-2 (rev-collision content mismatch is
  silently unchecked), OQ-3 (tombstone-primary resolution yields a live, body-less node), OQ-5
  (duplicate explicit `logicalId` forks an unguarded second root) are PINNED, not fixed — read before
  assuming any of the three can't happen.

## Open & hazards
- MERGE-CONTRACT OQ-2/3/5 above are load-bearing gaps, not oversights — a new caller that can inject
  duplicate revs or replay `logicalId`s (an importer) hits them for real.
- `docs/state/CANON.md`'s deferred `HttpFilesystem` (unifying zip-open and tree-over-HTTP marker-check
  into one 5th backend) was never built — `load.ts`'s tree-marker path stays a separate, unfolded
  validator per [[untrusted-archive-open-seam]]'s last bullet.
- Zip-open cap rescale is an accepted DoS tradeoff: a crafted `?src=` URL can now cost a tab ~4GiB
  before any guard fires (marker/ratio guards unchanged, only the ceiling moved).
