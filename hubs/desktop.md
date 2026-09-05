---
paths:
  - "src-tauri/**"
  - "apps/studio/src/tauri-fs.ts"
  - "apps/studio/src/resident-store.ts"
  - "apps/studio/src/folder-native.ts"
  - "packages/render-core/src/fs/tauri.ts"
  - "packages/render-core/src/fs/tauri.test.ts"
  - "docs/plans/native-canonical-store.md"
  - "docs/plans/folder-av-originals.md"
updated: 2026-09-05
---
# desktop
> *How is the desktop app different?*

The Tauri shell bundles Studio and Viewer. Read `src-tauri/README.md` for build commands and native entry points.

## Current guidance

- Native folders hold the desktop working library. Browser OPFS is a separate storage path.
- `apps/studio/src/tauri-fs.ts` adapts native operations to the filesystem contract.
- `src-tauri/capabilities/default.json` controls both command grants and allowed paths. Unit tests alone cannot prove these grants work.
- GitHub device authentication uses the OS keyring. Check packaged authentication before claiming persistent sign-in works.
- Remote image and AV fetches can use the native HTTPS bridge. Tile requests stay in the webview.

## Binding rules

- [[tauri-csp]] — preserve worker and rendering grants.
- [[tauri-fs-seam]] — use atomic replacement and name containment for native writes.

## Verification and evidence

- Run `pnpm capabilities:check` after changes to the native filesystem bridge or capability manifest.
- `scripts/lib/tauri-capabilities.test.mjs` covers command permissions and path scopes separately.
- `docs/plans/native-canonical-store.md` contains the packaged workflow checklist. Code completion does not complete that checklist.
- Review 2026-09-05 → A packaged build and isolated native boot passed with a valid six-exhibit library. Full native import/edit/publish remains unverified. Evidence: `ledgers/IMPLEMENT-review-2026-09-05.md`.
- Documentation refresh 2026-09-05 → Desktop README describes implemented storage and remaining verification. Evidence: `ledgers/DOCS-refresh-2026-09-05.md`.

Earlier decisions and measurements: [archived hub](../ledgers/DOCS-hubs-before-2026-09-05.md#desktop).
