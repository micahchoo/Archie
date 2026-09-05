# Documentation refresh — 2026-09-05

The audit found current instructions mixed with historical plans, duplicated verification rules, and stale user workflows.
This change refreshes maintained guidance against the source at `7661ec5` and preserves historical evidence in explicit archives.

## Changes

- The root README remains a short introduction and quickstart.
- User guides match current creation, overview, annotation, save, and publication controls.
- App READMEs provide purpose, run commands, code entry points, and links to capabilities.
- The recipe index points to one embed reference. Current source behavior is separate from the pinned `v1.1` example.
- Agent instructions use available tools with a bounded-output fallback. The dependency index is archived rather than loaded as a rule.
- Three overlapping compiler rules become one. Shared-checkout guidance retains the constraints and moves incident narratives to evidence.
- Rules and hubs use native `paths` lists. The doc checker validates the same field and rejects legacy `scope` metadata.
- Territory hubs hold current contracts and pointers. Their earlier contents remain in a dated snapshot.
- Root HANDOFF and the implementation strategy point to current authorities and their historical archives.
- All 15 remaining plan/spec files have dated status notices. Completed work, proposals, and pending acceptance remain distinct.
- Three August 30 ledgers now include their original evidence date in the filename.
- The project librarian skill follows the existing hubs and ledgers structure.

## Source checks

User-facing corrections were checked against Studio components, save and publish modules, package scripts, Viewer routing, and native GitHub modules.
Embed attributes, target fallbacks, and offline behavior were checked against `element.ts`, `target-resolve.ts`, and `resource-policy.ts`.
The archived dependency index contains historical service state. Installed packages and official versioned documentation now guide dependency lookups.

Claude uses `paths` lists for conditional rules. Symlinked rules load their targets normally.
Source: [Claude Code memory documentation](https://code.claude.com/docs/en/memory#path-specific-rules), accessed 2026-09-05.
Runtime context consumption was not measured. The shared-checkout rule deliberately matches all paths.

## Archives

- [Original agent guidance](DOCS-agent-guidance-before-2026-09-05.md)
- [Earlier hubs](DOCS-hubs-before-2026-09-05.md)
- [August handoff](HANDOFF-2026-08-08.md)
- [Original implementation strategy](../docs/archive/IMPLEMENTATION-STRATEGY-2026-08-08.md)

The handoff, strategy, and three renamed August ledgers preserve their original bodies.
Historical citations in dated ledgers and seed bodies retain their original paths.
Ratified ADRs, research, and the merge contract remain intact.

## Verification

- Local Markdown destination checks: 190 checked, zero missing, including all plan-status pointers.
- Native rule metadata: all 22 rules and nine hubs use `paths` lists. Hub symlinks retain a single source.
- Four reversible probes rejected legacy metadata, scalar paths, dead globs, and duplicate fields. Original rule contents were restored.
- Existing script tests: 36 passed, zero failed or skipped.
- Hub index and tracker map match regeneration. `git diff --check` passed.
- The only remaining doclint finding is the preexisting untracked `ledgers/TEND-rerun-2026-08-22.md`. It remains untouched.
- New archive files have intent-to-add entries for review. Their contents are not staged, and no commit was created.
- The pinned embed SRI matches the local `v1.1` entry. CDN bytes were not fetched.
- No app browser run or screenshot regeneration was needed for the prose edits. HTML runtime code and attributes remain unchanged.

Compared with HEAD, CLAUDE.md fell from 719 to 316 words. The nine hubs fell from 7,685 to 2,714 words.
Rule text fell from 15,035 to 12,627 words. These counts include metadata and exclude hub symlinks.
Archived text remains available, so these figures measure maintained guidance rather than total repository size.
No application logic changed. The documentation checker is the only executable code change.
