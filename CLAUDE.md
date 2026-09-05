# Working on Archie

Archie is a pnpm workspace with a shared TypeScript core, Svelte Studio, Astro/Svelte Viewer, and Tauri desktop shell.

- Before editing a territory, read its page in [hubs/INDEX.md](hubs/INDEX.md) and the rules it links.
- For domain terms, read [CONTEXT.md](CONTEXT.md). For architectural decisions, read the relevant file in `docs/adr/`.
- For current delivery limits, read [docs/CAPABILITIES.md](docs/CAPABILITIES.md).
- For issue work, use `.seeds/` through `sd`. [Issue tracking](docs/agents/issue-tracker.md) defines the workflow. `ISSUES.md` is frozen history.
- For app startup and browser checks, use the project `run-app` skill.
- For verification, select the relevant gates in [hubs/verification.md](hubs/verification.md). Root commands are `pnpm typecheck`, `pnpm test`, and `pnpm build`.
- Preserve existing uncommitted changes. Before staging, inspect the diff and select explicit paths. Coordinate shared files with their owners.

## Documentation

Rules in `.claude/rules/` use `paths` for conditional loading. Other agents must read matching rules through the territory hub.
Hubs hold current constraints and links. Dated ledgers hold measurements and historical context.

When a change touches a hub's paths, update the relevant verdict and evidence link in the same change.
Keep each instruction in one authoritative document. Read that document before adding a duplicate.
For completed plans, preserve a dated archive and replace active instructions with a short pointer.

Before a docs, rules, or hubs commit, run `node scripts/doclint.mjs`.
To regenerate the hub index, run `node scripts/doclint.mjs --index`.
To regenerate the tracker map, run `node scripts/trackers-gen.mjs`.

## Available tools

Use context-mode search and indexing tools when the session exposes them. Follow any active tool-routing hooks.
If those tools are absent, use bounded file reads and `rg`. Save long command output to a file and inspect relevant excerpts.
For dependency APIs, check the installed package and official documentation for its version. Use an indexed documentation service only when available.

Keep user-facing responses under 500 words unless the task requires more detail. Write large artifacts to files and link them.
