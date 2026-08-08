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
- This crate — hosts the webview and the custom Rust the web origin cannot do itself (8 commands
  in src-tauri/src). `github/` owns the publish handshake — device-flow sign-in, keyring token
  custody, pack-push: `gh_device_start`, `gh_device_poll`, `gh_token_save`, `gh_token_load`,
  `gh_token_clear`, `gh_push_tree`. `video.rs` is the native transcode sidecar (WebKitGTK has no
  WebCodecs): `video_probe_encoders`, `video_transcode`. Plus the `fs`/`dialog`/`http`/`opener`
  plugins, a single-instance guard, and a native menu to switch Studio/Viewer. The token stays
  off the JS heap (Q-12) and the GitHub endpoints send no CORS headers, so the webview cannot
  call them itself.

## Prerequisites

Buildable: `.github/workflows/desktop.yml` builds the packaged binary (`pnpm exec tauri build`)
and boots it (`scripts/desktop-boot.sh`). A local build needs the same inputs, all present:

1. **Rust toolchain** + the platform webview deps (WebView2 on Windows, WebKitGTK on Linux,
   WKWebView ships with macOS). See https://tauri.app/start/prerequisites/.
2. **Tauri CLI**: `@tauri-apps/cli` is pinned at the repo root (run `pnpm tauri` from repo root).
3. **JS deps** in `apps/studio`: `@tauri-apps/api`, `@tauri-apps/plugin-fs`,
   `@tauri-apps/plugin-dialog`, `@tauri-apps/plugin-http`, `@tauri-apps/plugin-opener` (the web
   build does not need them — `tauri-fs.ts` dynamic-imports them).
4. **Icons**: already in `src-tauri/icons/*` (referenced by `tauri.conf.json` → `bundle.icon`).

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

## Asset loading (implemented)

AV loads through the asset protocol: `convertFileSrc` maps file paths to `asset://` URLs the
webview streams from disk with native byte-range seeking (apps/studio/src/tauri-fs.ts:25/48).
The `assetProtocol` scope (`$APPDATA/**`, `$HOME/**`) is open in `tauri.conf.json` and the CSP
already permits it. The video sidecar bridge stages its temp files under `$APPDATA`
(apps/studio/src/video-sidecar-bridge.ts) — inside the fs scope, so no capability grant was needed.
