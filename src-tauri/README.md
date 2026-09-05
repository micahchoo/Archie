# Archie Studio desktop shell

The Tauri v2 shell packages Studio and Viewer in a native window. Studio keeps
its working library in a resident filesystem folder. The shell also supplies
native dialogs, GitHub sign-in, deployment, and video conversion.

## Run and build

A local build needs the Rust toolchain and platform webview dependencies.
The repository supplies the Tauri CLI, JavaScript dependencies, and bundle icons.
The [desktop workflow](../.github/workflows/desktop.yml) records the build prerequisites.

From the repository root, run:

```bash
pnpm tauri dev      # Studio at http://localhost:5174/studio/
pnpm tauri build    # packaged application
```

The development command starts Vite through `beforeDevCommand`.
`scripts/build-tauri-frontend.sh` builds the packaged frontend into `src-tauri/frontend/`.
Studio occupies `/` with relative asset URLs. Viewer occupies `/viewer/`.
The native **View** menu switches between them in the packaged app.

## Entry points

| File | Role |
|------|------|
| `tauri.conf.json` | Build commands, window, CSP, and asset protocol scope |
| `src/lib.rs` | Plugins, command registration, native menu, and single-instance guard |
| `src/github/device_flow.rs` | GitHub device-code authorization |
| `src/github/keyring.rs` | Token persistence in the OS keyring |
| `src/github/pack_push.rs` | Site deployment through a `git2` pack push |
| `src/video.rs` | Native encoder probe and video conversion |
| `../apps/studio/src/tauri-fs.ts` | Tauri bridge for the shared filesystem interface |
| `../apps/studio/src/resident-store.ts` | Desktop working library location |
| `../packages/render-core/src/fs/tauri.ts` | Filesystem backend and contained writes |

The GitHub flow retains the token in the OS keyring. If the keyring is unavailable,
Studio reports that it cannot keep the session signed in. The advanced personal
access token flow has a separate, temporary token lifecycle.

Local audio and video use the asset protocol. `convertFileSrc` supplies URLs that
the webview reads from disk, including byte-range requests. The asset scope covers
`$APPDATA/**` and `$HOME/**`. The video bridge stages temporary files under `$APPDATA`.

[Delivery capabilities](../docs/CAPABILITIES.md) describes the desktop contract.
[Verification](../hubs/verification.md) distinguishes compilation, packaged launch,
and complete save/open/publish checks.
