---
scope:
  - "apps/studio/src/**"
  - "apps/studio/e2e/**"
updated: 2026-07-28
---
# authoring
> *how do authors make things?*

`apps/studio` is the authoring SPA (ADR-0002/Q-2): Library → Exhibit → draw regions → notes/media →
merge → publish. It depends on `@render/svelte → @render/mount → @render/core` and shares no code
with `@archie/viewer` beyond the published contract. Entry points: `src/App.svelte` (shell) plus flat top-level components
(`LibraryHome.svelte`, `AvEditor.svelte`, `CmdK.svelte`, `MergeReview.svelte`, `Publish.svelte`);
`Canvas.svelte` is lazy-loaded from the shared `@render/svelte` package, not local to studio. The one gate that matters for `.ts` edits
is `pnpm typecheck` (not svelte-check); for `.svelte` edits it's `pnpm --filter @archie/studio run
check`. Neither alone is sufficient — see below.

## Binding rules
- [[metadata-rights-keyed-writebacks]] — RightsFields (`rights`/`requiredStatement`/`metadata`) write-backs MUST be keyed partial patches, never whole-object reconstructions — a naive handler clobbers sibling fields; audited and fixed across every UI site.
- [[studio-ts-typecheck-gate]] — svelte-check relaxes `exactOptionalPropertyTypes`; only `pnpm typecheck` (tsc --noEmit) catches it on `.ts` files — TS2379 passed 542-green vitest + 0/0 svelte-check once already.
- [[svelte-no-typecheck-net]] — a typed-but-undestructured prop (`oncancel`) shipped a dead button through svelte-check at 0/0; a gate proves compiled, never that a prop is wired — assert in a browser drive.
- [[two-typescript-compilers]] — never call bare `tsc`; the workspace `typecheck` script must invoke `typescript-native`'s binary by explicit path, TS 5.9 stays for svelte-check/astro check.
- [[tauri-csp]] — `worker-src 'self' blob:` is load-bearing for the DZI-tile and bake workers, not just PixiJS; both call sites fall back silently on failure, so a CSP break shows as slow, not broken.
- [[perf-measure-the-flow]] — tiling/bake worker wins are real per-image (19–37x) but the worker pool is process-wide, not per-call; a per-call pool self-destructs silently at library scale (see Evidence).
- [[tauri-fs-seam]] — desktop fs backend needs atomic temp+rename writes and name containment that plugin-fs doesn't give for free; both are studio write paths (autosave, resident store).

## Decisions
- Archie-e09d — self-contained trees wired into Studio's site sinks (folder destination / GitHub
  push / desktop deploy write `_viewer/` + `viewer.html`; zip and folder AUTOSAVE stay lean) via the
  SAME `@render/archie-viewer/single?raw` IIFE `exportSelfContained` ships — the parked spike's
  +304.9KB-gz duplication is gone (one lazy chunk serves both); trade: the tree's viewer eager-loads
  278KB gz instead of ~39KB lazy / 64c8f62
- Archie-7e6f — video transcode CLOSED: browser WebCodecs path via mediabunny wired into the
  web-tier publish with pinned fallback counters (both routes); H.264 empirically proven present in
  the Flatpak, so no codecs-extra manifest stanza needed / 6f4c3cc
- Archie-5a9b — RightsFields clobber audit shipped; every UI write-back site converted to keyed patches / `0fb15fc`
- Archie-458e — metadata joined the Details panel as a tab at all three levels (Library/Exhibit/Object) / `16d0f2c`
- Archie-a5b1 — partially this territory: the fix landed on the archival-page RENDER side, not studio write-back; RightsEditor's keyed-patch contract (Archie-5a9b) was already correct and untouched / `58f1cc3`

## Evidence
- `ledgers/PERF-image-pipeline-2026-07-24.md` — DZI tiling worker pool 37x on one image, but at 70-object library scale the per-call pool asked for ~25GB at once and every pool died; fixed with a process-wide gate (`withPoolGate`), end-to-end win is 1.9–4.7x, not 37x (a narrower 70-object serial→inline comparison is 1.26x).
- `ledgers/FIX-a5b1-rights-metadata-2026-07-26.md` — the read-side rights/metadata ladder is 3 surfaces (SPA/embed/archival page) in 3 different states; only the archival page (publish output, not studio) had a real gap.
- `ledgers/EXPLORE-studio-folder-export-settings-2026-07-26.md` — no settings surface exists today; ~20 loose `localStorage` keys with no UI; storage/diagnostics readout is the one genuinely new thing a panel should add (worker-pool fallback + retained-OPFS bloat are both currently invisible to the author).

## Open & hazards
- Archie-a09d — desktop-lane QA quarantine: native fs/dialog flows (add-media, project-binding, portable-zip-open) are logic-tested via the fs-seam but never smoke-tested in a packaged Tauri build; still open.
- Archie-623e — native folder as canonical desktop store: code (Phases 1-6) is in the tree at authoring's `resident-store.ts`, but unverified end-to-end (blocked on Archie-9ece, the packaged-run verification, also open).
- Worker-pool fallback is silent by design (`bakeFallbackCount()` is the only witness) — a broken worker path degrades to slow-but-looks-healthy, not to a visible error; don't remove the counter or the CI worker-smoke gate.
- `apps/studio/e2e/playwright.config.ts` defaults to port 5198 with `reuseExistingServer: !CI`, same shared-port shape as [[viewer-e2e-shared-port]] — `STUDIO_E2E_PORT` exists precisely so concurrent agents don't drive each other's stale build.
