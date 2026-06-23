#!/usr/bin/env bash
# Snapshot the 21 canonical showroom screenshots out of the harness scratch dir
# (docs/screenshots/auto/) into docs/showroom/screenshots/ with code-based names that
# pair 1:1 with csv/ (s1-library.png ↔ s1-library.csv). Re-run after a fresh harness run.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
src="$root/docs/screenshots/auto"
dst="$root/docs/showroom/screenshots"
mkdir -p "$dst"

# source-name(without .desktop.png)  ->  showroom code
map="
studio-library s1-library
studio-overview s2-overview
studio-editor-image s3-canvas
studio-readings s4-readings
studio-narrative s5-narrative
studio-editor-av s6a-audio
studio-editor-video s6b-video
studio-map s7-map
studio-cite s8-cite
studio-meta s9-meta
studio-ingest s10-ingest
studio-publish s11-publish
studio-shortcuts s12-shortcuts
viewer-home v1-gallery
viewer-voynich v2-reader
viewer-narrative v3-narrative
viewer-av v4-av
viewer-search v5-search
viewer-lightbox v6-lightbox
viewer-sheet v7-sheet
embed-host e1-embed
"
n=0
while read -r source code; do
  [ -z "$source" ] && continue
  f="$src/$source.desktop.png"
  if [ ! -f "$f" ]; then echo "MISSING: $f" >&2; continue; fi
  cp "$f" "$dst/$code.png"
  n=$((n+1))
done <<< "$map"
echo "synced $n/21 screenshots → $dst"
