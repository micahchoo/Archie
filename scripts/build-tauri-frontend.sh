#!/usr/bin/env bash
# Combine BOTH apps into one directory served at a single Tauri origin:
#   /         → Studio (the authoring SPA)
#   /viewer/  → Viewer (the Astro reader)
# Same origin = shared OPFS, so the in-app Viewer reads Studio's LIVE working store
# (apps/viewer/src/published.ts probeWorkingStore). The native View menu (src-tauri/src/lib.rs)
# navigates the webview between the two. This is ADDITIVE — it does not touch the web / gh-pages
# / dev-server builds (those still target apps/*/dist independently).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/src-tauri/frontend"

echo "[tauri-frontend] cleaning $OUT"
rm -rf "$OUT"
mkdir -p "$OUT/viewer"

echo "[tauri-frontend] building Studio → /  (relative base for the Tauri origin root)"
pnpm --filter @archie/studio exec vite build --base ./ --outDir "$OUT" --emptyOutDir

echo "[tauri-frontend] building Viewer → /viewer/"
# astro directly (not `pnpm build`) to skip the gen-published prebuild hook — avoids regenerating
# the committed public/published tree. SITE_BASE puts the reader under /viewer/ so its routes resolve.
SITE_BASE=/viewer/ pnpm --filter @archie/viewer exec astro build
cp -r "$ROOT/apps/viewer/dist/." "$OUT/viewer/"

echo "[tauri-frontend] combined frontend ready at $OUT"
