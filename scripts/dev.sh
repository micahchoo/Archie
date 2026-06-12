#!/usr/bin/env bash
set -euo pipefail

# Single-origin dev (Q-3 archie-persistence): ONE front door at http://localhost:5173 mirroring the
# GH-Pages layout — /viewer/ (Astro, this origin) and /studio/ (Vite on 5174, proxied by the Astro
# dev server; see apps/viewer/astro.config.mjs). Same origin ⇒ the Viewer's live source reads the
# Studio's OPFS working store in dev: author an exhibit at /studio/, open /viewer/, it's there —
# no publish, no gen.
#
# The VIEWER fronts (not the Studio) because plain Vite namespaces all its dev URLs under /studio/
# (cleanly proxyable), while Astro requests internals at root-relative paths (/@vite, /@id, /src)
# that a prefix proxy can't catch.
#
# The Viewer's predev still bakes the sample tree (public/published/), so the hall shows the
# published samples ALONGSIDE your local exhibits — exactly like the deployed co-deploy.

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== Studio (Vite) → :5174 under /studio/ ==="
(cd "$ROOT/apps/studio" && pnpm dev) &
STUDIO_PID=$!
trap 'kill "$STUDIO_PID" 2>/dev/null || true' EXIT

echo "=== Viewer (Astro) → :5173 (front door) ==="
echo "    Studio: http://localhost:5173/studio/   Viewer: http://localhost:5173/viewer/"
# Explicit gen + astro (not `pnpm dev`): the --port flag must reach astro itself, and the predev
# gen must still bake the sample tree before the server binds (stale-public gotcha).
cd "$ROOT/apps/viewer" && pnpm gen && SITE_BASE=/viewer/ pnpm exec astro dev --port 5173
