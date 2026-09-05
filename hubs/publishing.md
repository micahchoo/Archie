---
paths:
  - "packages/render-core/src/publish/**"
  - "apps/studio/src/dzi-*.ts"
  - "apps/studio/src/bake-*.ts"
  - "apps/viewer/scripts/gen-published.mts"
  - "scripts/perf/publish*"
  - "scripts/perf/worker-smoke.mjs"
  - ".github/workflows/deploy.yml"
updated: 2026-09-05
---
# publishing
> *How does authored become published?*

`publishLibrary` in `packages/render-core/src/publish/site.ts` projects a library into a published file tree.
`apps/viewer/scripts/gen-published.mts` creates the Viewer fixtures and deployed tree.
For user controls, read `docs/guide/06-publish.md`.

## Current guidance

- Write history pages before indexes and `archie.json` last. The marker records completion but does not make in-place publication transactional.
- A note-only publish must change the generation used for reader cache invalidation.
- A published manifest must not reference missing assets. Preserve `PublishResult.danglingRefs` checks over the finished output.
- Preserve unrelated exhibits during fixture regeneration. Review generated diffs before committing them.
- Derive the base URL from the destination before projection. Keep local links relative where the format allows it.
- Separate site publication from artifact export. The earlier single-dialog design is historical.

## Binding rules

- [[render-core-data-integrity]] — preserve write ordering and classified recovery.
- [[untrusted-archive-open-seam]] — reuse the shared archive validation path.
- [[bound-fetch-defaults]] — bind browser fetch defaults.
- [[perf-measure-the-flow]] — measure real libraries and keep worker pools bounded across calls.
- [[tauri-csp]] — worker failures can silently select slower fallbacks.

## Verification and evidence

- `scripts/export-fidelity.mjs` checks emitted files through a real browser publication.
- `scripts/perf/worker-smoke.mjs` checks built workers. `scripts/perf/publishrun.mjs` measures archival-tier end-to-end behavior.
- Archie-6a99 records the memory finding from the thousand-image acceptance run. Check its live seed before selecting follow-up work.
- Review 2026-09-05 → Ordering, generation, and Pages transport failures have regression coverage. Evidence: `ledgers/IMPLEMENT-review-2026-09-05.md`.

Earlier decisions and measurements: [archived hub](../ledgers/DOCS-hubs-before-2026-09-05.md#publishing).
