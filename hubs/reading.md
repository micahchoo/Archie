---
paths:
  - "apps/viewer/src/components/**"
  - "apps/viewer/src/pages/**"
  - "apps/viewer/src/lib/**"
  - "apps/viewer/e2e/**"
  - "apps/viewer/astro.config.mjs"
updated: 2026-09-05
---
# reading
> *how do readers experience things? (the Viewer app)*

Viewer is the read-only Astro/Svelte app. Start at `apps/viewer/README.md` for its routes and code entry points.

## Current guidance

- `apps/viewer/src/components/ExhibitView.svelte` composes the readers, finder, and citation surface through lazy imports.
- Keep source identity in the shared viewer address context. Links, citations, and location updates must retain the selected library source.
- A source change reloads the library session. An empty live store must clear stale exhibit metadata and media.
- Reading citations resolve the owning interpretation. Whole-recording AV notes open without inventing a time cue.
- Keep arrival payloads within `scripts/perf/reader-budget.json`. Run `scripts/perf/readerrun.mjs --check` for payload claims.

## Binding rules

- [[two-typescript-compilers]] — check Svelte scripts and drive changed controls in a browser.
- [[viewer-optimizedeps-bare-includes]] — maintain direct dependencies and dev optimization for lazy imports.
- [[stop-the-machine-not-just-the-token]] — cancel active work as well as stale completions.
- [[wall-clock-quiet-is-a-load-sensitive-gate]] — suppress feedback using arrival state rather than quiet timers.
- [[viewer-e2e-shared-port]] — use distinct ports for concurrent browser runs.

## Evidence

- Review 2026-09-05 → Source-aware navigation, citation resolution, and empty-store refresh pass regression checks. Evidence: `ledgers/IMPLEMENT-review-2026-09-05.md`.
- `ledgers/DESIGN-review-modules-2026-09-05.md` records address and session contracts.
- Documentation refresh 2026-09-05 → Viewer routes and shipped-feature descriptions match the code. Evidence: `ledgers/DOCS-refresh-2026-09-05.md`.

Earlier decisions and measurements: [archived hub](../ledgers/DOCS-hubs-before-2026-09-05.md#reading).
