#!/usr/bin/env bash
# Desktop store assertions over a driven packaged build (Archie-91e7 / Archie-7b48 / Archie-9ece).
#
# WHY THIS EXISTS. Three P0/P1-class desktop defects shipped in one week, and EVERY headless gate in
# this repo was green for all three:
#
#   fs:allow-rename ungranted      every write failed at its temp-then-rename commit point; first boot
#                                  produced 18 directories, 4 files, ZERO bytes, behind a soft "Retry
#                                  save". Invisible because fs/tauri.test.ts runs on a node:fs bridge
#                                  with no permission system.
#   Object.assign on               folder import threw TypeError in JavaScriptCore. Invisible because
#   webkitRelativePath             jsdom AND Chromium-based Playwright both implement the permissive
#                                  shape that WebKitGTK does not.
#   scope refuses dot-paths        fs.exists(".bake-schema") refused; the asset job rejected AFTER its
#                                  bytes landed and the UI blamed disk space. Invisible because the
#                                  permission audit reads identifiers, never paths.
#
# Checks 2 and 3 below would have caught the first on its very first run. That is the whole argument
# for this file: the cheapest possible assertions over the tree the app actually wrote.
#
# USAGE
#   scripts/desktop-smoke.sh                 # assert over the current app-data dir
#   APP=/path/to/profile scripts/desktop-smoke.sh
#   MIN_ASSETS=3 scripts/desktop-smoke.sh    # also require N asset files (after driving an import)
#
# DRIVING IT. This script only ASSERTS; it does not drive the UI. Build and launch first:
#
#   pnpm exec tauri build --debug --no-bundle      # NEVER plain `cargo build` — that bakes devUrl,
#                                                  # so the app loads whatever dev server is on :5174,
#                                                  # which may be ANOTHER worktree's frontend.
#   Xvfb :99 -screen 0 1600x1000x24 &
#   DISPLAY=:99 GDK_BACKEND=x11 WEBKIT_DISABLE_COMPOSITING_MODE=1 ./src-tauri/target/debug/archie
#
# Xvfb is not optional on a Wayland session: measured 2026-07-26, the window captures BLANK with the
# compositing flag set and verified in /proc/PID/environ, `import -window root` is refused outright,
# and synthetic pointer events never arrive (the GTK File menu would not even open). On a nested X
# server all three work. Two GTK file-chooser details cost a cycle each: inline autocompletion
# corrupts `xdotool type` (paste with xclip instead), and Enter does NOT commit the location bar —
# click Open.
set -uo pipefail

APP=${APP:-$HOME/.local/share/digital.compost.archie}
LIB="$APP/library"
LS="$APP/localstorage"
MIN_ASSETS=${MIN_ASSETS:-0}
fail=0
ok()  { printf '%-6s %s\n' "ok" "$1"; }
bad() { printf '%-6s %s\n' "FAIL" "$1"; fail=1; }

echo "=== app-data: $APP"

# 1. ORIGIN. `cargo build` bakes devUrl, so the app can silently load a dev server belonging to another
#    checkout. WebKit names its localStorage file after the ORIGIN — the only unambiguous tell. A
#    result measured on the wrong origin is unverified, not passed. Same family as the shared-port
#    hazard in .claude/rules/viewer-e2e-shared-port.md, reached through a build flag instead.
shopt -s nullglob
packaged=("$LS"/tauri_localhost_0*)
devorigin=("$LS"/http_localhost*)
shopt -u nullglob

if [ ${#packaged[@]} -gt 0 ]; then
  ok "origin is tauri_localhost_0 (packaged frontendDist)"
else
  bad "origin NOT packaged — localstorage holds: ${packaged[*]:-<none>} ${devorigin[*]##*/}"
fi
if [ ${#devorigin[@]} -gt 0 ]; then
  bad "a dev-server origin is ALSO present — this profile is contaminated: ${devorigin[*]##*/}"
else
  ok "no dev-server origin in the profile"
fi

if [ ! -d "$LIB" ]; then
  bad "no library dir at $LIB"
  echo; echo "RESULT: FAIL"; exit 1
fi

# 2. THE ZERO-BYTE CHECK. TauriFilesystem commits every durable write with temp-then-rename; a denied
#    rename leaves the destination empty while the tree looks fully populated.
zero=$(find "$LIB" -type f -size 0 | wc -l)
total=$(find "$LIB" -type f | wc -l)
if [ "$zero" -eq 0 ]; then
  ok "no 0-byte files ($total files on disk)"
else
  bad "$zero of $total files are ZERO BYTES"
  find "$LIB" -type f -size 0 | head -10 | sed 's/^/       /'
fi

# 3. Leftover temp files mean a rename failed partway.
tmps=$(find "$LIB" -name '*.tmp-*' | wc -l)
if [ "$tmps" -eq 0 ]; then
  ok "no leftover .tmp-* files"
else
  bad "$tmps leftover .tmp-* files (a rename did not complete)"
fi

# 4. The marker file must exist, be non-empty, and parse.
LJ="$LIB/library.json"
if [ -s "$LJ" ]; then
  ok "library.json is $(stat -c%s "$LJ") bytes"
  if ! python3 - "$LJ" <<'PY'
import json,sys
d=json.load(open(sys.argv[1]))
ex=d.get("exhibits") or []
print(f"ok     library.json parses — {len(ex)} exhibit(s)")
PY
  then
    bad "library.json does not parse"
  fi
else
  bad "library.json missing or empty — this is the fs:allow-rename signature"
fi

# 5. Optional: assert an import actually landed media. Set MIN_ASSETS after driving a folder import —
#    this is what distinguishes "the app booted" from "the app can ingest", and it is the check that
#    catches a scope/permission refusal in the asset path (Archie-7b48), where the failure lands AFTER
#    some bytes are written so the tree looks healthy.
if [ "$MIN_ASSETS" -gt 0 ]; then
  assets=$(find "$LIB/exhibits" -path '*/assets/*' -type f ! -name '.*' 2>/dev/null | wc -l)
  if [ "$assets" -ge "$MIN_ASSETS" ]; then
    ok "$assets asset file(s) on disk (>= $MIN_ASSETS)"
  else
    bad "$assets asset file(s) on disk, expected >= $MIN_ASSETS — an import did not complete"
  fi
fi

echo
if [ "$fail" -eq 0 ]; then echo "RESULT: PASS"; else echo "RESULT: FAIL"; fi
exit "$fail"
