# Issue tracker — seeds (`sd`)

The canonical tracker is `.seeds/issues.jsonl`. `ISSUES.md` is frozen historical evidence.
[TRACKERS.md](../TRACKERS.md) maps legacy `Issue N` and `Q-N` identifiers to seeds issues.
[The process hub](../../hubs/process.md) holds shared-worktree and evidence conventions.

## Task workflow

1. Read the issue with `sd show <id>`.
2. Before work, claim it with `sd update <id> --assignee <name> --status in_progress`.
3. For a dependency, run `sd dep add <ticket> <blocker>`.
4. Record the result with `sd close <id> --reason "<answer and evidence path>"`.

`sd ready` lists open issues without unresolved blockers. `sd blocked` lists blocked issues.
`sd list` and `sd ready` each default to 50 results. For backlog counts, use `sd stats`.
For a complete enumeration, choose a `--limit` that covers the total from `sd stats`.

## Maps

A map is an issue with the `wayfinder:map` label. Its description holds Notes, Decisions so far, and Fog sections.
Each child has `map:<map-slug>` and `wayfinder:<type>` labels, where type is `research`, `prototype`, `grilling`, or `task`.

- Find maps with `sd list --label wayfinder:map`.
- Find children with `sd list --label map:<map-slug>`.
- Find ready children with `sd ready --label map:<map-slug>`.

After closing a child, add its result to the map's Decisions so far section.
Read the current map description before you use `sd update <map-id> --description "<complete description>"`.
The command replaces the description, so preserve its other sections.

## Tracker changes

For an authorized commit, inspect the changed issue IDs before you stage `.seeds/issues.jsonl`.
The shared file can contain changes from other sessions. The [shared-worktree rule](../../.claude/rules/shared-worktree-agent-collisions.md) explains this hazard.
`sd sync` stages and commits tracker changes. Use it only within an authorized commit workflow.

For the installed command surface, run `sd --help` or `sd <command> --help`.
