# Plan — Tauri desktop port of Archie

Status: **shipped** — a Flatpak (`digital.compost.archie`) builds, installs, and runs on Linux.
Author: session 2026-06-20

## Build recipe (Linux → Flatpak), as actually executed

1. Host build deps (one sudo): `libwebkit2gtk-4.1-dev build-essential libssl-dev
   libayatana-appindicator3-dev librsvg2-dev libxdo-dev file`.
2. `pnpm add -Dw @tauri-apps/cli` · icons: `tauri icon <png>` (SVG with a `--` in an XML
   comment breaks resvg — rasterize a clean PNG with `rsvg-convert` first).
3. `pnpm exec tauri build --no-bundle` → self-contained `src-tauri/target/release/archie`
   (frontend embedded; `--base ./` for the Tauri origin via `beforeBuildCommand`).
4. Package the binary against `org.gnome.Platform//49` (it ships `webkit2gtk-4.1` + GTK3 +
   libsoup3) via `src-tauri/flatpak/digital.compost.archie.yml`.
5. `flatpak run org.flatpak.Builder --user --install … manifest` → `flatpak run digital.compost.archie`.

Environment gotchas hit (machine-specific, not obvious):
- `flathub` was a **system** remote; `--user` installs need `flatpak remote-add --user flathub …` first.
- flatpak-builder's state-dir and build-dir must share a filesystem — the repo is on `/mnt`, so
  pin both under `$HOME` (`--state-dir=$HOME/.cache/… $HOME/.cache/…`).
- `pkill -f archie` matches its own shell's argv → kills the chain; use `pkill -x archie` / pid.
- **CSP** (compiled into the binary): must allow `script-src 'unsafe-eval'` (Annotorious→PixiJS
  shaders) and `https:` on img/media/connect (remote IIIF folios). See `.claude/rules/tauri-csp.md`.

## Thesis

Archie is already shaped for this port. Two structural facts decide the effort:

1. **No backend to move.** Studio is a client-only Vite/Svelte SPA; Viewer is Astro
   `output: "static"`. Zero SSR, zero API routes. The only "server" is
   `scripts/dev-proxy.mjs`, a dev-only cross-origin shim for OPFS. A Tauri webview
   serves the same static bundle and *deletes* the proxy.
2. **Persistence is one seam.** Every save/load/publish path flows through the
   `Filesystem` interface (`packages/render-core/src/fs/seam.ts`). Backends are
   interchangeable behind it and pinned by one shared contract test
   (`fs/conformance.ts`). The existing backends — `MemoryFilesystem`,
   `ZipFilesystem`, `FsaFilesystem` — are thin projections of the seam.

So the Tauri port is, at its core: **add a fourth backend behind the seam.** The
hard architectural work was already done when the seam was drawn.

## Why the WebKit caveat *simplifies* rather than complicates

Tauri's webview is Chromium only on Windows (WebView2); macOS uses WKWebView,
Linux WebKitGTK. The existing FSA and OPFS paths assume Chromium and are
unreliable there. In Tauri we sidestep both: route **everything** through one
native backend (`@tauri-apps/plugin-fs`). The three-backend capability dance
(Chromium-FSA vs. non-Chromium-zip, see `fs/binding.ts`) collapses into a single
native backend that behaves identically on all three OSes.

## Design — where each piece lives

Follows the existing rule, stated in `apps/studio/src/binding.ts`:
*headless, capability-independent core lives in `render-core`; browser/platform
glue lives in the app.*

| File | Role |
|------|------|
| `packages/render-core/src/fs/tauri.ts` | `TauriFilesystem` implementing the seam over a small **`TauriFsBridge`** interface (path-based, mirrors `plugin-fs`). Pure — no Tauri import; stays headless-testable like `memory.ts`/`fsa.ts`. |
| `packages/render-core/src/fs/tauri.test.ts` | Binds the bridge to Node `fs` over temp dirs and runs the *existing* `runConformance()` suite. Green = path/dir/file logic is correct. |
| `apps/studio/src/tauri-fs.ts` | The real `@tauri-apps/plugin-fs` bridge (dynamic-imported, so the web build needs no Tauri dep) + `isTauri()` environment selector. |
| `src-tauri/` | Tauri shell: `tauri.conf.json`, `Cargo.toml`, `main.rs`, `build.rs`, `capabilities/` (fs + dialog grants). Bundles the built Studio. |

**Why a bridge interface instead of importing `plugin-fs` directly into the
backend:** keeps `render-core` dependency-free and headless-testable, and makes
the backend provable in Node CI without a Rust toolchain. Because `plugin-fs` is
a path-based API isomorphic to Node `fs` (readFile / writeFile / mkdir / readDir
/ remove / stat), the Node-bound conformance run validates the real logic; the
Tauri binding is a ~15-line 1:1 adapter.

## Phases

1. **Plan** — this doc.
2. **Build core** — `tauri.ts` backend + `tauri.test.ts` green against the
   conformance suite. (load-bearing proof)
3. **Scaffold** — `src-tauri/` + `apps/studio/src/tauri-fs.ts` real bridge +
   backend selector.
4. **Review** — run conformance + typecheck; code-reviewer pass.

## Deferred (not this session — needs a Rust toolchain + cross-OS machines)

- `cargo build` / `tauri build` on each OS; bundling Studio's `dist/` into the webview.
- Asset loading: switch OPFS/blob URLs → Tauri asset protocol (`convertFileSrc`)
  + CSP config. **Highest-risk remaining item.**
- Publish flow (`render-core/src/publish/site.ts`): write the tree straight to a
  picked folder via the fs plugin instead of FSA / zip-download.
- Directory picking: `showDirectoryPicker()` → `@tauri-apps/plugin-dialog`.
- Recents reopen: FSA handle store (IndexedDB) → persisted absolute paths.
- Cross-OS rendering QA for OpenSeadragon under WKWebView.

## Effort

~2–3 weeks for a shippable app. The seam + conformance suite already exist and
there is no backend, which is why this is weeks not months. Biggest remaining
risk is asset-protocol/CSP wiring, not storage.
