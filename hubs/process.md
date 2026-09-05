---
paths:
  - "hubs/**"
  - ".claude/rules/**"
  - ".seeds/**"
  - "ledgers/**"
  - "docs/agents/**"
updated: 2026-09-05
---
# process
> *how do agents work in this repo?*

The knowledge layer separates current instructions from dated evidence.
Use [issue tracking](../docs/agents/issue-tracker.md) for `.seeds/` commands and ownership.
Use [CLAUDE.md](../CLAUDE.md) for entry rules and tool fallbacks.

## Current guidance

- Rules use `paths` for conditional loading. Hubs use the same field through their rule symlinks.
- Before editing a territory, read its hub and linked rules. Agent briefs include a `hub:` line.
- When a change touches a hub's paths, update its current verdict and evidence link in the same change.
- Keep durable contracts in rules or ADRs. Keep measurements, incidents, and completed plans in dated records.
- `.seeds/` is the live tracker. `ISSUES.md` and archived handoffs describe historical state.
- Run `node scripts/doclint.mjs` before a documentation commit. Regenerate indexes with the commands in CLAUDE.md.

## Binding rules

- [[shared-worktree-agent-collisions]] — coordinate file and Git ownership separately.
- [[post-review-fixes-are-unreviewed]] — review follow-up changes and reconcile reported counts with output.
- [[a-green-run-is-one-sample]] — repeat timing-sensitive checks when reliability is the claim.
- [[prior-art-citation-discipline]] — open cited evidence and check actual usage.

## Evidence and limits

- `scripts/doclint.mjs` checks links, paths, hub freshness, indexes, tracker mapping, citations, mirrors, naming, accretion, and coverage.
- New Markdown files must enter Git's index before the untracked-doc check passes. A clean link check does not prove UI instructions correct.
- `ledgers/DESIGN-knowledge-layer-2026-07-27.md` records the original knowledge-layer design.
- Documentation refresh 2026-09-05 → Native rule paths, consolidated checks, and explicit archives replace duplicated instructions. Evidence: `ledgers/DOCS-refresh-2026-09-05.md`.

Earlier decisions and measurements: [archived hub](../ledgers/DOCS-hubs-before-2026-09-05.md#process).
