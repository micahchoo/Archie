---
paths:
  - "**"
tags: [process, agents, git, worktrees, data-loss]
priority: high
source: measured shared-checkout failures
---
# Shared checkout ownership

When agents need independent Git operations, give each agent a worktree. Check the actual paths with `git worktree list`.
When agents share a checkout, assign disjoint files and one owner for Git operations.
Include that restriction in each dispatch brief. File ownership alone does not isolate branch or staging state.

Before staging, inspect the diff and select explicit paths. Never use `git add -A` or `git commit -a` in a shared checkout.
Before committing, read `git branch --show-current`. Another agent can change the active branch.

Before a temporary test injection, save the current file contents outside the checkout.
Restore those contents after the probe. A restore from HEAD can erase earlier uncommitted changes, including another author's work.
Coordinate edits to shared files before restoring anything.

The issue tracker stores all tickets in `.seeds/issues.jsonl`.
Before staging that file, inspect the changed ticket IDs and fields. A precise filename still includes every author's edits to it.
For backlog totals, reconcile the ticket set with `sd stats`.

If commits need separation, rebuild the owned slice in a fresh worktree. Preserve the original history while other agents use it.
For concurrent browser servers, apply [[viewer-e2e-shared-port]].

Evidence: [shared-checkout incidents](../../ledgers/DOCS-agent-guidance-before-2026-09-05.md#shared-worktree-agent-collisions).
