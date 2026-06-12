#!/usr/bin/env bash
# Archie launcher (Linux / macOS terminal).
# Double-click users on macOS: use start.command instead.
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "  Node.js is not installed."
  echo ""
  echo "  1. Go to https://nodejs.org and download the LTS installer (version 22 or newer)."
  echo "  2. Install it, then run this script again."
  echo ""
  read -r -p "  Press Enter to close..."
  exit 1
fi

exec node scripts/start.mjs "$@"
