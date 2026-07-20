#!/bin/sh
# Point git at the tracked qa/hooks dir so the repo's git hooks survive clones.
# Run once per clone: sh qa/hooks/install.sh
set -e
git config core.hooksPath qa/hooks
chmod +x qa/hooks/post-checkout qa/hooks/post-commit qa/hooks/post-merge qa/hooks/pre-push
echo "Installed: core.hooksPath -> qa/hooks (LFS safety net)"

# This directory replaces .git/hooks as the effective hooks dir -- confirm the LFS hooks came
# along, rather than silently losing them (tend Issue 8, ledgers/COLDSTART.md: a fresh clone's
# git-lfs auto-installs into .git/hooks, and pointing core.hooksPath elsewhere without these
# tracked copies silently drops the pre-push / post-checkout / post-merge LFS safety net).
for h in post-checkout post-commit post-merge pre-push; do
  if [ ! -x "qa/hooks/$h" ]; then
    printf >&2 "WARNING: qa/hooks/%s is missing or not executable -- git-lfs's %s hook won't fire.\n" "$h" "$h"
  fi
done
command -v git-lfs >/dev/null 2>&1 && echo "LFS hooks present: post-checkout, post-commit, post-merge, pre-push" \
  || echo "NOTE: git-lfs not found on PATH -- install it (https://git-lfs.com/) so the LFS hooks above can run."
