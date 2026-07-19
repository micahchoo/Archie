# Issue tracker — seeds (`sd`)

This repo tracks issues with [seeds](https://github.com/) — git-native, stored in
`.seeds/issues.jsonl`. The tend backlog in `ISSUES.md` is a separate, older system
managed by /tend; don't mix the two. `sd --help` for the command surface.

## Wayfinding operations

- **The map** is a seeds issue labelled `wayfinder:map`; its description holds the
  Notes / Decisions so far / Fog sections. Find it: `sd list --label wayfinder:map`.
- **Tickets** are seeds issues carrying two labels: `map:<map-slug>` (the child
  relationship) and `wayfinder:<type>` (research | prototype | grilling | task).
  Find a map's children: `sd list --label map:<map-slug>`.
- **Claiming**: `sd update <id> --assignee <name> --status in_progress` — do this
  *before* any work. Open + unassigned = unclaimed.
- **Blocking** uses seeds' native deps: `sd dep add <ticket> <blocker>` (ticket
  depends on blocker). `sd blocked` shows the blocked set.
- **Frontier**: `sd ready` (open, no unresolved blockers) — filter to the map's
  children by label; the map issue itself also appears there, skip it.
- **Resolving**: post the answer as the close reason —
  `sd close <id> --reason "<the answer / where the asset lives>"` — then append a
  one-line gist to the map's Decisions-so-far via `sd update <map-id> --description`.
- Assets created while resolving (docs, prototypes) live in the repo and are
  referenced by path from the close reason, not pasted into it.
- Commit `.seeds/` changes only when the user asks (repo rule); `sd sync` exists
  but stages *and commits* — prefer plain `git add .seeds` in a user-requested commit.

Current map: **Studio UX overhaul** (`Archie-21b1`) — 18 tickets from
`ledgers/UX-AUDIT-studio-wireframes.md` (W1–W25).
