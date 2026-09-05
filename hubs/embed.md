---
paths:
  - "packages/archie-viewer/**"
  - "recipes/**"
updated: 2026-09-05
---
# embed
> *how does `<archie-viewer>` work and stay small?*

The embed registers `<archie-viewer>` and opens published libraries in a shadow root.
`recipes/README.md` indexes runnable examples. `recipes/EMBED.md` owns the public reference and release distinction.

## Current guidance

- `packages/archie-viewer/src/element.ts` owns element attributes and lifecycle.
- Keep the heavy reader behind the lazy import. Entry size alone does not measure its eager dependency closure.
- ResourcePolicy controls media requests. Target or policy changes must cancel pending work and tear down active mounts.
- `offline` permits blob/data resources and blocks URL library loads, including same-origin URLs. Use a local file for offline reading.
- Explicit `target` takes precedence over `iiif-content`. Preserve source, Reading, and section identity through navigation.

## Binding rules

- [[archie-viewer-eager-closure]] — use the eager closure budget.
- [[vitest-css-id-empty-string]] — test actual token content through the virtual CSS module.
- [[bound-fetch-defaults]] — browser fetch defaults need their receiver.
- [[osd-overlay-wrapper]] — use real pointer input to check overlay hit-testing.
- [[drive-must-not-recreate-the-thing-under-test]] — drive transitions without resetting their state.
- [[post-review-fixes-are-unreviewed]] — preserve assertion completeness during follow-up edits.
- [[viewer-e2e-shared-port]] — use the intended built output and server.

## Verification and evidence

- `packages/archie-viewer/build.mjs` checks bundle budgets. Baseline updates require the explicit update command.
- `scripts/sync-dist.mjs` copies the built artifact to the root distribution used by local recipes.
- `recipes/smoke.mjs` drives real Chromium. `recipes/TESTING.md` explains the checks.
- Review 2026-09-05 → Resource policy, Reading/AV arrival, and async cancellation pass regressions. Evidence: `ledgers/IMPLEMENT-review-2026-09-05.md`.
- Documentation refresh 2026-09-05 → One embed reference distinguishes current source from the pinned release. Evidence: `ledgers/DOCS-refresh-2026-09-05.md`.

Earlier decisions and measurements: [archived hub](../ledgers/DOCS-hubs-before-2026-09-05.md#embed).
