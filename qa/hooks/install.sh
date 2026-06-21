#!/bin/sh
# Point git at the tracked qa/hooks dir so the QA hooks survive clones.
# Run once per clone: sh qa/hooks/install.sh
set -e
git config core.hooksPath qa/hooks
chmod +x qa/hooks/pre-commit
echo "Installed: core.hooksPath -> qa/hooks (pre-commit syncs qa/features.csv)"
