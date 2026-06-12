#!/usr/bin/env bash
# Archie launcher (macOS double-click). Opens Terminal and runs the start script.
cd "$(dirname "$0")" || exit 1
exec bash ./start.sh "$@"
