---
scope:
  - "packages/render-core/src/publish/**"
  - "apps/studio/src/dzi-*.ts"
  - "apps/studio/src/bake-*.ts"
  - "apps/viewer/scripts/gen-published.mts"
  - "scripts/perf/publish*"
  - "scripts/perf/worker-smoke.mjs"
  - ".github/workflows/deploy.yml"
updated: 2026-07-27
---
# publishing
> *How does authored become published?*

`publishLibrary` (`packages/render-core/src/publish/site.ts:312`) is the ONE function that turns a
`Library` + log into a tree: collection.json/exhibits.json first, `archie.json` marker LAST as the
commit point (ADR-0020, generation hash keys viewer cache-busting). `apps/viewer/scripts/gen-published.mts`
is the disk-writing wrapper the Viewer's dev/deploy path calls; `.github/workflows/deploy.yml` is the
GH Pages sink. DZI tiling (`apps/studio/src/dzi-slicer.ts` + `dzi-slice-pool.ts`/`dzi-tile-worker.ts`)
and bake (`bake-async.ts`/`bake-worker.ts`) are the two worker-backed perf paths inside publish/ingest —
both fall back to a slow inline path **silently** on worker failure. The one metric that matters:
end-to-end wall-clock over a real library (`scripts/perf/publishrun.mjs`), not a single-image bench.

## Binding rules
- [[perf-measure-the-flow]] — a primitive win (DZI tiling 19x/image) was 1.9-4.7x end-to-end because
  `publishLibrary` already fans out `mapLimit(exhibits, 6)`; worker pools must be sized by memory
  (`POOL_BYTE_BUDGET`), never per-call — a per-call pool at library scale silently destroyed itself
  and every object fell back to inline, still reporting a healthy publish.
- [[render-core-data-integrity]] — multi-file writes: content first, `archie.json` marker LAST is the
  commit point; a torn write must read as stale/refused, never as complete.
- [[bound-fetch-defaults]] — `publish/open.ts`'s `fetchArchieLibraryBytes` default must be
  `globalThis.fetch.bind(globalThis)`; Node tests can't see the unbound-receiver break, only
  `embed-smoke` in a real browser can.
- [[tauri-csp]] — `worker-src 'self' blob:` is load-bearing for `dzi-tile-worker.ts`/`bake-worker.ts`;
  both fallbacks are silent, so a CSP regression here reads as a healthy but 37x-slower publish.
- [[untrusted-archive-open-seam]] — the marker this hub writes is validated by exactly one module
  (`publish/open.ts`); don't grow a second decode-then-validate copy for a new consumer.

## Decisions
- Archie-9b93 — gen-published tree is a UNION (merge-preserving); rm-everything regen deleted
  committed exhibits on every dev run and CI deploy — fixed, don't reintroduce full-wipe regen.
- Archie-3db4 — gen-published `--from` bakes the real deploy BASE (`published-base.js`), not the
  sample-data fixture's demo base, into user manifests.
- Archie-4b0a — quality-tier engine (archival/web) at the publish seam; web tier fenced on selector
  rescale into served pixel space / `1074795`.
- Archie-53e3 — incremental GitHub push: blob-sha delta against what GitHub already has, truncation
  degrades to full re-upload / `ec4c763`.
- Archie-e09d — self-replicating publish prototype: tree can carry its own viewer bundle (opt-in
  `getViewerBundle`) / `c2f1ade`.
- Archie-039e — BagIt-shaped deposit export with a fixity manifest, validated against `bagit-python`
  / `b0c73f4`.
- Archie-c85f — object-storage publish probe (rclone, two-pass marker-last ordering) / `d7ae26f`.
- Archie-fde8 — post-publish verification (`verify-publish.mjs`, reads the tree back through the
  REAL render-core readers) / `7fbd87d`. Not present on this branch's tree — merged via `main`.

## Evidence
- `ledgers/PERF-image-pipeline-2026-07-24.md` — DZI tiling per-image 19x (worker pool ×4 best); the
  dominant cost was the serial `await`, not CPU; end-to-end library figure is the one to report.
- `scripts/perf/worker-smoke.mjs` — proves the BUILT `dzi-tile-worker`/`bake-worker` boot in real
  Chromium; the bench's `@render/core` shim can't see the barrel's module-load-time DOMPurify hang.
- `.github/workflows/deploy.yml` (comment at the `deploy` job) — build/deploy are separate jobs
  because a build rerun after a transient Pages failure double-uploads the pages artifact and
  hard-fails (run 28698550063).

## Open & hazards
- Archie-69f9 (open) — an OLDER published tree (schema version behind) currently refuses to open;
  ADR-0020 sanctions only the newer-tree-refuses direction, older-tree-migrates is the deferred fix.
- Archie-c367 (open) — the export surface's final option set (folder/zip/GH Pages/object-storage/
  BagIt) is not yet closed; new sinks should land behind this ticket, not ad hoc.
- Archie-c74e (open) — the 1,000-image acceptance harness (`scripts/accept/*`, commit `8007e80`)
  measured both-tier publish + GitHub-limits fit at real scale; its scripts are not on this branch's
  tree (merged via `main`) — check there before re-deriving scale numbers.
