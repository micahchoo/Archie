---
name: librarian
description: >-
  Audit and maintain Archie's project agent documentation. Use for stale instructions,
  duplicated rules, broken knowledge pointers, or requests to organize .claude/.
compatibility: Requires filesystem access and Git. Optional documentation search tools.
---
# Librarian

Use Archie's existing knowledge layer. Read [CLAUDE.md](../../../CLAUDE.md) and [the process hub](../../../hubs/process.md) before changing its structure.
Keep all changes within the project. Personal agent settings are outside this skill's scope.

## Audit

1. Start with the user's reported problem or an existing audit finding.
2. If a session audit cache exists, read its relevant findings. Treat an absent cache as unknown.
3. Inspect current tracked files and their callers. Exclude `.claude/worktrees/` and generated files from documentation inventories.
4. Check each disputed instruction against source, commands, or authoritative documentation.
5. Record the concrete mismatch before deciding to refresh, merge, archive, or delete it.

## Place the information

| Information | Home |
| --- | --- |
| Instructions needed for every task | Root `CLAUDE.md` |
| Constraints needed for matching code | `.claude/rules/` with a `paths` list |
| Current territory contracts and evidence links | `hubs/` |
| Repeatable agent workflow | `.claude/skills/` |
| User task instructions | `docs/guide/` |
| Ratified decisions | `docs/adr/` or `docs/decisions/` |
| Dated measurements and incidents | `ledgers/` |
| Completed plans | `docs/archive/` or a dated ledger |

The generated hub index is the project entry map. Use it instead of creating a second `.claude/` knowledge tree.
Keep detailed contracts where their maintainers use them. Length alone does not justify cutting a specification.

## Edit

1. Put each maintained instruction in one authoritative document.
2. Replace duplicates with pointers that state when readers need the target.
3. For historical records, preserve the original text and label its date and authority.
4. After a move, update active references. Keep historical citations intact with an explicit archive notice about original paths.
5. For rules and hubs, use native `paths` lists. The doc checker reads the same field.
6. Update the affected hub with the result and evidence.

## Check

1. Check local links and documented commands against the current tree.
2. Regenerate `hubs/INDEX.md` with `node scripts/doclint.mjs --index`.
3. If tracker mappings changed, run `node scripts/trackers-gen.mjs`.
4. Run `node scripts/doclint.mjs` before the documentation commit.
5. Report remaining mismatches and the limits of the checks.

Source design: [knowledge layer](../../../ledgers/DESIGN-knowledge-layer-2026-07-27.md).
