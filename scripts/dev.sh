#!/usr/bin/env bash
set -euo pipefail

# Single-origin dev (Q-3 archie-persistence): ONE front door at http://localhost:5173 mirroring the
# GH-Pages layout — /studio/ (Vite :5174) and /viewer/ (Astro :4321) behind a dumb path-routing
# proxy (scripts/dev-proxy.mjs). Same origin ⇒ the Viewer's live source reads the Studio's OPFS
# working store in dev: author an exhibit at /studio/, open /viewer/, it's there — no publish.
#
# A STANDALONE proxy because neither dev server can front the other: Vite can't catch Astro's
# root-relative internals; Astro routes HTML navigations before its own proxy middleware (browser
# visits 404 while curl proxies — see dev-proxy.mjs).
#
# The Viewer's gen still bakes the sample tree first, so the hall shows the published samples
# ALONGSIDE your local exhibits — exactly like the deployed co-deploy.

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== Studio (Vite) → :5174 ==="
(cd "$ROOT/apps/studio" && pnpm dev) &
STUDIO_PID=$!

echo "=== Viewer (Astro) → :4321 ==="
# Explicit gen + astro: the sample tree must be baked BEFORE the server binds (stale-public gotcha).
(cd "$ROOT/apps/viewer" && pnpm gen && SITE_BASE=/viewer/ pnpm exec astro dev --port 4321) &
VIEWER_PID=$!

trap 'kill "$STUDIO_PID" "$VIEWER_PID" 2>/dev/null || true' EXIT

echo "=== Front door → :5173 ==="
echo "    Studio: http://localhost:5173/studio/   Viewer: http://localhost:5173/viewer/"
node "$ROOT/scripts/dev-proxy.mjs"
