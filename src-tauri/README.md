# src-tauri — Archie Studio desktop shell

A Tauri v2 shell that bundles the **Studio** web app into a native window and gives it
real filesystem access via `@tauri-apps/plugin-fs`. See `docs/plans/tauri-port.md` for the
full plan and rationale.

## Why this is small

All app behaviour lives in the Studio bundle. The persistence layer already abstracts every
save/load/publish behind the `Filesystem` seam (`packages/render-core/src/fs/seam.ts`). The
desktop port is just a **fourth backend** behind that seam:

- `packages/render-core/src/fs/tauri.ts` — `TauriFilesystem`, pure, over a `TauriFsBridge`
  interface. Proven against the shared conformance suite in `fs/tauri.test.ts` (Node-fs bridge).
- `apps/studio/src/tauri-fs.ts` — the real `@tauri-apps/plugin-fs` bridge + `isTauri()` selector.
- This crate — registers the `fs` + `dialog` plugins and hosts the webview. No custom Rust IPC.

## Prerequisites (not bundled in this repo)

This scaffold is complete but **not yet buildable as-is** — it needs:

1. **Rust toolchain** + the platform webview deps (WebView2 on Windows, WebKitGTK on Linux,
   WKWebView ships with macOS). See https://tauri.app/start/prerequisites/.
2. **Tauri CLI**: `pnpm add -D @tauri-apps/cli` (run `pnpm tauri` from repo root).
3. **JS deps** in `apps/studio`: `@tauri-apps/plugin-fs`, `@tauri-apps/plugin-dialog`,
   `@tauri-apps/api` (the web build does not need them — `tauri-fs.ts` dynamic-imports them).
4. **Icons**: `pnpm tauri icon path/to/logo.png` generates `src-tauri/icons/*`
   (referenced by `tauri.conf.json` → `bundle.icon`).

## Run

```bash
pnpm tauri dev      # dev — loads Studio from the Vite dev server (:5174/studio/)
pnpm tauri build    # production bundle per OS
```

## Known caveat — base path

Studio's web build uses `base: "/studio/"` (it lives under `/studio/` on GitHub Pages). A Tauri
webview serves from the root, so the build command here passes `--base ./` to emit relative asset
URLs. Verify routing inside the webview; if the SPA router assumes `/studio/`, add a Tauri-specific
base or a router basename. This is the first thing to check after `pnpm tauri dev` comes up.

## Asset loading (the real remaining work)

User images/tiles currently come from OPFS / blob URLs. Under Tauri they should load via the asset
protocol (`convertFileSrc`) — the `assetProtocol` scope is already opened in `tauri.conf.json`. This
is the highest-risk remaining item (CSP + protocol wiring + OpenSeadragon under WKWebView).
