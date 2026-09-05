---
paths:
  - "apps/studio/src/**"
  - "apps/studio/e2e/**"
updated: 2026-09-05
---
# authoring
> *how do authors make things?*

Studio owns the Library → Exhibit → Object authoring flow.
Start at `apps/studio/README.md` for code entry points and development commands.

## Current guidance

- `apps/studio/src/App.svelte` composes the shell. `apps/studio/src/editor-model.svelte.ts` derives editor state.
- `apps/studio/src/Publish.svelte` separates site publication from artifact export. Follow Q-15 in `docs/decisions/archie.md`.
- The shared canvas comes from `@render/svelte`. Keep authoring state outside the renderer.
- Undo groups actions through UndoWire. After undo, a new edit descends from the visible revision while retaining append-only history.
- Save feedback identifies its destination. Browser persistence, desktop storage, and public delivery are separate capabilities.

## Binding rules

- [[two-typescript-compilers]] — choose the strict TypeScript and Svelte checks for the changed files.
- [[metadata-rights-keyed-writebacks]] — patch changed fields without reconstructing sibling metadata.
- [[tauri-csp]] — keep the worker and remote-media grants required by desktop flows.
- [[tauri-fs-seam]] — native writes require atomic replacement and safe names.
- [[perf-measure-the-flow]] — measure the full import or publish flow and preserve fallback counters.

## Verification and evidence

- `hubs/verification.md` maps claims to checks. Use distinct `STUDIO_E2E_PORT` values for concurrent browser runs.
- Review 2026-09-05 → Save races, undo grouping, contrast, and title layout have regression coverage. Evidence: `ledgers/IMPLEMENT-review-2026-09-05.md`.
- `ledgers/DESIGN-review-modules-2026-09-05.md` records the module contracts.
- Native import, edit, keyring, and publication still need the full packaged workflow checks in `docs/CAPABILITIES.md`.
- Documentation refresh 2026-09-05 → Author guides and app entry points match current controls. Evidence: `ledgers/DOCS-refresh-2026-09-05.md`.

Earlier decisions and measurements: [archived hub](../ledgers/DOCS-hubs-before-2026-09-05.md#authoring).
