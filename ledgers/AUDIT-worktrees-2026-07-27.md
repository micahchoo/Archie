# AUDIT — .claude/worktrees drift (2026-07-27, Archie-1a47)

The 2026-07-27 doc sweep feared divergent unmerged doc work in 14 worktrees ("48 vs 39
ledger files"). Measured per branch (`git rev-list --left-right --count main...<br>` +
`git diff --name-only main...<br> -- ledgers/`), the fear inverts:

- **12 of 13 agent branches were fully MERGED into main (ahead 0) with ZERO ledger diff.**
  The "extra ledgers" were files main already had — the sweep compared against this
  checkout's branch (`fix/flaky-gates`), which was behind main. A drift measurement is
  only as good as the ref it diffs against.
- Pruned (merged + clean tree): zip64-bytes, incremental-push, folder-probe, tier-engine,
  bagit-fixity, object-storage, bulk-metadata-import (dirt was its own
  `.skill-invocation-log`), republish-test, self-replicating-publish, video-transcode,
  web-tier-selector-rescale. Branches NOT deleted — only the checkouts. 4.3GB → ~1GB.
- Kept: `accept/thousand-images` (locked, unmerged 1 ahead, dirty 3 — live),
  `feat/export-surface` (moved to a new sha DURING this audit — live),
  `merge-main` (merge tooling; main itself advanced 10c82ab → f63a90f mid-audit).

Standing practice this establishes: prune criterion is `merge-base --is-ancestor <br> main`
AND clean tree AND not locked; a worktree failing any one of those is someone's live desk.
