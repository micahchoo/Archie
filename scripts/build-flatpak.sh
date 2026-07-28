#!/usr/bin/env bash
# Build the Archie Flatpak, end to end, with no interaction (Archie-9ece / batch:packaged-drive).
#
# The manifest (src-tauri/flatpak/digital.compost.archie.yml) installs a PREBUILT binary from
# ../target/release/archie — it does not compile Rust itself. So this script owns both halves:
# the release build, then the Flatpak package. Doing only the second half against a stale or
# missing binary is the failure mode this exists to prevent.
#
# NEVER plain `cargo build` for the binary: `tauri build` is what bakes frontendDist. A cargo build
# leaves devUrl baked in and the packaged app loads whatever dev server is on :5174 — which may be
# another worktree's frontend. That is a silent wrong-app, not an error.
#
# flatpak-builder is used through the FLATPAK (`org.flatpak.Builder`), because that is what is
# installed here and it carries its own toolchain; a host `flatpak-builder` is used if present.
#
# USAGE
#   scripts/build-flatpak.sh                 # release build (if needed) + package + install --user
#   SKIP_RUST=1 scripts/build-flatpak.sh     # reuse the existing target/release/archie
#   FORCE_RUST=1 scripts/build-flatpak.sh    # rebuild the binary even if one exists
#   NO_INSTALL=1 scripts/build-flatpak.sh    # build the repo only, don't install
#   scripts/build-flatpak.sh --run           # …then launch it
set -uo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
APP_ID=digital.compost.archie
MANIFEST="$ROOT/src-tauri/flatpak/$APP_ID.yml"
BIN="$ROOT/src-tauri/target/release/archie"
BUILD_DIR="$ROOT/.flatpak-build"
REPO_DIR="$ROOT/.flatpak-repo"
RUNTIME_VERSION=$(sed -n 's/^runtime-version: *"\{0,1\}\([^"]*\)"\{0,1\}/\1/p' "$MANIFEST" | head -1)

say()  { printf '\n\033[1m• %s\033[0m\n' "$1"; }
fail() { printf '\n\033[31mFAIL\033[0m %s\n' "$1"; exit 1; }

[ -f "$MANIFEST" ] || fail "no manifest at $MANIFEST"

# --- 0. the toolchain, and a runtime that must MATCH the manifest ---------------------------------
if command -v flatpak-builder >/dev/null 2>&1; then
  FPB=(flatpak-builder)
elif flatpak info org.flatpak.Builder >/dev/null 2>&1; then
  # --filesystem=host so the sandboxed builder can read this checkout and write the repo.
  FPB=(flatpak run --filesystem=host --share=network org.flatpak.Builder)
else
  fail "no flatpak-builder. Install one:  flatpak install -y flathub org.flatpak.Builder"
fi

for ref in "org.gnome.Platform//$RUNTIME_VERSION" "org.gnome.Sdk//$RUNTIME_VERSION"; do
  flatpak info "$ref" >/dev/null 2>&1 || {
    say "installing missing $ref"
    flatpak install -y --noninteractive flathub "$ref" || fail "could not install $ref"
  }
done

# --- 1. the release binary ------------------------------------------------------------------------
if [ "${FORCE_RUST:-0}" = "1" ] || { [ "${SKIP_RUST:-0}" != "1" ] && [ ! -x "$BIN" ]; }; then
  say "building the release binary (tauri build --no-bundle) — this is the slow half"
  ( cd "$ROOT" && pnpm exec tauri build --no-bundle ) || fail "tauri build failed"
fi
[ -x "$BIN" ] || fail "no release binary at $BIN (run without SKIP_RUST, or FORCE_RUST=1)"
say "binary: $(du -h "$BIN" | cut -f1) at $BIN"

# --- 2. package ------------------------------------------------------------------------------------
say "flatpak-builder → $REPO_DIR"
rm -rf "$BUILD_DIR"
"${FPB[@]}" --force-clean --repo="$REPO_DIR" "$BUILD_DIR" "$MANIFEST" || fail "flatpak-builder failed"

# --- 3. install + verify ----------------------------------------------------------------------------
if [ "${NO_INSTALL:-0}" != "1" ]; then
  say "installing --user from the local repo"
  flatpak remote-add --user --if-not-exists --no-gpg-verify archie-local "$REPO_DIR" || fail "remote-add failed"
  flatpak install -y --user --noninteractive --reinstall archie-local "$APP_ID" || fail "install failed"
  # Prove the thing actually landed, rather than trusting the installer's exit code.
  flatpak info "$APP_ID" >/dev/null 2>&1 || fail "installed, but $APP_ID is not resolvable"
  say "installed: $(flatpak info "$APP_ID" | sed -n 's/^ *Version: *//p' | head -1) — run with:  flatpak run $APP_ID"
fi

[ "${1:-}" = "--run" ] && exec flatpak run "$APP_ID"
say "done"
