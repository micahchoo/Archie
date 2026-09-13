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

# Astro 6 requires Node 22.12+. Check before starting either backend so a too-old
# runtime cannot leave a partial dev stack or a misleading front door behind.
if ! node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 22 || (major === 22 && minor >= 12) ? 0 : 1)'; then
  echo "Archie dev requires Node >=22.12.0 (found $(node -v))." >&2
  exit 1
fi

# pnpm is the documented runner, but some managed environments expose Node/npm without
# a working pnpm shim. Use npm's local workspace scripts in that case so a missing package
# manager cannot leave only the front-door proxy running.
if command -v pnpm >/dev/null 2>&1; then
  PKG_RUNNER=(pnpm)
else
  PKG_RUNNER=(npm run)
fi

PROXY_PID=""
STUDIO_PID=""
VIEWER_PID=""

# Kill only the process trees this launcher owns. The backend commands spawn Vite/Astro children,
# so killing the shell PID alone can leave a stale server that makes the next launch borrow old state.
kill_tree() {
  local pid="$1" child
  [[ -z "$pid" ]] && return 0
  for child in $(pgrep -P "$pid" 2>/dev/null || true); do kill_tree "$child"; done
  kill "$pid" 2>/dev/null || true
}
cleanup() {
  kill_tree "$PROXY_PID"
  kill_tree "$STUDIO_PID"
  kill_tree "$VIEWER_PID"
}
# Install cleanup before any backend starts, including a failed startup or an interrupted dependency gen.
trap cleanup EXIT INT TERM

# Never borrow an unowned service: TCP readiness alone cannot distinguish a stale prior stack from
# the processes this invocation started. Fail clearly before spawning anything when a required port is occupied.
for port in 5173 5174 4321; do
  if (exec 3<>/dev/tcp/127.0.0.1/$port) 2>/dev/null; then
    echo "Archie dev cannot start: port $port is already in use." >&2
    exit 1
  fi
done

echo "=== Studio (Vite) → :5174 ==="
(cd "$ROOT/apps/studio" && "${PKG_RUNNER[@]}" dev) &
STUDIO_PID=$!

echo "=== Viewer (Astro) → :4321 ==="
# Explicit gen + astro: the sample tree must be baked BEFORE the server binds (stale-public gotcha).
(cd "$ROOT/apps/viewer" && "${PKG_RUNNER[@]}" gen && SITE_BASE=/viewer/ "$ROOT/apps/viewer/node_modules/.bin/astro" dev --port 4321) &
VIEWER_PID=$!

# Do not expose a proxy that routes into a failed backend. Wait for both servers before
# binding the front door, then keep supervising after startup as well.
for i in $(seq 1 60); do
  studio_ready=false
  viewer_ready=false
  (exec 3<>/dev/tcp/127.0.0.1/5174) 2>/dev/null && studio_ready=true || true
  (exec 3<>/dev/tcp/127.0.0.1/4321) 2>/dev/null && viewer_ready=true || true
  if [[ "$studio_ready" == true && "$viewer_ready" == true ]]; then break; fi
  if ! kill -0 "$STUDIO_PID" 2>/dev/null || ! kill -0 "$VIEWER_PID" 2>/dev/null; then
    echo "A dev backend exited before both surfaces became ready." >&2
    exit 1
  fi
  sleep 1
done
if [[ "$studio_ready" != true || "$viewer_ready" != true ]]; then
  echo "Timed out waiting for Studio (:5174) and Viewer (:4321)." >&2
  exit 1
fi

echo "=== Front door → :5173 ==="
echo "    Studio: http://localhost:5173/studio/   Viewer: http://localhost:5173/viewer/"
node "$ROOT/scripts/dev-proxy.mjs" &
PROXY_PID=$!

while kill -0 "$PROXY_PID" 2>/dev/null; do
  if ! kill -0 "$STUDIO_PID" 2>/dev/null || ! kill -0 "$VIEWER_PID" 2>/dev/null; then
    echo "A dev backend exited; stopping the front door." >&2
    kill "$PROXY_PID" 2>/dev/null || true
    break
  fi
  sleep 1
done
wait "$PROXY_PID"
