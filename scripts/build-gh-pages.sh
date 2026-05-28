#!/usr/bin/env bash
set -euo pipefail

REPO="Archie"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/gh-pages-dist"

echo "=== Building Studio (Vite SPA) ==="
cd "$ROOT/apps/studio"
pnpm exec vite build --base="/$REPO/studio/"

echo "=== Building Viewer (Astro static) ==="
cd "$ROOT/apps/viewer"
SITE_BASE="/$REPO/viewer/" PUBLISH_BASE="https://micahchoo.github.io/$REPO/viewer/published/" pnpm build

echo "=== Assembling deploy directory ==="
rm -rf "$OUT"
mkdir -p "$OUT"
cp -r "$ROOT/apps/studio/dist" "$OUT/studio"
cp -r "$ROOT/apps/viewer/dist" "$OUT/viewer"

echo "=== Writing landing page ==="
cat > "$OUT/index.html" <<'LANDING'
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Archie — Exhibit Annotation</title>
  <style>
    :root { color-scheme: dark; }
    body {
      margin: 0; min-height: 100vh;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      font-family: system-ui, sans-serif;
      background: #1a1a1a; color: #e0e0e0;
    }
    h1 { font-weight: 400; letter-spacing: 0.02em; margin-bottom: 0.25rem; }
    p.sub { color: #888; margin-bottom: 2rem; }
    .apps { display: flex; gap: 2rem; }
    .apps a {
      display: block; padding: 1rem 2rem;
      border: 1px solid #444; border-radius: 8px;
      text-decoration: none; color: inherit;
      transition: border-color 0.2s, background 0.2s;
    }
    .apps a:hover { border-color: #888; background: #222; }
    .apps h2 { margin: 0 0 0.25rem; font-weight: 500; font-size: 1.1rem; }
    .apps p { margin: 0; color: #888; font-size: 0.9rem; }
  </style>
</head>
<body>
  <h1>Archie</h1>
  <p class="sub">Multi-media exhibit annotation</p>
  <div class="apps">
    <a href="./studio/">
      <h2>Studio</h2>
      <p>Authoring app — annotate exhibits</p>
    </a>
    <a href="./viewer/">
      <h2>Viewer</h2>
      <p>Published exhibits — read-only</p>
    </a>
  </div>
</body>
</html>
LANDING

echo "=== Done: $OUT ==="
ls -la "$OUT/"
