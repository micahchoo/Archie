#!/usr/bin/env bash
# Boot the packaged desktop app on a throwaway profile and assert what it wrote (Archie-9ece).
#
# This is the orchestration half; scripts/desktop-smoke.sh is the assertion half. Split because the
# assertions are useful on their own after a MANUAL drive (that is how the folder-import fix was
# verified), while this script exists so CI and a local run take exactly the same path.
#
# WHAT A BOOT ALONE PROVES. On first run Studio seeds its library and writes it through the whole
# TauriFilesystem stack — temp file, then rename, then the marker. That is precisely the path the
# `fs:allow-rename` P0 broke, and a boot-only run catches it: measured, the broken build produced 18
# directories and 4 files of ZERO bytes while looking healthy. No UI driving is needed for that class.
#
# WHAT IT DOES NOT PROVE. Ingest. The dot-path scope defect (Archie-7b48) only fires when an asset is
# written, so it needs a driven import — see desktop-smoke.sh's MIN_ASSETS and the drive recipe in its
# header. Do not read a green boot as "desktop works"; read it as "desktop can persist its own state".
#
# USAGE
#   scripts/desktop-boot.sh                       # build must already exist
#   BIN=path/to/archie scripts/desktop-boot.sh
#   KEEP_PROFILE=1 scripts/desktop-boot.sh        # leave the profile for inspection / a manual drive
set -uo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
BIN=${BIN:-$ROOT/src-tauri/target/debug/archie}
APP=${APP:-$HOME/.local/share/digital.compost.archie}
BOOT_TIMEOUT=${BOOT_TIMEOUT:-90}
DISPLAY_NUM=${DISPLAY_NUM:-:99}

if [ ! -x "$BIN" ]; then
  echo "desktop-boot: no binary at $BIN"
  echo "              build it first: pnpm exec tauri build --debug --no-bundle"
  echo "              (NEVER plain \`cargo build\` — that bakes devUrl and the app will load whatever"
  echo "               dev server is on :5174, which may be another worktree's frontend.)"
  exit 1
fi

cleanup() {
  [ -n "${APP_PID:-}" ] && kill "$APP_PID" 2>/dev/null
  [ -n "${XVFB_PID:-}" ] && kill "$XVFB_PID" 2>/dev/null
  return 0
}
trap cleanup EXIT

# A THROWAWAY profile, so the assertions describe this boot and not an earlier one. Moved aside rather
# than deleted — this path is a user's real library on a developer machine.
if [ -e "$APP" ]; then
  mv "$APP" "$APP.presmoke-$$" || { echo "desktop-boot: could not move $APP aside"; exit 1; }
  echo "moved existing profile aside: $APP.presmoke-$$"
fi

# Xvfb, not the session's display. On a Wayland session (measured 2026-07-26) the app renders to a
# surface X cannot read, root capture is refused, and synthetic input never arrives — none of which
# announces itself; you just get a blank window and clicks that do nothing.
if ! xdpyinfo -display "$DISPLAY_NUM" >/dev/null 2>&1; then
  Xvfb "$DISPLAY_NUM" -screen 0 1600x1000x24 >/tmp/archie-xvfb.log 2>&1 &
  XVFB_PID=$!
  for _ in $(seq 1 20); do
    xdpyinfo -display "$DISPLAY_NUM" >/dev/null 2>&1 && break
    sleep 0.5
  done
  xdpyinfo -display "$DISPLAY_NUM" >/dev/null 2>&1 || { echo "desktop-boot: Xvfb never came up"; exit 1; }
fi

echo "booting $BIN on $DISPLAY_NUM"
DISPLAY="$DISPLAY_NUM" GDK_BACKEND=x11 WEBKIT_DISABLE_COMPOSITING_MODE=1 "$BIN" >/tmp/archie-app.log 2>&1 &
APP_PID=$!

# Wait for the app to finish writing its seed. The marker is written LAST (render-core's
# content-before-marker rule), so a non-empty library.json means the write path completed — which is
# exactly the signal the broken build could never produce.
LJ="$APP/library/library.json"
for _ in $(seq 1 "$BOOT_TIMEOUT"); do
  [ -s "$LJ" ] && break
  kill -0 "$APP_PID" 2>/dev/null || { echo "desktop-boot: the app EXITED before writing its library"; tail -20 /tmp/archie-app.log; exit 1; }
  sleep 1
done

if [ ! -s "$LJ" ]; then
  echo "desktop-boot: library.json never became non-empty after ${BOOT_TIMEOUT}s"
  echo "              this is the fs:allow-rename signature — the tree is populated but empty:"
  find "$APP/library" -type f 2>/dev/null | head -10 | sed 's/^/       /'
  tail -20 /tmp/archie-app.log
  exit 1
fi

echo "library written; stopping the app"
kill "$APP_PID" 2>/dev/null
APP_PID=""
sleep 2

APP="$APP" "$ROOT/scripts/desktop-smoke.sh"
status=$?

if [ "${KEEP_PROFILE:-0}" != "1" ] && [ "$status" -eq 0 ]; then
  rm -rf "$APP"
fi
exit "$status"
